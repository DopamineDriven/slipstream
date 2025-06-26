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
