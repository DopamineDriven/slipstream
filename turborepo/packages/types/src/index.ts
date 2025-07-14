/**
 * shared websocket (client-server) events
 */
export type {
  AIChatChunk,
  AIChatError,
  AIChatInlineData,
  AIChatRequest,
  AIChatResponse,
  AnyEvent,
  AnyEventTypeUnion,
  AssetUploadRequest,
  AssetUploadResponse,
  ChatWsEvent,
  ChatWsEventTypeUnion,
  EventMap,
  EventTypeMap,
  ImageGenRequest,
  ImageGenResponse,
  PingMessage,
  TypingIndicator
} from "@/events.ts";

/**
 * model/provider types
 */
export type {
  AllModelsUnion,
  AnthropicChatModels,
  GeminiChatModels,
  GetModelUtilRT,
  GrokChatModels,
  ModelMap,
  Models,
  OpenAIChatModels,
  Provider,
  Providers,
  AnthropicDisplayNameUnion,
  AnthropicModelIdUnion,
  GeminiDisplayNameUnion,
  GeminiModelIdUnion,
  GrokDisplayNameUnion,
  GrokModelIdUnion,
  ModelDisplayNameToModelId,
  ModelIdToModelDisplayName,
  OpenAiDisplayNameUnion,
  OpenAiModelIdUnion
} from "@/models.ts";

export {
  toPrismaFormat,
  allProviders,
  getModelsForProvider,
  providerModelResponsesApi,
  providerModelChatApi,
  displayNameToModelId,
  getDisplayNameByModelId,
  getModelIdByDisplayName,
  defaultModelDisplayNameByProvider,
  defaultModelIdByProvider,
  modelIdToDisplayName
} from "@/models.ts";

/**
 * convenient utility types
 */
export type {
  ArrFieldReplacer,
  CTR,
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
