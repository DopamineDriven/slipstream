import type { StorageClass } from "@aws-sdk/client-s3";

export interface StorageConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  buckets: {
    wsAssets: string;
    pyGenAssets: string;
  };
  kmsKeyId?: string;
  defaultPresignExpiry?: number;
}


export type UploadResult ={
  bucket: string;
  key: string;
  etag?: string;
  objectId: string;
  versionId?: string;
  s3Uri: string;
  publicUrl: string;
  size?: number;
  location?: string;
}

export type UploadOptions = {
  onProgress?: (progress: {
    loaded: number;
    total: number;
    percentage: number;
  }) => void;
  tags?: Record<string, string>;
  cacheControl?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
}

export type CopyOptions ={
  copyMetadata?: boolean;
  metadata?: Record<string, string>;
  contentType?: string;
}

export type StreamOptions = {
  highWaterMark?: number;
  chunkSize?: number;
}


export interface StorageConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  buckets: {
    wsAssets: string;
    pyGenAssets: string;
  };
  /**
   * If I decide to add KMS
   */
  kmsKeyId?: string;
  defaultPresignExpiry?: number;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  bucket: string;
  fields?: Record<string, string>;
}

export interface AssetMetadata {
  userId: string;
  conversationId?: string;
  messageId?: string;
  filename: string;
  contentType: string;
  size?: number;
  origin: AssetOriginType; // Using literal union type
}

export interface PresignMeta {
  userId: string;
  filename: string;
  contentType: string;
  origin: AssetOriginType;
  messageId?: string | null;
  conversationId?: string | null;
  size?: number;
}

export type PresignResult = {
  uploadUrl: string;
  key: string;
  bucket: string;
  /**
   * s3://bucket/key (no version yet)
   */
  s3Uri: string;
  publicUrl: string;
  requiredHeaders: Record<string, string>;
};

export type FinalizeResult = {
  bucket: string;
  key: string;
  versionId: string | null;
  /**
   * s3://bucket/key#<version|nov>
   */
  s3ObjectId: string;
  extension?: string;
  etag?: string;
  size?: number;
  contentType?: string;
  lastModified?: string;
  cacheControl?: string;
  contentDisposition?: string;
  storageClass?: keyof typeof StorageClass;
  expires?: Date;
  checksum?: { algo: ChecksumAlgorithmType; value: string };
};

export type ImageProbe = {
  format: ImageFormatType;
  width: number;
  height: number;
  frames: number;
  animated: boolean;
  hasAlpha: boolean | null;
  orientation: number | null;
  aspectRatio: number;
  colorSpace: ColorSpaceType;
  iccProfile: string | null;
  exifDateTimeOriginal: string | null;
};

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

export type ColorSpaceType =
  | "unknown"
  | "srgb"
  | "display_p3"
  | "adobe_rgb"
  | "prophoto_rgb"
  | "rec2020"
  | "rec709"
  | "cmyk"
  | "lab"
  | "xyz"
  | "gray";
