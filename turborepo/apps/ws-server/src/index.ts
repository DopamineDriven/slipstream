import process from "node:process";
import type { Signals } from "@/types/index.ts";
import type { Socket } from "net";
import * as dotenv from "dotenv";
import { Credentials } from "@slipstream/credentials";

dotenv.config({ quiet: true });

async function exe() {
  const cred = new Credentials();

  const cfg = await cred.getAll();

  try {
    const isProd = typeof process.env.IS_PROD === "undefined";
    const region = cfg.AWS_REGION,
      pyGenAssets = process.env.GEN_BUCKET ?? cfg.GEN_BUCKET,
      wsAssets = process.env.ASSETS_BUCKET ?? cfg.ASSETS_BUCKET,
      buckets = { pyGenAssets, wsAssets },
      config = {
        credentials: {
          accessKeyId: cfg.AWS_ACCESS_KEY_S3,
          secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY_S3
        },
        isProd,
        accessKeyId: cfg.AWS_ACCESS_KEY_S3,
        secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY_S3,
        buckets,
        region
      };

    const { LoggerService } = await import("@/logger/index.ts");

    const { Fs } = await import("@d0paminedriven/fs");

    const fs = new Fs(process.cwd());

    const loggerConfig = {
      serviceName: "ws-server",
      environment:
        typeof process.env.IS_PROD === "undefined"
          ? "production"
          : "development",
      region,
      taskArn: process.env.ECS_TASK_ARN,
      taskDefinition: process.env.ECS_TASK_DEFINITION,
      logLevel: typeof process.env.IS_PROD === "undefined" ? "info" : "debug",
      isProd
    };

    const logger = LoggerService.getLoggerInstance(loggerConfig),
      log = logger.getPinoInstance();

    const { S3Storage } = await import("@slipstream/storage-s3");

    const s3 = S3Storage.getInstance(config, fs);

    const redisUrl = cfg.REDIS_URL ?? "redis://redis:6379",
      ca = cred.unflattenNewlines(cfg.REDIS_CA_PEM),
      cert = cred.unflattenNewlines(cfg.REDIS_CLIENT_CERT),
      key = cred.unflattenNewlines(cfg.REDIS_CLIENT_KEY),
      host = cfg.REDIS_HOST;

    const { EnhancedRedisPubSub } = await import("@slipstream/redis-service");

    const redisInstance = new EnhancedRedisPubSub(
      redisUrl,
      ca,
      key,
      cert,
      host
    );

    const { PrismaService } = await import("@/prisma/index.ts");

    const connectionString = process.env.DATABASE_URL ?? cfg.DATABASE_URL;

    const prisma = new PrismaService(connectionString, 10, 30000, fs);

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

    const xai = new xAIService(prisma, redisInstance, cfg.X_AI_KEY);

    const { AnthropicService } = await import("@/anthropic/index.ts");

    const anthropic = new AnthropicService(
      logger,
      prisma,
      redisInstance,
      cfg.ANTHROPIC_API_KEY
    );

    const { OpenAIService } = await import("@/openai/index.ts");

    const openai = new OpenAIService(
      logger,
      prisma,
      redisInstance,
      cfg.OPENAI_API_KEY
    );

    const { GeminiService } = await import("@/gemini/index.ts");

    const gemini = new GeminiService(
      logger,
      prisma,
      redisInstance,
      cfg.GOOGLE_API_KEY
    );

    const resolver = new Resolver(
      wsServer,
      openai,
      gemini,
      anthropic,
      s3,
      cfg.FASTAPI_URL,
      region,
      xai,
      v0,
      meta,
      isProd
    );

    resolver.registerAll();
    wsServer.setResolver(resolver);
    setInterval(async () => {
      try {
        await redisInstance.ping();
      } catch (err) {
        log.error(
          "Redis health check failed: ".concat(
            err instanceof Error ? err.message : ""
          )
        );
      }
    }, 30000);
    await wsServer.start();

    let isShuttingDown = false;

    const gracefulShutdown = async <const T extends Signals>(signal: T) => {
      if (isShuttingDown) {
        log.info(`Already shutting down, ignoring ${signal}`);
        return;
      }

      isShuttingDown = true;
      log.warn(`${signal} received, shutting down gracefully...`);

      try {
        await wsServer.stop();
        log.info("Cleanup complete, exiting gracefully");
        process.exitCode = 0;
      } catch (error) {
        log.error(
          `Error during shutdown: ` +
            (typeof error === "string" ? error : JSON.stringify(error))
        );
        if (error instanceof Error) {
          log.error("Stacktrace: " + (error.stack ?? ""));
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

declare global {
  interface BigInt {
    toJSON(): string;
  }
  interface JSON {
    parse<T = unknown>(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): T;
  }
}

// BigInt.prototype.toJSON = function () {
//   return this.toJSON(); // Convert to string for serialization
// };
// declare global {
//  namespace NodeJS {
//     interface ProcessEnv {
//       readonly ASSETS_BUCKET: "ws-server-assets-dev" | "ws-server-assets-prod";
//       readonly GEN_BUCKET: "py-gen-assets-dev" | "py-gen-assets-prod"
//     }
//   }

// }
