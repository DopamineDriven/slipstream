import type {
  AIChatRequestImgGenFields,
  AIChatResponseImgGenFieldsFinal,
  ImgGenStage
} from "@/events-images.ts";
import type {
  AIChatEventTypeUnion,
  AssetOrigin,
  AssetStatus,
  AssetUploadAbortReason,
  AssetUploadInstructionsMethod,
  AttachmentMetadata,
  MetadataUnion,
  S3ObjectId,
  UserMetadata,
  WithExpiry
} from "@/events-workup.ts";
import type {
  GetModelUtilRT,
  ImageGenFacilitatingModelsByProvider,
  ImageGenModelsByProvider,
  ImageGenProviders,
  Provider
} from "@/models.ts";
import type { CTR, DX, Rm } from "@/utils.ts";

export interface AIChatResEntity<T extends `ai_chat_${AIChatEventTypeUnion}`> {
  type: T;
  conversationId: string;
  userMsgId: string;
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
  aiMsgId?: string;
  imgGenEnabled?: boolean;
  imgGenFields?: AIChatResponseImgGenFieldsFinal;
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
  metadata?: UserMetadata;
  batchId?: string;
  imgGenEnabled?: boolean;
  imgGenFields?: AIChatRequestImgGenFields;
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

export type AIChatResponseDb = DX<
  Rm<CTR<AIChatResEntity<"ai_chat_response">, "chunk">, "imgGenFields"> & {
    usage?: number;
    thinkingDuration?: number;
    thinkingText?: string;
    imgGenFields?: AIChatResponseImgGenFieldsFinal;
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
  provider: ImageGenProviders;
  model?:
    | ImageGenModelsByProvider<"gemini">
    | ImageGenModelsByProvider<"openai">
    | ImageGenModelsByProvider<"grok">
    | ImageGenFacilitatingModelsByProvider<"gemini">
    | ImageGenFacilitatingModelsByProvider<"openai">;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  hasProviderConfigured?: boolean;
  isDefaultProvider?: boolean;
  batchId?: string;
  metadata?: UserMetadata;
  /**
   * gpt-image-1 only
   *
   * values include "high" | "low" | null
   */
  input_fidelity?: string;
  /**
   * gpt-image-1 & gpt-image-1-mini only
   *
   * values include "low" | "auto"
   */
  moderation?: string;
  /**
   * gpt-image-1, gpt-image-1-mini, dall-e-2:
   *
   * n=1 (default),
   * n=10 (max)
   *
   * dall-e-3:
   *
   * n=1 (default),
   * n=1 (max)
   *
   * gemini-2.5-flash-image:
   *
   * n=1 (default),
   * n=10 (max)
   *
   * imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * n=1 (default),
   * n=4 (max)
   *
   * grok-2-image-1212
   *
   * n=1 (default),
   * n=10 (max)
   */
  n?: number;
  negativePrompt?: string;
  /**
   * gpt-image-1 & gpt-image-1-mini only:
   *
   * n=0 (default),
   * n=3 (max)
   *
   * *streaming must be set to **true***
   */
  output_partial_images?: number;
  /**
   * gpt-image-1, gpt-image-1-mini:
   *
   * "png" (default);
   * "png" | "jpeg" | "webp"
   *
   * imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "png" (default);
   * "png" | "jpeg"
   */
  output_format?: string;
  /**
   *
   * gpt-image-1, gpt-image-1-mini:
   *
   * output must be of type jpeg or webp
   *
   * Range: 0-100. Default: 100
   *
   *
   * imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * Only applies if mimeType is "image/jpeg",
   * Range: 0-100. Default: 75
   */
  output_compression?: number;
  /**
   * gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "transparent" | "opaque" | "auto"
   *
   * output format must be "png" | "webp"
   */
  output_background?: "transparent" | "opaque" | "auto";
  /**
   *  gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "low" | "medium" | "high" | "auto"
   *
   * dall-e-3:
   *
   * "auto" (default); "standard" | "hd" | "auto"
   *
   * dall-e-2:
   *
   * "auto" (default); "standard" | "auto"
   *
   * imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "1K" (default); "1K" | "2K"
   */
  output_quality: string;
  /**
   *  gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "1024x1024" | "1536x1024" | "1024x1536" | "auto"
   *
   * dall-e-3:
   *
   * "auto" (default); "1024x1024" | "1792x1024" | "1024x1792" | "auto"
   *
   * dall-e-2:
   *
   * "auto" (default); "1024x1024" | "256x256" | "512x512" | "auto"
   *
   * imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "1:1" (default); "1:1" | "9:16" | "16:9" | "3:4" | "4:3"
   *
   * gemini-2.5-flash-image:
   *
   * "1:1" (default); "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9"
   */
  output_size?: string;
  /**
   * **Imagen 3 & 4 models only**
   *
   * imagen-3.0-generate-002, imagen-4.0-generate-001,
   * imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001
   *
   * "dont_allow": Disallow the inclusion of people or faces in images.
   *
   * "allow_adult": Allow generation of adults only.
   *
   * "allow_all": Allow generation of people of all ages.
   *
   * ---
   *
   * "allow_adult" (default)
   */
  personGeneration?: string;

  seed?: number;
};

/**
 * Enhanced generation response
 */
export type ImageGenResponse = {
  type: "image_gen_response";
  done: boolean;
  userId: string;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  conversationId: string;
  chunk?: string;
  thinkingChunk?: string;
  thinkingDuration?: string;
  usage?: number;
  title?: string;
  provider: string;
  duration: number;
  model: string;
  requested_count: number;
  actual_count: number;
  partialImages?: {
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
    revised_prompt?: string;
  }[];
  images: {
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
    revised_prompt?: string;
  }[];
  messageId?: string;
  success: boolean;
  error?: string;
};

export type ImageGenError = {
  type: "image_gen_error";
  done: boolean;
  userId: string;
  temperature?: number;
  systemPrompt?: string;
  prompt?: string;
  topP?: number;
  requested_count: number;
  duration: number;
  title?: string;
  provider: string;
  model: string;
  stop_reason?: unknown;
  conversationId: string;
  messageId?: string;
  success: false;
  error: string;
};

/**
 * Generation progress updates
 */
export type ImageGenProgress = {
  type: "image_gen_progress";
  done: boolean;
  userId: string;
  temperature?: number;
  topP?: number;
  conversationId: string;
  model: string;
  chunk?: string;
  thinkingChunk?: string;
  thinkingDuration?: string;
  title?: string;
  provider: string;
  duration: number;
  partial_image?: {
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
    revised_prompt?: string;
  }[];
  images?: {
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
    revised_prompt?: string;
  }[];
  requested_count: number;
  systemPrompt?: string;
  /**
   * 0-100 (??????? how do we know the progress if provider/user-network dependent?)
   */
  progress: number;
  /**
   * "queued" | "processing" | "persisting" | "finalizing" | "refusal" | "aborted"
   */
  stage?: ImgGenStage;
  /**
   *  seconds remaining (how will we know the seconds remaining if provider/user-network dependent)?
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

export type AIChatResRT = {
  conversationSettings: {
    createdAt: Date;
    id: string;
    updatedAt: Date;
    conversationId: string;
    systemPrompt: string | null;
    temperature: number | null;
    topP: number | null;
    enableThinking: boolean | null;
    trackUsage: boolean | null;
    enableWebSearch: boolean | null;
    enableAssetGen: boolean | null;
    reasoningEffort: "minimal" | "low" | "medium" | "high" | null;
    outputVerbosity: ("low" | "medium" | "high") | null
    maxTokens: number | null;
    usageAlerts: boolean | null;
  } | null;
  messages: ({
    attachments: ({
      imageGenOutput: {
        createdAt: Date;
        id: string;
        updatedAt: Date;
        jobId: string;
        mime: string | null;
        jobIndex: number;
        kind: "PARTIAL" | "FINAL";
        seriesIndex: number;
        seriesId: string;
        isPartial: boolean;
        width: number | null;
        height: number | null;
        ext: string | null;
        revisedPrompt: string | null;
        attachmentId: string;
      } | null;
      image: {
        createdAt: Date;
        updatedAt: Date;
        width: number;
        height: number;
        format: "jpeg" | "png" | "gif" | "webp" | "avif" | "heic" | "apng" | "bmp" | "tiff" | "ico" | "jxl" | "jp2" | "jpx" | "jxr" | "jls" | "svg" | "raw" | "dng" | "cr2" | "nef" | "arw" | "hdr" | "pic" | "rgbe" | "xyze" | "unknown";
        aspectRatio: number | null;
        frames: number;
        hasAlpha: boolean | null;
        animated: boolean;
        orientation: number | null;
        colorSpace: "unknown" | "srgb" | "display_p3" | "adobe_rgb" | "prophoto_rgb" | "rec2020" | "rec709" | "cmyk" | "lab" | "xyz" | "gray" | null;
        exifDateTimeOriginal: Date | null;
        cameraMake: string | null;
        cameraModel: string | null;
        lensModel: string | null;
        gpsLat: number | null;
        gpsLon: number | null;
        dominantColorHex: string | null;
        iccProfile: string | null;
        attachmentId: string;
      } | null;
    } & {
      createdAt: Date;
      id: string;
      userId: string;
      updatedAt: Date;
      conversationId: string | null;
      uploadDuration: number | null;
      mime: string | null;
      seriesId: string | null;
      ext: string | null;
      draftId: string | null;
      batchId: string | null;
      generationGroupId: string | null;
      s3ObjectId: string | null;
      origin: "UPLOAD" | "REMOTE" | "GENERATED" | "PASTED" | "SCREENSHOT" | "IMPORTED" | "SCRAPED";
      status: "REQUESTED" | "PLANNED" | "UPLOADING" | "STORED" | "SCANNING" | "READY" | "FAILED" | "QUARANTINED" | "ATTACHED" | "DELETED";
      uploadMethod: "GENERATED" | "FETCHED" | "PRESIGNED" | "SERVER";
      assetType: "DOCUMENT" | "IMAGE" | "VIDEO" | "AUDIO" | "UNKNOWN";
      cdnUrl: string | null;
      publicUrl: string | null;
      sourceUrl: string | null;
      thumbnailKey: string | null;
      compatMime: string | null;
      compatExt: string | null;
      compatVersionId: string | null;
      compatKey: string | null;
      compatS3ObjectId: string | null;
      compatStatus: "FAILED" | "PENDING" | "ACTIVE" | "ALIASED" | null;
      compatReadyAt: Date | null;
      compatCdnUrl: string | null;
      bucket: string;
      key: string;
      versionId: string | null;
      region: string;
      cacheControl: string | null;
      contentDisposition: string | null;
      contentEncoding: string | null;
      expiresAt: Date | null;
      size: bigint | null;
      filename: string | null;
      etag: string | null;
      checksumAlgo: "CRC32" | "CRC32C" | "SHA1" | "SHA256" | "CRC64NVME";
      checksumSha256: string | null;
      storageClass: string | null;
      sseAlgorithm: string | null;
      sseKmsKeyId: string | null;
      s3LastModified: Date | null;
      deletedAt: Date | null;
      messageId: string | null;
    })[];
  } & {
    createdAt: Date;
    id: string;
    userId: string | null;
    userKeyId: string | null;
    updatedAt: Date;
    conversationId: string;
    provider: "OPENAI" | "GROK" | "GEMINI" | "ANTHROPIC" | "META" | "VERCEL";
    model: string | null;
    thinkingDuration: number | null;
    thinkingText: string | null;
    senderType: "USER" | "AI" | "SYSTEM";
    content: string;
    isImageGen: boolean;
    messageType: "AUDIO_GEN" | "COMPUTER_USE" | "IMAGE_GEN" | "TEXT" | "VIDEO_GEN";
    liked: boolean | null;
    disliked: boolean | null;
    tryAgain: boolean | null;
  })[];
} & {
  createdAt: Date;
  id: string;
  shareToken: string | null;
  userId: string;
  userKeyId: string | null;
  title: string | null;
  updatedAt: Date;
  branchId: string | null;
  parentId: string | null;
  isShared: boolean;
};
