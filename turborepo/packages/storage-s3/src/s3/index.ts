import * as https from "https";
import { Readable } from "node:stream";
import type {
  CopyOptions,
  FinalizeResult,
  PresignMeta,
  PresignResult,
  StorageConfig,
  UploadOptions,
  UploadResult
} from "@/types/index.ts";
import { S3Utils } from "@/utils/index.ts";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  waitUntilObjectExists
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Fs } from "@d0paminedriven/fs";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { CTR, XOR } from "@t3-chat-clone/types";

const BUCKET_MAP = {
  GENERATED: "pyGenAssets",
  UPLOAD: "wsAssets",
  REMOTE: "wsAssets",
  PASTED: "wsAssets",
  SCREENSHOT: "wsAssets",
  IMPORTED: "wsAssets",
  SCRAPED: "wsAssets"
} as const satisfies Record<
  PresignMeta["origin"],
  keyof StorageConfig["buckets"]
>;

export class S3Storage extends S3Utils {
  // Cache for frequently used commands (optional optimization)
  private readonly commandCache = new Map<string, HeadObjectCommand>();
  private readonly uploadCache = new Map<string, Promise<UploadResult>>();
  private client: S3Client;
  private cfg: CTR<Pick<StorageConfig, "region" | "buckets">> &
    Pick<StorageConfig, "kmsKeyId" | "defaultPresignExpiry">;

  constructor(
    cfg: StorageConfig,
    public fs: Fs
  ) {
    super();
    this.cfg = {
      ...cfg,
      defaultPresignExpiry: cfg.defaultPresignExpiry ?? 3600
    };
    this.client = new S3Client({
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey
      },

      region: cfg.region,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 3000,
        requestTimeout: 3000,
        httpsAgent: new https.Agent({
          maxSockets: 50,
          keepAlive: true,
          keepAliveMsecs: 1000
        })
      })
      // creds: default provider chain (env/SSO/role)
    });
  }

  private contentTypeToExt(ContentType?: string) {
    if (ContentType) {
      return this.fs.mimeToExt(ContentType as keyof typeof this.fs.toExtObj);
    } else return undefined;
  }

  public async uploadDirect(
    data: Buffer | Uint8Array | string | Readable,
    meta: PresignMeta & { conversationId?: string },
    options?: UploadOptions
  ): Promise<UploadResult> {
    const bucket = this.cfg.buckets[BUCKET_MAP[meta.origin]];
    const key = this.generateKey(meta);
    let uploadPromise: Promise<UploadResult> | undefined;
    // Dedup concurrent uploads of same content
    const cacheKey = `${bucket}:${key}`;

    uploadPromise =
      this.uploadCache.get(cacheKey) ??
      this.performUpload(bucket, key, data, meta, options);

    this.uploadCache.set(cacheKey, uploadPromise);

    try {
      const result = await uploadPromise;
      return result;
    } finally {
      this.uploadCache.delete(cacheKey);
    }
  }

  private async performUpload(
    bucket: string,
    key: string,
    data: Buffer | Uint8Array | string | Readable,
    meta: PresignMeta & { conversationId?: string },
    options?: UploadOptions
  ): Promise<UploadResult> {
    try {
      // For streams or large buffers, use multipart upload
      const isStream = data instanceof Readable;
      const size = this.getDataSize(data);
      const useMultipart = isStream || (size && size > 5 * 1024 * 1024); // 5MB

      if (useMultipart) {
        // Use AWS SDK's managed upload for automatic multipart handling
        const parallelUploads3 = new Upload({
          client: this.client,
          params: {
            Bucket: bucket,
            Key: key,
            Body: data,
            ContentType: meta.contentType,
            ...(meta.size && { ContentLength: meta.size }),
            Metadata: {
              userId: meta.userId,
              filename: meta.filename,
              origin: meta.origin,
              ...(meta.conversationId && {
                conversationId: meta.conversationId
              }),
              ...(meta.messageId && { messageId: meta.messageId })
            },
            ...(this.cfg.kmsKeyId && {
              ServerSideEncryption: "aws:kms",
              SSEKMSKeyId: this.cfg.kmsKeyId
            }),
            ...(options?.tags && { Tagging: this.formatTags(options.tags) }),
            ...(options?.cacheControl && {
              CacheControl: options.cacheControl
            }),
            ...(options?.contentDisposition && {
              ContentDisposition: options.contentDisposition
            })
          },
          // Configuration for multipart
          queueSize: 4, // Concurrent parts
          partSize: 5 * 1024 * 1024, // 5MB parts
          leavePartsOnError: false
        });

        // Track progress if callback provided
        if (options?.onProgress) {
          parallelUploads3.on("httpUploadProgress", progress => {
            if (progress.loaded && progress.total) {
              options.onProgress?.({
                loaded: progress.loaded,
                total: progress.total,
                percentage: Math.round((progress.loaded / progress.total) * 100)
              });
            }
          });
        }

        const result = await parallelUploads3.done();
        result.VersionId;
        return {
          bucket,
          key,
          etag: this.stripQuotes(result.ETag),
          versionId: result.VersionId ?? undefined,
          objectId: `s3://${bucket}/${key}#${result.VersionId ?? "nov"}`,
          s3Uri: result.VersionId
            ? `s3://${bucket}/${key}?versionId=${result.VersionId}`
            : `s3://${bucket}/${key}`,
          publicUrl: this.publicUrl(bucket, key),
          size: size ?? undefined,
          location: result.Location
        };
      } else {
        // Simple PUT for small files
        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: meta.contentType,
          ...(meta.size && { ContentLength: meta.size }),
          Metadata: {
            userId: meta.userId,
            filename: meta.filename,
            origin: meta.origin,
            ...(meta.conversationId && { conversationId: meta.conversationId }),
            ...(meta.messageId && { messageId: meta.messageId })
          },
          ...(this.cfg.kmsKeyId && {
            ServerSideEncryption: "aws:kms",
            SSEKMSKeyId: this.cfg.kmsKeyId
          }),
          ...(options?.tags && { Tagging: this.formatTags(options.tags) }),
          ...(options?.cacheControl && { CacheControl: options.cacheControl })
        });

        const result = await this.client.send(command);

        return {
          bucket,
          key,
          objectId: `s3://${bucket}/${key}#${result.VersionId ?? "nov"}`,
          etag: this.stripQuotes(result.ETag),
          versionId: result.VersionId ?? undefined,
          s3Uri: result.VersionId
            ? `s3://${bucket}/${key}?versionId=${result.VersionId}`
            : `s3://${bucket}/${key}`,
          publicUrl: this.publicUrl(bucket, key),
          size: size ?? undefined
        };
      }
    } catch (error) {
      if (error instanceof S3ServiceException) {
        throw new Error(`S3 upload failed: ${error.message} (${error.name})`);
      }
      throw error;
    }
  }

  /**
   * Copy an object within S3 (server-side, no download needed)
   */
  public async copyObject(
    source: { bucket: string; key: string; versionId?: string },
    destination: { bucket: string; key: string },
    options?: CopyOptions
  ): Promise<UploadResult> {
    const copySource = source.versionId
      ? `${source.bucket}/${source.key}?versionId=${source.versionId}`
      : `${source.bucket}/${source.key}`;

    const command = new CopyObjectCommand({
      CopySource: copySource,
      Bucket: destination.bucket,
      Key: destination.key,
      MetadataDirective: options?.copyMetadata ? "COPY" : "REPLACE",
      ...(options?.metadata && { Metadata: options.metadata }),
      ...(options?.contentType && { ContentType: options.contentType }),
      ...(this.cfg.kmsKeyId && {
        ServerSideEncryption: "aws:kms",
        SSEKMSKeyId: this.cfg.kmsKeyId
      })
    });

    const result = await this.client.send(command);

    await waitUntilObjectExists(
      { client: this.client, maxWaitTime: 10, minDelay: 1, maxDelay: 2 },
      { Bucket: destination.bucket, Key: destination.key }
    );

    return {
      objectId: `s3://${destination.bucket}/${destination.key}#${result.VersionId ?? "nov"}`,
      bucket: destination.bucket,
      key: destination.key,
      etag: this.stripQuotes(result.CopyObjectResult?.ETag),
      s3Uri: `s3://${destination.bucket}/${destination.key}`,
      publicUrl: this.publicUrl(destination.bucket, destination.key)
    };
  }
  private formatTags(tags: Record<string, string>): string {
    return Object.entries(tags)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
  }
  public async presign(
    meta: PresignMeta,
    expiresIn = this.cfg.defaultPresignExpiry
  ) {
    const bucket = this.cfg.buckets[BUCKET_MAP[meta.origin]];
    const key = this.generateKey(meta);
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: meta.contentType,
      Metadata: {
        userId: meta.userId,
        filename: meta.filename,
        origin: meta.origin
      },
      ...(this.cfg.kmsKeyId && {
        ServerSideEncryption: "aws:kms",
        SSEKMSKeyId: this.cfg.kmsKeyId
      })
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn });
    return {
      uploadUrl,
      key,
      bucket,
      s3Uri: `s3://${bucket}/${key}`,
      publicUrl: this.publicUrl(bucket, key),
      requiredHeaders: { "Content-Type": meta.contentType } // if you sign SSE headers, include them here too
    } satisfies PresignResult;
  }

  private getDataSize(
    data: Buffer | Uint8Array | string | Readable
  ): number | undefined {
    if (Buffer.isBuffer(data)) return data.length;
    if (data instanceof Uint8Array) return data.length;
    if (typeof data === "string") return Buffer.byteLength(data);
    return undefined; // Can't determine size of stream
  }

  public async finalize(bucket: string, key: string) {
    const head = await this.client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
        ChecksumMode: "ENABLED"
      })
    );
    const {
      ContentDisposition,
      StorageClass,
      ExpiresString,
      ContentType,
      CacheControl,
      ETag,
      LastModified,
      ContentLength,
      VersionId
    } = head;

    const versionId = VersionId ?? null;
    const s3ObjectId = `s3://${bucket}/${key}#${versionId ?? "nov"}`;

    const checksum = this.checksum(head);

    const expires = this.handleExpires(ExpiresString);
    const extension = this.contentTypeToExt(ContentType);

    return {
      bucket,
      key,
      versionId,
      contentDisposition: ContentDisposition,
      cacheControl: CacheControl,
      extension,
      expires,
      storageClass: StorageClass,
      s3ObjectId,
      etag: this.stripQuotes(ETag),
      size: ContentLength ?? undefined,
      contentType: ContentType ?? undefined,
      lastModified: LastModified?.toISOString(),
      checksum
    } satisfies FinalizeResult;
  }

  public async signDownloadById(
    s3ObjectId: string,
    expiresIn = this.cfg.defaultPresignExpiry
  ) {
    const { bucket, key, versionId } = this.parseS3ObjectId(s3ObjectId);
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(versionId && { VersionId: versionId })
    });
    return getSignedUrl(this.client, cmd, { expiresIn });
  }

  public async deleteById(s3ObjectId: string) {
    const { bucket, key, versionId } = this.parseS3ObjectId(s3ObjectId);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(versionId && { VersionId: versionId })
      })
    );
  }

  // ---------- helpers ----------
  private generateKey(meta: PresignMeta) {
    const ts = Date.now();
    const name = this.extractCleanFilename(meta.filename);
    return [meta.origin.toLowerCase(), meta.userId, `${ts}-${name}`].join("/");
  }
  private publicUrl(bucket: string, key: string) {
    return `https://${bucket}.s3.${this.cfg.region}.amazonaws.com/${key}`;
  }

  public async objectExists(bucket: string, key: string) {
    try {
      const cacheKey = `${bucket}:${key}`;
      let command = this.commandCache.get(cacheKey);

      if (!command) {
        command = new HeadObjectCommand({ Bucket: bucket, Key: key });

        if (this.commandCache.size > 100) {
          const firstKey = this.commandCache.keys().next().value;
          if (firstKey) this.commandCache.delete(firstKey);
        }
        this.commandCache.set(cacheKey, command);
      }

      await this.client.send(command);
      return true;
    } catch (error) {
      console.log(`Object check failed for ${bucket}/${key}:`, error);
      return false;
    }
  }

  public async listObjects(
    bucket: string,
    prefix?: string,
    options?: { maxKeys?: number; continuationToken?: string }
  ): Promise<{
    objects: {
      key?: string;
      size?: number;
      lastModified?: Date;
      etag?: string;
    }[];
    isTruncated: boolean;
    nextToken?: string;
  }> {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: options?.maxKeys ?? 1000,
      ContinuationToken: options?.continuationToken
    });

    const response = await this.client.send(command);
    if (typeof response.Contents === "undefined") {
      throw new Error("List Object Error");
    }
    return {
      objects: response.Contents?.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: this.stripQuotes(obj.ETag)
      })),
      isTruncated: response.IsTruncated ?? false,
      nextToken: response.NextContinuationToken
    };
  }

  /**
   * Download an object from S3
   */
  public async getObject(
    bucket: string,
    key: string,
    options?: { versionId?: string; range?: string }
  ): Promise<{
    body: Readable;
    objectId: string;
    metadata: Record<string, string>;
    contentType?: string;
    contentLength?: number;
    extension?: string;
    etag?: string;
  }> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      VersionId: options?.versionId,
      Range: options?.range
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error("No body in response");
    }

    // Convert to Node.js Readable stream
    const webStream = response.Body.transformToWebStream();
    const body = Readable.fromWeb(
      webStream as import("stream/web").ReadableStream
    );
    const extension = this.contentTypeToExt(response.ContentType);

    return {
      body,
      extension,
      objectId: `s3://${bucket}/${key}#${response.VersionId ?? "nov"}`,
      metadata: response.Metadata ?? {},
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      etag: this.stripQuotes(response.ETag)
    };
  }
  /**
   * Delete multiple objects at once
   */
  public async deleteObjects(
    bucket: string,
    keys: XOR<string[], { key: string; versionId?: string }[]>
  ): Promise<{ deleted: string[]; errors: { key: string; error: string }[] }> {
    const deleted = Array.of<string>();
    const errors = Array.of<{ key: string; error: string }>();

    // Normalize input to handle both formats
    const deleteTargets =
      typeof keys[0] === "string"
        ? (keys as string[]).map(key => ({ key, versionId: undefined }))
        : (keys as { key: string; versionId?: string }[]);

    // Process in batches of 10 for rate limiting
    const batchSize = 10;
    for (let i = 0; i < deleteTargets.length; i += batchSize) {
      const batch = deleteTargets.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async ({ key, versionId }) => {
          try {
            await this.client.send(
              new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
                VersionId: versionId
              })
            );
            const identifier = versionId ? `${key}#${versionId}` : key;
            deleted.push(identifier);
            const cacheKey = versionId
              ? `${bucket}:${key}#${versionId}`
              : `${bucket}:${key}`;
            this.commandCache.delete(cacheKey);
          } catch (error) {
            errors.push({
              key: versionId ? `${key}#${versionId}` : key,
              error:
                error instanceof Error
                  ? error.message
                  : versionId
                    ? `Unknown error for deletion of '${bucket}:${key}#${versionId}'`
                    : `Unknown error for deletion of '${bucket}:${key}'`
            });
          }
        })
      );
    }

    return { deleted, errors };
  }

  public async deleteObject(bucket: string, key: string, versionId?: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
          VersionId: versionId
        })
      );

      const cacheKey = versionId
        ? `${bucket}:${key}#${versionId}`
        : `${bucket}:${key}`;
      this.commandCache.delete(cacheKey);
      return key;
    } catch (error) {
      console.error(`Failed to delete ${bucket}/${key}:`, error);
      return undefined;
    }
  }
}
