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
    if (this.isNativeImgModel(model)) {
      return this.handleXAIAiImageGenRequest({ model, ...rest });
    } else {
      return this.handleXAIAiResponsesApiRequest({
        management_api_key: this.xaiManagementKey,
        model,
        ...rest
      });
    }
  }
}
