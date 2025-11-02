// Properly typed image generation structures based on the actual API response

import { MessageSingleton } from "@slipstream/types";

export interface ImageGenOutput {
  id: string;
  jobId: string;
  jobIndex: number;
  kind: 'PARTIAL' | 'FINAL';
  seriesIndex: number;
  seriesId: string;
  isPartial: boolean;
  attachmentId: string;
  width: number;
  height: number;
  mime: string;
  ext: string;
  revisedPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageMetadata {
  attachmentId: string;
  format: string;
  width: number;
  height: number;
  aspectRatio: number;
  frames: number;
  hasAlpha: boolean;
  animated: boolean;
  orientation: number | null;
  colorSpace: string;
  exifDateTimeOriginal: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  dominantColorHex: string | null;
  iccProfile: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImageGenAttachment {
  id: string;
  conversationId: string | null;
  draftId: string | null;
  batchId: string | null;
  generationGroupId: string;
  seriesId: string;
  userId: string;
  messageId: string;
  s3ObjectId: string;
  origin: 'GENERATED';
  status: 'READY';
  uploadMethod: 'GENERATED';
  assetType: 'IMAGE';
  uploadDuration: number;
  cdnUrl: string;
  publicUrl: string | null;
  sourceUrl: string | null;
  thumbnailKey: string | null;
  compatMime: string;
  compatExt: string;
  compatVersionId: string;
  compatKey: string;
  compatS3ObjectId: string;
  compatStatus: string;
  compatReadyAt: string;
  compatCdnUrl: string;
  bucket: string;
  key: string;
  versionId: string;
  region: string;
  cacheControl: string | null;
  contentDisposition: string | null;
  contentEncoding: string | null;
  expiresAt: string | null;
  size: number;
  filename: string;
  ext: string;
  mime: string;
  etag: string;
  checksumAlgo: string;
  checksumSha256: string;
  storageClass: string | null;
  sseAlgorithm: string | null;
  sseKmsKeyId: string | null;
  s3LastModified: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  imageGenOutput: ImageGenOutput;
  image: ImageMetadata;
}


// Grouped series data for UI rendering
export interface ImageGenSeries {
  seriesId: string;
  items: ImageGenSeriesItem[];
  jobId?: string;
  jobIndex?: number;
  generationGroupId?: string;
  revisedPrompt?: string | null;
}

export interface ImageGenSeriesItem {
  cdnUrl: string;
  width: number;
  height: number;
  mime: string;
  isPartial: boolean;
  index: number;
  generationGroupId?: string;
  seriesId: string;
  revisedPrompt?: string | null;
}
