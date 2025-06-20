
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
};

export type AIChatResponse = {
  type: "ai_chat_response";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
};

export type AIChatChunk = {
  type: "ai_chat_chunk";
  conversationId: string;
  chunk: string;
  done: boolean;
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
