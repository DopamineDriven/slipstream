import type { Socket } from "net";
import * as dotenv from "dotenv";
import { Credentials } from "@t3-chat-clone/credentials";

dotenv.config({ quiet: true });

async function exe() {
  const cred = new Credentials();

  const cfg = await cred.getAll();
  try {
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

    const redisUrl = cfg.REDIS_URL ?? "redis://redis:6379";

    const { EnhancedRedisPubSub } = await import(
      "@t3-chat-clone/redis-service"
    );

    const redisInstance = new EnhancedRedisPubSub(redisUrl);

    const { prismaClient, PrismaService } = await import("@/prisma/index.ts");

    const prisma = new PrismaService(prismaClient);

    const jwtSecret =
      cfg.JWT_SECRET ?? "QzItEuoPfuEZyoll41Zw8x+l0/8jSJxZYbpQ76dk4vI=";

    const port = cfg.PORT ? Number.parseInt(cfg.PORT) : 4000;

    const { WSServer } = await import("@/ws-server/index.ts");

    const wsServer = new WSServer({ port, jwtSecret }, redisInstance, prisma);

    const { Resolver } = await import("@/resolver/index.ts");

    const { getOpenAI } = await import("@/openai/index.ts");

    const { AnthropicService } = await import("@/anthropic/index.ts");

    const anthropic = new AnthropicService(cred);

    const openai = await getOpenAI(cred);

    const { GeminiService } = await import("@/gemini/index.ts");

    const gemini = new GeminiService(cred);

    const resolver = new Resolver(
      wsServer,
      openai,
      gemini,
      anthropic,
      r2,
      cred
    );

    resolver.registerAll();
    wsServer.setResolver(resolver);
    setInterval(async () => {
      try {
        await redisInstance.ping();
      } catch (err) {
        console.error(
          "Redis health check failed: ",
          err instanceof Error ? err.message : ""
        );
      }
    }, 30000);
    await wsServer.start();
  } catch (err) {
    if (err instanceof Error) throw new Error(err.message);
    else throw new Error(`something went wrong...`);
  }
}

exe();
declare module "ws" {
  interface WebSocket {
    _socket: Socket;
  }
}
