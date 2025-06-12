import type { RawData } from "ws";
import { createClient, RedisClientType } from "redis";
import { WebSocket, WebSocketServer  } from "ws";
import type { AnyEvent, EventTypeMap } from "@/types/index.ts";
import { verifyJWT } from "@/auth/index.ts";
import { logger } from "@/logger/index.ts";

// src/server/WSServer.ts

interface WSServerOptions {
  port: number;
  redisUrl: string;
  jwtSecret: string;
  channel?: string; // default pub/sub channel
}

type MessageHandler = (
  event: AnyEvent,
  ws: WebSocket,
  userId: string
) => Promise<void> | void;

export class WSServer {
  private wss: WebSocketServer;
  private redis: RedisClientType;
  private readonly channel: string;
  private readonly jwtSecret: string;
  private readonly handlers = new Map<string, MessageHandler>();

  constructor(private opts: WSServerOptions) {
    this.channel = opts.channel ?? "chat-global";
    this.jwtSecret = opts.jwtSecret;
    this.wss = new WebSocketServer({ port: opts.port });
    this.redis = createClient({ url: opts.redisUrl });
  }

  public async start() {
    await this.redis.connect();
    logger.info(`Connected to Redis at ${this.opts.redisUrl}`);
    logger.info(
      `WebSocket server listening on ws://localhost:${this.opts.port}`
    );

    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));

    // Redis subscription to broadcast events to all sockets
    const sub = this.redis.duplicate();
    await sub.connect();
    await sub.subscribe(this.channel, msg => {
      this.broadcastRaw(msg);
    });
  }

  private async handleConnection(ws: WebSocket, req: Request) {
    // Extract token from query
    const token = new URL(req.url ?? "", "ws://dummy").searchParams.get(
      "token"
    );
    if (!token) {
      ws.close(4001, "Missing auth token");
      return;
    }
    let userId: string;
    try {
      const user = await verifyJWT(token);
      if (!user) throw new Error("Invalid JWT");
      userId = user.sub;
    } catch (e) {
      logger.warn(`${e}`);
      ws.close(4001, "Auth failed");
      return;
    }
    logger.info(`User ${userId} connected`);

    ws.on("message", async (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (typeof msg.type !== "string") throw new Error("No type in message");
        // Dispatch to registered handler if present
        const handler = this.handlers.get(msg.type);
        if (handler) {
          await handler(msg, ws, userId);
        } else {
          // Default: publish to Redis (for broadcast)
          await this.redis.publish(
            this.channel,
            JSON.stringify({ ...msg, userId, timestamp: Date.now() })
          );
        }
      } catch (e) {
        logger.error("Invalid message received", e);
        ws.send(JSON.stringify({ error: "Invalid message" }));
      }
    });

    ws.on("close", () => {
      logger.info(`User ${userId} disconnected`);
      // Add presence logic or cleanup here if needed
    });
  }

  /**
   * Register a custom handler for a given event type (for extensibility)
   */
  public on<T extends keyof EventTypeMap>(event: T, handler: MessageHandler) {
    this.handlers.set(event, handler);
  }

  /**
   * Broadcast a raw JSON message string to all connected clients
   */
  public broadcastRaw(msg: string) {
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  /**
   * Broadcast a typed event to all clients (recommended for TS)
   */
  public broadcast<T extends keyof EventTypeMap>(
    event: T,
    data: EventTypeMap[T]
  ) {
    const msg = JSON.stringify({ ...data, type: event });
    this.broadcastRaw(msg);
  }

  public async stop() {
    await this.redis.quit();
    this.wss.close();
    logger.info("Server shut down.");
  }
}
