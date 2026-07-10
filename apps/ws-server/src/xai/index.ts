import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import { GrokResponsesApiService } from "@/xai/responses-api.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type { GrokModelIdUnion } from "@slipstream/types";

export class xAIService extends GrokResponsesApiService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    userStore: UserStoreVectorService,
    memoryService: ConversationMemoryVectorService,
    apiKey: string,
    managementKey: string
  ) {
    super(
      redis,
      s3,
      logger,
      prisma,
      userStore,
      memoryService,
      apiKey,
      managementKey
    );
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
