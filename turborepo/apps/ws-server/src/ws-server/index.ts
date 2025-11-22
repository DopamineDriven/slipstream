import http from "node:http";
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
import { PdfService } from "@/pdf/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientContextWorkupProps, EventTypeMap } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

export class WSServer {
  private wss: WebSocketServer;
  public readonly channel: string;
  private unsubscribePubSub?: () => Promise<void>;
  private userMap = new Map<WebSocket, string>();
  public userDataMap = new Map<string, UserData>();
  private httpServer: http.Server;

  public readonly handlers: HandlerMap = {};
  private resolver?: {
    handleRawMessage: (
      ws: WebSocket,
      userId: string,
      raw: RawData,
      userData?: UserData
    ) => void | Promise<void>;
    handleConnectionEstablished(
      ws: WebSocket,
      userId: string,
      userData?: UserData
    ): Promise<void>;
  };

  constructor(
    private opts: WSServerOptions,
    public redis: EnhancedRedisPubSub,
    public prisma: PrismaService,
    public pdfService: PdfService
  ) {
    this.channel = opts.channel ?? "chat-global";
    this.httpServer = http.createServer(async (req, res) => {
      const startTime = performance.now();
      if (req.url === "/webhooks/adobe/pdf-created" && req.method === "POST") {
        await this.pdfService.handleWebhook(req, res);
        return;
      }
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
    handleConnectionEstablished(
      ws: WebSocket,
      userId: string,
      userData?: UserData
    ): Promise<void>;
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
    providerContext: ClientContextWorkupProps,
    email?: string
  ) {
    if (!cookieObj) return;
    const { city, country, latlng, tz, region, postalCode, ip, locale, ua } =
      cookieObj;
    void this.prisma.updateProfile({
      email: email ?? "",
      region,
      postalCode,
      city,
      ip,
      locale,
      ua: decodeURIComponent(ua),
      country,
      latlng,
      tz,
      userId,
      providerContext
    });
    return this.userDataMap.set(userId, {
      email,
      region,
      ip,
      locale,
      ua: decodeURIComponent(ua),
      postalCode,
      city,
      country,
      providerContext,
      latlng,
      tz
    });
  }

  public async refreshUserProviderConfig(ws: WebSocket) {
    const userId = this.userMap.get(ws);
    if (!userId) throw new Error("no user session currently active");
    const userData = this.userDataMap.get(userId);
    console.log(userId);
    if (!userData) {
      throw new Error(
        `Cannot refresh provider config: user ${userId} not in map`
      );
    }
    console.info(userData);

    const providerContext = await this.prisma.injectClientApiKeyProps(userId);

    if (!providerContext) throw new Error("unable to resolve provider context");
    if (userData.providerContext) userData.providerContext = providerContext;
    // Update in-memory data
    this.userDataMap.set(userId, userData);

    console.info(`Refreshed provider config for user ${userId}`);
    return providerContext;
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
    const providers = await this.prisma.injectClientApiKeyProps(userId);

    await this.stashUserData(userId, cookieObj, providers, email);

    const {
      city,
      country,
      ip,
      locale,
      ua,
      providerContext = providers,
      latlng,
      tz,
      postalCode,
      region,
      email: userEmail = email
    } = this.userDataMap.get(userId) ?? {
      email: "unknown email",
      city: "Chicago",
      country: "US",
      latlng: "unknown latlng",
      tz: "America/Chicago",
      ip: "0.0.0.0",
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
      locale: "en-US",
      postalCode: "unknown postal code",
      region: "Illinois",
      providerContext: {
        isDefault: providers.isDefault,
        isSet: providers.isSet
      }
    };

    const userData = {
      email: userEmail,
      city,
      ip,
      providerContext,
      locale,
      ua,
      country,
      latlng,
      postalCode,
      region,
      tz
    };

    this.userMap.set(ws, userId);
    const message = `User ${userId} connected from ${city}, ${country} (${region} region) having postal code ${postalCode} in the ${tz} timezone with a locale of ${locale}, an approx location of ${latlng}, an ip of ${ip}, and a ua of ${ua}`;
    console.info(message);
    ws.on("message", raw => {
      if (this.resolver) {
        const uid = this.userMap.get(ws) ?? "";
        this.resolver.handleRawMessage(ws, uid, raw, userData);
      } else {
        ws.send(JSON.stringify({ error: "No resolver configured" }));
      }
    });
    ws.on("close", () => {
      this.userMap.delete(ws);
      this.userDataMap.delete(userId);
      console.info(`User ${userId} disconnected`);
    });

    if (this.resolver?.handleConnectionEstablished) {
      void this.resolver.handleConnectionEstablished(ws, userId, userData);
    }
  }

  private async authenticateConnection(
    ws: WebSocket,
    req: IncomingMessage
  ): Promise<{ userId: string; email: string } | null> {
    const id = this.extractUserIdFromUrl(req);

    if (!id) {
      ws.close(4001, "no user id, connection closed");
      return null;
    }

    if (id === "no-id") {
      ws.close(4001, "no user id, connection closed");
      return null;
    }

    try {
      const decodedId = decodeURIComponent(id);

      const {
        isValid: userIsValid,
        userId,
        email
      } = await this.prisma.getAndValidateUserSessionById(decodedId);

      if (userIsValid === false) {
        ws.close(4001, `Invalid Session for user ${userId}`);
        return null;
      }

      return { userId, email };
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
            "locale",
            "ua",
            "ip",
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

  private extractUserIdFromUrl(req: IncomingMessage): string | null {
    const rawPath = req?.url ?? "";
    const host = req?.headers?.host;
    if (!host) return null;

    const isSecure = req.socket instanceof TLSSocket;
    // pick the right WS protocol (wss if TLS, otherwise ws)
    const scheme = isSecure ? "wss" : "ws";
    // build a full URL so URL.searchParams works
    try {
      const full = new URL(`${scheme}://${host}${rawPath}`);
      return full.searchParams.get("id");
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
