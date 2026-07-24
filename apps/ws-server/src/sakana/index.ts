import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { SakanaProviderChatRequestEntity } from "@/sakana/chat.ts";
import type { SakanaUserLocation } from "@/sakana/workup.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import { SakanaChatService } from "@/sakana/chat.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";

interface SakanaRouteRequestEntity extends ProviderChatRequestEntity {
  user_location?: SakanaUserLocation;
}

export class SakanaService extends SakanaChatService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    memoryService: ConversationMemoryVectorService,
    redis: EnhancedRedisPubSub,
    apiKey: string,
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

  public async routeSakana({ model, ...rest }: SakanaRouteRequestEntity) {
    if (!model || !this.prisma.isSakanaModel(model)) return;

    return await this.handleSakanaAiChatRequest({
      ...rest,
      model
    } satisfies SakanaProviderChatRequestEntity);
  }
}
