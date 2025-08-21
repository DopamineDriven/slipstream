/**
 * shared websocket (client-server) events
 */
export type {
  AIChatChunk,
  AIChatError,
  AIChatEventTypeUnion,
  AIChatInlineData,
  AIChatRequestUserMetadata,
  AIChatRequest,
  AIChatResEntity,
  AIChatResponse,
  AnyEvent,
  AnyEventTypeUnion,
  AssetAttachedToMessage,
  AssetBatchUpload,
  AssetDeleted,
  AssetFetchRequest,
  AssetFetchResponse,
  AssetOrigin,
  AssetPasteEvent,
  AssetStatus,
  AssetUploadProgress,
  AssetUploadedNotification,
  AssetUploadRequest,
  AssetUploadResponse,
  AttachmentMetadata,
  ChatWsEvent,
  ChatWsEventTypeUnion,
  ClientContextWorkupProps,
  EventMap,
  EventTypeMap,
  ImageGenProgress,
  ImageGenRequest,
  ImageGenResponse,
  PingMessage,
  RecordCountsProps,
  TypingIndicator,
  UploadMethod
} from "@/events.ts";

/**
 * model/provider types
 */
export type {
  AllDisplayNamesUnion,
  AllModelsUnion,
  AnthropicChatModels,
  AnthropicDisplayNameUnion,
  AnthropicModelIdUnion,
  DisplayNameModelMap,
  GeminiChatModels,
  GeminiDisplayNameUnion,
  GeminiModelIdUnion,
  GetDisplayNamesForProviderRT,
  GetModelsForProviderRT,
  GetModelUtilRT,
  GrokChatModels,
  GrokDisplayNameUnion,
  GrokModelIdUnion,
  ImageGenModels,
  ImageGenModelsByProvider,
  ImageGenProviders,
  MetaChatModels,
  MetaDisplayNameUnion,
  MetaModelIdUnion,
  ModelDisplayNameToModelId,
  ModelIdToModelDisplayName,
  ModelMap,
  Models,
  OpenAIChatModels,
  OpenAiDisplayNameUnion,
  OpenAiModelIdUnion,
  Provider,
  Providers,
  VercelChatModels,
  VercelDisplayNameUnion,
  VercelModelIdUnion
} from "@/models.ts";

export {
  allProviders,
  defaultModelDisplayNameByProvider,
  defaultModelIdByProvider,
  displayNameModelsByProvider,
  displayNameToModelId,
  getAllProviders,
  getDisplayNameByModelId,
  getDisplayNamesForProvider,
  getModelIdByDisplayName,
  getModelsForProvider,
  imageGenProvders,
  modelIdsByProvider,
  modelIdToDisplayName,
  providerModelChatApi,
  providerModelImageGenApi,
  toPrismaFormat
} from "@/models.ts";

/**
 * convenient utility types
 */
export type {
  ArrFieldReplacer,
  CTR,
  DX,
  Equal,
  Expect,
  Extends,
  InferGSPRT,
  InferGSPRTWorkup,
  IsExact,
  IsOptional,
  OnlyOptional,
  OnlyRequired,
  RTC,
  Rm,
  TCN,
  Unenumerate,
  Without,
  XOR
} from "@/utils.ts";

/**
 * api-handling types for codegen
 */

export type {
  AnthropicError,
  AnthropicModel,
  AnthropicResponse,
  AnthropicSuccess,
  FlexiProvider,
  GeminiError,
  GeminiModel,
  GeminiResponse,
  GeminiSuccess,
  GrokModelsResponse,
  ListModelsSingleton,
  OpenAiError,
  OpenAiResponse,
  SuccessResponse
} from "@/types.ts";
