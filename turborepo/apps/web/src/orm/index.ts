import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import { PrismaUserKeyService } from "@/orm/user-key-service";
import { PrismaUserMessageService } from "@/orm/user-message-service";

interface OrmServiceEntity {
  prismaApiKeyService: PrismaUserKeyService;
  prismaConversationService: PrismaUserMessageService;
}
/**
  async deleteAttachment(id: string, userId: string): Promise<Attachment> {
    // Verify ownership
    const attachment = await this.prismaClient.attachment.findUnique({
      where: { id }
    });

    if (!attachment) {
      throw new Error("Attachment not found");
    }

    if (attachment.userId !== userId) {
      throw new Error("Unauthorized to delete this attachment");
    }

    return this.prismaClient.attachment.update({
      where: { id },
      data: {
        status: "DELETED",
        deletedAt: new Date()
      }
    });
  }
 */
export function ormHandler(
  prisma: PrismaClientWithAccelerate
): OrmServiceEntity {
  return {
    prismaApiKeyService: new PrismaUserKeyService(prisma),
    prismaConversationService: new PrismaUserMessageService(prisma)
  };
}
