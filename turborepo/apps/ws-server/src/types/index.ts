import { WebSocket } from "ws";
import { UserKey } from "@/generated/client/client.ts";

export type Unenumerate<T> = T extends (infer U)[] | readonly (infer U)[]
  ? U
  : T;

export type RemoveFields<T, P extends keyof T = keyof T> = {
  [S in keyof T as Exclude<S, P>]: T[S];
};

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

export type ConditionalToRequired<
  T,
  Z extends keyof T = keyof T
> = RemoveFields<T, Z> & { [Q in Z]-?: T[Q] };

export type KebabToSnake<T extends string> = T extends `${infer X}-${infer Y}`
  ? `${X}_${KebabToSnake<Y>}`
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

export type Provider = keyof typeof providerModelChatApi;

export type ModelMap = {
  readonly [P in keyof typeof providerModelChatApi]: Unenumerate<
    (typeof providerModelChatApi)[P]
  >;
};

export type OpenAIChatModels = ModelMap["openai"];

export type GeminiChatModels = ModelMap["gemini"];

export type GrokChatModels = ModelMap["grok"];

export type AnthropicChatModels = ModelMap["anthropic"];

export type AllModelsUnion = ModelMap[Provider];

export type GetModelUtilRT<T = Provider> = T extends "openai"
  ? OpenAIChatModels
  : T extends "gemini"
    ? GeminiChatModels
    : T extends "grok"
      ? GrokChatModels
      : T extends "anthropic"
        ? AnthropicChatModels
        : never;

export type ChatMessage = {
  type: "message";
  userId: string;
  conversationId: string;
  content: string;
  timestamp: number;
  attachments?: string[];
};

export type ApiKeySetDefaultRequest = {
  type: "api_key_set_default_request";
  provider: Provider;
};
export type ApiKeySetDefaultResponse = {
  type: "api_key_set_default_response";
  provider: Provider;
  keyId: string;
  userId: string;
  message?: string;
};
export type ApiKeySetDefaultError = {
  type: "api_key_set_default_error";
  provider: Provider;
  userId: string;
  keyId?: string;
  message: string;
};

export type ApiKeyCreateRequest = {
  type: "api_key_create_request";
  provider: Provider;
  apiKey: string;
  label?: string;
  asDefault?: boolean;
};

export type ApiKeyCreateResponse = {
  type: "api_key_create_response";
  provider: Provider;
  label?: string;
  asDefault?: boolean;
  userId: string;
  keyId: string;
};

export type ApiKeyCreateError = {
  type: "api_key_create_error";
  provider: Provider;
  userId: string;
  message: string;
};

export type ApiKeyUpdateRequest = {
  type: "api_key_update_request";
  provider: Provider;
  apiKey?: string;
  label?: string;
  asDefault?: boolean;
};

export type ApiKeyUpdateResponse = {
  type: "api_key_update_response";
  provider: Provider;
  label?: string;
  asDefault?: boolean;
  userId: string;
  keyId: string;
};

export type ApiKeyUpdateError = {
  type: "api_key_update_error";
  provider: Provider;
  message: string;
  label?: string;
  asDefault?: boolean;
  userId: string;
  keyId: string;
};

export type ApiKeyDeleteRequest = {
  type: "api_key_delete_request";
  provider: Provider;
  asDefault?: boolean;
};

export type ApiKeyDeleteResponse = {
  type: "api_key_delete_response";
  provider: Provider;
  userId: string;
  message?: string;
};

export type ApiKeyDeleteError = {
  type: "api_key_delete_error";
  keyId: string;
  provider: Provider;
  label?: string;
  asDefault?: boolean;
  userId: string;
  message: string;
};

export type ApiKeyListRequest = {
  type: "api_key_list_request";
};

export type ApiKeyListResponse = {
  type: "api_key_list_response";
  apiKeys: UserKey[];
  userId: string;
};

export type ApiKeyListError = {
  type: "api_key_list_error";
  message?: string;
  userId: string;
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
  maxTokens?: number;
};

export type AIChatResponse = {
  type: "ai_chat_response";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
  provider?: Provider;
  title?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
};

export type AIChatInlineData = {
  type: "ai_chat_inline_data";
  conversationId: string;
  userId: string;
  data: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
};

export type AIChatChunk = {
  type: "ai_chat_chunk";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
  provider?: Provider;
  title?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
};

export type AIChatError = {
  type: "ai_chat_error";
  conversationId: string;
  userId: string;
  message: string;
  done: true;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
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
  | ApiKeyCreateError
  | ApiKeyCreateRequest
  | ApiKeyCreateResponse
  | ApiKeyDeleteError
  | ApiKeyDeleteRequest
  | ApiKeyDeleteResponse
  | ApiKeyListError
  | ApiKeyListRequest
  | ApiKeyListResponse
  | ApiKeySetDefaultError
  | ApiKeySetDefaultRequest
  | ApiKeySetDefaultResponse
  | ApiKeyUpdateError
  | ApiKeyUpdateRequest
  | ApiKeyUpdateResponse
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

export type EventUnion = XOR<ChatMessage, TypingIndicator>;

export type EventTypeMap = {
  api_key_create_error: ApiKeyCreateError;
  api_key_create_request: ApiKeyCreateRequest;
  api_key_create_response: ApiKeyCreateResponse;
  api_key_delete_error: ApiKeyDeleteError;
  api_key_delete_request: ApiKeyDeleteRequest;
  api_key_delete_response: ApiKeyDeleteResponse;
  api_key_list_error: ApiKeyListError;
  api_key_list_request: ApiKeyListRequest;
  api_key_list_response: ApiKeyListResponse;
  api_key_set_default_error: ApiKeySetDefaultError;
  api_key_set_default_request: ApiKeySetDefaultRequest;
  api_key_set_default_response: ApiKeySetDefaultResponse;
  api_key_update_error: ApiKeyUpdateError;
  api_key_update_request: ApiKeyUpdateRequest;
  api_key_update_response: ApiKeyUpdateResponse;
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
