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
    const ca = cred.unflattenNewlines(cfg.REDIS_CA_PEM);
    const cert = cred.unflattenNewlines(cfg.REDIS_CLIENT_CERT);
    const key = cred.unflattenNewlines(cfg.REDIS_CLIENT_KEY);
    const host = cfg.REDIS_HOST;
    const { EnhancedRedisPubSub } = await import(
      "@t3-chat-clone/redis-service"
    );

    const redisInstance = new EnhancedRedisPubSub(
      redisUrl,
      ca,
      key,
      cert,
      host
    );

    const { prismaClient, PrismaService } = await import("@/prisma/index.ts");

    const prisma = new PrismaService(prismaClient);

    const jwtSecret =
      cfg.JWT_SECRET ?? "QzItEuoPfuEZyoll41Zw8x+l0/8jSJxZYbpQ76dk4vI=";

    const port = cfg.PORT ? Number.parseInt(cfg.PORT) : 4000;

    const { WSServer } = await import("@/ws-server/index.ts");

    const wsServer = new WSServer({ port, jwtSecret }, redisInstance, prisma);

    const { Resolver } = await import("@/resolver/index.ts");

    const { v0Service } = await import("@/vercel/index.ts");

    const v0 = new v0Service(prisma, redisInstance, cfg.V0_API_KEY);

    const { LlamaService } = await import("@/meta/index.ts");

    const meta = new LlamaService(cfg.LLAMA_API_KEY);

    const { xAIService } = await import("@/xai/index.ts");

    const xai = new xAIService(cfg.X_AI_KEY);

    const { OpenAIService } = await import("@/openai/index.ts");

    const { AnthropicService } = await import("@/anthropic/index.ts");

    const anthropic = new AnthropicService(cfg.ANTHROPIC_API_KEY);

    const openai = new OpenAIService(cfg.OPENAI_API_KEY);

    const { GeminiService } = await import("@/gemini/index.ts");

    const gemini = new GeminiService(cfg.GOOGLE_API_KEY);

    const resolver = new Resolver(
      wsServer,
      openai,
      gemini,
      anthropic,
      r2,
      cfg.FASTAPI_URL,
      cfg.R2_BUCKET,
      xai,
      v0,
      meta
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
