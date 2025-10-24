import type { Provider } from "@/models.ts";

export type SpreadSheetExtensions = "xlsx" | "xls" | "ods" | "csv";

export type PresentationExtensions = "pptx" | "ppt" | "odp";

export type DocExtensions = "pdf" | "docx" | "doc" | "odt" | "rtf";

export type TextExtensions = "txt" | "tex";

export type EbookExtensions = "epub" | "mobi";

export type UploadMethod = "SERVER" | "PRESIGNED" | "GENERATED" | "FETCHED";

export type AssetOrigin =
  | "UPLOAD"
  | "GENERATED"
  | "REMOTE"
  | "PASTED"
  | "IMPORTED"
  | "SCRAPED"
  | "SCREENSHOT";

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
export type AssetStatus =
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

export type AssetUploadAbortReason =
  | "SERVER"
  | "USER"
  | "NETWORK"
  | "TIMEOUT"
  | "UNKNOWN";

export type ImgColorSpace =
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

export type ImgColorModel =
  | "rgb"
  | "rgba"
  | "grayscale"
  | "grayscale-alpha"
  | "indexed"
  | "cmyk"
  | "ycbcr"
  | "ycck"
  | "vector"
  | "lab"
  | "unknown";

export type ImgFormat =
  | "apng"
  | "png"
  | "jpeg"
  | "gif"
  | "bmp"
  | "webp"
  | "avif"
  | "svg"
  | "ico"
  | "heic"
  | "tiff"
  | "unknown";

export interface ImageSpecs {
  type: "IMAGE";
  width: number;
  height: number;
  format: ImgFormat;
  frames: number;
  animated: boolean;
  hasAlpha: boolean | null;
  /**
   * EXIF orientation (1-8) or null
   */
  orientation: number | null;
  aspectRatio: number;
  colorModel: ImgColorModel;
  colorSpace: ImgColorSpace;
  /**
   * Profile name/description if available, or 'embedded' if present but unnamed, null otherwise
   */
  iccProfile: string | null;
  /**
   * ISO-like string or null
   */
  exifDateTimeOriginal: string | null;
  metadata?: Record<string, string>;
}

export interface PdfDocSpecs {
  pdfVersion: string | null;
  isEncrypted: boolean | null;
  isSearchable: boolean | null;
  isLinearized: boolean | null;
  hasForm: boolean | null;
  hasSignatures: boolean | null;
  hasAttachments: boolean | null;
  hasJavaScript: boolean | null;
  permissions: {
    printing: boolean;
    modifying: boolean;
    copying: boolean;
    annotating: boolean;
  } | null;
}

export interface SpreadSheetDocSpecs {
  sheetCount: number | null;
  sheetNames: string[] | null;
  hasFormulas: boolean | null;
  hasMacros: boolean | null;
  hasPivotTables: boolean | null;
  hasCharts: boolean | null;
  activeSheet: number | null;
}

export interface PresentationDocSpecs {
  slideCount: number | null;
  hasAnimations: boolean | null;
  hasTransitions: boolean | null;
  hasNotes: boolean | null;
  hasMasterSlides: boolean | null;
  presentationFormat: "standard" | "widescreen" | null;
}

export interface DocSpecs {
  type: "DOCUMENT";
  format: string | null;
  mimeType: string | null;
  pageCount: number | null;
  wordCount: number | null;
  lineCount: number | null;
  language: string | null;
  encoding: string | null;
  author: string | null;
  subject: string | null;
  keywords: string[] | null;
  pdfVersion: string | null;
  isEncrypted: boolean | null;
  isSearchable: boolean | null;
  isLinearized: boolean | null;
  textPreview: string | null;
  createdDate: string | null;
  modifiedDate: string | null;
}

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
