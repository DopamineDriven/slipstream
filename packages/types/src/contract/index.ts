import type {
  AIChatChunk,
  AIChatError,
  AIChatInlineData,
  AIChatRequest,
  AIChatResponse
} from "@/contract/ai-chat-events.ts";
import type {
  AssetAttachedToMessage,
  AssetBatchUpload,
  AssetDeleted,
  AssetFetchError,
  AssetFetchRequest,
  AssetFetchResponse,
  AssetPasteEvent,
  AssetReady,
  AssetUploadAbort,
  AssetUploadAborted,
  AssetUploadComplete,
  AssetUploadCompleteError,
  AssetUploadedNotification,
  AssetUploadError,
  AssetUploadInstructions,
  AssetUploadPrepare,
  AssetUploadProgress,
  AssetUploadRequest,
  AssetUploadResponse
} from "@/contract/asset-events.ts";
import type {
  CliConfigHydrate,
  CliConfigHydrateAck,
  CliConfigUpdate,
  CliConfigUpdateAck,
  CliRecentConvos,
  CliRecentConvosAck
} from "@/contract/cli-events.ts";
import type {
  ConversationList,
  ConversationListAck
} from "@/contract/conversation-list-events.ts";
import type {
  HydrateConversation,
  HydrateConversationAck
} from "@/contract/hydrate-conversation.ts";
import type {
  ImageGenError,
  ImageGenProgress,
  ImageGenRequest,
  ImageGenResponse
} from "@/contract/image-gen-events.ts";
import type {
  LocalToolRequest,
  LocalToolResult
} from "@/contract/local-tool-events.ts";
import type { PingMessage } from "@/contract/ping.ts";
import type {
  ConnectionEstablished,
  ProviderContextPing,
  ProviderContextPong,
  ProviderContextUpdate,
  ProviderContextUpdateAck
} from "@/contract/provider-context-events.ts";
import type {
  STTUserBinaryFrame,
  STTUserCancel,
  STTUserCanceled,
  STTUserConnect,
  STTUserConnected,
  STTUserError,
  STTUserFinish,
  STTUserFinished,
  STTUserInterrupted,
  STTUserPresent,
  STTUserRecover,
  STTUserRecovered,
  STTUserRehydrate,
  STTUserRehydrated,
  STTUserRestore,
  STTUserRestored,
  STTUserTimeout
} from "@/contract/stt-events.ts";
import type {
  UserTTSChunk,
  UserTTSError,
  UserTTSRequest,
  UserTTSResponse,
  UserTTSResponsePreexisting
} from "@/contract/tts-events.ts";
import type { TypingIndicator } from "@/contract/typing-indicator.ts";
import type { UTR } from "@/utils.ts";

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
  | CliConfigHydrate
  | CliConfigHydrateAck
  | CliConfigUpdate
  | CliConfigUpdateAck
  | CliRecentConvos
  | CliRecentConvosAck
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
  | STTUserBinaryFrame
  | STTUserCancel
  | STTUserCanceled
  | STTUserConnect
  | STTUserConnected
  | STTUserError
  | STTUserFinish
  | STTUserFinished
  | STTUserInterrupted
  | STTUserPresent
  | STTUserRecover
  | STTUserRecovered
  | STTUserRehydrate
  | STTUserRehydrated
  | STTUserRestore
  | STTUserRestored
  | STTUserTimeout
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

export type EventTypeMap<T extends boolean = false> = UTR<AnyEvent, "type", T>;

export type EventMap<
  T extends keyof EventTypeMap,
  V extends boolean = false
> = {
  [P in T]: EventTypeMap<V>[P];
}[T];
