import type {
  ChatWsEvent,
  EventTypeMap,
  HandlerMap,
  MessageHandler,
  RawData,
  UserData
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
  private userId = "";
  private userData?: UserData;
  public readonly handlers: HandlerMap = {};
  private resolver?: {
    handleRawMessage: (
      ws: WebSocket,
      userId: string,
      raw: RawData,
      userData?: UserData
    ) => void | Promise<void>;
  };
  constructor(
    private url: string,
    id?: string,
    userData?: UserData
  ) {
    this.userId = id ?? "";
    this.userData = userData;
  }

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
      const data = JSON.parse(event.data) as ChatWsEvent;
      this.listeners.forEach(listener => listener(data));
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
    handleRawMessage: (
      ws: WebSocket,
      userId: string,
      raw: RawData,
      userData?: UserData
    ) => void | Promise<void>;
  }) {
    this.resolver = resolver;
  }
  public send<const T extends keyof EventTypeMap>(
    event: T,
    data: EventTypeMap[T]
  ) {
    const payload = {
      ...data,
      type: event,
      userId: this.userId,
      userData: { ...(this.userData ?? {}) }
    } satisfies EventTypeMap[T] & {
      type: T;
      userId: string;
      userData?: UserData;
    };
    const msg = JSON.stringify({ ...data, type: event });
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

  public on<const T extends keyof EventTypeMap>(
    event: T,
    handler: MessageHandler<T>
  ): void {
    this.handlers[event] = handler as HandlerMap[T];
  }

  public get isConnected() {
    return this._isConnected;
  }
}
