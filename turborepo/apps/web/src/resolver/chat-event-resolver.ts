import type {
  ChatWsEvent,
  ChatWsEventTypeUnion,
  EventTypeMap,
  RawData
} from "@/types/chat-ws";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";

export class ChatEventResolver {
  constructor(public wsClient: ChatWebSocketClient) {}

  public registerAll() {
    this.wsClient.setResolver(this);
  }
  public handleRawMessage(socket: WebSocket, raw: RawData) {
    const data = this.parseEvent(raw);
    if (!data) return;
    switch (data.type) {
      case "typing":
        return this.handleTyping(data, socket);

      case "message":
        return this.handleMessage(data, socket);

      case "ping":
        return this.handlePing(data, socket);

      case "ai_chat_chunk":
        return this.handleAIChatChunk(data, socket);

      case "ai_chat_response":
        return this.handleAIChatResponse(data, socket);

      case "ai_chat_error":
        return this.handleAIChatError(data, socket);

      case "image_gen_response":
        return this.handleImageGenResponse(data, socket);

      case "asset_upload_response":
        return this.handleAssetUploadResponse(data, socket);

      case "ai_chat_inline_data":
        return this.handleAIChatInlineData(data, socket);

      default:
        console.warn(`No handler for event type ${data.type}`);
    }
  }
  public EVENT_TYPES = [
    "message",
    "typing",
    "ping",
    "image_gen_request",
    "image_gen_response",
    "ai_chat_response",
    "asset_upload_request",
    "asset_upload_response",
    "ai_chat_chunk",
    "ai_chat_request",
    "ai_chat_inline_data",
    "ai_chat_error"
  ] as const;
  private parseEvent(raw: RawData): ChatWsEvent | null {
    let msg: unknown;
    try {
      if (Array.isArray(raw)) {
        msg = JSON.parse(Buffer.concat(raw).toString());
      } else {
        msg = JSON.parse(Buffer.from(raw).toString());
      }
      if (
        typeof msg !== "object" ||
        msg === null ||
        !("type" in msg) ||
        typeof (msg as { type?: unknown }).type !== "string" ||
        !this.EVENT_TYPES.includes(
          (msg as { type: string }).type as ChatWsEventTypeUnion
        )
      ) {
        return null;
      }
      return msg as EventTypeMap[ChatWsEvent["type"]];
    } catch {
      console.error("Invalid message received");
      return null;
    }
  }

  public safeErrMsg(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return String(err);
  }

  private handleTyping(evt: EventTypeMap["typing"], _ws: WebSocket): void {
    console.debug("typing:", evt);
  }

  private handleMessage(evt: EventTypeMap["message"], _ws: WebSocket): void {
    console.debug("new chat message:", evt);
  }

  private handlePing(evt: EventTypeMap["ping"], ws: WebSocket): void {
    console.log(evt.type);
    ws.send(JSON.stringify(evt));
  }

  private handleAIChatChunk(
    evt: EventTypeMap["ai_chat_chunk"],
    _ws: WebSocket
  ) {
    console.log("stream chunk:", evt);
    // stream token into UI
  }

  private handleAIChatInlineData(
    event: EventTypeMap["ai_chat_inline_data"],
    _ws: WebSocket
  ) {
    console.log("ai_chat_inline_data", event.type);
  }

  private handleAIChatResponse(
    evt: EventTypeMap["ai_chat_response"],
    _ws: WebSocket
  ): void {
    console.debug("chat complete", evt);
    // finished streaming (token generation complete)
  }

  private handleAIChatError(
    evt: EventTypeMap["ai_chat_error"],
    _ws: WebSocket
  ): void {
    console.error("chat error", evt);
  }

  private handleImageGenResponse(
    evt: EventTypeMap["image_gen_response"],
    _ws: WebSocket
  ): void {
    console.debug("image URL", evt);
    // display generated image
  }

  private handleAssetUploadResponse(
    evt: EventTypeMap["asset_upload_response"],
    _ws: WebSocket
  ): void {
    console.debug("uploaded asset:", evt);
    // update UI with new asset
  }
}

/**
 type _ChatAction =
  | {
      type: "message";
      conversationId: string;
      message: EventMap<"message">;
    }
  | {
      type: "ai_chat_chunk";
      conversationId: string;
      chunk: EventMap<"ai_chat_chunk">;
    }
  | {
      type: "ai_chat_response";
      conversationId: string;
      response: EventMap<"ai_chat_response">;
    }
  | {
      type: "ai_chat_error";
      conversationId: string;
      error: EventMap<"ai_chat_error">;
    };
 */
