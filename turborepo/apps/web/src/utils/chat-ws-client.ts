import type { HandlerMap, RawData } from "@/types/chat-ws";
import type { ChatWsEvent, EventTypeMap, ChatWsEventTypeUnion } from "@t3-chat-clone/types";

export type ChatEventListener = (event: ChatWsEvent) => void;

// Type-safe event handler registry with built-in dispatch
class EventHandlerRegistry {
  private handlers: HandlerMap = {};
  private activeHandlers = new Set<keyof HandlerMap>();

  // Event types for validation
  private readonly EVENT_TYPES = [
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

 public register<const K extends keyof HandlerMap>(event: K, handler: HandlerMap[K]) {
    if (this.activeHandlers.has(event)) {
      console.warn(`Handler for ${event} already registered, replacing...`);
    }
    this.handlers[event] = handler;
    this.activeHandlers.add(event);
  }

 public unregister<const K extends keyof HandlerMap>(event: K) {
    delete this.handlers[event];
    this.activeHandlers.delete(event);
  }

  // Parse and validate incoming messages
 public parseEvent(raw: RawData): ChatWsEvent | null {
    try {
      let msg: unknown;

      // Handle both string and buffer data
      if (typeof raw === 'string') {
        msg = JSON.parse(raw);
      } else if (Array.isArray(raw)) {
        msg = JSON.parse(Buffer.concat(raw).toString());
      } else {
        msg = JSON.parse(Buffer.from(raw).toString());
      }

      // Validate message structure
      if (
        typeof msg !== "object" ||
        msg === null ||
        !("type" in msg) ||
        typeof (msg as { type?: unknown }).type !== "string" ||
        !this.EVENT_TYPES.includes(
          (msg as { type: string }).type as ChatWsEventTypeUnion
        )
      ) {
        console.warn("Invalid message structure received", msg);
        return null;
      }

      return msg as ChatWsEvent;
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
      return null;
    }
  }

  // Type-safe dispatch with built-in event handling
 public dispatch(event: ChatWsEvent, socket: WebSocket): boolean {
    // Handle built-in events first
    switch (event.type) {
      case "ping":
        // Auto-respond to ping
        socket.send(JSON.stringify(event));
        console.debug("Responded to ping");
        break;

      case "typing":
        console.debug("Typing event:", event);
        break;

      default:
        // Log other events at debug level
        console.debug(`Received ${event.type} event`);
    }

    // Then dispatch to registered handlers
    type EventType = ChatWsEvent["type"];

    const dispatcher: Record<EventType, () => void> = {
      "ai_chat_chunk": () => {
        const handler = this.handlers.ai_chat_chunk;
        if (handler && event.type === "ai_chat_chunk") {
          handler(event, socket);
        }
      },
      "ai_chat_error": () => {
        const handler = this.handlers.ai_chat_error;
        if (handler && event.type === "ai_chat_error") {
          handler(event, socket);
        }
      },
      "ai_chat_inline_data": () => {
        const handler = this.handlers.ai_chat_inline_data;
        if (handler && event.type === "ai_chat_inline_data") {
          handler(event, socket);
        }
      },
      "ai_chat_request": () => {
        const handler = this.handlers.ai_chat_request;
        if (handler && event.type === "ai_chat_request") {
          handler(event, socket);
        }
      },
      "ai_chat_response": () => {
        const handler = this.handlers.ai_chat_response;
        if (handler && event.type === "ai_chat_response") {
          handler(event, socket);
        }
      },
      "asset_upload_request": () => {
        const handler = this.handlers.asset_upload_request;
        if (handler && event.type === "asset_upload_request") {
          handler(event, socket);
        }
      },
      "asset_upload_response": () => {
        const handler = this.handlers.asset_upload_response;
        if (handler && event.type === "asset_upload_response") {
          handler(event, socket);
        }
      },
      "image_gen_request": () => {
        const handler = this.handlers.image_gen_request;
        if (handler && event.type === "image_gen_request") {
          handler(event, socket);
        }
      },
      "image_gen_response": () => {
        const handler = this.handlers.image_gen_response;
        if (handler && event.type === "image_gen_response") {
          handler(event, socket);
        }
      },
      "ping": () => {
        const handler = this.handlers.ping;
        if (handler && event.type === "ping") {
          handler(event, socket);
        }
      },
      "typing": () => {
        const handler = this.handlers.typing;
        if (handler && event.type === "typing") {
          handler(event, socket);
        }
      }
    };

    const dispatchFn = dispatcher[event.type];
    if (dispatchFn) {
      dispatchFn();
      return true;
    }

    console.warn(`No handler registered for event type: ${event.type}`);
    return false;
  }

  public clear() {
    for (const key of this.activeHandlers) {
      delete this.handlers[key];
    }
    this.activeHandlers.clear();
  }

  public get rawHandlers() {
    return this.handlers;
  }
}

export class ChatWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageQueue = Array.of<string>();
  private listeners = new Set<ChatEventListener>();
  private _isConnected = false;
  private registry = new EventHandlerRegistry();

  constructor(private readonly url: string) {}

  // Expose handlers for backward compatibility
  public get handlers() {
    return this.registry.rawHandlers;
  }

  public connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this._isConnected = true;
      this.reconnectAttempts = 0;
      console.log("WebSocket connected");

      while (
        this.messageQueue.length > 0 &&
        this.socket?.readyState === WebSocket.OPEN
      ) {
        const msg = this.messageQueue.shift();
        if (msg) this.socket.send(msg);
      }
    };

    this.socket.onmessage = (event: MessageEvent<string>) => {
      if (!this.socket) return;

      // Parse and validate the event
      const data = this.registry.parseEvent(event.data);
      if (!data) return;

      // Notify all listeners first
      this.listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });

      // Dispatch to type-safe registry (includes built-in handling)
      this.registry.dispatch(data, this.socket);
    };

    this.socket.onerror = error => {
      console.error("WebSocket error:", error);
      this._isConnected = false;
    };

    this.socket.onclose = (event) => {
      this._isConnected = false;
      this.socket = null;

      console.log(`WebSocket closed: code=${event.code}, reason=${event.reason}`);

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts += 1;
        const delay = 1000 * Math.pow(2, this.reconnectAttempts);
        console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);
        this.reconnectTimeout = setTimeout(() => this.connect(), delay);
      } else {
        console.error("Max reconnect attempts reached");
      }
    };
  }

  public off<const K extends keyof HandlerMap>(event: K) {
    this.registry.unregister(event);
  }

  public send<const T extends keyof EventTypeMap>(
    event: T,
    data: EventTypeMap[T]
  ) {
    const payload = { ...data, type: event } satisfies EventTypeMap[T] & {
      type: T;
    };
    const msg = JSON.stringify(payload);
    
    // Debug logging for ai_chat_request events
    if (data.type === "ai_chat_request") {
      const prompt = data.prompt;
      console.log(
        `[WebSocketClient] Sending ${event} - prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}" (${prompt.length} chars)`
      );
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log(`[WebSocketClient] Message sent immediately via WebSocket`);
      this.socket.send(msg);
    } else {
      console.log(`[WebSocketClient] Message queued (socket not ready)`);
      this.messageQueue.push(msg);
      if (!this.socket) {
        console.log("Socket not connected, initiating connection...");
        this.connect();
      }
    }
  }

  public addListener(listener: ChatEventListener) {
    this.listeners.add(listener);
  }

  public removeListener(listener: ChatEventListener) {
    this.listeners.delete(listener);
  }

  public close() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this._isConnected = false;
    }

    // Clear all handlers and listeners
    this.registry.clear();
    this.listeners.clear();
    this.messageQueue = [];

    console.log("WebSocket client closed");
  }

  public on<const K extends keyof HandlerMap>(
    event: K,
    handler: HandlerMap[typeof event]
  ) {
    this.registry.register(event, handler);
  }

  public get isConnected() {
    return this._isConnected;
  }

  // Utility method for error formatting (moved from resolver)
  public static formatError(err: unknown): string {
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
    } else {
      return String(err);
    }
  }
}
