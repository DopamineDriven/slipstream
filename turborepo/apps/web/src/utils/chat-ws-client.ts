import type {
  ChatWsEvent,
  EventTypeMap,
  HandlerMap,
  MessageHandler,
  RawData
} from "@/types/chat-ws";

export type ChatEventListener = (event: ChatWsEvent) => void;

export class ChatWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageQueue = Array.of<string>();
  private listeners = Array.of<ChatEventListener>();
  private _isConnected = false;
  public readonly handlers: HandlerMap = {};
  private resolver?: {
    handleRawMessage: (socket: WebSocket, raw: RawData) => void | Promise<void>;
  };
  constructor(private readonly url: string) {}

  public connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this._isConnected = true;
      this.reconnectAttempts = 0;
      while (
        this.messageQueue.length > 0 &&
        this.socket?.readyState === WebSocket.OPEN
      ) {
        const msg = this.messageQueue.shift();
        if (msg) this.socket.send(msg);
      }
    };

    this.socket.onmessage = (event: MessageEvent<string>) => {
      const raw = event.data satisfies RawData;
      if (!this.socket) return;
      if (this.resolver) {
        this.resolver.handleRawMessage(this.socket, raw);
      } else {
        const data = JSON.parse(raw) as ChatWsEvent;
        this.listeners.forEach(listener => listener(data));
        switch (data.type) {
          case "ai_chat_chunk": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "ai_chat_error": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "ai_chat_inline_data": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "ai_chat_request": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "ai_chat_response": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "asset_upload_request": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "asset_upload_response": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "image_gen_request": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "image_gen_response": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "message": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "ping": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          case "typing": {
            const handler = this.handlers[data.type];
            if (handler) handler(data, this.socket);
            break;
          }
          default:
            console.warn(`Unhandled event type in ${raw}`);
        }
      }
    };

    this.socket.onerror = error => {
      console.error("WebSocket error:", error);
      this._isConnected = false;
    };

    this.socket.onclose = () => {
      this._isConnected = false;
      this.socket = null;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts += 1;
        const delay = 1000 * Math.pow(2, this.reconnectAttempts);
        this.reconnectTimeout = setTimeout(() => this.connect(), delay);
      } else {
        console.error("Max reconnect attempts reached");
      }
    };
  }
  public setResolver(resolver: {
    handleRawMessage: (ws: WebSocket, raw: RawData) => void
  }) {
    this.resolver = resolver;
  }
  public send<const T extends keyof EventTypeMap>(
    event: T,
    data: EventTypeMap[T]
  ) {
    const payload = { ...data, type: event } satisfies EventTypeMap[T] & {
      type: T;
    };
    const msg = JSON.stringify(payload);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(msg);
    } else {
      this.messageQueue.push(msg);
      if (!this.socket) this.connect();
    }
  }

  public addListener(listener: ChatEventListener) {
    this.listeners.push(listener);
  }

  public removeListener(listener: ChatEventListener) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  public close() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this._isConnected = false;
    }
  }

  public on(event: keyof EventTypeMap, handler: MessageHandler<typeof event>) {
    switch (event) {
      case "ai_chat_chunk": {
        this.handlers[event] = handler;
        break;
      }
      case "ai_chat_error": {
        this.handlers[event] = handler;
        break;
      }
      case "ai_chat_inline_data": {
        this.handlers[event] = handler;
        break;
      }
      case "ai_chat_response": {
        this.handlers[event] = handler;
        break;
      }
      case "ai_chat_request": {
        this.handlers[event] = handler;
        break;
      }
      case "asset_upload_response": {
        this.handlers[event] = handler;
        break;
      }
      case "asset_upload_request": {
        this.handlers[event] = handler;
        break;
      }
      case "image_gen_request": {
        this.handlers[event] = handler;
        break;
      }
      case "image_gen_response": {
        this.handlers[event] = handler;
        break;
      }
      case "message": {
        this.handlers[event] = handler;
        break;
      }
      case "ping": {
        this.handlers[event] = handler;
        break;
      }
      case "typing": {
        this.handlers[event] = handler;
        break;
      }
      default:
        console.warn(`unhandled event in 'on' method in ws-client`);
    }
  }

  public get isConnected() {
    return this._isConnected;
  }
}
