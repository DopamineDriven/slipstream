import type { GetModelUtilRT, Provider } from "@/models.ts";
import type { CTR, DX, Rm } from "./utils.ts";

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

export type UploadMethod = Uppercase<"server" | "presigned" | "generated" | "fetched">;
export type AssetOrigin =
  | "UPLOAD"
  | "GENERATED"
  | "REMOTE"
  | "PASTED"
  | "IMPORT"
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
export type AssetUploadedNotification = {
  type: "asset_uploaded";
  conversationId: string;
  attachmentId: string;
  userId: string;
  filename: string;
  mime: string;
  size: number;
  bucket: string;
  key: string;
  url: string; // Signed URL for immediate access
  origin: AssetOrigin;
  status: AssetStatus;
};

/**
 * Client notifies server when paste event occurs
 * Server will respond with upload instructions
 */
export type AssetPasteEvent = {
  type: "asset_paste";
  conversationId: string;
  filename: string; // Usually "paste.png" or similar
  contentType: string;
  size: number;
};

/**
 * Track upload progress (server → client)
 */
export type AssetUploadProgress = {
  type: "asset_upload_progress";
  conversationId: string;
  attachmentId: string;
  progress: number; // 0-100
  bytesUploaded: number;
  totalBytes: number;
};

/**
 * Notify when an asset is attached to a message
 */
export type AssetAttachedToMessage = {
  type: "asset_attached";
  conversationId: string;
  messageId: string;
  attachmentId: string;
};

/**
 * Notify when an asset is deleted
 */
export type AssetDeleted = {
  type: "asset_deleted";
  conversationId: string;
  attachmentId: string;
  userId: string;
};

/**
 * Request to fetch and store a remote URL
 */
export type AssetFetchRequest = {
  type: "asset_fetch_request";
  conversationId: string;
  url: string;
  messageId?: string;
};

/**
 * Response for fetched remote asset
 */
export type AssetFetchResponse = {
  type: "asset_fetch_response";
  conversationId: string;
  attachmentId?: string;
  url?: string;
  success: boolean;
  error?: string;
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

/**
 * Enhanced image generation request
 */
export type ImageGenRequest = {
  type: "image_gen_request";
  userId: string;
  conversationId: string;
  messageId?: string;
  prompt: string;
  model?: "stable-diffusion" | "dalle-3" | "midjourney";
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
  attachmentId?: string;
  imageUrl?: string;
  taskId?: string;
  success: boolean;
  error?: string;
};

/**
 * Generation progress updates
 */
export type ImageGenProgress = {
  type: "image_gen_progress";
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
  | AssetFetchRequest
  | AssetFetchResponse
  | AssetPasteEvent
  | AssetUploadedNotification
  | AssetUploadProgress
  | AssetUploadRequest
  | AssetUploadResponse
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
  asset_fetch_request: AssetFetchRequest;
  asset_fetch_response: AssetFetchResponse;
  asset_paste: AssetPasteEvent;
  asset_uploaded: AssetUploadedNotification;
  asset_upload_progress: AssetUploadProgress;
  asset_upload_request: AssetUploadRequest;
  asset_upload_response: AssetUploadResponse;
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
