import type { ProviderChatRequestEntity } from "@/types/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { GrokResponsesApiService } from "@/xai/responses-api.ts";
import type { GrokModelIdUnion } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class xAIService extends GrokResponsesApiService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    apiKey: string,
    managementKey: string
  ) {
    super(redis, s3, logger, prisma, apiKey, managementKey);
  }
  public async routeXai({ model: m, ...rest }: ProviderChatRequestEntity) {
    const model = (m ?? "grok-4-1-fast-reasoning") as GrokModelIdUnion;
    switch (model) {
      case "grok-2-image-1212": {
        return this.handleXAIAiImageGenRequest({ model, ...rest });
      }
      case "grok-2-vision-1212":
      case "grok-3":
      case "grok-3-mini":
      case "grok-4-0709":
      case "grok-4-1-fast-non-reasoning":
      case "grok-4-1-fast-reasoning":
      case "grok-4-fast-non-reasoning":
      case "grok-4-fast-reasoning":
      case "grok-code-fast-1":
      default: {
        return this.handleXAIAiResponsesApiRequest({ model, ...rest });
      }
    }
  }
}
// codex resume 019aeb73-466c-78e3-beea-34f50e76f617
