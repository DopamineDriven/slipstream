import type { WebSocket } from "ws";

export type ChatMessage = {
  type: "message";
  userId: string;
  conversationId: string;
  content: string;
  timestamp: number;
  attachments?: string[];
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

export type MessageHandler<T extends keyof EventTypeMap> = (
  event: EventTypeMap[T],
  ws: WebSocket,
  userId: string
) => Promise<void> | void;

export type HandlerMap = {
  [K in keyof EventTypeMap]?: MessageHandler<K>;
};
