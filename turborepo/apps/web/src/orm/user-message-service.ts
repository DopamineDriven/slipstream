import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import type { ChatInterfaceProps } from "@/types/ui";
import { redirect } from "next/navigation";
import { ErrorHelperService } from "@/orm/err-helper";
import { getSession } from "@/utils/auth";
import type { $Enums } from "@slipstream/db/edge-client";
import type {
  AttachmentSingleton,
  ConversationSingleton,
  MessageSingleton,
  Rm
} from "@slipstream/types";

export class PrismaUserMessageService extends ErrorHelperService {
  constructor(public prismaClient: PrismaClientWithAccelerate) {
    super();
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

  public async getMessagesByConversationId(conversationId: string) {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        conversationSettings: true
      }
    });
  }

  private bigintToInt({ messages, ...rest }: ConversationSingleton<false>) {
    const msgs = messages.map(msg => {
      const { attachments, ...rest } = msg;
      const atts = attachments.map(att => {
        const { size, ...attRest } = att;
        return {
          ...attRest,
          size: size ? Number(size) : null
        } as Rm<AttachmentSingleton<true>, "providerLinks">;
      });
      return {
        ...rest,
        attachments: atts
      } as Rm<MessageSingleton<true>, "userKey">;
    });

    return { ...rest, messages: msgs } as ConversationSingleton<true>;
  }

  public isHomeOrNewChat(conversationId: string) {
    return conversationId === "home" || conversationId === "new-chat";
  }

  public fromPrismaFormat(provider?: $Enums.Provider | null) {
    if (!provider) return null;
    return provider.toLowerCase() as Lowercase<$Enums.Provider>;
  }

  public async getConversationRouteProps(conversationId: string) {
    const session = await getSession();
    if (!session?.user?.id) redirect("/auth/login");
    if (this.isHomeOrNewChat(conversationId)) {
      return {
        conversationId,
        user: session.user,
        conversationTitle: null,
        initialMessages: null,
        lastModel: null,
        lastProvider: null
      } satisfies ChatInterfaceProps;
    } else {
      const convo =
        await this.getMessagesByConversationIdWithAssets(conversationId);

      const lastMsg = convo.messages.at(-1);
      const lastModel = lastMsg?.model;
      const lastProvider = this.fromPrismaFormat(lastMsg?.provider);

      return {
        user: session.user,
        conversationId,
        conversationTitle: convo.title,
        initialMessages: convo.messages,
        lastModel,
        lastProvider
      } satisfies ChatInterfaceProps;
    }
  }

  public async handleMetadata({
    params
  }: {
    params: Promise<{
      conversationId: string;
    }>;
  }) {
    const { conversationId } = await params;
    if (!this.isHomeOrNewChat(conversationId)) {
      const title = await this.getTitleByConversationId(conversationId);
      return {
        title
      };
    } else if (conversationId === "home") {
      return {
        title: "Home"
      };
    }
    return {
      title: "New Chat"
    };
  }

  public async getMessagesByConversationIdWithAssets(conversationId: string) {
    const convo = await this.prismaClient.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            imageGenJob: true,
            attachments: {
              orderBy: { createdAt: "asc" },
              include: { image: true, document: true, imageGenOutput: true }
            }
          }
        },
        conversationSettings: true
      }
    });

    return this.bigintToInt(convo) satisfies ConversationSingleton<true>;
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
