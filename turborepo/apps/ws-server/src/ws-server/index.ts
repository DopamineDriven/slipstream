import http from "http";
import { TLSSocket } from "tls";
import type { IncomingMessage } from "http";
import type {
  RedisClientType,
  RedisDefaultModules,
  RedisFunctions,
  RedisModules,
  RedisScripts,
  RespVersions,
  TypeMapping
} from "redis";
import type { RawData } from "ws";
import * as dotenv from "dotenv";
import { createClient } from "redis";
import { WebSocket, WebSocketServer } from "ws";
import type {
  EventTypeMap,
  HandlerMap,
  MessageHandler,
  WSServerOptions
} from "@/types/index.ts";
import { DbService } from "@/db/index.ts";

dotenv.config();

export class WSServer {
  private wss: WebSocketServer;
  public redis: RedisClientType<
    RedisDefaultModules & RedisModules,
    RedisFunctions,
    RedisScripts,
    RespVersions,
    TypeMapping
  >;
  public readonly channel: string;
  private readonly jwtSecret: string;

  private userMap = new Map<WebSocket, string>();

  private httpServer: http.Server;

  public readonly handlers: HandlerMap = {};
  private resolver?: {
    handleRawMessage: (
      ws: WebSocket,
      userId: string,
      raw: RawData
    ) => void | Promise<void>;
  };

  constructor(private opts: WSServerOptions, private db: DbService) {
    this.channel = opts.channel ?? "chat-global";
    this.jwtSecret = opts.jwtSecret;
    this.redis = createClient({ url: opts.redisUrl });

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
      raw: RawData
    ) => void | Promise<void>;
  }) {
    this.resolver = resolver;
  }

  public async start(): Promise<void> {
    await this.redis.connect();
    console.info(`Connected to Redis at ${this.opts.redisUrl}`);
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
    const sub = this.redis.duplicate();
    await sub.connect();
    await sub.subscribe(this.channel, msg => this.broadcastRaw(msg));
  }
  private async handleConnection(
    ws: WebSocket,
    req: IncomingMessage
  ): Promise<void> {
    const userId = await this.authenticateConnection(ws, req);
    if (!userId) return;
    this.userMap.set(ws, userId);
    console.info(`User ${userId} connected`);
    ws.on("message", raw => {
      if (this.resolver) {
        const uid = this.userMap.get(ws) ?? "";
        this.resolver.handleRawMessage(ws, uid, raw);
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
  ): Promise<string | null> {
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
      const userIsValid = await this.db.isValidUserAndSessionByEmail(decodedEmail);
      if (userIsValid === false) throw new Error("Invalid Session");
      if (userIsValid.valid === false) throw new Error("Invalid Session");
      return userIsValid.id;
    } catch {
      ws.close(4001, "Auth failed");
      return null;
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

  /** Broadcast a raw JSON message string to all connected clients */
  public broadcastRaw(msg: string): void {
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  /** Broadcast a typed event to all clients */
  public broadcast<T extends keyof EventTypeMap>(
    event: T,
    data: EventTypeMap[T]
  ): void {
    const msg = JSON.stringify({ ...data, type: event });
    this.broadcastRaw(msg);
  }

  public async stop(): Promise<void> {
    await this.redis.quit();
    this.wss.close();
    console.info("Server shut down.");
  }
}
