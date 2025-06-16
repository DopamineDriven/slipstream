import { ChatWsEvent } from "@/types/chat-ws";

export type ChatEventListener = (event: ChatWsEvent) => void;

export class ChatWebSocketClient {
  private socket: WebSocket | null = null;
  private readonly url: string;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageQueue=Array.of<string>();
  private listeners=Array.of<ChatEventListener>();
  private _isConnected = false;

  constructor(url: string) {
    this.url = url;
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

  public send(event: ChatWsEvent) {
    const msg = JSON.stringify(event);
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

  public get isConnected() {
    return this._isConnected;
  }
}
