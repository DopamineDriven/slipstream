// src/context/ChatEventResolver.ts
import type { Dispatch } from "react";
import { Session } from "next-auth";
import type {
  ChatWsEvent,
  ChatWsEventTypeUnion,
  EventMap,
  EventTypeMap,
  RawData
} from "@/types/chat-ws";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";

// The same actions your reducer expects:
type ChatAction =
  | {
      type: "add_message";
      conversationId: string;
      message: EventMap<"message">;
    }
  | {
      type: "add_chunk";
      conversationId: string;
      chunk: EventMap<"ai_chat_chunk">;
    }
  | {
      type: "finish_stream";
      conversationId: string;
      response: EventMap<"ai_chat_response">;
    }
  | { type: "error"; conversationId: string; error: EventMap<"ai_chat_error"> };

export class ChatEventResolver {
  // Build a HandlerMap<ChatAction> keyed by event type
  private handlers: {
    [K in keyof EventTypeMap]?: (evt: EventMap<K>) => void;
  } = {};

  constructor(
    private dispatch: Dispatch<ChatAction>,
    public wsClient: ChatWebSocketClient,
    public session: Session | null
  ) {
    this.handlers.message = evt =>
      this.dispatch({
        type: "add_message",
        conversationId: evt.conversationId,
        message: evt
      });
    this.handlers.ai_chat_chunk = evt =>
      this.dispatch({
        type: "add_chunk",
        conversationId: evt.conversationId,
        chunk: evt
      });
    this.handlers.ai_chat_response = evt =>
      this.dispatch({
        type: "finish_stream",
        conversationId: evt.conversationId,
        response: evt
      });
    this.handlers.ai_chat_error = evt =>
      this.dispatch({
        type: "error",
        conversationId: evt.conversationId,
        error: evt
      });
    // if you want inline_data, typing, etc—just add more here
  }
  /** Register all event handlers here */
  public registerAll() {
    this.wsClient.on("typing", this.handleTyping.bind(this));
    // You can also register response handlers if needed (for internal use)
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
  public async handleTyping(
    event: EventTypeMap["typing"],
    ws: ChatWebSocketClient
  ): Promise<void> {
    ws.send("typing", { ...event });
  }

  /**
   *
   * This is akin to
   *
   *

  ```ts
      public async handleRawMessage(
        ws: WebSocket,
        userId: string,
        raw: RawData
      ): Promise<void> {
        const event = this.parseEvent(raw);
        if (!event) {
          ws.send(JSON.stringify({ error: "Invalid message" }));
          return;
        }
        switch (event.type) {
          case "message":
            await this.handleMessage(event, ws, userId);
            break;
          case "typing":
            await this.handleTyping(event, ws, userId);
            break;
          case "ping":
            await this.handlePing(event, ws, userId);
            break;
          case "asset_upload_request":
            await this.handleAssetUploadRequest(event, ws, userId);
            break;
          case "image_gen_request":
            await this.handleImageGenRequest(event, ws, userId);
            break;
          case "ai_chat_request":
            await this.handleAIChat(event, ws, userId);
            break;
          default:
            await this.wsServer.redis.publish(
              this.wsServer.channel,
              JSON.stringify({ event: "never", userId, timestamp: Date.now() })
            );
        }
      }
    ```
   **/

  public processEvent(wsClient: ChatWebSocketClient, raw: RawData) {
    const event = this.parseEvent(raw);
    // Narrow it to the exact shape

    if (!event) return;
    return wsClient.send(event.type, event);
  }
}
