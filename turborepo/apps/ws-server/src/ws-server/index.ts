import http from "http";
import { TLSSocket } from "tls";
import type {
  BufferLike,
  HandlerMap,
  MessageHandler,
  UserData,
  WSServerOptions
} from "@/types/index.ts";
import type { IncomingMessage } from "http";
import type { RawData } from "ws";
import { PrismaService } from "@/prisma/index.ts";
import { WebSocket, WebSocketServer } from "ws";
import type { EventTypeMap } from "@t3-chat-clone/types";
import { EnhancedRedisPubSub } from "@t3-chat-clone/redis-service";

export class WSServer {
  private wss: WebSocketServer;
  public readonly channel: string;
  private readonly jwtSecret: string;
  private unsubscribePubSub?: () => Promise<void>;
  private userMap = new Map<WebSocket, string>();
  private userDataMap = new Map<string, UserData>();
  private httpServer: http.Server;

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
    private opts: WSServerOptions,
    public redis: EnhancedRedisPubSub,
    public prisma: PrismaService
  ) {
    this.channel = opts.channel ?? "chat-global";
    this.jwtSecret = opts.jwtSecret;
    this.httpServer = http.createServer((req, res) => {
      const startTime = performance.now();

      if (req.url === "/health") {
        const processingTime = performance.now() - startTime;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            processingTime: `${processingTime.toFixed(4)}ms`
          })
        );
      } else {
        res.writeHead(426, { "Content-Type": "text/plain" });
        res.end("Upgrade Required");
      }
    });

    this.wss = new WebSocketServer({ server: this.httpServer });
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

  public async start(): Promise<void> {
    await this.redis.connect();
    // now we listen on our HTTP server (which also speaks WS)
    this.httpServer.listen(this.opts.port, () => {
      console.info(`HTTP+WebSocket server listening on port ${this.opts.port}`);
    });

    // handle _all_ WS connections
    this.wss.on("connection", (ws, req) => {
      ws._socket.setKeepAlive(true, 60_000);
      this.handleConnection(ws, req);
    });

    // Redis pub/sub for broadcast
    this.unsubscribePubSub = await this.redis.subscribeToMessages(
      this.channel,
      msg => this.broadcastRaw(msg)
    );
  }

  private async stashUserData(
    userId: string,
    cookieObj: Record<keyof UserData, string> | null,
    email?: string
  ) {
    if (!cookieObj) return;
    const { city, country, latlng, tz, region, postalCode } = cookieObj;
    void this.prisma.updateProfile({
      email: email ?? "",
      region,
      postalCode,
      city,
      country,
      latlng,
      tz,
      userId
    });
    return this.userDataMap.set(userId, {
      email,
      region,
      postalCode,
      city,
      country,
      latlng,
      tz
    });
  }

  private async handleConnection(
    ws: WebSocket,
    req: IncomingMessage
  ): Promise<void> {
    const cookies = req.headers.cookie;
    const cookieObj = this.parsedCookies(cookies);

    const { userId, email } = (await this.authenticateConnection(ws, req)) ?? {
      userId: null,
      email: undefined
    };
    if (!userId) return;
    await this.stashUserData(userId, cookieObj, email);
    const {
      city,
      country,
      latlng,
      tz,
      postalCode,
      region,
      email: userEmail = email
    } = this.userDataMap.get(userId) ?? {
      email: "unknown email",
      city: "unknown city",
      country: "unknown country",
      latlng: "unknown latlng",
      tz: "unknown tz",
      postalCode: "unknown postal code",
      region: "unknown"
    };

    this.userMap.set(ws, userId);
    const message = `User ${userId} connected from ${city}, ${country} (${region} region) having postal code ${postalCode} in the ${tz} timezone with an approx location of ${latlng}`;
    console.info(message);
    ws.on("message", raw => {
      if (this.resolver) {
        const uid = this.userMap.get(ws) ?? "";
        this.resolver.handleRawMessage(ws, uid, raw, {
          email: userEmail,
          city,
          country,
          latlng,
          postalCode,
          region,
          tz
        });
      } else {
        ws.send(JSON.stringify({ error: "No resolver configured" }));
      }
    });
    ws.on("close", () => {
      this.userMap.delete(ws);
      console.info(`User ${userId} disconnected`);
    });
  }

  private async authenticateConnection(
    ws: WebSocket,
    req: IncomingMessage
  ): Promise<{ userId: string; email: string } | null> {
    const userEmail = this.extractUserEmailFromUrl(req);

    if (!userEmail) {
      ws.close(4001, "no user email, connection closed");
      return null;
    }

    if (userEmail === "no-user-email") {
      ws.close(4001, "no user email, connection closed");
      return null;
    }

    try {
      const decodedEmail = decodeURIComponent(userEmail);

      const { isValid: userIsValid, userId } =
        await this.prisma.getAndValidateUserSessionByEmail(decodedEmail);

      if (userIsValid === false) throw new Error("Invalid Session");

      return { userId, email: decodedEmail };
    } catch (err) {
      if (err instanceof Error) {
        ws.close(4001, `Auth failed: ${err.message}`);
        return null;
      } else {
        ws.close(4001, "Auth failed");
        return null;
      }
    }
  }

  private parsedCookies(cookieHeader?: string) {
    const arr = Array.of<readonly [keyof UserData, string]>();
    try {
      if (cookieHeader) {
        cookieHeader.split(";").forEach(function (cookie) {
          const cookieKeys = [
            "city",
            "country",
            "latlng",
            "tz",
            "region",
            "postalCode"
          ];
          const parts = cookie.match(/(.*?)=(.*)/);
          if (parts) {
            const k = (parts?.[1]?.trim() ?? "").trimStart();
            const v = parts?.[2]?.trim() ?? "";
            if (cookieKeys.includes(k)) {
              arr.push([k as keyof UserData, decodeURIComponent(v)] as const);
            }
          }
        });
      } else {
        console.warn("No cookies received in the WebSocket handshake.");
      }
    } catch (err) {
      if (err instanceof Error) {
        console.error(`parseCookies Error: ` + err.message);
      } else {
        const stringify = JSON.stringify(err, null, 2);
        console.error(stringify);
      }
    } finally {
      if (arr.length > 0) {
        return Object.fromEntries(arr) as Record<keyof UserData, string>;
      } else return null;
    }
  }

  private extractUserEmailFromUrl(req: IncomingMessage): string | null {
    const rawPath = req?.url ?? "";
    const host = req?.headers?.host;
    if (!host) return null;

    const isSecure = req.socket instanceof TLSSocket;
    // pick the right WS protocol (wss if TLS, otherwise ws)
    const scheme = isSecure ? "wss" : "ws";
    // build a full URL so URL.searchParams works
    try {
      const full = new URL(`${scheme}://${host}${rawPath}`);
      return full.searchParams.get("email");
    } catch {
      return null;
    }
  }

  /** Register a strongly-typed handler for a given event type */
  public on<const T extends keyof EventTypeMap>(
    event: T,
    handler: MessageHandler<T>
  ): void {
    this.handlers[event] = handler as HandlerMap[T];
  }

  private broadcastRawErrorCb(err?: Error) {
    // Only log when there is an actual send error
    if (err) console.error("broadcast send error:", err.message);
  }

  // Safely stringify events, handling BigInt values gracefully
  private safeStringify(data: unknown): string {
    const replacer = (_key: string, value: unknown) => {
      if (typeof value === "bigint") {
        const asNumber = Number(value);
        return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
      }
      return value as unknown;
    };
    return JSON.stringify(data, replacer);
  }

  /** Broadcast a raw JSON message string to all connected clients */
  public broadcastRaw(msg: BufferLike): void {
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg, err => this.broadcastRawErrorCb(err));
      }
    }
  }

  /** Broadcast a typed event to all clients */
  public broadcast<T extends keyof EventTypeMap>(
    event: T,
    data: EventTypeMap[T]
  ): void {
    const msg = this.safeStringify({ ...data, type: event });
    this.broadcastRaw(msg);
  }

  private async teardownPubSub() {
    if (this.unsubscribePubSub) {
      await this.unsubscribePubSub();
      this.unsubscribePubSub = undefined;
    }
  }

  public async stop(): Promise<void> {
    await this.teardownPubSub();
    await this.redis.quit();
    this.wss.close();
    console.info("Server shut down.");
  }
}
