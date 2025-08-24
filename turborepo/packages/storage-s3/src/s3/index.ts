import * as https from "https";
import type {
  FinalizeResult,
  PresignMeta,
  PresignResult,
  StorageConfig
} from "@/types/index.ts";
import { S3Utils } from "@/utils/index.ts";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CTR } from "@t3-chat-clone/types";

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
const { NodeHttpHandler } = await import("@smithy/node-http-handler");

export class S3Storage extends S3Utils {
  // Cache for frequently used commands (optional optimization)
  private readonly commandCache = new Map<string, HeadObjectCommand>();
  private client: S3Client;
  private cfg: CTR<Pick<StorageConfig, "region" | "buckets">> &
    Pick<StorageConfig, "kmsKeyId" | "defaultPresignExpiry">;

  constructor(cfg: StorageConfig) {
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

  // ---------- Core API ----------
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

    return {
      bucket,
      key,
      versionId,
      contentDisposition: ContentDisposition,
      cacheControl: CacheControl,
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

     const x = await this.client.send(command);
     x.VersionId;
     return true;
    } catch (error) {
      console.log(`Object check failed for ${bucket}/${key}:`, error);
      return false;
    }
  }
}
