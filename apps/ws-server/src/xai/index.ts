import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import { GrokResponsesApiLinearService } from "@/xai/responses-api-linear.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";

export class xAIService extends GrokResponsesApiLinearService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    userStore: UserStoreVectorService,
    memoryService: ConversationMemoryVectorService,
    apiKey: string,
    managementKey: string,
    localToolBroker: LocalToolBroker
  ) {
    super(
      redis,
      s3,
      logger,
      prisma,
      userStore,
      memoryService,
      apiKey,
      managementKey,
      localToolBroker
    );
  }
  public async routeXai({ model, ...rest }: ProviderChatRequestEntity) {
    if (!model || !this.prisma.isGrokModel(model)) {
      throw new Error(
        typeof model === "undefined"
          ? `no model passed to routeXai`
          : `non-grok model passed to routeXai ${model}`
      );
    }
    if (this.prisma.isGrokImgModel(model)) {
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
