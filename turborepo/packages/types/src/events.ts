import type {
  AIChatEventTypeUnion,
  AIChatRequestUserMetadata,
  AssetOrigin,
  AssetStatus,
  AssetUploadAbortReason,
  AssetUploadInstructionsMethod,
  AttachmentMetadata,
  MetadataUnion,
  S3ObjectId,
  WithExpiry
} from "@/events-workup.ts";
import type {
  GetModelUtilRT,
  ImageGenModelsByProvider,
  ImageGenProviders,
  Provider
} from "@/models.ts";
import type { MessageSingleton } from "@/types.ts";
import type { CTR, DX, Rm } from "@/utils.ts";

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
  batchId?: string;
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
    draftId?: string;
    batchId?: string;
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
  draftId: string;
  batchId: string;
  /**
   *  Usually "paste.png" or similar
   */
  filename: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  metadata?: MetadataUnion;
};

export type AssetReady = DX<
  {
    type: "asset_ready";
    userId: string;
    conversationId: string;
    attachmentId: string;
    bucket: string;
    key: string;
    draftId?: string;
    batchId?: string;
    publicUrl?: string;
    cdnUrl?: string;
    versionId?: string;
    /**
     * eg, "s3://bucket/key#<versionId|nov>"
     */
    s3ObjectId: S3ObjectId;
    etag?: string;
    /**
     * bytes
     */
    size: number;
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
  draftId?: string;
  batchId?: string;
  conversationId: string;
  attachmentId: string;
  /**
   * 0-100
   */
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
};

export type AssetAttachedToMessage = {
  type: "asset_attached";
  conversationId: string;
  filename: string;
  mime: string;
  size: number;
  draftId: string;
  batchId: string;
  width?: number;
  height?: number;
  metadata?: MetadataUnion;
};

export type AssetDeleted = {
  type: "asset_deleted";
  conversationId: string;
  attachmentId: string;
  messageId?: string;
  draftId?: string;
  batchId?: string;
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
  draftId?: string;
  batchId?: string;
  reason?: AssetUploadAbortReason;
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
  draftId?: string;
  batchId?: string;
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
  draftId?: string;
  batchId?: string;
  url?: string;
  attachmentId: string;
  success: false;
  error?: string;
};

export type AssetUploadPrepare = {
  type: "asset_upload_prepare";
  conversationId: string;
  filename: string;
  /**
   * keep naming consistent with other events
   */
  mime: string;
  size: number;
  origin: Exclude<AssetOrigin, "REMOTE" | "GENERATED" | "IMPORTED" | "SCRAPED">;
  draftId?: string;
  batchId?: string;
};

// server -> client
export type AssetUploadInstructions = {
  type: "asset_upload_instructions";
  userId: string;
  conversationId: string;
  draftId?: string;
  mimeType: string;
  batchId?: string;
  attachmentId: string;
  method: AssetUploadInstructionsMethod;
  uploadUrl: string;
  /**
   *  { "Content-Type": mime }
   */
  requiredHeaders?: Record<string, string>;
  /**
   * seconds
   */
  expiresIn: number;
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
  draftId?: string;
  batchId?: string;
  publicUrl: string;
  width?: number;
  height?: number;
  metadata?: MetadataUnion;
  etag?: string;
  success: boolean;
  /**
   * milliseconds
   */
  duration: number;
  bytesUploaded?: number;
};

/**
 * client -> server
 */
export type AssetUploadCompleteError = {
  type: "asset_upload_complete_error";
  conversationId: string;
  bucket: string;
  key: string;
  userId: string;
  attachmentId: string;
  draftId?: string;
  batchId?: string;
  versionId?: string;
  publicUrl?: string;
  etag?: string;
  /**
   * milliseconds
   */
  duration?: number;
  bytesUploaded?: number;
  width?: number;
  height?: number;
  metadata?: MetadataUnion;
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
  chunks: string[];
  thinkingChunks: string[];
  isNewChat: boolean;
  msgs: MessageSingleton<true>[];
  provider: ImageGenProviders;
  model: ImageGenModelsByProvider<ImageGenProviders>;
  hasProviderConfigured?: boolean;
  systemPrompt: string | undefined;
  timestamp: number;
  temperature: number | undefined;
  title: string | undefined;
  topP: number | undefined;
  apiKey: string | undefined;
  keyId: string | null;
  max_tokens: number | undefined;
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
  cdnUrl: string;
  mime: string;
  versionId: string;
  key: string;
  bucket: string;
  messageId?: string;
  attachmentId: string;
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
  /**
   * 0-100
   */
  progress: number;
  /**
   * "queued" | "processing" | "finalizing"
   */
  stage?: string;
  /**
   *  seconds remaining
   */
  eta?: number;
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
