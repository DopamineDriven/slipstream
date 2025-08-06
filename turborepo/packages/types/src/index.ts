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
  AssetUploadRequest,
  AssetUploadResponse,
  ChatWsEvent,
  ChatWsEventTypeUnion,
  ClientContextWorkupProps,
  EventMap,
  EventTypeMap,
  ImageGenRequest,
  ImageGenResponse,
  PingMessage,
  ProviderCountsProps,
  RecordCountsProps,
  TypingIndicator
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
  ModelDisplayNameToModelId,
  ModelIdToModelDisplayName,
  ModelMap,
  Models,
  OpenAIChatModels,
  OpenAiDisplayNameUnion,
  OpenAiModelIdUnion,
  Provider,
  Providers
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
  modelIdsByProvider,
  modelIdToDisplayName,
  providerModelChatApi,
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
  IsOptional,
  OnlyOptional,
  OnlyRequired,
  RTC,
  RemoveFields,
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
