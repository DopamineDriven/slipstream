import { ChatWebSocketClient } from "@/chat-ws-client.ts";
import { ClientContext } from "@/client-context.ts";
import type { ChatWsEvent, EventTypeMap } from "@slipstream/types";

type CliHandlerMap = {
  [K in keyof EventTypeMap]?: (data: EventTypeMap[K]) => void;
};

/**
 * Transport layer — wraps the battle-proven ChatWebSocketClient ported from
 * apps/web (reconnect + backoff, message queue, typed registry), plus the
 * one thing the browser could never send: the Cookie header at the
 * handshake, so stashUserData gets real UserData. ?id= carries the userId;
 * the server validates the session on file.
 */
export class SlipstreamClientService extends ClientContext {
  constructor(wsUrl?: string) {
    super(wsUrl);
  }

  protected wsClient?: ChatWebSocketClient;
  private handlers: CliHandlerMap = {};

  public on<const K extends keyof EventTypeMap>(
    event: K,
    handler: (data: EventTypeMap[K]) => void
  ) {
    // same idiom as the server's HandlerMap registration (ws-server on())
    this.handlers[event] = handler as CliHandlerMap[K];
  }

  public send<const K extends keyof EventTypeMap>(data: EventTypeMap[K]) {
    if (!this.wsClient) {
      throw new Error("not connected — call connect() first");
    }
    // proven client queues while disconnected and flushes on (re)connect
    this.wsClient.send(data.type, data);
  }

  /** volatile counterpart — false instead of queueing when not OPEN */
  public sendVolatile<const K extends keyof EventTypeMap>(
    data: EventTypeMap[K]
  ) {
    return this.wsClient?.sendVolatile(data.type, data) ?? false;
  }

  private dispatch(event: ChatWsEvent) {
    const handler = this.handlers[event.type];
    if (handler) {
      // the frame's type field discriminates; the registry write above is
      // the correlated site
      (handler as (data: ChatWsEvent) => void)(event);
    }
  }

  public async connect(timeoutMs = 10_000) {
    // real edge-derived context first (phase 2B) — stashUserData gets honest
    // geo instead of the Barrington fallback; fetch failure degrades to the
    // static cookie defaults so an edge blip never blocks a session
    await this.primeEdgeContext();
    // ?id= carries the userId — the server validates the session on file;
    // the Cookie header carries the client context parsedCookies() reads
    const url = `${this.wsUrl}/?id=${encodeURIComponent(this.userId)}`;
    const client = new ChatWebSocketClient(url, this.cookieHeader);
    this.wsClient = client;
    client.addListener(event => this.dispatch(event));
    client.connect();

    const startedAt = Date.now();
    while (!client.isConnected) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          `connection timed out (${this.wsUrl}) — is the ws-server up? ` +
            `If the session on file expired, refresh via ${this.loginUrl}`
        );
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
