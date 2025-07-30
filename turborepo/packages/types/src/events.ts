import type { GetModelUtilRT, Provider } from "@/models.ts";

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
  sub_type: "text" | "citation" | "thinking"
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
  | AssetUploadRequest
  | AssetUploadResponse
  | AIChatChunk
  | AIChatError
  | AIChatInlineData
  | AIChatRequest
  | AIChatResponse
  | TypingIndicator
  | PingMessage
  | ImageGenRequest
  | ImageGenResponse;

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
  asset_upload_request: AssetUploadRequest;
  asset_upload_response: AssetUploadResponse;
  typing: TypingIndicator;
  ping: PingMessage;
  image_gen_request: ImageGenRequest;
  image_gen_response: ImageGenResponse;
};

export type EventMap<T extends keyof EventTypeMap> = {
  [P in T]: EventTypeMap[P];
}[T];

export type ProviderCountsProps = {
  openai: number;
  grok: number;
  gemini: number;
  anthropic: number;
};

export type RecordCountsProps = {
  isSet: ProviderCountsProps;
  isDefault: ProviderCountsProps;
};

export type ClientContextWorkupProps = {
  isSet: Record<Provider, boolean>;
  isDefault: Record<Provider, boolean>;
};
