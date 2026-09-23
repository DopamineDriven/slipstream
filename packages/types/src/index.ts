import type { Socket } from "net";

/**
 * api-handling types for codegen
 */
export type {
  AnthropicError,
  AnthropicModel,
  AnthropicResponse,
  AnthropicSuccess,
  GeminiError,
  GeminiModel,
  GeminiResponse,
  GeminiSuccess,
  GrokModelsResponse,
  ListModelsSingleton,
  ModeUnion,
  MultimodalRT,
  OmniMapperRT,
  OpenAiError,
  OpenAiResponse,
  SuccessResponse
} from "@/codegen-types.ts";

export type {
  AIChatResponseAudioGenFields,
  AIChatResponseAudioGenSubFields,
  GeminiCodecTTS,
  GrokAudioCodecTTS,
  GrokBitRateTTS,
  GrokLanguageTTS,
  GrokOutputFormatTTS,
  GrokSampleRateTTS,
  GrokVoiceDisplayNameTTS,
  GrokVoiceTTS,
  GrokTTSReqShape,
  OpenAICodecTTS,
  TTSCodec
} from "@/contract/audio.ts";

export {
  grokVoiceDisplayNameToIdTTS,
  grokVoiceDisplayNamesTTS,
  grokVoiceIdToDisplayNameTTS,
  grokVoiceIdsTTS,
  grokVoices
} from "@/contract/audio.ts";

export type {
  AIChatEventTypeUnion,
  AssetDraftId,
  AssetOrigin,
  AssetReadyPayload,
  AssetStatus,
  AssetUploadAbortReason,
  AssetUploadInstructionsMethod,
  AttachmentMetadata,
  ClientContextWorkupProps,
  DocExtensions,
  EbookExtensions,
  DocSpecs,
  ImageSpecs,
  ImgColorModel,
  ImgColorSpace,
  ImgFormat,
  MetadataMap,
  MetadataTypeMap,
  MetadataTypeUnion,
  MetadataUnion,
  PdfDocSpecs,
  PresentationDocSpecs,
  PresentationExtensions,
  RecordCountsProps,
  S3ObjectId,
  SpreadSheetDocSpecs,
  SpreadSheetExtensions,
  TextExtensions,
  UnknownSpecs,
  UploadMethod,
  UserMetadata,
  UserRxnAction,
  WithExpiry
} from "@/contract/workup.ts";

/**
 * shared websocket (client-server) events
 */
export type {
  AnyEvent,
  AnyEventTypeUnion,
  ChatWsEvent,
  ChatWsEventTypeUnion,
  EventMap,
  EventTypeMap
} from "@/contract/index.ts";

export type {
  AIChatChunk,
  AIChatError,
  AIChatEventRecord,
  AIChatEventUnion,
  AIChatInlineData,
  AIChatRequest,
  AIChatResEntity,
  AIChatResponse,
  AIChatResponseDb,
  ChatChunkAndResMsgBlock
} from "@/contract/ai-chat-events.ts";

export type {
  AssetAttachedToMessage,
  AssetBatchUpload,
  AssetDeleted,
  AssetEventRecord,
  AssetEventUnion,
  AssetFetchError,
  AssetFetchRequest,
  AssetFetchResponse,
  AssetPasteEvent,
  AssetReady,
  AssetUploadAbort,
  AssetUploadAborted,
  AssetUploadComplete,
  AssetUploadCompleteError,
  AssetUploadError,
  AssetUploadInstructions,
  AssetUploadPrepare,
  AssetUploadProgress,
  AssetUploadedNotification,
  AssetUploadRequest,
  AssetUploadResponse
} from "@/contract/asset-events.ts";

export type {
  CliConfigDTO,
  CliEventRecord,
  CliEventUnion,
  CliConfigHydrate,
  CliConfigHydrateAck,
  CliConfigUpdate,
  CliConfigUpdateAck,
  CliRecentConvos,
  CliRecentConvosAck
} from "@/contract/cli-events.ts";

export type {
  ConversationList,
  ConversationListAck,
  ConversationListEntry
} from "@/contract/conversation-list-events.ts";

export type {
  HydrateConversation,
  HydrateConversationAck,
  HydrateConversationPage
} from "@/contract/hydrate-conversation.ts";

export type {
  ImageGenError,
  ImageGenEventRecord,
  ImageGenEventUnion,
  ImageGenProgress,
  ImageGenRequest,
  ImageGenResponse
} from "@/contract/image-gen-events.ts";

export type {
  CanonicalSchemaProperty,
  CanonicalToolDefinition,
  ListDirectoryEntry,
  ListDirectoryOutput,
  LocalToolCapabilities,
  LocalToolErrorCode,
  LocalToolFailure,
  LocalToolName,
  LocalToolOutput,
  LocalToolRequest,
  LocalToolResult,
  LocalToolSuccess,
  ReadFileOutput,
  RepoSearchOutput
} from "@/contract/local-tool-events.ts";

export {
  LOCAL_TOOL_DEFINITIONS,
  LOCAL_TOOL_NAMES,
  isLocalToolName
} from "@/contract/local-tool-events.ts";

export type { PingMessage } from "@/contract/ping.ts";

export type {
  ConnectionEstablished,
  ProviderContextEventRecord,
  ProviderContextEventUnion,
  ProviderContextPing,
  ProviderContextPong,
  ProviderContextUpdate,
  ProviderContextUpdateAck
} from "@/contract/provider-context-events.ts";

export type {
  STTUserBinaryFrame,
  STTUserCancel,
  STTUserCanceled,
  STTUserConnect,
  STTUserConnected,
  STTUserError,
  STTEventRecord,
  STTEventUnion,
  STTUserFinish,
  STTUserFinished,
  STTUserPresent,
  STTUserRecover,
  STTUserRecovered,
  STTUserRecoveredResultSingleton,
  STTUserRehydrate,
  STTUserRehydrated,
  STTUserRehydratedData,
  STTUserRehydratedDictation,
  STTUserRestore,
  STTUserRestored,
  STTUserTimeout,
  STTUserInterrupted
} from "@/contract/stt-events.ts";

export type {
  UserTTSChunk,
  UserTTSError,
  UserTTSEventRecord,
  UserTTSEventUnion,
  UserTTSRequest,
  UserTTSResponse,
  UserTTSResponsePreexisting
} from "@/contract/tts-events.ts";

export type { TypingIndicator } from "@/contract/typing-indicator.ts";

export type {
  BaseNanoBananaOutputAR,
  GeminiImageQuality,
  GeminiImageSize,
  GeminiModelAspectRatio,
  GeminiModelAspectRatioWorkup,
  GoogleGenAIImageGenOpts,
  GoogleHarmCategory,
  GoogleImagenGenerateImagesConfig,
  GoogleImagePromptLanguage,
  GoogleImgSizeQualityOpts,
  GooglePersonGeneration,
  GoogleSafetyFilterLevel,
  ImagenOutputSize,
  NanoBanana2OutputAR,
  NanoBananaImageGenOpts,
  NanoBananaOutputSize
} from "@/image-gen/google.ts";

export type {
  GrokAspectRatioAndResolutionOps,
  GrokImagine2ARUnion,
  GrokImagine2QualityUnion,
  GrokImagineARUnion,
  GrokImagineImageGenOpts,
  GrokImagineImageGenOptsExtended,
  GrokImagineImgModelUnion,
  GrokImagineQualityUnion,
  GrokImgCapableModels,
  GrokImgGenUnionOpts,
  GrokModelAspectRatio,
  GrokModelAspectRatioWorkup,
  GrokModelOptsRecord,
  GrokModelOptsUnion,
  GrokQualityAnd2Resolution,
  GrokResolutionBase,
  GrokResolutionWorkup
} from "@/image-gen/grok.ts";

export type {
  AIChatRequestImgGenFields,
  AIChatResponseImgGenFields,
  AIChatResponseImgGenFieldsFinal,
  AIChatResponseImgGenSubFields,
  ImageGenPartialArr,
  ImgGenStage,
  ImgMetadataEntity,
  OutputSizeProps,
  S3Checksum,
  S3StorageClass
} from "@/image-gen/index.ts";

export type {
  MetaImgGenOpts,
  MetaImgSize,
  MetaImgSizeMap,
  MetaModelImgARWorkup,
  ToolEnablementProps
} from "@/image-gen/meta.ts";

export type {
  BaseOpenAISize,
  GPT10x16,
  GPT16x10,
  GPT16x9,
  GPT1x2,
  GPT1x3,
  GPT21x9,
  GPT2x1,
  GPT2x3,
  GPT3x1,
  GPT3x2,
  GPT3x4,
  GPT4x3,
  GPT4x5,
  GPT5x4,
  GPT9x16,
  GPT9x21,
  GPTImage2Size,
  GPTImgOpts,
  GPTSizesMap,
  GPTSizesRecord,
  GPTSizesUnion,
  GptImageAndFacilitatorsImgGenWorkupRT,
  GptImageOutputSize,
  ImgGenWorkupRT,
  ImgGenWorkupRTObj,
  ImgGenWorkupResRT,
  InputFidelity,
  OpenAIAspectRatioRecord,
  OpenAIBaseQuality,
  OpenAIGptImage2Point5Quality,
  OpenAIImageGenOpts,
  OpenAIImgCapableModels,
  OpenAIImgGenQualityRecord,
  OpenAIImgNativeGPTImgAR,
  OpenAIImgOpts,
  OpenAIModelAspectRatio,
  OpenAIModelAspectRatioWorkup,
  OpenAINativeImgModelAspectRatioWorkup,
  OpenAINativeImgModelQualityWorkup,
  OpenAISizeQualityOpts,
  SharedOpenAIImageOpts
} from "@/image-gen/openai.ts";

export { GPT_IMAGE_2_EXTENDED_OPTIONS } from "@/image-gen/openai.ts";

/**
 * model/provider types
 */
export type {
  AllAudioGenModels,
  AlibabaChatModels,
  AlibabaDisplayNameUnion,
  AlibabaModelIdUnion,
  AllDisplayNamesUnion,
  AllImgGenFacilitatingModelsUnion,
  AllImgGenModelsUnion,
  AllImgGenProviderModelMap,
  AllImgGenProviderModels,
  AllModelsUnion,
  AllVideoGenModels,
  AnthropicChatModels,
  AnthropicDisplayNameUnion,
  AnthropicModelIdUnion,
  AudioGenModelMap,
  AudioGenProviders,
  CohereChatModels,
  CohereDisplayNameUnion,
  CohereModelIdUnion,
  DeepSeekChatModels,
  DeepSeekDisplayNameUnion,
  DeepSeekModelIdUnion,
  DisplayNameModelMap,
  GeminiAudioGenModels,
  GeminiChatModels,
  GeminiDisplayNameUnion,
  GeminiDisplayNameUnionAudioGen,
  GeminiDisplayNameUnionImgGen,
  GeminiDisplayNameUnionVideoGen,
  GeminiImgGenFacilitatingModels,
  GetImgGenFacilitatingModelUtilRT,
  GeminiImgGenModels,
  GeminiModelIdUnion,
  GeminiModelIdUnionAudioGen,
  GeminiModelIdUnionImgGen,
  GeminiModelIdUnionVideoGen,
  GeminiPureImageGenModels,
  GeminiVideoGenModels,
  GetDisplayNamesForProviderRT,
  GetDisplayNamesForProviderRTAudioGen,
  GetDisplayNamesForProviderRTImgGen,
  GetDisplayNamesForProviderRTVideoGen,
  GetImgModelUtilRT,
  GetAllImgGenModelUtilRt,
  GetModelsForProviderRT,
  GetModelsForProviderRTAudioGen,
  GetModelsForProviderRTImgGen,
  GetModelsForProviderRTVideoGen,
  GetModelUtilRT,
  GetAudioModelUtilRT,
  GetVideoModelUtilRT,
  GrokChatModels,
  GrokDisplayNameUnion,
  GrokDisplayNameUnionImgGen,
  GrokDisplayNameUnionVideoGen,
  GrokImgGenFacilitatingModels,
  GrokImgGenModels,
  GrokModelIdUnion,
  GrokModelIdUnionImgGen,
  GrokModelIdUnionVideoGen,
  GrokPureImageGenModels,
  GrokVideoGenModels,
  ImageGenFacilitatingModelsByProvider,
  ImageGenFacilitatingProviders,
  ImgGenFacilitatingModelMap,
  ImageGenModels,
  ImageGenModelsByProvider,
  ImageGenProviders,
  ImgGenModelMap,
  KimiChatModels,
  KimiDisplayNameUnion,
  KimiModelIdUnion,
  MetaChatModels,
  MetaDisplayNameUnion,
  MetaDisplayNameUnionImgGen,
  MetaImgGenModels,
  MetaModelIdUnion,
  MetaModelIdUnionImgGen,
  MetaPureImageGenModels,
  MiniMaxChatModels,
  MiniMaxDisplayNameUnion,
  MiniMaxModelIdUnion,
  MistralChatModels,
  MistralDisplayNameUnion,
  MistralModelIdUnion,
  ModelDisplayNameToModelId,
  ModelDisplayNameToModelIdAudioGen,
  ModelDisplayNameToModelIdImgGen,
  ModelIdToModelDisplayName,
  ModelIdToModelDisplayNameAudioGen,
  ModelIdToModelDisplayNameImgGen,
  ModelDisplayNameToModelIdVideoGen,
  ModelIdToModelDisplayNameVideoGen,
  ModelMap,
  Models,
  OpenAIChatModels,
  OpenAiDisplayNameUnion,
  OpenAiDisplayNameUnionImgGen,
  OpenAIImgGenFacilitatingModels,
  OpenAIImgGenModels,
  OpenAiModelIdUnionImgGen,
  OpenAiModelIdUnion,
  OpenAIModelIdUnion,
  OpenAIPureImageGenModels,
  Provider,
  ProviderModelRecord,
  Providers,
  PureImageGenModelsByProvider,
  SakanaChatModels,
  SakanaDisplayNameUnion,
  SakanaModelIdUnion,
  VercelChatModels,
  VercelDisplayNameUnion,
  VercelModelIdUnion,
  VideoGenModelMap,
  VideoGenProviders,
  ZaiChatModels,
  ZaiDisplayNameUnion,
  ZaiModelIdUnion
} from "@/models.ts";

export {
  allAudioGenProviders,
  allProviders,
  allImgGenProviders,
  allImgSupportingProviderModels,
  allVideoGenProviders,
  audioMimeSupportByProvider,
  defaultModelDisplayNameByProvider,
  defaultModelIdByProvider,
  displayNameModelsByProvider,
  displayNameToModelId,
  displayNameModelsByProviderAudioGen,
  displayNameToModelIdAudioGen,
  displayNameModelsByProviderImgGen,
  displayNameModelsByProviderVideoGen,
  displayNameToModelIdImgGen,
  displayNameToModelIdVideoGen,
  docMimeSupportByProvider,
  getAllProviders,
  getAllAudioGenProviders,
  getAllImgGenProviders,
  getAllVideoGenProviders,
  getDisplayNameByModelId,
  getDisplayNamesForProviderAudioGen,
  getDisplayNamesForProvider,
  getDisplayNamesForProviderImgGen,
  getDisplayNamesForProviderVideoGen,
  getModelIdByDisplayName,
  getModelsForProvider,
  getModelsForProviderAudioGen,
  getModelsForProviderImgGen,
  getModelsForProviderVideoGen,
  imageGenFacilitatingProviders,
  imageGenProviders,
  imgMimeSupportByProvider,
  imageModelFacilitatorSets,
  imageModelSets,
  isProvider,
  modelIdsByProvider,
  modelIdToDisplayName,
  modelIdsByProviderAudioGen,
  modelIdToDisplayNameAudioGen,
  modelIdToDisplayNameImgGen,
  modelIdToDisplayNameVideoGen,
  modelIdsByProviderImgGen,
  modelIdsByProviderVideoGen,
  providerModelChatApi,
  providerModelImageGenApi,
  providerModelImageGenFacilitatingApi,
  toPrismaFormat,
  videoMimeSupportByProvider
} from "@/models.ts";

/**
 * convenient utility types
 */
export type {
  ArrFieldReplacer,
  BigIntKeys,
  BigIntOrNumber,
  CommonDiscriminants,
  CTR,
  DeepPartial,
  DeepPartialFields,
  DeepReplace,
  DiscriminatedUnionToRecord,
  DX,
  Equal,
  Expect,
  Extends,
  FlexiCase,
  FlexiProvider,
  Include,
  InferGSPRT,
  InferGSPRTWorkup,
  IsExact,
  IsOptional,
  LiteralUnion,
  NormalizeAndInject,
  OnlyOptional,
  OnlyRequired,
  RTC,
  RequireNested,
  Rm,
  SerializeBigInt,
  Signals,
  TCN,
  Unenumerate,
  UnionToRecord,
  UTR,
  Without,
  XOR
} from "@/utils.ts";

export {
  asciiToSymbol,
  createDraftId,
  instanceFunc,
  parseDraftId,
  symbolToAscii
} from "@/utils.ts";

export type { STTTypes } from "@/stt.ts";

export type { TTSTypes } from "@/tts.ts";

/**
 * domain level types
 */
export type {
  AccountSingleton,
  AudioGenJobSinglton,
  AudioGenOutputSingleton,
  AttachmentProviderSingleton,
  AttachmentSingleton,
  AudioSingleton,
  CliConfigSingleton,
  CliConversationActivitySingleton,
  ConversationMemoryChunkSingleton,
  ConversationMemoryContextSingleton,
  ConversationMemoryStoreSingleton,
  ConversationSingleton,
  ConversationSingletonOneOff,
  ConvoSettingsSingleton,
  DictationSingleton,
  DocumentSingleton,
  ImageGenJobSingleton,
  ImageGenOutputSingleton,
  ImageSingleton,
  InlineImageGenOutputSingleton,
  MessageBlockSingleton,
  MessageSingleton,
  ProfileSingleton,
  ProviderStoreDocumentSingleton,
  ProviderStoreSingleton,
  SessionSingleton,
  SettingsSingleton,
  TTSJobSingleton,
  UserKeySingleton,
  UserSingleton,
  UserStoreDocAnnotSingleton,
  UserStoreDocChunkSingleton,
  UserStoreDocSingleton,
  UserStoreSingleton,
  VideoSingleton
} from "@/types.ts";

declare global {
  interface JSON {
    parse<T = unknown>(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): T;
  }
  interface Body {
    json<T = unknown>(): Promise<T>;
  }
  interface ObjectConstructor {
    // PropertyKey -> string and number allowed, symbol disallowed (symbol can't be enumerable)
    keys<T = object>(
      o: T
    ): (keyof T extends infer K
      ? K extends string
        ? K
        : K extends number
          ? `${K}`
          : never
      : never)[];
  }
}

declare module "ws" {
  interface WebSocket {
    _socket: Socket;
  }
}
