import type {
  GetModelUtilRT,
  ImageGenModelsByProvider,
  ImageGenProviders,
  Provider
} from "@/models.ts";
import type { CTR, DX, Rm } from "@/utils.ts";

export interface ImageSpecs {
  width: number;
  height: number;
  format: "apng" | "png" | "jpeg" | "gif" | "bmp" | "webp" | "avif" | "unknown";
  frames: number;
  animated: boolean;
  hasAlpha: boolean | null;
  orientation: number | null; // EXIF orientation (1-8) or null
  aspectRatio: number;
  colorModel:
    | "rgb"
    | "rgba"
    | "grayscale"
    | "grayscale-alpha"
    | "indexed"
    | "cmyk"
    | "ycbcr"
    | "ycck"
    | "unknown";
  colorSpace:
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
  iccProfile: string | null; // Profile name/description if available, or 'embedded' if present but unnamed, null otherwise
  exifDateTimeOriginal: string | null; // ISO-like string or null
}

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

export type AIChatRequestUserMetadata = {
  city?: string;
  region?: string;
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

export interface AIChatResEntity<T extends `ai_chat_${AIChatEventTypeUnion}`> {
  type: T;
  conversationId: string;
  userId: string;
  chunk?: string;
  done: T extends "ai_chat_error" ? true : boolean;
  data?: string;
  provider?: Provider;
  title?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
}

export type AIChatRequest = {
  type: "ai_chat_request";
  conversationId: string;
  prompt: string;
  provider: Provider;
  model?: GetModelUtilRT<Provider>;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  hasProviderConfigured?: boolean;
  isDefaultProvider?: boolean;
  metadata?: AIChatRequestUserMetadata;
};

export type AIChatInlineData = DX<
  CTR<AIChatResEntity<"ai_chat_inline_data">, "data">
>;

export type AIChatChunk = DX<
  AIChatResEntity<"ai_chat_chunk"> & {
    isThinking?: boolean;
    thinkingDuration?: number;
    thinkingText?: string;
  }
>;

export type AIChatResponse = DX<
  CTR<AIChatResEntity<"ai_chat_response">, "chunk"> & {
    usage?: number;
    thinkingDuration?: number;
    thinkingText?: string;
  }
>;

export type AIChatError = DX<
  Rm<AIChatResEntity<"ai_chat_error">, "chunk" | "data"> & {
    usage?: number;
    stopReason?: unknown;
    message: string;
  }
>;

export type TypingIndicator = {
  type: "typing";
  userId: string;
  conversationId: string;
};

export type PingMessage = {
  type: "ping";
};
/**
 * Origin types for assets
 */
export type S3ObjectId = `s3://${string}/${string}#${string}`;

export type WithExpiry<K extends string> = {
  [P in K | `${K}ExpiresAt`]: P extends K ? string : number; // epoch ms
};

export type UploadMethod = Uppercase<
  "server" | "presigned" | "generated" | "fetched"
>;
export type AssetOrigin =
  | "UPLOAD"
  | "GENERATED"
  | "REMOTE"
  | "PASTED"
  | "IMPORTED"
  | "SCRAPED"
  | "SCREENSHOT";

/**
 * Asset status lifecycle
 */
export type AssetStatus =
  | "REQUESTED" // Presigned URL requested (legacy)
  | "PLANNED" // Generation job created
  | "UPLOADING" // Currently uploading
  | "STORED" // In S3, not verified
  | "SCANNING" // Security/virus scan
  | "READY" // Available for use
  | "FAILED" // Upload/generation failed
  | "QUARANTINED" // Failed security scan
  | "ATTACHED" // Attached to a message
  | "DELETED"; // Soft deleted

/**
 * Server notifies client that an asset was uploaded server-side
 * (After successful upload via API route or server action)
 */
export type AssetUploadedNotification = DX<
  {
    type: "asset_uploaded";
    conversationId: string;
    attachmentId: string;
    userId: string;
    filename: string;
    mime: string;
    size: number;
    bucket: string;
    key: string;
    versionId: string;
    s3ObjectId: S3ObjectId;
  } & WithExpiry<"downloadUrl"> &
    WithExpiry<"uploadUrl"> & {
      origin: AssetOrigin;
      status: AssetStatus;
      etag?: string;
      /** @deprecated use downloadUrl */
      url?: string;
    }
>;

export type AssetPasteEvent = {
  type: "asset_paste";
  conversationId: string;
  filename: string; // Usually "paste.png" or similar
  mime: string;
  size: number;
  width?: number;
  height?: number;
  metadata?: ImageSpecs;
};

export type AssetReady = DX<
  {
    type: "asset_ready";
    userId: string;
    conversationId: string;
    attachmentId: string;
    bucket: string;
    key: string;
    versionId?: string;
    s3ObjectId: S3ObjectId; // eg, "s3://bucket/key#<versionId|nov>"
    etag?: string;
    size: number; // bytes
    mime: string;
    origin: AssetOrigin;
    status: Extract<AssetStatus, "READY">;
    metadata?: AttachmentMetadata;
  } & WithExpiry<"downloadUrl"> &
    Partial<WithExpiry<"thumbnailUrl">>
>;

export type AssetUploadProgress = {
  type: "asset_upload_progress";
  userId: string;
  conversationId: string;
  attachmentId: string;
  progress: number; // 0-100
  bytesUploaded: number;
  totalBytes: number;
};


export type AssetAttachedToMessage = {
  type: "asset_attached";
  conversationId: string;
  filename: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  metadata?: ImageSpecs;
};

export type AssetDeleted = {
  type: "asset_deleted";
  conversationId: string;
  attachmentId: string;
  userId: string;
  bucket: string;
  key: string;
  versionId: string;
  s3ObjectId: S3ObjectId;
};

export type AssetFetchRequest = {
  type: "asset_fetch_request";
  conversationId: string;
  sourceUrl: string;
  messageId?: string;
};

/**
 * Response for fetched remote asset
 */
export type AssetFetchResponse = DX<
  {
    type: "asset_fetch_response";
    userId: string;
    conversationId: string;
    attachmentId?: string;
    sourceUrl?: string;
    success: boolean;
    error?: string;
    bucket?: string;
    key?: string;
    versionId?: string;
    s3ObjectId?: S3ObjectId;
  } & Partial<WithExpiry<"downloadUrl">>
>;

export type AssetFetchError = {
  type: "asset_fetch_error";
  userId: string;
  conversationId: string;
  attachmentId?: string;
  sourceUrl?: string;
  success: false;
  statusCode?: number;
  error?: string;
};

export type AssetUploadAbort = {
  type: "asset_upload_abort";
  userId: string;
  conversationId: string;
  attachmentId: string;
  reason?:
    | "user" // user hit cancel / navigated away
    | "network" // network error/timeout on client
    | "server" // server told client to abort
    | "timeout"
    | "unknown";
  bytesUploaded?: number; // last known
  totalBytes?: number;
};

/**
 * (Optional) Server → Client ack for the abort
 * Use if you want the UI to reconcile list state immediately.
 * Status sticks to your existing enum; we flag the reason separately.
 */
export type AssetUploadAborted = {
  type: "asset_upload_aborted";
  userId: string;
  conversationId: string;
  attachmentId: string;
  status: Extract<AssetStatus, "FAILED">;
  error?: string; // eg, "aborted_by_user"
};

/**
 * Legacy: Direct base64 upload (backward compatibility)
 * @deprecated Use server-side uploads instead
 */
export type AssetUploadRequest = {
  type: "asset_upload_request";
  userId: string;
  conversationId: string;
  filename: string;
  contentType: string;
  base64: string;
  origin?: AssetOrigin;
};

/**
 * Legacy: Response for direct upload
 * @deprecated
 */
export type AssetUploadResponse = {
  type: "asset_upload_response";
  userId: string;
  conversationId: string;
  url?: string;
  attachmentId?: string;
  success: boolean;
  error?: string;
};

export type AssetUploadError = {
  type: "asset_upload_error";
  userId: string;
  conversationId: string;
  url?: string;
  attachmentId: string;
  success: false;
  error?: string;
};

export type AssetUploadPrepare = {
  type: "asset_upload_prepare";
  conversationId: string;
  filename: string;
  mime: string; // keep naming consistent with other events
  size: number;
  origin: Exclude<AssetOrigin, "REMOTE" | "GENERATED" | "IMPORTED" | "SCRAPED">;
  messageId?: string;
};

// server -> client
export type AssetUploadInstructions = {
  type: "asset_upload_instructions";
  userId: string;
  conversationId: string;
  attachmentId: string;
  method: "PUT" | "POST"; // if you later support POST policy, widen to "PUT" | "POST"
  uploadUrl: string;
  requiredHeaders?: Record<string, string>; // e.g. { "Content-Type": mime }
  expiresIn: number; // seconds
  bucket: string;
  key: string;
};

// client -> server
export type AssetUploadComplete = {
  type: "asset_upload_complete";
  conversationId: string;
  userId: string;
  bucket: string;
  key: string;
  attachmentId: string;
  versionId: string;
  publicUrl: string;
  etag?: string;
  success: boolean;
  duration: number; //milliseconds
  bytesUploaded?: number;
};
// client -> server
export type AssetUploadCompleteError = {
  type: "asset_upload_complete_error";
  conversationId: string;
  bucket: string;
  key: string;
  userId: string;
  attachmentId: string;
  versionId?: string;
  publicUrl?: string;
  etag?: string;
  duration?: number; //milliseconds
  bytesUploaded?: number;
  error: string;
  success: false;
  code?: number;
};


/**
 * Enhanced image generation request
 */
export type ImageGenRequest = {
  type: "image_gen_request";
  conversationId: string;
  prompt: string;
  model: ImageGenModelsByProvider<ImageGenProviders>;
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  steps?: number;
  guidanceScale?: number;
};

/**
 * Enhanced generation response
 */
export type ImageGenResponse = {
  type: "image_gen_response";
  userId: string;
  conversationId: string;
  messageId?: string;
  attachmentId?: string;
  imageUrl?: string;
  taskId?: string;
  success: boolean;
  error?: string;
};

export type ImageGenError = {
  type: "image_gen_error";
  userId: string;
  conversationId: string;
  messageId?: string;
  attachmentId?: string;
  imageUrl?: string;
  taskId?: string;
  success: false;
  error: string;
};

/**
 * Generation progress updates
 */
export type ImageGenProgress = {
  type: "image_gen_progress";
  userId: string;
  conversationId: string;
  taskId: string;
  progress: number; // 0-100
  stage?: string; // "queued" | "processing" | "finalizing"
  eta?: number; // seconds remaining
};

/**
 * Batch upload notification
 */
export type AssetBatchUpload = {
  type: "asset_batch_upload";
  userId: string;
  conversationId: string;
  attachmentIds: string[];
  totalCount: number;
  successCount: number;
  failedCount: number;
};

export type AnyEvent =
  | AIChatChunk
  | AIChatError
  | AIChatInlineData
  | AIChatRequest
  | AIChatResponse
  | AssetAttachedToMessage
  | AssetBatchUpload
  | AssetDeleted
  | AssetFetchError
  | AssetFetchRequest
  | AssetFetchResponse
  | AssetPasteEvent
  | AssetReady
  | AssetUploadAbort
  | AssetUploadAborted
  | AssetUploadedNotification
  | AssetUploadComplete
  | AssetUploadCompleteError
  | AssetUploadError
  | AssetUploadInstructions
  | AssetUploadPrepare
  | AssetUploadProgress
  | AssetUploadRequest
  | AssetUploadResponse
  | ImageGenError
  | ImageGenProgress
  | ImageGenRequest
  | ImageGenResponse
  | PingMessage
  | TypingIndicator;

export type AnyEventTypeUnion = AnyEvent["type"];

/**
 * type alias used in apps/web repo
 */
export type ChatWsEvent = AnyEvent;

/**
 * type alias used in apps/web repo
 */
export type ChatWsEventTypeUnion = ChatWsEvent["type"];

export type EventTypeMap = {
  ai_chat_chunk: AIChatChunk;
  ai_chat_error: AIChatError;
  ai_chat_inline_data: AIChatInlineData;
  ai_chat_request: AIChatRequest;
  ai_chat_response: AIChatResponse;
  asset_attached: AssetAttachedToMessage;
  asset_batch_upload: AssetBatchUpload;
  asset_deleted: AssetDeleted;
  asset_fetch_error: AssetFetchError;
  asset_fetch_request: AssetFetchRequest;
  asset_fetch_response: AssetFetchResponse;
  asset_paste: AssetPasteEvent;
  asset_ready: AssetReady;
  asset_upload_abort: AssetUploadAbort;
  asset_upload_aborted: AssetUploadAborted;
  asset_upload_complete: AssetUploadComplete;
  asset_upload_complete_error: AssetUploadCompleteError;
  asset_upload_error: AssetUploadError;
  asset_upload_instructions: AssetUploadInstructions;
  asset_upload_prepare: AssetUploadPrepare;
  asset_upload_progress: AssetUploadProgress;
  asset_upload_request: AssetUploadRequest;
  asset_upload_response: AssetUploadResponse;
  asset_uploaded: AssetUploadedNotification;
  image_gen_error: ImageGenError;
  image_gen_progress: ImageGenProgress;
  image_gen_request: ImageGenRequest;
  image_gen_response: ImageGenResponse;
  ping: PingMessage;
  typing: TypingIndicator;
};

export type EventMap<T extends keyof EventTypeMap> = {
  [P in T]: EventTypeMap[P];
}[T];

export type RecordCountsProps = {
  isSet: Record<Provider, number>;
  isDefault: Record<Provider, number>;
};

export type ClientContextWorkupProps = {
  isSet: Record<Provider, boolean>;
  isDefault: Record<Provider, boolean>;
};
