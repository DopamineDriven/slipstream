import process from "node:process";
import type { Signals } from "@/types/index.ts";
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

    const awsAccessKeyId = cfg.AWS_ACCESS_KEY,
      awsSecretAccessLey = cfg.AWS_SECRET_ACCESS_KEY,
      region = cfg.AWS_REGION,
      pyGenAssets = process.env.GEN_BUCKET ?? cfg.GEN_BUCKET,
      wsAssets = process.env.ASSETS_BUCKET ?? cfg.ASSETS_BUCKET;

    const { Fs } = await import("@d0paminedriven/fs");
    const fs = new Fs(process.cwd());

    const { S3Storage } = await import("@t3-chat-clone/storage-s3");

    const s3 = S3Storage.getInstance(
      {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessLey,
        buckets: {
          pyGenAssets,
          wsAssets
        },
        region
      },
      fs
    );

    const { R2Instance } = await import("@/r2-helper/index.ts");

    const r2 = new R2Instance({
      accountId,
      accessKeyId,
      secretAccessKey,
      r2PublicUrl
    });

    const redisUrl = cfg.REDIS_URL ?? "redis://redis:6379",
      ca = cred.unflattenNewlines(cfg.REDIS_CA_PEM),
      cert = cred.unflattenNewlines(cfg.REDIS_CLIENT_CERT),
      key = cred.unflattenNewlines(cfg.REDIS_CLIENT_KEY),
      host = cfg.REDIS_HOST;

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

    const prisma = new PrismaService(prismaClient, fs);

    const jwtSecret =
      cfg.JWT_SECRET ?? "QzItEuoPfuEZyoll41Zw8x+l0/8jSJxZYbpQ76dk4vI=";

    const port = cfg.PORT ? Number.parseInt(cfg.PORT) : 4000;

    const { WSServer } = await import("@/ws-server/index.ts");

    const wsServer = new WSServer({ port, jwtSecret }, redisInstance, prisma);

    const { Resolver } = await import("@/resolver/index.ts");

    const { v0Service } = await import("@/vercel/index.ts");

    const v0 = new v0Service(prisma, redisInstance, cfg.V0_API_KEY);

    const { LlamaService } = await import("@/meta/index.ts");

    const meta = new LlamaService(prisma, redisInstance, cfg.LLAMA_API_KEY);

    const { xAIService } = await import("@/xai/index.ts");

    const xai = new xAIService(cfg.X_AI_KEY, prisma, redisInstance);

    const { OpenAIService } = await import("@/openai/index.ts");

    const { AnthropicService } = await import("@/anthropic/index.ts");

    const anthropic = new AnthropicService(
      prisma,
      redisInstance,
      cfg.ANTHROPIC_API_KEY
    );

    const openai = new OpenAIService(prisma, redisInstance, cfg.OPENAI_API_KEY);

    const { GeminiService } = await import("@/gemini/index.ts");

    const gemini = new GeminiService(prisma, redisInstance, cfg.GOOGLE_API_KEY);

    const resolver = new Resolver(
      wsServer,
      openai,
      gemini,
      anthropic,
      s3,
      r2,
      cfg.FASTAPI_URL,
      cfg.R2_BUCKET,
      region,
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
    let isShuttingDown = false;

    const gracefulShutdown = async <const T extends Signals>(signal: T) => {
      if (isShuttingDown) {
        console.log(`Already shutting down, ignoring ${signal}`);
        return;
      }

      isShuttingDown = true;
      console.log(`${signal} received, shutting down gracefully...`);

      try {
        await wsServer.stop();
        console.log("Cleanup complete, exiting gracefully");
        process.exitCode = 0;
      } catch (error) {
        console.error("Error during shutdown:", error);
        if (error instanceof Error) {
          console.error(error.stack);
        }
        process.exitCode = 1;
      }
    };
    process.on("SIGTERM", async () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", async () => gracefulShutdown("SIGINT"));
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
// declare global {
//  namespace NodeJS {
//     interface ProcessEnv {
//       readonly ASSETS_BUCKET: "ws-server-assets-dev" | "ws-server-assets-prod";
//       readonly GEN_BUCKET: "py-gen-assets-dev" | "py-gen-assets-prod"
//     }
//   }

// }
