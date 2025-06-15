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
import { createClient } from "redis";
import { WebSocket, WebSocketServer } from "ws";
import type {
  EventTypeMap,
  HandlerMap,
  MessageHandler,
  WSServerOptions
} from "@/types/index.ts";
import { verifyJWT } from "@/auth/index.ts";
import { logger } from "@/logger/index.ts";

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
  public readonly handlers: HandlerMap = {};
  private resolver?: {
    handleRawMessage: (
      ws: WebSocket,
      userId: string,
      raw: RawData
    ) => void | Promise<void>;
  };

  constructor(private opts: WSServerOptions) {
    this.channel = opts.channel ?? "chat-global";
    this.jwtSecret = opts.jwtSecret;
    this.wss = new WebSocketServer({ port: opts.port });
    this.redis = createClient({ url: opts.redisUrl });
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
    logger.info(`Connected to Redis at ${this.opts.redisUrl}`);
    logger.info(
      `WebSocket server listening on ws://localhost:${this.opts.port}`
    );

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req.url ?? "");
    });

    // Redis pub/sub for broadcast
    const sub = this.redis.duplicate();
    await sub.connect();
    await sub.subscribe(this.channel, msg => this.broadcastRaw(msg));
  }

  private async handleConnection(ws: WebSocket, url: string): Promise<void> {
    const userId = await this.authenticateConnection(ws, url);
    if (!userId) return;

    logger.info(`User ${userId} connected`);
    ws.on("message", raw => {
      if (this.resolver) {
        this.resolver.handleRawMessage(ws, userId, raw);
      } else {
        ws.send(JSON.stringify({ error: "No resolver configured" }));
      }
    });
    ws.on("close", () => logger.info(`User ${userId} disconnected`));
  }

  private async authenticateConnection(
    ws: WebSocket,
    url: string
  ): Promise<string | null> {
    const token = this.extractTokenFromUrl(url);
    if (!token) {
      ws.close(4001, "Missing auth token");
      return null;
    }
    try {
      const user = await verifyJWT(token);
      if (!user) throw new Error("Invalid JWT");
      return user.sub;
    } catch {
      ws.close(4001, "Auth failed");
      return null;
    }
  }

  private extractTokenFromUrl(url: string): string | null {
    try {
      return new URL(url, "ws://ws-server.d0paminedriven.com").searchParams.get(
        "token"
      );
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
    logger.info("Server shut down.");
  }
}
