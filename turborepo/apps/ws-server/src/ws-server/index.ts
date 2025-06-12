import type { RawData } from "ws";
import { createClient } from "redis";
import { WebSocket, WebSocketServer } from "ws";
import type { AnyEvent, EventTypeMap } from "@/types/index.ts";
import { verifyJWT } from "@/auth/index.ts";
import { logger } from "@/logger/index.ts";
import type {RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping, RedisClientType, RedisDefaultModules} from "redis";

interface WSServerOptions {
  port: number;
  redisUrl: string;
  jwtSecret: string;
  channel?: string;
}

type MessageHandler<T extends keyof EventTypeMap> = (
  event: EventTypeMap[T],
  ws: WebSocket,
  userId: string
) => Promise<void> | void;

type HandlerMap = {
  [K in keyof EventTypeMap]?: MessageHandler<K>;
};
/**
 * <M extends RedisModules, F extends RedisFunctions, S extends RedisScripts, RESP extends RespVersions, TYPE_MAPPING extends TypeMapping>(options?: RedisClientOptions<M, F, S, RESP, TYPE_MAPPING>): RedisClientType<RedisDefaultModules & M, F, S, RESP, TYPE_MAPPING>
 */

// type M<T extends keyof EventTypeMap> = {
//   [P in T]: MessageHandler<P>;
// }[T];

export class WSServer {
  private wss: WebSocketServer;
  private redis: RedisClientType<RedisDefaultModules & RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping>;
  private readonly channel: string;
  private readonly jwtSecret: string;
  private readonly handlers: HandlerMap = {};

  constructor(private opts: WSServerOptions) {
    this.channel = opts.channel ?? "chat-global";
    this.jwtSecret = opts.jwtSecret;
    this.wss = new WebSocketServer({ port: opts.port });
    this.redis = createClient({ url: opts.redisUrl });
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
    ws.on("message", raw => this.handleMessage(ws, userId, raw));
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
      return new URL(url, "ws://dummy").searchParams.get("token");
    } catch {
      return null;
    }
  }

  private async handleMessage(
    ws: WebSocket,
    userId: string,
    raw: RawData
  ): Promise<void> {
    const event = this.parseEvent(raw);
    if (!event) {
      ws.send(JSON.stringify({ error: "Invalid message" }));
      return;
    }

    // Do a type-safe dispatch using event.type
    switch (event.type) {
      case "message":
        if (this.handlers.message) {
          await this.handlers.message(event, ws, userId);
        }
        break;
      case "typing":
        if (this.handlers.typing) {
          await this.handlers.typing(event, ws, userId);
        }
        break;
      case "ping":
        if (this.handlers.ping) {
          await this.handlers.ping(event, ws, userId);
        }
        break;
      default:
        await this.redis.publish(
          this.channel,
          // event is of type never
          JSON.stringify({ event: "never", userId, timestamp: Date.now() })
        );
    }
  }

  private parseEvent(raw: RawData): AnyEvent | null {
    const EVENT_TYPES = Array.of<EventTypeMap[keyof EventTypeMap]["type"]>();
    let msg: EventTypeMap[keyof EventTypeMap];
    try {
      if (Array.isArray(raw)) {
        msg = JSON.parse(
          Buffer.concat(raw).toString()
        ) as EventTypeMap[keyof EventTypeMap];
      } else
        msg = JSON.parse(
          Buffer.from(raw).toString()
        ) as EventTypeMap[keyof EventTypeMap];
      // Basic shape/type validation
      if (
        typeof msg !== "object" ||
        !msg ||
        typeof msg.type !== "string" ||
        !(msg.type in EVENT_TYPES)
      ) {
        return null;
      }
      return msg as AnyEvent;
    } catch {
      logger.error("Invalid message received");
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
