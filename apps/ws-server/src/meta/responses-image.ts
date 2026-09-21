import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type {
  MetaActiveMessageBlock,
  MetaFinalizedMessageBlock,
  MetaProviderChatRequestEntity
} from "@/meta/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { OpenAI } from "openai";
import { MetaChatService } from "@/meta/chat.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap, MetaModelIdUnion } from "@slipstream/types";
import { isLocalToolName } from "@slipstream/types";

export class MetaResponsesImageService extends MetaChatService {
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
  

}
