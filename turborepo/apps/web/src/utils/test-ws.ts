// src/lib/ChatWebSocketClient.ts
import type { ChatWsEvent } from "@t3-chat-clone/types";

type EventType = ChatWsEvent["type"];
type GenericHandler = (event: ChatWsEvent, socket: WebSocket) => void;

/* eslint-disable @typescript-eslint/no-non-null-assertion */

export class ChatWebSocketClient {
  private socket: WebSocket | null = null;
  private queue: string[] = Array.of<string>();
  private reconnectAttempts = 0;
  private maxReconnect = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private handlers: Record<EventType, GenericHandler[]> = {
    ai_chat_chunk: Array.of<GenericHandler>(),
    ai_chat_error: Array.of<GenericHandler>(),
    ai_chat_inline_data: Array.of<GenericHandler>(),
    ai_chat_request: Array.of<GenericHandler>(),
    ai_chat_response: Array.of<GenericHandler>(),
    asset_upload_request: Array.of<GenericHandler>(),
    asset_upload_response: Array.of<GenericHandler>(),
    image_gen_request: Array.of<GenericHandler>(),
    image_gen_response: Array.of<GenericHandler>(),
    ping: Array.of<GenericHandler>(),
    typing: Array.of<GenericHandler>()
  };

  constructor(private url: string) {}

  public connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      while (this.queue.length && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(this.queue.shift()!);
      }
    };

    this.socket.onmessage = (ev: MessageEvent<string>) => {
      let data: ChatWsEvent;
      try {
        data = JSON.parse(ev.data) as ChatWsEvent;
      } catch {
        return;
      }

      if (!this.socket) return; // in case we got closed
      this.handlers[data.type].forEach(fn => fn(data, this.socket!));
    };

    this.socket.onclose = () => {
      this.socket = null;
      if (++this.reconnectAttempts <= this.maxReconnect) {
        const delay = 1000 * 2 ** this.reconnectAttempts;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      } else {
        console.error("WebSocket: max reconnects reached");
      }
    };

    this.socket.onerror = e => {
      console.error("WebSocket error", e);
    };
  }

  public on(event: EventType, handler: GenericHandler) {
    this.handlers[event].push(handler);
    if (!this.socket) this.connect();
  }

  public off(event: EventType, handler: GenericHandler) {
    this.handlers[event] = this.handlers[event].filter(h => h !== handler);
  }

  public send<const T extends EventType>(
    event: T,
    payload: Omit<ChatWsEvent, "type">
  ) {
    const msg = JSON.stringify({ ...payload, type: event });
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(msg);
    } else {
      this.queue.push(msg);
      if (!this.socket) this.connect();
    }
  }

  public close() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  public get isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
