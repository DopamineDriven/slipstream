import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { OpenAIResponsesChatService } from "@/openai/responses-chat.ts";
import { PrismaService } from "@/prisma/index.ts";
import type { OpenAiModelIdUnion } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class OpenAIService extends OpenAIResponsesChatService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    s3: S3Storage,
    redis: EnhancedRedisPubSub,
    apiKey: string
  ) {
    super(logger, prisma, s3, redis, apiKey);
  }
  public async routeOpenAI({ model, ...rest }: ProviderOpenaiRequestEntity) {
    const m = model as OpenAiModelIdUnion;
    if (this.isImgGenModel(m)) {
      return this.handleOpenaiNativeImageRequestGptImage1({
        model: m,
        ...rest
      });
    } else if (
      this.isImgGenFacilitating(m) &&
      typeof rest.imgGenFields !== "undefined" &&
      rest.imgGenEnabled === true
    ) {
      return this.handleOpenaiResponsesImgGen({ model: m, ...rest });
    } else {
      return this.handleOpenaiChatRequest({ model: m, ...rest });
    }
  }
}
