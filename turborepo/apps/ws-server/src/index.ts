import * as dotenv from "dotenv";
dotenv.config();

import { WebSocketServer } from "ws";
import { verifyJWT } from "@/auth/index.ts";
import { publishMessage, subscribeToMessages } from "@/pubsub/index.ts";
import { logger } from "@/logger/index.ts";
import type { EventUnion } from "@/types/index.ts";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const CHANNEL = "chat-global";

// Boot WS server
const wss = new WebSocketServer({ port: PORT });

logger.info(`WebSocket server listening on ws://localhost:${PORT}`);

// Subscribe to Redis channel, broadcast to all sockets
wss.on("connection", async (ws, req) => {
  // Parse JWT from query string: ws://...?token=...
  const token = new URL(req.url ?? "", "ws://dummy").searchParams.get("token");
  if (!token) {
    ws.close(4001, "Missing auth token");
    return;
  }
  const user = await verifyJWT(token);
  if (!user) {
    ws.close(4001, "Auth failed");
    return;
  }
  logger.info(`User ${user.sub} connected`);

  // Forward all messages from this user to Redis
  ws.on("message", async (raw) => {
    let msg: EventUnion;
    try {
      msg = (JSON.parse(Buffer.from(raw.toString()).toString())) as EventUnion;
      // Validate msg structure here if desired
      // Attach user ID to every message for trust
      if ("type" in msg && msg.type === "message") {
        msg.userId = user.sub;
        msg.timestamp = Date.now();
      }
      await publishMessage(CHANNEL, JSON.stringify(msg));
    } catch (err) {
      logger.error("Invalid message", err);
      ws.send(JSON.stringify({ error: "Invalid message format" }));
    }
  });

  // Subscribe this socket to chat events from Redis
  const unsubscribe = subscribeToMessages(CHANNEL, (msg) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  });

  ws.on("close", () => {
    logger.info(`User ${user.sub} disconnected`);
    unsubscribe();
  });
});

