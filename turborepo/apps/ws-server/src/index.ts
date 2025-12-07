import type { Socket } from "net";
import * as dotenv from "dotenv";
import type { Signals } from "@slipstream/types";
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

    const loggerConfig = {
      serviceName: "ws-server",
      environment: isProd === true ? "production" : "development",
      region,
      taskArn: process.env.ECS_TASK_ARN,
      taskDefinition: process.env.ECS_TASK_DEFINITION,
      logLevel: typeof process.env.IS_PROD === "undefined" ? "info" : "debug",
      isProd
    };
    const { ExtractService } = await import("@/extract/index.ts");

    const extract = new ExtractService();

    const logger = LoggerService.getLoggerInstance(loggerConfig),
      log = logger.getPinoInstance();

    const { S3Storage } = await import("@slipstream/storage-s3");

    const s3 = S3Storage.getInstance(config);

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
    const connectionString = process.env.DATABASE_URL ?? cfg.DATABASE_URL;

    const { DbService } = await import("@slipstream/db/node");

    const db = new DbService(connectionString);

    const { PrismaService } = await import("@/prisma/index.ts");

    const { Extract } = await import("@d0paminedriven/metadata");

    const extractpkg = new Extract();

    const prisma = new PrismaService(db, extract, extractpkg, isProd);

    const port = cfg.PORT ? Number.parseInt(cfg.PORT) : 4000;

    const { PdfService } = await import("@/pdf/index.ts");

    const pdfService = new PdfService(
      cfg.PDF_SERVICES_CLIENT_ID,
      cfg.PDF_SERVICES_CLIENT_SECRET,
      cfg.ADOBE_WEBHOOK_SECRET,
      s3,
      prisma
    );

    const { WSServer } = await import("@/ws-server/index.ts");

    const wsServer = new WSServer({ port }, redisInstance, prisma, pdfService);

    const { Resolver } = await import("@/resolver/index.ts");

    const { v0Service } = await import("@/vercel/index.ts");

    const v0 = new v0Service(logger, prisma, redisInstance, cfg.V0_API_KEY);

    const { LlamaService } = await import("@/meta/index.ts");

    const meta = new LlamaService(
      logger,
      prisma,
      redisInstance,
      cfg.LLAMA_API_KEY
    );

    const { xAIService } = await import("@/xai/index.ts");

    const xai = new xAIService(
      logger,
      prisma,
      redisInstance,
      s3,
      cfg.X_AI_KEY,
      cfg.X_AI_MANAGEMENT_API_KEY
    );

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
      s3,
      redisInstance,
      cfg.OPENAI_API_KEY
    );

    const { GeminiService } = await import("@/gemini/index.ts");

    const gemini = new GeminiService(
      logger,
      prisma,
      redisInstance,
      s3,
      cfg.GOOGLE_API_KEY
    );

    const { ProviderService } = await import("@/providers/index.ts");

    const providers = new ProviderService({
      apiKeys: {
        anthropic: cfg.ANTHROPIC_API_KEY,
        gemini: cfg.GOOGLE_API_KEY,
        grok: cfg.X_AI_KEY,
        meta: cfg.LLAMA_API_KEY,
        openai: cfg.OPENAI_API_KEY,
        vercel: cfg.V0_API_KEY,
        grokMgmtKey: cfg.X_AI_MANAGEMENT_API_KEY
      },
      dependencies: {
        logger,
        prisma,
        redis: redisInstance,
        s3,
        isProd
      },
      anthropic,
      gemini,
      grok: xai,
      meta,
      openai,
      vercel: v0
    });

    const { ImageCompatService } = await import("@/image/index.ts");

    const imgCompatService = new ImageCompatService(s3, prisma, isProd);

    const resolver = new Resolver(
      wsServer,
      providers,
      s3,
      region,
      imgCompatService,
      cfg.X_AI_MANAGEMENT_API_KEY
    );

    resolver.registerAll();

    wsServer.setResolver(resolver);

    const redisPingHandle = setInterval(async () => {
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
        clearInterval(redisPingHandle);
        await wsServer.stop();
        log.info("Cleanup complete, exiting gracefully");
        process.exitCode = 0;
      } catch (error) {
        process.exitCode = 1;

        if (error instanceof Error) {
          log.error(
            { name: error.name, stack: error.stack, cause: error.cause },
            error.message
          );
          throw new Error(error.message);
        } else throw new Error(JSON.stringify(error, null, 2));
      }
    };
    process.on("SIGTERM", async () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", async () => gracefulShutdown("SIGINT"));
  } catch (err) {
    if (err instanceof Error)
      throw new Error(err.message.concat(`${err.stack}`));
    else throw new Error(`something went wrong...`);
  }
}

exe();

declare module "ws" {
  interface WebSocket {
    _socket: Socket;
  }
}

declare module "http" {
  interface IncomingHttpHeaders extends NodeJS.Dict<string | string[]> {
    "x-adobe-pdf-hook"?: string;
    "x-attachment-id"?: string;
  }
}

declare global {
  interface JSON {
    parse<T = unknown>(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): T;
  }
  interface Body {
    json<T = unknown>(): Promise<T>;
  }
  interface Response {
    json<T = unknown>(): Promise<T>;
  }
}
