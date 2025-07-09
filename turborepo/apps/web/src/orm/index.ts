import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import { PrismaUserKeyService } from "@/orm/user-key-service";

interface OrmServiceEntity {
  prismaApiKeyService: PrismaUserKeyService;
}

export function ormHandler(
  prisma: PrismaClientWithAccelerate
): OrmServiceEntity {
  return {
    prismaApiKeyService: new PrismaUserKeyService(prisma)
  };
}
