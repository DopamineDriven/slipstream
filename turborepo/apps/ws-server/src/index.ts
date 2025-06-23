import type { Socket } from "net";
import { RedisInstance } from "@t3-chat-clone/redis-service";
import { Pool } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { DbService } from "@/db/index.ts";
import { gemini } from "@/gemini/index.ts";
import { openai } from "@/openai/index.ts";
import { R2Instance } from "@/r2-helper/index.ts";
import { Resolver } from "@/resolver/index.ts";
import { WSServer } from "@/ws-server/index.ts";

dotenv.config();

// r2
const accountId = process.env.R2_ACCOUNT_ID ?? "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
const r2PublicUrl = process.env.R2_PUBLIC_URL ?? "";

const r2 = new R2Instance({
  accountId,
  accessKeyId,
  secretAccessKey,
  r2PublicUrl
});

// redis
const redisUrl = process.env.REDIS_URL ?? "redis://redis:6379";

const redisInstance = new RedisInstance(redisUrl);

// pg
const dbConnectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: dbConnectionString
});

const db = new DbService(pool);

const jwtSecret =
  process.env.JWT_SECRET ?? "QzItEuoPfuEZyoll41Zw8x+l0/8jSJxZYbpQ76dk4vI=";

const port = process.env.PORT ? Number.parseInt(process.env.PORT) : 4000;

const wsServer = new WSServer({ port, redisUrl, jwtSecret }, db, redisInstance);
const resolver = new Resolver(wsServer, openai, gemini, wsServer.redis, r2);
resolver.registerAll();
wsServer.setResolver(resolver);

wsServer.start();

export {};

declare module "ws" {
  interface WebSocket {
    _socket: Socket;
  }
}
