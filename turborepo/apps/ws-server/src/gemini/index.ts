import type { ProviderGeminiChatRequestEntity } from "@/gemini/types.ts";
import { GeminiChatService } from "@/gemini/chat.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import type { GeminiModelIdUnion } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class GeminiService extends GeminiChatService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    apiKey: string
  ) {
    super(logger, prisma, redis, s3, apiKey);
  }
  public async routeGemini({
    model,
    ...rest
  }: ProviderGeminiChatRequestEntity) {
    const m = model as GeminiModelIdUnion;
    return this.handleGeminiAiChatRequest({ model: m, ...rest });
  }
}
