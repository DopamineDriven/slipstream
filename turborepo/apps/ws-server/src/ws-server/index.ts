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
import { db } from "@/db/index.ts";

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

  public wsHostname = process.env.WS_HOSTNAME ?? "localhost:4000";

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
    console.info(`WebSocket server listening on ws://${this.wsHostname}`);

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req.url ?? "");
    });

    // Redis pub/sub for broadcast
    const sub = this.redis.duplicate();
    await sub.connect();
    await sub.subscribe(this.channel, msg => this.broadcastRaw(msg));
  }

  // private async handlePoolQuery(ws: Websocket, userId: string) {

  // }

  private async handleConnection(ws: WebSocket, url: string): Promise<void> {
    const userId = await this.authenticateConnection(ws, url);
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
    url: string
  ): Promise<string | null> {
    const userEmail = this.extractUserEmailFromUrl(url);
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
      const userIsValid = await db.isValidUserAndSessionByEmail(decodedEmail);
      if (userIsValid === false) throw new Error("Invalid Session");
      if (userIsValid.valid === false) throw new Error("Invalid Session");
      return userIsValid.id;
    } catch {
      ws.close(4001, "Auth failed");
      return null;
    }
  }

  private extractUserEmailFromUrl(url: string): string | null {
    try {
      const u = new URL(url, `ws://${this.wsHostname}`);
      return u.searchParams.get("email");
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
