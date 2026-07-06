import { WebSocket } from "ws";
import { CliConfigService } from "@/config.ts";
import type { EventTypeMap } from "@slipstream/types";

type CliHandlerMap = {
  [K in keyof EventTypeMap]?: (data: EventTypeMap[K]) => void;
};

/**
 * WS transport — the CLI as a first-class client of the existing server
 * surface. Cookie header at the handshake (the reason ws beats the native
 * WebSocket), ?id= session auth, typed EventTypeMap dispatch mirroring the
 * server's own handler-map idiom.
 */
export class SlipstreamClientService extends CliConfigService {
  private ws?: WebSocket;
  private handlers: CliHandlerMap = {};

  public on<const K extends keyof EventTypeMap>(
    event: K,
    handler: (data: EventTypeMap[K]) => void
  ) {
    // same idiom as the server's HandlerMap registration (ws-server on())
    this.handlers[event] = handler as CliHandlerMap[K];
  }

  public send<const K extends keyof EventTypeMap>(data: EventTypeMap[K]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("not connected — call connect() first");
    }
    this.ws.send(JSON.stringify(data));
  }

  public async connect() {
    const url = `${this.wsUrl}/?id=${encodeURIComponent(this.sessionId)}`;
    const ws = new WebSocket(url, {
      headers: { Cookie: this.cookieHeader }
    });
    this.ws = ws;

    ws.on("message", raw => {
      const text =
        typeof raw === "string" ? raw : Buffer.from(raw as Buffer).toString();
      const frame = JSON.parse<
        EventTypeMap[keyof EventTypeMap] & { type: keyof EventTypeMap }
      >(text);
      const handler = this.handlers[frame.type];
      if (handler) {
        // the frame's type field discriminates; the registry write is the
        // correlated site (same idiom as the server's HandlerMap)
        (handler as (data: EventTypeMap[keyof EventTypeMap]) => void)(frame);
      }
    });

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    ws.once("open", () => resolve());
    ws.once("error", err => reject(err));
    ws.once("close", (code, reason) => {
      const why = reason.toString("utf-8");
      console.error(
        `\nconnection closed (${code})${why ? `: ${why}` : ""}` +
          (code === 4001 ? ` — session invalid; visit ${this.loginUrl}` : "")
      );
      process.exit(code === 1000 ? 0 : 1);
    });
    return promise;
  }
}
