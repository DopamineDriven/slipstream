import type { WithImplicitCoercion } from "buffer";

export type ModelProvider = "openai" | "gemini";
export type GeminiModels = "gemini-2.5-flash" | "gemini-2.5-pro";
export type OpenAIModels =
  | "gpt-4o-2024-11-20"
  | "gpt-4.1"
  | "gpt-o3-pro"
  | "gpt-4.1-nano"
  | "gpt-4.5-preview"
  | "gpt-4o-mini";

export type SelectedProvider<T extends ModelProvider | undefined> =
  T extends "openai" ? OpenAIModels : GeminiModels;

export type ChatMessage = {
  type: "message";
  conversationId: string;
  content: string;
  timestamp: number;
  attachments?: string[];
};

export type AIChatRequest = {
  type: "ai_chat_request";
  conversationId: string;
  prompt: string;
  apiKey?: string;
  provider?: ModelProvider;
  model?: SelectedProvider<ModelProvider>;
};

export type AIChatResponse = {
  type: "ai_chat_response";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
  provider?: ModelProvider;
  model?: string;
};

export type AIChatInlineData = {
  type: "ai_chat_inline_data";
  conversationId: string;
  userId: string;
  data: string;
  provider?: ModelProvider;
  model?: string;
};

export type AIChatChunk = {
  type: "ai_chat_chunk";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
  provider?: ModelProvider;
  model?: string;
};

export type AIChatError = {
  type: "ai_chat_error";
  conversationId: string;
  userId: string;
  message: string;
  done: true;
  provider?: ModelProvider;
  model?: string;
};

export type TypingIndicator = {
  type: "typing";
  conversationId: string;
};

export type PingMessage = {
  type: "ping";
};

export type ImageGenRequest = {
  type: "image_gen_request";
  conversationId: string;
  prompt: string;
  seed?: number;
};

export type ImageGenResponse = {
  type: "image_gen_response";
  userId: string;
  conversationId: string;
  imageUrl?: string;
  success: boolean;
  error?: string;
};

export type AssetUploadRequest = {
  type: "asset_upload_request";
  conversationId: string;
  filename: string;
  contentType: string;
  base64: string;
};

export type AssetUploadResponse = {
  type: "asset_upload_response";
  userId: string;
  conversationId: string;
  url?: string;
  success: boolean;
  error?: string;
};

export type ChatWsEvent =
  | AssetUploadRequest
  | AssetUploadResponse
  | AIChatChunk
  | AIChatRequest
  | AIChatResponse
  | AIChatError
  | AIChatInlineData
  | ChatMessage
  | TypingIndicator
  | PingMessage
  | ImageGenRequest
  | ImageGenResponse;

export type ChatWsEventTypeUnion = ChatWsEvent["type"];

export type EventTypeMap = {
  ai_chat_chunk: AIChatChunk;
  ai_chat_request: AIChatRequest;
  ai_chat_response: AIChatResponse;
  ai_chat_error: AIChatError;
  ai_chat_inline_data: AIChatInlineData;
  asset_upload_request: AssetUploadRequest;
  asset_upload_response: AssetUploadResponse;
  message: ChatMessage;
  typing: TypingIndicator;
  ping: PingMessage;
  image_gen_request: ImageGenRequest;
  image_gen_response: ImageGenResponse;
};

export type EventMap<T extends keyof EventTypeMap> = {
  [P in T]: EventTypeMap[P];
}[T];
export interface UserData {
  city?: string;
  country?: string;
  latlng?: string;
  tz?: string;
}
export type Unenumerate<T> = T extends (infer U)[] | readonly (infer U)[]
  ? U
  : T;

export const providerModelChatApi = {
  openai: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.5-preview",
    "o4-mini",
    "o1",
    "o3",
    "o1-mini",
    "o3-mini",
    "gpt-4o",
    "gpt-4o-audio-preview",
    "gpt-4o-mini",
    "gpt-4o-search-preview",
    "gpt-4o-mini-search-preview",
    "gpt-4o-mini-audio-preview",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k"
  ],
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.5",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-flash-preview-native-audio-dialog",
    "gemini-2.5-flash-exp-native-audio-thinking-dialog",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
    "gemini-2.0-flash",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-embedding-exp",
    "imagen-4.0-generate-preview-06-06",
    "imagen-4.0-ultra-generate-preview-06-06",
    "imagen-3.0-generate-002",
    "veo-2.0-generate-001",
    "gemini-live-2.5-flash-preview",
    "gemini-2.0-flash-live-001"
  ],
  grok: ["grok-3", "grok-3.1", "grok-3.2"],
  /**
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-names
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-aliases
   */
  anthropic: [
    "claude-opus-4-20250514",
    "claude-opus-4-0",
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-0",
    "claude-3-7-sonnet-20250219",
    "claude-3-7-sonnet-latest",
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest",
    "claude-3-5-sonnet-20240620",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-3-opus-latest"
  ]
} as const;

export const providerModelResponsesApi = {
  openai: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.5-preview",
    "o1-pro",
    "o1",
    "o3",
    "o3-mini",
    "o3-deep-research",
    "o3-pro",
    "o4-mini",
    "o4-mini-deep-research",
    "o4-mini-deep-research-2025-06-26",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k"
  ],
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.5",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-flash-preview-native-audio-dialog",
    "gemini-2.5-flash-exp-native-audio-thinking-dialog",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
    "gemini-2.0-flash",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-embedding-exp",
    "imagen-4.0-generate-preview-06-06",
    "imagen-4.0-ultra-generate-preview-06-06",
    "imagen-3.0-generate-002",
    "veo-2.0-generate-001",
    "gemini-live-2.5-flash-preview",
    "gemini-2.0-flash-live-001"
  ],
  grok: ["grok-3", "grok-3.1", "grok-3.2"],
  /**
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-names
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-aliases
   */
  anthropic: [
    "claude-opus-4-20250514",
    "claude-opus-4-0",
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-0",
    "claude-3-7-sonnet-20250219",
    "claude-3-7-sonnet-latest",
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest",
    "claude-3-5-sonnet-20240620",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-3-opus-latest"
  ]
} as const;

export type Providers = keyof typeof providerModelChatApi;

export function toPrismaFormat<const T extends Providers>(provider: T) {
  return provider.toUpperCase() as Uppercase<T>;
}

export type ModelMap = {
  readonly [P in keyof typeof providerModelChatApi]: Unenumerate<
    (typeof providerModelChatApi)[P]
  >;
};

export type OpenAIChatModels = ModelMap["openai"];

export type GeminiChatModels = ModelMap["gemini"];

export type GrokChatModels = ModelMap["grok"];

export type AnthropicChatModels = ModelMap["anthropic"];

export type AllModelsUnion = ModelMap[Providers];

export type GetModelUtilRT<T = Providers> = T extends "openai"
  ? OpenAIChatModels
  : T extends "gemini"
    ? GeminiChatModels
    : T extends "grok"
      ? GrokChatModels
      : T extends "anthropic"
        ? AnthropicChatModels
        : never;


export type Models<T extends keyof typeof providerModelChatApi> = {
  readonly [P in T]: Unenumerate<(typeof providerModelChatApi)[P]>;
}[T];

export type RawData = WithImplicitCoercion<string | ArrayLike<number>>;

export type MessageHandler<T extends keyof EventTypeMap> = (
  event: EventTypeMap[T],
  ws: WebSocket
) => Promise<void> | void;

export type HandlerMap = {
  [K in keyof EventTypeMap]?: MessageHandler<K>;
};

export type BufferLike =
  | string
  | Buffer
  | DataView
  | number
  | ArrayBufferView
  | Uint8Array
  | ArrayBuffer
  | SharedArrayBuffer
  | Blob
  | readonly any[]
  | readonly number[]
  | { valueOf(): ArrayBuffer }
  | { valueOf(): SharedArrayBuffer }
  | { valueOf(): Uint8Array }
  | { valueOf(): readonly number[] }
  | { valueOf(): string }
  | { [Symbol.toPrimitive](hint: string): string };
