import type { Provider } from "@/models.ts";
import { $Enums } from "@slipstream/db/node/generated/client";
import type { ExpandedDocSpecs, ExpandedImgSpecs, PdfDocSpecs as PdfSpecs,SpreadSheetDocSpecs as SpreadSheetSpecs,PresentationDocSpecs as PresentationSpecs } from "@d0paminedriven/metadata";
export type SpreadSheetExtensions = "xlsx" | "xls" | "ods" | "csv";

export type PresentationExtensions = "pptx" | "ppt" | "odp";

export type DocExtensions = "pdf" | "docx" | "doc" | "odt" | "rtf" | "ai";

export type TextExtensions = "txt" | "tex";

export type EbookExtensions = "epub" | "mobi";

export type UploadMethod = $Enums.UploadMethod;

export type AssetOrigin = $Enums.AssetOrigin;

export type AssetUploadInstructionsMethod = "PUT" | "POST";

/**
 * Asset status lifecycle
 *
 * ```ts
 * "REQUESTED" // Presigned URL requested (legacy)
 * "PLANNED" // Generation job created
 * "UPLOADING" // Currently uploading
 * "STORED" // In S3, not verified
 * "SCANNING" // Security/virus scan
 * "READY" // Available for use, verified
 * "FAILED" // Upload/generation failed
 * "QUARANTINED" // Failed security scan
 * "ATTACHED" // Attached to a message
 * "DELETE" // Soft deleted
 * ```
 */
export type AssetStatus = $Enums.AssetStatus;

export type AssetUploadAbortReason =
  | "SERVER"
  | "USER"
  | "NETWORK"
  | "TIMEOUT"
  | "UNKNOWN";

export type ImgColorSpace = $Enums.ColorSpace;

export type ImgColorModel = $Enums.ColorModel;

export type ImgFormat = $Enums.ImageFormat;

export interface ImageSpecs extends ExpandedImgSpecs {};

export interface PdfDocSpecs extends PdfSpecs{}

export interface SpreadSheetDocSpecs extends SpreadSheetSpecs {}

export interface PresentationDocSpecs extends PresentationSpecs {}

export interface DocSpecs extends ExpandedDocSpecs{};

export type UnknownSpecs = {
  type: "UNKNOWN";
  [record: string | number | symbol]: unknown;
};

export type MetadataUnion = ImageSpecs | DocSpecs;

export type MetadataTypeUnion = MetadataUnion["type"];

export type MetadataTypeMap = {
  image_specs: ImageSpecs;
  doc_specs: DocSpecs;
};

export type MetadataMap<T extends keyof MetadataTypeMap> = {
  [P in T]: MetadataTypeMap[P];
}[T];

export type AttachmentMetadata = {
  filename: string;
  originalName?: string;
  uploadMethod?: UploadMethod;
  uploadDuration?: number;
  uploadedAt: string;
  scannedAt?: string;
  scanResult?: "clean" | "infected";
  thumbnailGenerated?: boolean;
  extractedText?: string;
  dimensions?: { width: number; height: number };
  thumbnailDimensions?: { width: number; height: number };
  quality?: number;
  duration?: number;
  [key: string]: unknown;
};

export type UserMetadata = {
  city?: string;
  region?: string;
  ip?: string;
  ua?: string;
  country?: string;
  lat?: number;
  lng?: number;
  tz?: string;
  postalCode?: string;
  locale?: string;
  providerContext?: ClientContextWorkupProps;
};

export type AIChatEventTypeUnion =
  | "chunk"
  | "error"
  | "inline_data"
  | "response";

export type S3ObjectId = `s3://${string}/${string}#${string}`;

export type AssetDraftId = `${string}~${string}~${string}~${number}`;

export type WithExpiry<K extends string> = {
  [P in K | `${K}ExpiresAt`]: P extends K ? string : number; // epoch ms
};

/**
 * BYOK handling
 */
export type RecordCountsProps = {
  isSet: Record<Provider, number>;
  isDefault: Record<Provider, number>;
};

export type ClientContextWorkupProps = {
  isSet: Record<Provider, boolean>;
  isDefault: Record<Provider, boolean>;
};
