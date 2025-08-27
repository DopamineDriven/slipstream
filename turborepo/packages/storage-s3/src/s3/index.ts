import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { Readable } from "node:stream";
import type {
  AssetMetadata,
  CopyOptions,
  DeleteResult,
  FinalizeResult,
  PresignedDownloadOptions,
  PresignedUploadResponse,
  PresignMeta,
  PresignResult,
  StorageConfig,
  UploadOptions,
  UploadResult
} from "@/types/index.ts";
import type { GetObjectCommandInput } from "@aws-sdk/client-s3";
import { S3Utils } from "@/utils/index.ts";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ObjectNotInActiveTierError,
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

export class S3Storage extends S3Utils {
  // Cache for frequently used commands (optional optimization)
  private readonly commandCache = new Map<string, HeadObjectCommand>();
  private readonly uploadCache = new Map<string, Promise<UploadResult>>();
  private readonly httpAgent = new HttpAgent({
    keepAlive: true,
    maxSockets: 256,
    keepAliveMsecs: 1000
  });
  private readonly httpsAgent = new HttpsAgent({
    keepAlive: true,
    maxSockets: 256,
    keepAliveMsecs: 1000
  });
  private readonly requestHandler = new NodeHttpHandler({
    connectionTimeout: 5000,
    requestTimeout: 300000,
    httpsAgent: this.httpsAgent,
    httpAgent: this.httpAgent
  });

  private client: S3Client;
  static #instance: S3Storage | null = null;
  private cfg: CTR<Pick<StorageConfig, "region" | "buckets">> &
    Pick<StorageConfig, "kmsKeyId" | "defaultPresignExpiry">;
  private readonly inflightUploads = new Set<{
    abort: () => Promise<void> | void;
  }>();
  private constructor(
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
      requestHandler: this.requestHandler
    });
  }
  private selectBucket(origin: PresignMeta["origin"]) {
    const bucketKey = this.BUCKET_MAP[origin];
    return this.cfg.buckets[bucketKey];
  }
  // TODO
  private track<T extends { abort: () => Promise<void> | void }>(u: T): T {
    this.inflightUploads.add(u);
    const _untrack = () => this.inflightUploads.delete(u);

    return u;
  }

  public BUCKET_MAP = {
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
  public async generatePresignedUpload(input: AssetMetadata, expiresIn = 3600) {
    const key = this.generateKey(input);
    const bucket = this.selectBucket(input.origin);

    // keep these tiny — S3 metadata has limits (~2KB total)
    // ${envPrefix}/u/${userId}/${YYYYMM}/${ULID()}.${ext}
    const meta = {
      u: input.userId, // short keys keep headroom
      conv: input.conversationId,
      batch: input.batchId,
      draft: input.draftId,
      origin: input.origin,
      filename: input.filename // optional; useful in audits
    };

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.contentType, // enforce via signature
      // ContentDisposition: `inline; filename="${sanitize(input.filename)}"`, // optional
      Metadata: meta
      // Optional tags (good for lifecycle/routing); SDK will sign x-amz-tagging
      // Tagging: `app=t3&state=staged&batch=${encodeURIComponent(input.batchId)}`
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = Date.now() + expiresIn * 1000;

    return {
      uploadUrl,
      publicUrl: this.publicUrl(bucket, key),
      key,
      bucket,
      // echo back what client/server both need to correlate
      draftId: input.draftId,
      batchId: input.batchId,
      conversationId: input.conversationId,
      requiredHeaders: { "Content-Type": input.contentType }, // client MUST send this
      expiresAt,
      s3Uri: `s3://${bucket}/${key}`
    } as const satisfies PresignedUploadResponse;
  }
  public static getInstance(config: StorageConfig, fs: Fs) {
    if (this.#instance === null) {
      this.#instance = new S3Storage(config, fs);
      return this.#instance;
    }
    return this.#instance;
  }

  public static hasInstance() {
    return this.#instance !== null;
  }

  public static async resetInstance() {
    if (this.#instance) {
      this.#instance.destroy();
      this.#instance = null;
    }
  }

  private async destroy() {
    this.commandCache.clear();
    this.uploadCache.clear();
    this.client.destroy();
  }

  public contentTypeToExt(ContentType?: string) {
    if (ContentType) {
      return this.fs.mimeToExt(ContentType as keyof typeof this.fs.toExtObj);
    } else return undefined;
  }

  public async uploadDirect(
    data: Buffer | Uint8Array | string | Readable,
    meta: PresignMeta & { conversationId?: string },
    options?: UploadOptions
  ): Promise<UploadResult> {
    const bucket = this.cfg.buckets[this.BUCKET_MAP[meta.origin]];
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
        const s3Uri = `s3://${bucket}/${key}` as const;
        return {
          bucket,
          key,
          etag: this.stripQuotes(result.ETag),
          versionId: result.VersionId ?? "nov",
          s3ObjectId:
            `s3://${bucket}/${key}#${result.VersionId ?? "nov"}` as const,
          s3Uri,
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
          s3ObjectId:
            `s3://${bucket}/${key}#${result.VersionId ?? "nov"}` as const,
          etag: this.stripQuotes(result.ETag),
          versionId: result.VersionId ?? "nov",
          s3Uri: `s3://${bucket}/${key}` as const,
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
    try {
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
        s3ObjectId:
          `s3://${destination.bucket}/${destination.key}#${result.VersionId ?? "nov"}` as const,
        bucket: destination.bucket,
        key: destination.key,
        versionId: result.VersionId ?? "nov",
        etag: this.stripQuotes(result.CopyObjectResult?.ETag),
        s3Uri: `s3://${destination.bucket}/${destination.key}`,
        publicUrl: this.publicUrl(destination.bucket, destination.key)
      };
    } catch (error) {
      if (error instanceof ObjectNotInActiveTierError) {
        console.error(
          `[Fault: ${error.$fault}]: Could not copy ${source.key} from ${source.bucket} to ${destination.key} of ${destination.bucket}. Object is not in the active tier.
            Attempts: ${error.$metadata.attempts ?? 0}
            Message: ${error.message}
            Name: ${error.name}
            Stack: ${error.stack ?? ""}
            `
        );
      }
      if (error instanceof Error) {
        if (error.name === "NoSuchKey") {
          console.error(
            `Source object not found: ${source.bucket}/${source.key}`
          );
        }
        if (error.name === "AccessDenied") {
          console.error(`Access denied for copy operation`);
        }
        if (error.name === "ObjectNotInActiveTierError") {
          console.error(
            `Object is in Glacier/Deep Archive and not available for copy`
          );
        }
      }
      throw new Error(
        `could not copy key: ${source.key}, bucket: ${source.bucket} to key: ${destination.key}, bucket: ${destination.bucket}.`
      );
    }
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
    const bucket = this.cfg.buckets[this.BUCKET_MAP[meta.origin]];
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
    const expiresAt = Date.now() + (expiresIn ?? 3600) * 1000; // Convert seconds to ms

    return {
      uploadUrl,
      key,
      bucket,
      s3Uri: `s3://${bucket}/${key}`, // NO version fragment
      publicUrl: this.publicUrl(bucket, key),
      expiresAt,
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

  public async finalize(bucket: string, key: string, versionId = "nov") {
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
    let v = VersionId;

    if (typeof v === "undefined" || (v !== versionId && versionId !== "nov")) {
      v = versionId;
    }

    const s3ObjectId = `s3://${bucket}/${key}#${v ?? "nov"}` as const;

    const checksum = this.checksum(head);

    const expires = this.handleExpires(ExpiresString);
    const extension = this.contentTypeToExt(ContentType);
    const publicUrl = this.publicUrl(bucket, key);
    return {
      bucket,
      key,
      versionId: v,
      contentDisposition: ContentDisposition,
      cacheControl: CacheControl,
      extension,
      expires,
      publicUrl,
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
      VersionId: versionId
    });
    const downloadUrl = await getSignedUrl(this.client, cmd, { expiresIn });
    const expiresAt = Date.now() + (expiresIn ?? 3600) * 1000;

    return {
      downloadUrl,
      s3ObjectId,
      expiresAt,
      bucket,
      key,
      versionId: versionId ?? "nov"
    };
  }

  public async deleteById(s3ObjectId: string) {
    const { bucket, key, versionId } = this.parseS3ObjectId(s3ObjectId);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
        VersionId: versionId
      })
    );
  }

  private generateKey(meta: PresignMeta) {
    const ts = Date.now();
    const name = this.extractCleanFilename(meta.filename);
    return [meta.origin.toLowerCase(), meta.userId, `${ts}-${name}`].join("/");
  }
  public publicUrl(bucket: string, key: string) {
    return `https://${bucket}.s3.${this.cfg.region}.amazonaws.com/${key}`;
  }

  public async objectExists(bucket: string, key: string, versionId?: string) {
    try {
      const cacheKey = versionId
        ? `${bucket}:${key}#${versionId}`
        : `${bucket}:${key}`;
      let command = this.commandCache.get(cacheKey);

      if (!command) {
        command = new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
          VersionId: versionId
        });

        if (this.commandCache.size > 100) {
          const firstKey = this.commandCache.keys().next().value;
          if (firstKey) this.commandCache.delete(firstKey);
        }
        this.commandCache.set(cacheKey, command);
      }

      const response = await this.client.send(command);
      return {
        exists: true,
        s3ObjectId: `s3://${bucket}/${key}#${response.VersionId ?? "nov"}`,
        versionId: response.VersionId ?? "nov",
        etag: this.stripQuotes(response.ETag),
        size: response.ContentLength
      };
    } catch (error) {
      console.log(`Object check failed for ${bucket}/${key}:`, error);
      return { exists: false };
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
  ) {
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
      objectId: `s3://${bucket}/${key}#${response.VersionId ?? "nov"}` as const,
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
      const response = await this.client.send(
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

      // Build result with proper typing

      const result = {
        key,
        deleted: true,
        versionId: versionId,
        s3ObjectId: `s3://${bucket}/${key}#${versionId ?? "nov"}` as const,
        deleteMarker: response.DeleteMarker
      } satisfies DeleteResult;

      if (response.VersionId) {
        result.versionId = response.VersionId;
        result.s3ObjectId =
          `s3://${bucket}/${key}#${response.VersionId}` as const;
      } else if (versionId) {
        result.versionId = versionId;
        result.s3ObjectId = `s3://${bucket}/${key}#${versionId}` as const;
      }

      return result;
    } catch (error) {
      console.error(`Failed to delete ${bucket}/${key}:`, error);
      return undefined;
    }
  }
  public buildContentDisposition(
    filename: string | undefined,
    asAttachment = false
  ) {
    if (!filename) return undefined;
    // RFC 5987 + quoted fallback
    const encoded = encodeURIComponent(filename);
    const type = asAttachment ? "attachment" : "inline";
    // Use both filename and filename* for widest browser support
    return `${type}; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encoded}`;
  }
  public async generatePresignedDownload(
    bucket: string,
    key: string,
    opts: PresignedDownloadOptions = {}
  ) {
    const {
      versionId,
      expiresIn = 3600,
      asAttachment = false,
      filename,
      contentTypeOverride,
      cacheControl
    } = opts;

    const input = {
      Bucket: bucket,
      Key: key,
      VersionId: versionId ?? undefined,
      // Response header overrides (become query params on the signed URL)
      ResponseContentDisposition: this.buildContentDisposition(
        filename,
        asAttachment
      ),
      ResponseContentType: contentTypeOverride,
      ResponseCacheControl: cacheControl
      // You can also set ResponseContentLanguage / ResponseExpires if you need them
    } satisfies GetObjectCommandInput;

    const command = new GetObjectCommand(input);
    const downloadUrl = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const s3Uri = `s3://${bucket}/${key}${versionId ? `#${versionId}` : ""}`;

    return {
      downloadUrl,
      s3Uri,
      expiresAt,
      bucket,
      key,
      versionId: versionId ?? undefined
    } as const;
  }
}
