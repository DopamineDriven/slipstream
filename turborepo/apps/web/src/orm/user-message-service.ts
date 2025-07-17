import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import type { Conversation, Message } from "@prisma/client";
import { ErrorHelperService } from "@/orm/err-helper";

export class PrismaUserMessageService extends ErrorHelperService {
  constructor(public prismaClient: PrismaClientWithAccelerate) {
    super();
  }
  public async getMessages(conversationId: string): Promise<Message[]> {
    return await this.prismaClient.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" }
    });
  }
  public async getRecentConversationsByUserId(userId: string): Promise<
    {
      id: string;
      userId: string;
      userKeyId: string | null;
      title: string | null;
      createdAt: Date;
      updatedAt: Date;
      branchId: string | null;
      parentId: string | null;
      isShared: boolean;
      shareToken: string | null;
    }[]
  > {
    return await this.prismaClient.conversation.findMany({
      where: { userId },
      take: 15,
      orderBy: [{ updatedAt: "desc" }]
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

