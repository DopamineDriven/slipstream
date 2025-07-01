import { WebSocket } from "ws";

export type Unenumerate<T> = T extends (infer U)[] | readonly (infer U)[]
  ? U
  : T;

export type RemoveFields<T, P extends keyof T = keyof T> = {
  [S in keyof T as Exclude<S, P>]: T[S];
};

export type ConditionalToRequired<
  T,
  Z extends keyof T = keyof T
> = RemoveFields<T, Z> & { [Q in Z]-?: T[Q] };

export type StripHyphen<T extends string> = T extends `${infer X}-${infer Y}`
  ? `${X}_${StripHyphen<Y>}`
  : T;

export const openAiChatModelsObj = {
  "gpt_4.1": "gpt-4.1",
  "gpt_4.1_mini": "gpt-4.1-mini",
  "gpt_4.1_nano": "gpt-4.1-nano",
  "gpt_4.5_preview": "gpt-4.5-preview",
  o4_mini: "o4-mini",
  o1: "o1",
  o3: "o3",
  o1_mini: "o1-mini",
  o3_mini: "o3-mini",
  gpt_4o: "gpt-4o",
  gpt_4o_audio_preview: "gpt-4o-audio-preview",
  gpt_4o_mini: "gpt-4o-mini",
  gpt_4o_search_preview: "gpt-4o-search-preview",
  gpt_4o_mini_search_preview: "gpt-4o-mini-search-preview",
  gpt_4o_mini_audio_preview: "gpt-4o-mini-audio-preview",
  gpt_4: "gpt-4",
  gpt_4_turbo: "gpt-4-turbo",
  "gpt_3.5_turbo": "gpt-3.5-turbo",
  "gpt_3.5_turbo_16k": "gpt-3.5-turbo-16k"
} as const;

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
  grok: ["grok-3", "grok-3.1", "grok-3.2"]
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
  grok: ["grok-3", "grok-3.1", "grok-3.2"]
} as const;

export type Provider = keyof typeof providerModelChatApi;

export type ModelMap = {
  readonly [P in keyof typeof providerModelChatApi]: Unenumerate<
    (typeof providerModelChatApi)[P]
  >;
};

export type OpenAIChatModels = ModelMap["openai"];

export type GeminiChatModels = ModelMap["gemini"];

export type GrokChatModels = ModelMap["grok"];

export type AllModelsUnion = ModelMap[Provider];

export type GetModelUtilRT<T = Provider> = T extends "openai"
  ? OpenAIChatModels
  : T extends "gemini"
    ? GeminiChatModels
    : T extends "grok"
      ? GrokChatModels
      : never;

export type ChatMessage = {
  type: "message";
  userId: string;
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
  provider?: Provider;
  model?: GetModelUtilRT<Provider>;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
};

export type AIChatResponse = {
  type: "ai_chat_response";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
  provider?: Provider;
  model?: string;
};

export type AIChatInlineData = {
  type: "ai_chat_inline_data";
  conversationId: string;
  userId: string;
  data: string;
  provider?: Provider;
  model?: string;
};

export type AIChatChunk = {
  type: "ai_chat_chunk";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
  provider?: Provider;
  model?: string;
};

export type AIChatError = {
  type: "ai_chat_error";
  conversationId: string;
  userId: string;
  message: string;
  done: true;
  provider?: Provider;
  model?: string;
};

export type TypingIndicator = {
  type: "typing";
  userId: string;
  conversationId: string;
};

export type PingMessage = {
  type: "ping";
};

export type ImageGenRequest = {
  type: "image_gen_request";
  userId: string;
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
  userId: string;
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

export type AnyEvent =
  | AssetUploadRequest
  | AssetUploadResponse
  | AIChatChunk
  | AIChatError
  | AIChatInlineData
  | AIChatRequest
  | AIChatResponse
  | ChatMessage
  | TypingIndicator
  | PingMessage
  | ImageGenRequest
  | ImageGenResponse;

export type AnyEventTypeUnion = AnyEvent["type"];

/**
 * helper workup for use in XOR type below
 * makes properties from U optional and undefined in T, and vice versa
 */
export type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

/**
 * enforces mutual exclusivity of T | U
 */
// prettier-ignore
export type XOR<T, U> =
  [T, U] extends [object, object]
    ? (Without<T, U> & U) | (Without<U, T> & T)
    : T | U

export type EventUnion = XOR<ChatMessage, TypingIndicator>;

export type EventTypeMap = {
  ai_chat_chunk: AIChatChunk;
  ai_chat_error: AIChatError;
  ai_chat_inline_data: AIChatInlineData;
  ai_chat_request: AIChatRequest;
  ai_chat_response: AIChatResponse;
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

export interface WSServerOptions {
  port: number;
  redisUrl: string;
  jwtSecret: string;
  channel?: string;
}

export interface UserData {
  city?: string;
  country?: string;
  latlng?: string;
  tz?: string;
}

export type MessageHandler<T extends keyof EventTypeMap> = (
  event: EventTypeMap[T],
  ws: WebSocket,
  userId: string,
  userData?: UserData
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

/**
 * @url https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/handle-streaming-refusals#implementation-guide
 */
export const triggerAnthropicRefusalForPromptTesting =
  "ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL_1FAEFB6177B4672DEE07F9D3AFC62588CCD2631EDCF22E8CCC1FB35B501C9C86" as const;
