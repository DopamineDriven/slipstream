import type { PrismaClientBase } from "@/lib/prisma";
import { PrismaUserKeyService } from "@/orm/user-key-service";
import { PrismaUserMessageService } from "@/orm/user-message-service";

interface OrmServiceEntity {
  prismaApiKeyService: PrismaUserKeyService;
  prismaConversationService: PrismaUserMessageService;
}

export function ormHandler(prisma: PrismaClientBase) {
  return {
    prismaApiKeyService: new PrismaUserKeyService(prisma),
    prismaConversationService: new PrismaUserMessageService(prisma)
  } satisfies OrmServiceEntity;
}
