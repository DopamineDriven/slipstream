import type { ProviderGeminiChatRequestEntity } from "@/gemini/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import { GeminiChatService } from "@/gemini/chat.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type { GeminiModelIdUnion } from "@slipstream/types";

export class GeminiService extends GeminiChatService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    store: UserStoreVectorService,
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    apiKey: string
  ) {
    super(logger, prisma, store, redis, s3, apiKey);
  }
  public async routeGemini({
    model,
    ...rest
  }: ProviderGeminiChatRequestEntity) {
    const m = model as GeminiModelIdUnion;
    return this.handleGeminiAiChatRequest({ model: m, ...rest });
  }
}
