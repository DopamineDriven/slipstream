import type { Socket } from "net";
import { Credentials } from "@t3-chat-clone/credentials";
import * as dotenv from "dotenv";

dotenv.config();

async function exe() {
  const cred = new Credentials();

  const cfg = await cred.getAll();
  {
    // r2
    const accountId = cfg.R2_ACCOUNT_ID;
    const accessKeyId = cfg.R2_ACCESS_KEY_ID;
    const secretAccessKey = cfg.R2_SECRET_ACCESS_KEY;
    const r2PublicUrl = cfg.R2_PUBLIC_URL;
    const { R2Instance } = await import("@/r2-helper/index.ts");

    const r2 = new R2Instance({
      accountId,
      accessKeyId,
      secretAccessKey,
      r2PublicUrl
    });

    // redis
    const redisUrl = cfg.REDIS_URL ?? "redis://redis:6379";

    const { RedisInstance } = await import("@t3-chat-clone/redis-service");

    const redisInstance = new RedisInstance(redisUrl);

    // pg

    const { Pool } = await import("@neondatabase/serverless");

    const pool = new Pool({
      connectionString: cfg.DATABASE_URL
    });
    const { DbService } = await import("@/db/index.ts");

    const db = new DbService(pool);

    const jwtSecret =
      cfg.JWT_SECRET ?? "QzItEuoPfuEZyoll41Zw8x+l0/8jSJxZYbpQ76dk4vI=";

    const port = cfg.PORT ? Number.parseInt(cfg.PORT) : 4000;
    const { WSServer } = await import("@/ws-server/index.ts");
    const wsServer = new WSServer(
      { port, redisUrl, jwtSecret },
      db,
      redisInstance
    );
    const { Resolver } = await import("@/resolver/index.ts");
    const { getOpenAI } = await import("@/openai/index.ts");
    const openai = await getOpenAI(cred);
    const { getGemini } = await import("@/gemini/index.ts");
    const gemini = await getGemini(cred);
    const resolver = new Resolver(
      wsServer,
      openai,
      gemini,
      wsServer.redis,
      r2,
      cred
    );
    resolver.registerAll();
    wsServer.setResolver(resolver);

    wsServer.start();
  }
}

exe();
declare module "ws" {
  interface WebSocket {
    _socket: Socket;
  }
}
