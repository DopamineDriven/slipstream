import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { MetaRouteRequestEntity } from "@/meta/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import { MetaChatService } from "@/meta/chat.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";

export class MetaService extends MetaChatService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    userStoreVector: UserStoreVectorService,
    memoryService: ConversationMemoryVectorService,
    apiKey: string,
    s3: S3Storage,
    localToolBroker: LocalToolBroker
  ) {
    super(
      logger,
      prisma,
      userStoreVector,
      s3,
      memoryService,
      redis,
      apiKey,
      localToolBroker
    );
  }

  public async handleMetaAiChatRequest({
    model,
    ...rest
  }: MetaRouteRequestEntity) {
    if (!model || !this.prisma.isMetaModel(model)) return;
    return await this.handleMetaResponsesApiRequest({ model, ...rest });
  }
}
