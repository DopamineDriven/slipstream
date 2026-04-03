import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import { OpenAIResponsesChatService } from "@/openai/responses-chat.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";

export class OpenAIService extends OpenAIResponsesChatService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    redis: EnhancedRedisPubSub,
    apiKey: string
  ) {
    super(logger, prisma, userStoreVector, s3, redis, apiKey);
  }
  public async routeOpenAI({ model, ...rest }: ProviderOpenaiRequestEntity) {
    if (!model || !this.isOpenAIModel(model)) return;
    if (this.isImgGenNative(model)) {
      return this.handleOpenaiNativeImageRequestGptImage1({
        ...rest,
        model
      });
    } else if (
      this.isImgGenFacilitating(model) &&
      typeof rest.imgGenFields !== "undefined" &&
      rest.imgGenEnabled === true
    ) {
      return this.handleOpenaiResponsesImgGen({ model, ...rest });
    } else {
      return this.handleOpenaiChatRequest({ model, ...rest });
    }
  }
}
