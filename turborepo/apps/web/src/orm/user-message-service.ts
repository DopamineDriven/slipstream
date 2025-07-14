import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import type { Conversation, Message } from "@prisma/client";
import { ErrorHelperService } from "@/orm/err-helper";
export class PrismaUserMessageService extends ErrorHelperService {
  constructor(public prismaClient: PrismaClientWithAccelerate) {super()}

  public async getRecentConversationsByUserId(userId: string) {
    return await this.prismaClient.conversation.findMany({
      where: { userId },
      take: 10,
      orderBy: [{ updatedAt: "asc" }]
    });
  }
  public async getMessagesByConversationId(
    conversationId: string
  ): Promise<null | (Conversation & { messages: Message[] })> {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: true }
    });
  }
}
