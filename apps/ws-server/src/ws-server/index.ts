import { createServer } from "node:http";
import { TLSSocket } from "node:tls";
import type { LoggerService } from "@/logger/index.ts";
import type { PdfService } from "@/pdf/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { TTSService } from "@/tts/index.ts";
import type {
  BufferLike,
  HandlerMap,
  MessageHandler,
  UserData,
  WSServerOptions
} from "@/types/index.ts";
import type { IncomingMessage, Server } from "node:http";
import type { Logger as PinoLogger } from "pino";
import type { RawData } from "ws";
import { WebSocket, WebSocketServer } from "ws";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { ClientContextWorkupProps, EventTypeMap } from "@slipstream/types";

export class WSServer {
  private wss: WebSocketServer;
  public readonly channel: string;
  private unsubscribePubSub?: () => Promise<void>;
  private userMap = new Map<WebSocket, string>();
  public userDataMap = new Map<string, UserData>();
  private httpServer: Server;
  private logger: PinoLogger;

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
  /**
   * In-flight TTS service reference (set via `setTTSService` after
   * construction). Used by `stop()` to drain in-flight server-side work
   * before tearing down Redis and the WS listener.
   *
   * Setter injection rather than constructor injection is a deliberate
   * workaround for service construction order — `WSServer` is instantiated
   * before `TTSService` in `apps/ws-server/src/index.ts`. The `setResolver`
   * pattern below already establishes setter-injection as the codebase
   * convention for "service constructed after WSServer."
   */
  private ttsService?: TTSService;
  /**
   * Shutdown admission gate. Once `stop()` flips this to `true`, the
   * message handler rejects new long-running work so connected clients
   * cannot create fresh in-flight jobs during the drain window. The
   * re-snapshot drain loop alone is insufficient — it only catches *late*
   * registrations; the gate prevents the inputs in the first place.
   */
  private isDraining = false;

  constructor(
    private opts: WSServerOptions,
    public redis: EnhancedRedisPubSub,
    public prisma: PrismaService,
    public pdfService: PdfService,
    logger: LoggerService
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, v: process.version },
        { msgPrefix: "[ws-server] " }
      );
    this.channel = opts.channel ?? "chat-global";
    this.httpServer = createServer(async (req, res) => {
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

  public setTTSService(ttsService: TTSService) {
    this.ttsService = ttsService;
  }

  /**
   * Best-effort socket send. Mirrors `TTSService.trySend`. Used by the
   * shutdown admission gate to inform clients that new requests are being
   * rejected during drain. Phase 2 will promote this to a shared utility
   * once provider services adopt the pattern.
   */
  private trySend<T extends keyof EventTypeMap>(
    ws: WebSocket,
    type: T,
    data: EventTypeMap[T]
  ) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify({ ...data, type }));
      return true;
    } catch (err) {
      this.logger.debug(
        {
          type,
          err: err instanceof Error ? err.message : "unknown send error"
        },
        "trySend failed — client likely disconnected"
      );
      return false;
    }
  }

  public async start(): Promise<void> {
    await this.redis.connect();
    // now we listen on our HTTP server (which also speaks WS)
    this.httpServer.listen(this.opts.port, () => {
      this.logger.info(
        `HTTP+WebSocket server listening on port ${this.opts.port}`
      );
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
    const {
      browserName,
      browserVersion,
      city,
      country,
      latlng,
      viewport,
      tz,
      region,
      postalCode,
      ip,
      locale,
      ua
    } = cookieObj;
    void this.prisma.updateProfile({
      email: email ?? "",
      region,
      postalCode,
      browserName,
      viewport,
      browserVersion,
      city,
      ip,
      locale,
      ua,
      country,
      latlng,
      tz,
      userId,
      providerContext
    });
    return this.userDataMap.set(userId, {
      email,
      region,
      browserName,
      browserVersion,
      ip,
      locale,
      viewport,
      ua,
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
    this.logger.info(userId);
    if (!userData) {
      throw new Error(
        `Cannot refresh provider config: user ${userId} not in map`
      );
    }
    this.logger.info(userData);

    const providerContext = await this.prisma.injectClientApiKeyProps(userId);

    if (!providerContext) throw new Error("unable to resolve provider context");
    if (userData.providerContext) userData.providerContext = providerContext;
    // Update in-memory data
    this.userDataMap.set(userId, userData);

    this.logger.info(`Refreshed provider config for user ${userId}`);
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
      viewport,
      ua,
      browserName,
      browserVersion,
      providerContext = providers,
      latlng,
      tz,
      postalCode,
      region,
      email: userEmail = email
    } = this.userDataMap.get(userId) ?? {
      email: "anonymous@wow.com",
      browserName: "Chrome",
      browserVersion: "147.0.7727.49",
      city: "Barrington",
      viewport: "desktop",
      country: "US",
      latlng: "41.8338486,-87.8966849",
      tz: "America/Chicago",
      ip: "0.0.0.0",
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
      locale: "en-US",
      postalCode: "60010",
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
      viewport,
      country,
      latlng,
      postalCode,
      browserName,
      browserVersion,
      region,
      tz
    } satisfies UserData;

    this.userMap.set(ws, userId);
    const message = `User ${userId} (${email}) connected on a ${viewport} via ${browserName} version ${browserVersion} from ${city}, ${country} (${region} region) having postal code ${postalCode} in the ${tz} timezone with a locale of ${locale}, an approx location of ${latlng}, an ip of ${ip}, and a ua of ${ua}`;
    this.logger.info(message);
    ws.on("message", raw => {
      // Shutdown admission gate — once `stop()` flips `isDraining`, reject
      // new long-running work so connected clients cannot create fresh
      // in-flight jobs during the drain window. The drain primitive's
      // re-snapshot loop alone is insufficient — it only catches *late*
      // registrations, not new arrivals from already-connected clients.
      if (this.isDraining) {
        this.trySend(ws, "user_tts_error", {
          type: "user_tts_error",
          status: 503,
          statusText: "Server is draining, please retry shortly",
          conversationId: "",
          messageId: ""
        } satisfies EventTypeMap["user_tts_error"]);
        return;
      }
      if (this.resolver) {
        const uid = this.userMap.get(ws) ?? "";
        this.resolver.handleRawMessage(ws, uid, raw, userData);
      } else {
        ws.send(JSON.stringify({ error: "No resolver configured" }));
      }
    });
    ws.on("close", (s, f) => {
      // In-flight server-side work continues after socket close — drain
      // responsibility lives in `stop()`, not the per-socket handler.
      // userId is closure-captured into all in-flight TTS frames via the
      // `streamToClient(... , userId, ...)` parameter, so deleting userMap
      // here does not break anything.
      const reason = f.toString("utf-8");
      const obj =
        reason.length > 1
          ? { reason, code: s, userId, email }
          : { code: s, userId, email };

      this.logger.debug(
        obj,
        `ws close event with code ${s} — in-flight server work continues`
      );
      this.userMap.delete(ws);
      this.userDataMap.delete(userId);
      this.logger.info(`User ${userId} disconnected`);
    });

    if (this.resolver?.handleConnectionEstablished) {
      void this.resolver.handleConnectionEstablished(ws, userId, userData);
    }
  }

  private async authenticateConnection(ws: WebSocket, req: IncomingMessage) {
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
          function isUserDataKey(s: string) {
            return (
              s === "city" ||
              s === "locale" ||
              s === "ua" ||
              s === "ip" ||
              s === "country" ||
              s === "latlng" ||
              s === "tz" ||
              s === "region" ||
              s === "postalCode" ||
              s === "browserName" ||
              s === "browserVersion" ||
              s === "viewport"
            );
          }
          const cookieKeys = [
            "city",
            "locale",
            "ua",
            "ip",
            "country",
            "latlng",
            "tz",
            "region",
            "postalCode",
            "browserName",
            "browserVersion",
            "viewport"
          ] satisfies Exclude<keyof UserData, "providerContext">[];
          const parts = cookie.match(/(.*?)=(.*)/);
          if (parts) {
            const k = (parts?.[1]?.trim() ?? "").trimStart();
            const v = parts?.[2]?.trim() ?? "";

            if (isUserDataKey(k) && cookieKeys.includes(k)) {
              arr.push([k, decodeURIComponent(v)] as const);
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

  private extractUserIdFromUrl(req: IncomingMessage) {
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

  public async stop() {
    // Critical ordering — see plan
    // /home/dopaminedriven/.claude/plans/fancy-nibbling-bentley.md Step 1.3.
    //   1. Flip admission gate FIRST so message handler stops admitting new
    //      long-running work for the entire drain window.
    //   2. Tear down Redis pub/sub so cross-instance broadcasts stop arriving.
    //   3. Drain in-flight TTS work — bounded by INFLIGHT_DRAIN_TIMEOUT_MS
    //      (default 90s, Fargate-safe under the 120s stopTimeout ceiling).
    //   4. Quit Redis only after all consumers are done with it.
    //   5. Close the WSS listener + existing client sockets LAST so any
    //      trailing trySend in finalize() lands on a still-open socket
    //      where possible.
    this.logger.info("Shutdown initiated, entering drain mode");
    this.isDraining = true;
    await this.teardownPubSub();
    if (this.ttsService) {
      await this.ttsService.awaitAllInflight();
    }
    await this.redis.quit();
    this.wss.close();
    this.logger.info("Server shut down");
  }
}
