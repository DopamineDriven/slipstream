import type { Socket } from "net";
import { Pool } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { DbService } from "@/db/index.ts";
import { openai } from "@/openai/index.ts";
import { Resolver } from "@/resolver/index.ts";
import { WSServer } from "@/ws-server/index.ts";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const db = new DbService(pool);

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const jwtSecret =
  process.env.JWT_SECRET ?? "QzItEuoPfuEZyoll41Zw8x+l0/8jSJxZYbpQ76dk4vI=";

const port = process.env.PORT ? Number.parseInt(process.env.PORT) : 4000;

const wsServer = new WSServer({ port, redisUrl, jwtSecret }, db);
const resolver = new Resolver(wsServer, openai, wsServer.redis);
resolver.registerAll();
wsServer.setResolver(resolver);

wsServer.start();

export {};

declare module "ws" {
  interface WebSocket {
    _socket: Socket;
  }
}
