import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import type {
  Conversation,
  ConversationSettings,
  Message
} from "@prisma/client";
import { ErrorHelperService } from "@/orm/err-helper";

export type GetMessagesByConversationIdRT =
  | null
  | (Conversation & {
      messages: Message[];
      conversationSettings: ConversationSettings | null;
    });

export class PrismaUserMessageService extends ErrorHelperService {
  constructor(public prismaClient: PrismaClientWithAccelerate) {
    super();
  }
  public async getMessages(conversationId: string): Promise<Message[]> {
    return await this.prismaClient.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      cacheStrategy: { swr: 3600, ttl: 60 }
    });
  }
  public async getRecentConversationsByUserId(
    userId: string,
    options?: { skip?: number; take?: number }
  ): Promise<
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
      take: options?.take ?? 20,
      skip: options?.skip ?? 0,
      orderBy: [{ updatedAt: "desc" }]
    });
  }
  public sanitizeTitle(generatedTitle: string) {
    return generatedTitle.trim().replace(/^(['"])(.*?)\1$/, "$2");
  }

  public async getSidebarData(userId: string) {
    return await this.prismaClient.conversation
      .findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }],
        cacheStrategy: { swr: 3600, ttl: 60 }
      })
      .then(t => {
        return t.map(v => ({
          id: v.id,
          title: this.sanitizeTitle(v.title ?? "Untitled"),
          updatedAt: v.updatedAt
        }));
      });
  }

  public async getMessagesByConversationId(
    conversationId: string
  ): Promise<GetMessagesByConversationIdRT> {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      cacheStrategy: { swr: 3600, ttl: 60 },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        conversationSettings: true
      }
    });
  }

  public async updateConversationTitle(
    conversationId: string,
    updatedTitle: string
  ) {
    return await this.prismaClient.conversation.update({
      where: { id: conversationId },
      data: { title: updatedTitle }
    });
  }

  public async convoCounts(userId: string) {
    return await this.prismaClient.conversation.count({
      where: { userId: userId }
    });
  }

  public async deleteConversation(conversationId: string) {
    return await this.prismaClient.conversation.delete({
      where: { id: conversationId }
    });
  }
}
