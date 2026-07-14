import type {
  GrokLanguageTTS,
  GrokVoiceTTS,
  TTSCodec
} from "@/events-audio.ts";
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
  ClientContextWorkupProps,
  MetadataUnion,
  S3ObjectId,
  UserMetadata,
  UserRxnAction,
  WithExpiry
} from "@/events-workup.ts";
import type {
  LocalToolCapabilities,
  LocalToolRequest,
  LocalToolResult
} from "@/local-tools.ts";
import type {
  AllImgGenFacilitatingModelsUnion,
  AllImgGenModelsUnion,
  AllModelsUnion,
  ImageGenProviders,
  Provider
} from "@/models.ts";
import type { ConversationSingleton } from "@/types.ts";
import type { CTR, DX, Rm, UTR } from "@/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

export type ConversationListEntry = {
  id: string;
  title: string | null;
  updatedAt: number;
  messageCount: number;
};

export type ConversationList = {
  type: "conversation_list";
  take?: number; // server clamps (default 50, max ~100)
};

export type ConversationListAck = {
  type: "conversation_list_ack";
  userId: string;
  conversations: ConversationListEntry[];
};

export type ChatChunkAndResMsgBlock = {
  type: $Enums.MessageBlockType;
  content: string;
  ordinal: number;
  conversationId: string;
  durationMs: number;
};

export type HydrateConversation = {
  type: "hydrate_conversation";
  conversationId: string;
  lowestLoadedOrdinal: number;
  /** clamped server-side; defaults to CONVERSATION_PAGE_SIZE */
  take?: number;
};

export type HydrateConversationPage = {
  /**
   * Exclusive upper bound / SWR page key cursor.
   * This page was fetched with: ordinal < cursor.
   */
  cursor: number;
  /**
   * First ordinal in lookup order.
   * Because messages are ordinal-desc, this is the newest/highest ordinal in the page.
   */
  firstOrdinal: number;
  /**
   * Last ordinal in lookup order.
   * Because messages are ordinal-desc, this is the oldest/lowest ordinal in the page.
   * The next older page uses cursor = lastOrdinal.
   */
  lastOrdinal: number;
  convo: ConversationSingleton<true>;
  hasMore: boolean;
};

export type HydrateConversationAck = {
  type: "hydrate_conversation_ack";
  userId: string;
  pages: HydrateConversationPage[];
  conversationId: string;
};

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
  messageBlocks?: T extends "ai_chat_response"
    ? ChatChunkAndResMsgBlock[]
    : ChatChunkAndResMsgBlock;
  imgGenAttachmentId?: string;
  imgGenEnabled?: boolean;
  imgGenFields?: AIChatResponseImgGenFieldsFinal;
}

export type AIChatRequest = {
  type: "ai_chat_request";
  conversationId: string;
  prompt: string;
  provider: Provider;
  model?: AllModelsUnion;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  hasProviderConfigured?: boolean;
  isDefaultProvider?: boolean;
  metadata?: UserMetadata;
  batchId?: string;
  // TODO
  // enableVideoGen?: boolean
  imgGenEnabled?: boolean;
  imgGenFields?: AIChatRequestImgGenFields;
  localTools?: LocalToolCapabilities;
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
    /**
     * only contains a single message within, the most recent one (the ai model's response)
     */
    convo: ConversationSingleton<true>;
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
    responseOutput?: string;
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

export type ConnectionEstablished = {
  type: "connection_established";
  providerContext: ClientContextWorkupProps;
};

export type ProviderContextUpdate = {
  type: "provider_context_update";
};

export type ProviderContextUpdateAck = {
  type: "provider_context_update_ack";
  providerContext: ClientContextWorkupProps;
};

export type ProviderContextPing = {
  type: "provider_context_ping";
};

export type ProviderContextPong = {
  type: "provider_context_pong";
  providerContext: ClientContextWorkupProps;
};

export type UserRxnUpdate = {
  type: "user_rxn_update";
  conversationId: string;
  messageId: string;
  action: UserRxnAction;
};
export type UserRxnUpdateAck = {
  type: "user_rxn_update_ack";
  conversationId: string;
  messageId: string;
  liked: boolean | null;
  disliked: boolean | null;
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
  model?: AllImgGenFacilitatingModelsUnion | AllImgGenModelsUnion;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  hasProviderConfigured?: boolean;
  isDefaultProvider?: boolean;
  batchId?: string;
  metadata?: UserMetadata;
  /**
   * gpt-image-2, gpt-image-1.5 & gpt-image-1 only
   *
   * values include "high" | "low" | null
   */
  input_fidelity?: string;
  /**
   * gpt-image-2, gpt-image-1.5, gpt-image-1, and gpt-image-1-mini only
   *
   * values include "low" | "auto"
   */
  moderation?: string;
  /**
   * gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * n=1 (default),
   * n=10 (max)
   *
   * gemini-3.1-flash-image-preview (Nano Banana 2), gemini-3-pro-image-preview (Nano Banana Pro), and gemini-2.5-flash-image (Nano Banana):
   *
   * n=1 (default),
   * n=10 (max)
   *
   *
   * grok-imagine-image (uncertain as to how xAI caps grok-imagine-image-quality)
   *
   * n=1 (default),
   * n=10 (max)
   */
  n?: number;
  negativePrompt?: string;
  /**
   * gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
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
   *  imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "png" (default);
   * "png" | "jpeg"
   */
  output_format?: string;
  /**
   *
   * gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * output must be of type jpeg or webp
   *
   * Range: 0-100. Default: 100
   */
  output_compression?: number;
  /**
   * gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "transparent" | "opaque" | "auto"
   *
   * output format must be "png" | "webp"
   */
  output_background?: "transparent" | "opaque" | "auto";
  /**
   *  gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "low" | "medium" | "high" | "auto"
   *
   * imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "1K" (default); "1K" | "2K"
   */
  output_quality: string;
  /**
   *  gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "1024x1024" | "1536x1024" | "1024x1536" | "auto"
   *
   * gemini-2.5-flash-image:
   *
   * "1:1" (default); "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9"
   */
  output_size?: string;
  /**
   * **Imagen 3 & 4 models only**
   *
   *  imagen-4.0-generate-001,
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

export type UserTTSRequest = {
  type: "user_tts_request";
  conversationId: string;
  messageId: string;
  /**
   * defaults to `"auto"`
   */
  language?: GrokLanguageTTS;
  /**
   * defaults to mp3
   */
  codec?: TTSCodec;
  /**
   * defaults to eve
   */
  voice?: GrokVoiceTTS;
  /**
   * defaults to 128000 (bps)
   */
  bitRate?: number;
  /**
   * defaults to 24000 (Hz)
   */
  sampleRate?: number;
};

export type UserTTSChunk = {
  type: "user_tts_chunk";
  ttsJobId: string;
  conversationId: string;
  messageId: string;
  audioChunk: string;
  generationMs: number;
};

export type UserTTSError = {
  type: "user_tts_error";
  status: number;
  statusText: string;
  ttsJobId?: string;
  conversationId: string;
  messageId: string;
};

export type UserTTSResponse = {
  type: "user_tts_response";
  ttsJobId: string;
  attachmentId: string;
  conversationId: string;
  messageId: string;
  durationMs: number;
  generationMs: number;
  size: number;
  cdnUrl: string;
  codec: TTSCodec;
};
export type UserTTSResponsePreexisting = {
  type: "user_tts_response_preexisting";
  ttsJobId: string;
  attachmentId: string;
  conversationId: string;
  messageId: string;
  durationMs: number;
  generationMs: number;
  size: number;
  cdnUrl: string;
  codec: TTSCodec;
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
  | ConnectionEstablished
  | ConversationList
  | ConversationListAck
  | HydrateConversation
  | HydrateConversationAck
  | ImageGenError
  | ImageGenProgress
  | ImageGenRequest
  | ImageGenResponse
  | LocalToolRequest
  | LocalToolResult
  | PingMessage
  | ProviderContextPing
  | ProviderContextPong
  | ProviderContextUpdate
  | ProviderContextUpdateAck
  | TypingIndicator
  | UserTTSChunk
  | UserTTSRequest
  | UserTTSError
  | UserTTSResponse
  | UserTTSResponsePreexisting;

export type AnyEventTypeUnion = AnyEvent["type"];

/**
 * type alias used in apps/web repo
 */
export type ChatWsEvent = AnyEvent;

/**
 * type alias used in apps/web repo
 */
export type ChatWsEventTypeUnion = ChatWsEvent["type"];

export type EventTypeMap = UTR<AnyEvent, "type">;

export type EventMap<T extends keyof EventTypeMap> = {
  [P in T]: EventTypeMap[P];
}[T];
