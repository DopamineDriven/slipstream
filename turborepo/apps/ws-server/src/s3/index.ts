import * as https from "https";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ObjectNotInActiveTierError,
  PutObjectCommand,
  S3Client,
  waitUntilObjectExists
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@smithy/node-http-handler";

// These provide compile-time type safety while avoiding runtime enum overhead
export type AssetOriginType =
  | "UPLOAD"
  | "REMOTE"
  | "GENERATED"
  | "PASTED"
  | "SCREENSHOT"
  | "IMPORTED"
  | "SCRAPED";
export type AssetStatusType =
  | "REQUESTED"
  | "PLANNED"
  | "UPLOADING"
  | "STORED"
  | "SCANNING"
  | "READY"
  | "FAILED"
  | "QUARANTINED"
  | "ATTACHED"
  | "DELETED";
export type UploadMethodType = "GENERATED" | "FETCHED" | "PRESIGNED" | "SERVER";
export type ChecksumAlgorithmType =
  | "CRC32"
  | "CRC32C"
  | "CRC64NVME"
  | "SHA1"
  | "SHA256";
export type ImageFormatType =
  | "apng"
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "heic"
  | "gif"
  | "tiff"
  | "bmp"
  | "svg"
  | "unknown";

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  buckets: {
    wsAssets: string;
    pyGenAssets: string;
  };
  // Optional performance tuning
  maxSockets?: number;
  connectionTimeout?: number;
  socketTimeout?: number;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  bucket: string;
  fields?: Record<string, string>;
}

// TODO use the Prisma Asset Type?
export interface AssetMetadata {
  userId: string;
  conversationId?: string;
  messageId?: string;
  filename: string;
  contentType: string;
  size?: number;
  origin: AssetOriginType; // Using literal union type
}

type FinalizeResult = {
  bucket: string;
  key: string;
  versionId: string | null;
  s3ObjectId: string;
  etag?: string;
  size?: number;
  contentType?: string;
  lastModified?: string;
  checksum?: { algo: ChecksumAlgorithmType; value: string } | undefined;
};

// This ensures compile-time validation that all AssetOrigin values are mapped
const BUCKET_MAP = {
  GENERATED: "pyGenAssets",
  UPLOAD: "wsAssets",
  REMOTE: "wsAssets",
  PASTED: "wsAssets",
  SCREENSHOT: "wsAssets",
  IMPORTED: "wsAssets",
  SCRAPED: "wsAssets"
} as const satisfies Record<AssetOriginType, keyof S3Config["buckets"]>;

export class S3Service {
  static #instance: S3Service | null = null;
  private readonly s3Client: S3Client;
  private readonly config: S3Config;
  // Cache for frequently used commands (optional optimization)
  private readonly commandCache = new Map<string, HeadObjectCommand>();

  private readonly putObjectCommandCache = new Map<string, PutObjectCommand>();
  // Singleton instance storage
  private static instance: S3Service | null = null;

  private constructor(config: S3Config) {
    // Prevent accidental instantiation
    this.config = config;

    // Initialize S3 Client with connection pooling
    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      requestHandler: new NodeHttpHandler({
        connectionTimeout: config.connectionTimeout ?? 3000,
        requestTimeout: config.socketTimeout ?? 3000,
        httpsAgent: new https.Agent({
          maxSockets: config.maxSockets ?? 50, // Connection pool size
          keepAlive: true,
          keepAliveMsecs: 1000
        })
      })
    });
  }

  static getInstance(config: S3Config) {
    if (!this.#instance) {
      this.#instance = new S3Service(config);
      return this.#instance;
    }
    return this.#instance;
  }

  public static hasInstance() {
    return S3Service.instance !== null;
  }

  public static async resetInstance() {
    if (S3Service.instance) {
      S3Service.instance.destroy();
      S3Service.instance = null;
    }
  }

  private stripQuotes = (s?: string | null) =>
    s ? s.replace(/^"(.*)"$/, "$1") : undefined;

  public generateAssetKey(
    userId: string,
    filename: string,
    origin: AssetOriginType
  ) {
    const timestamp = Date.now();
    const sanitizedFilename = this.sanitizeFilename(filename);

    return [
      origin.toLowerCase(),
      userId,
      `${timestamp}-${sanitizedFilename}`
    ].join("/");
  }

  async generatePresignedUpload(
    { ...metadata }: AssetMetadata,
    expiresIn = 3600
  ) {
    const key = this.generateKey(metadata);
    const bucket = this.selectBucket(metadata.origin);
    const fields = {
      userId: metadata.userId,
      messageId: metadata.messageId ?? "",
      filename: metadata.filename,
      origin: metadata.origin
    };
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: metadata.contentType,
      Metadata: {
        ...fields
      }
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    const publicUrl = this.getPublicUrl(bucket, key);

    return {
      uploadUrl,
      publicUrl,
      key,
      bucket,
      fields
    } satisfies PresignedUploadResponse;
  }

  async generatePresignedDownload(
    bucket: string,
    key: string,
    expiresIn = 3600
  ) {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async uploadDirect(
    data: Buffer | Uint8Array | string,
    { conversationId = "new-chat", ...metadata }: AssetMetadata
  ) {
    const key = this.generateKey({ conversationId, ...metadata });
    const bucket = this.selectBucket(metadata.origin);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: metadata.contentType,
      Metadata: {
        userId: metadata.userId,
        conversationId,
        messageId: metadata.messageId ?? "",
        filename: metadata.filename,
        origin: metadata.origin
      }
    });

    const result = await this.s3Client.send(command);
    const url = await this.generatePresignedDownload(bucket, key);

    return {
      url,
      key,
      bucket,
      etag: result.ETag
    };
  }

  async objectExists(bucket: string, key: string) {
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

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      console.log(`Object check failed for ${bucket}/${key}:`, error);
      return false;
    }
  }

  async getObjectMetadata(bucket: string, key: string) {
    const cacheKey = `${bucket}:${key}`;
    let command = this.commandCache.get(cacheKey);
    if (typeof command === "undefined") {
      command = new HeadObjectCommand({ Bucket: bucket, Key: key });
      if (this.commandCache.size > 100) {
        const firstKey = this.commandCache.keys().next().value;
        if (firstKey) this.commandCache.delete(firstKey);
      }
      this.commandCache.set(cacheKey, command);
    }
    try {
      const response = await this.s3Client.send(command);
      return {
        size: response.ContentLength,
        contentType: response.ContentType,
        etag: response.ETag,
        lastModified: response.LastModified,
        metadata: response.Metadata
      };
    } catch (error) {
      console.error(`Failed to get metadata for ${bucket}/${key}:`, error);
      return null;
    }
  }

  public async deleteObject(bucket: string, key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key
        })
      );

      this.commandCache.delete(`${bucket}:${key}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete ${bucket}/${key}:`, error);
      return false;
    }
  }

  async finalizeUploadedObject(
    bucket: string,
    key: string
  ): Promise<FinalizeResult> {
    // Optional safety if you’re paranoid / doing cross-region writes:
    // await waitUntilObjectExists({ client: this.s3Client, maxWaitTime: 10 }, { Bucket: bucket, Key: key });

    const head = await this.s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
        // Ask for checksums in the response headers.
        // (If the object is SSE-KMS encrypted, IAM/KMS must allow decrypt/datakey to read checksums.)
        ChecksumMode: "ENABLED"
      })
    );

    const versionId = head.VersionId ?? null; // present when bucket has versioning
    const s3ObjectId = `s3://${bucket}/${key}#${versionId ?? "nov"}`;

    // Prefer SHA256, then CRC32C/CRC32, then SHA1
    const checksum = head.ChecksumSHA256
      ? ({ algo: "SHA256", value: head.ChecksumSHA256 } as const)
      : head.ChecksumCRC32C
        ? ({ algo: "CRC32C", value: head.ChecksumCRC32C } as const)
        : head.ChecksumCRC32
          ? ({ algo: "CRC32", value: head.ChecksumCRC32 } as const)
          : head.ChecksumSHA1
            ? ({ algo: "SHA1", value: head.ChecksumSHA1 } as const)
            : undefined;

    return {
      bucket,
      key,
      versionId,
      s3ObjectId,
      etag: this.stripQuotes(head.ETag),
      size: head.ContentLength ?? undefined,
      contentType: head.ContentType ?? undefined,
      lastModified: head.LastModified?.toISOString(),
      checksum
    };
  }

  public async copyAsset(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string
  ) {
    try {
      const copyCommand = new CopyObjectCommand({
        CopySource: `${sourceBucket}/${sourceKey}`,
        Bucket: destBucket,
        Key: destKey,
        MetadataDirective: "COPY"
      });

      await this.s3Client.send(copyCommand);

      await waitUntilObjectExists(
        { client: this.s3Client, maxWaitTime: 10, minDelay: 1, maxDelay: 2 },
        { Bucket: destBucket, Key: destKey }
      );

      console.log(
        `Successfully copied ${sourceBucket}/${sourceKey} to ${destBucket}/${destKey}`
      );
      return true;
    } catch (error) {
      if (error instanceof ObjectNotInActiveTierError) {
        console.error(
          `[Fault: ${error.$fault}]: Could not copy ${sourceKey} from ${sourceBucket}. Object is not in the active tier.
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
            `Source object not found: ${sourceBucket}/${sourceKey}`
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
      return false;
    }
  }

  private generateKey({ ...metadata }: AssetMetadata): string {
    const timestamp = Date.now();
    const sanitizedFilename = this.sanitizeFilename(metadata.filename);

    // origin/userId/conversationId/timestamp-filename
    const parts = [
      metadata.origin.toLowerCase(),
      metadata.userId,
      `${timestamp}-${sanitizedFilename}`
    ];

    return parts.join("/");
  }

  private selectBucket(origin: AssetOriginType) {
    const bucketKey = BUCKET_MAP[origin];
    return this.config.buckets[bucketKey];
  }

  private sanitizeFilename(filename: string) {
    const basename = filename.split(/[/\\]/).pop() ?? "file";
    return basename.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  private getPublicUrl(bucket: string, key: string): string {
    return `https://${bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  private destroy(): void {
    this.commandCache.clear();
    this.s3Client.destroy();
  }
}
