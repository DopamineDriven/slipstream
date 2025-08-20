import * as https from "https";
import {
  AssetOrigin,
  AssetStatus,
  UploadMethod
} from "@/generated/client/enums.ts";
import { Sha256 } from "@aws-crypto/sha256-js";
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
import {
  getSignedUrl,
  S3RequestPresigner
} from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@smithy/node-http-handler";

// These provide compile-time type safety while avoiding runtime enum overhead
export type AssetOriginType = keyof typeof AssetOrigin;
export type AssetStatusType = keyof typeof AssetStatus;
export type UploadMethodType = keyof typeof UploadMethod;

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
  private readonly s3Client: S3Client;
  private readonly config: S3Config;
  private readonly presigner: S3RequestPresigner;

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
      maxAttempts: 3,
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

    // Initialize presigner with proper ChecksumConstructor
    // This gives us more control over presigning configuration
    // and allows for potential custom signing logic
    this.presigner = new S3RequestPresigner({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      region: config.region,
      sha256: Sha256 // Using the ChecksumConstructor (not the deprecated HashConstructor)
    });
  }

  /**
   * Get the singleton instance of S3Service
   * @param config Optional S3Config - only used on first call
   * @returns The singleton S3Service instance
   */
  public static getInstance(config: S3Config): S3Service {
    if (!S3Service.instance) {
      S3Service.instance = new S3Service(config);
      return S3Service.instance;
    }
    return S3Service.instance;
  }

  /**
   * Check if an instance exists without creating one
   */
  public static hasInstance(): boolean {
    return S3Service.instance !== null;
  }

  /**
   * Reset the singleton instance (useful for testing or graceful shutdown)
   */
  public static async resetInstance(): Promise<void> {
    if (S3Service.instance) {
      S3Service.instance.destroy();
      S3Service.instance = null;
    }
  }

  /**
   * Generate a presigned URL for direct client upload
   * @performance Reuses S3Client and presigner instances
   */
  async generatePresignedUpload(
    { ...metadata }: AssetMetadata,
    expiresIn = 3600
  ): Promise<PresignedUploadResponse> {
    const key = this.generateKey(metadata);
    const bucket = this.selectBucket(metadata.origin);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: metadata.contentType,
      Metadata: {
        userId: metadata.userId,
        messageId: metadata.messageId ?? "",
        filename: metadata.filename,
        origin: metadata.origin
      }
    });

    // Option 1: Use getSignedUrl helper (recommended)
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    // Option 2: Use presigner directly for more control (alternative)
    // const presignedRequest = await this.presigner.presign(command, { expiresIn });
    // const uploadUrl = presignedRequest.url;

    const publicUrl = this.getPublicUrl(bucket, key);

    return {
      uploadUrl,
      publicUrl,
      key,
      bucket
    };
  }

  /**
   * Generate a presigned URL for download
   */
  async generatePresignedDownload(
    bucket: string,
    key: string,
    expiresIn = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Direct upload from server (for generated content)
   */
  async uploadDirect(
    data: Buffer | Uint8Array | string,
    { conversationId = "new-chat", ...metadata }: AssetMetadata
  ): Promise<{ url: string; key: string; bucket: string; etag?: string }> {
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

  /**
   * Check if an object exists
   * @performance Uses cached HeadObjectCommand when possible
   */
  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      const cacheKey = `${bucket}:${key}`;
      let command = this.commandCache.get(cacheKey);

      if (!command) {
        command = new HeadObjectCommand({ Bucket: bucket, Key: key });
        // Limit cache size to prevent memory bloat
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

  /**
   * Get object metadata
   */
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

  /**
   * Delete an object
   */
  async deleteObject(bucket: string, key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key
        })
      );
      // Clear from cache if present
      this.commandCache.delete(`${bucket}:${key}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete ${bucket}/${key}:`, error);
      return false;
    }
  }

  async copyAsset(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string
  ): Promise<boolean> {
    try {
      // Server-side copy - no data transfer through your application!
      const copyCommand = new CopyObjectCommand({
        CopySource: `${sourceBucket}/${sourceKey}`,
        Bucket: destBucket,
        Key: destKey,
        MetadataDirective: "COPY" // Preserves original metadata
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
      if (error instanceof Error) {
        // Handle specific S3 errors
        if (error.name === "NoSuchKey") {
          console.error(
            `Source object not found: ${sourceBucket}/${sourceKey}`
          );
        } else if (error.name === "AccessDenied") {
          console.error(`Access denied for copy operation`);
        } else if (error.name === "ObjectNotInActiveTierError") {
          console.error(
            `Object is in Glacier/Deep Archive and not available for copy`
          );
        } else if (error instanceof ObjectNotInActiveTierError) {
          console.error(
            `Could not copy ${sourceKey} from ${sourceBucket}. Object is not in the active tier.`
          );
        }
      }
      return false;
    }
  }

  /**
   * Generate a consistent key structure
   */
  private generateKey({
    ...metadata
  }: AssetMetadata): string {
    const timestamp = Date.now();
    const sanitizedFilename = this.sanitizeFilename(metadata.filename);

    // Structure: origin/userId/conversationId/timestamp-filename
    const parts = [
      metadata.origin.toLowerCase(),
      metadata.userId,
      `${timestamp}-${sanitizedFilename}`
    ];

    return parts.join("/");
  }

  /**
   * Select appropriate bucket based on origin
   * @performance Uses const map lookup instead of switch statement
   */
  private selectBucket(origin: AssetOriginType): string {
    const bucketKey = BUCKET_MAP[origin];
    return this.config.buckets[bucketKey];
  }

  /**
   * Sanitize filename for S3
   */
  private sanitizeFilename(filename: string): string {
    // Remove path traversal attempts
    const basename = filename.split(/[/\\]/).pop() ?? "file";
    // Replace unsafe characters, but preserve file extension
    return basename.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  /**
   * Get public URL (if bucket is public)
   */
  private getPublicUrl(bucket: string, key: string): string {
    return `https://${bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  /**
   * Cleanup resources (called internally on reset)
   */
  private destroy(): void {
    this.commandCache.clear();
    this.s3Client.destroy();
  }
}
