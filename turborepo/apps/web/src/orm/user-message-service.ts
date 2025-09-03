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

  public sanitizeTitle(generatedTitle: string) {
    return generatedTitle.trim().replace(/^(['"])(.*?)\1$/, "$2");
  }

  public async getSidebarData(userId: string) {
    return await this.prismaClient.conversation
      .findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }]
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
  ) {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: {

        messages: { orderBy: { createdAt: "asc" }},
        conversationSettings: true
      }
    });
  }


    public async getMessagesByConversationIdWithAsset(
    conversationId: string
  ) {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: {

        messages: { orderBy: { createdAt: "asc" }},
        conversationSettings: true
      }
    });
  }

  public async getTitleByConversationId(conversationId: string) {
    return await this.prismaClient.conversation
      .findUnique({
        where: { id: conversationId },
        select: { title: true }
      })
      .then(t => {
        return t?.title ?? "Untitled";
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


  public async deleteConversation(conversationId: string) {
    return await this.prismaClient.conversation.delete({
      where: { id: conversationId }
    });
  }
}
