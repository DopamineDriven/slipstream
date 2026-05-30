import type { PrismaClientBase } from "@/lib/prisma";
import type { ChatInterfaceProps } from "@/types/ui";
import { redirect } from "next/navigation";
import { ErrorHelperService } from "@/orm/err-helper";
import { getSession } from "@/utils/auth";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AttachmentSingleton,
  ConversationSingleton,
  MessageSingleton,
  Rm,
  TTSJobSingleton
} from "@slipstream/types";

export class PrismaUserMessageService extends ErrorHelperService {
  constructor(public prismaClient: PrismaClientBase) {
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
        messages: {
          orderBy: { createdAt: "asc" },
          include: { messageBlocks: { orderBy: { ordinal: "asc" } } }
        },
        conversationSettings: true
      }
    });
  }

  public bigIntToIntMsg(
    messages: Rm<MessageSingleton<true | false>, "userKey">[]
  ) {
    return messages.map(msg => {
      let t: TTSJobSingleton<true | false> | undefined;
      const { attachments, ttsJob, ...rest } = msg;
      if (ttsJob) {
        t = ttsJob;
      } else {
        t = undefined;
      }
      const atts = attachments.map(att => {
        const { size, ...attRest } = att;
        return {
          ttsJob: t
            ? ({
                ...t,
                sizeBytes: t?.sizeBytes ? Number(t.sizeBytes) : null
              } as const)
            : undefined,
          ...attRest,
          size: size ? Number(size) : null
        } as Rm<AttachmentSingleton<true>, "providerLinks">;
      });
      return {
        ttsJob: t
          ? ({
              ...t,
              sizeBytes: t?.sizeBytes ? Number(t.sizeBytes) : null
            } as const)
          : undefined,
        ...rest,
        attachments: atts
      } as Rm<MessageSingleton<true>, "userKey">;
    });
  }

  public bigintToInt({
    messages,
    ...rest
  }: ConversationSingleton<false | true>) {
    return {
      ...rest,
      messages: this.bigIntToIntMsg(messages)
    } as ConversationSingleton<true>;
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
    console.log(session?.session);
    if (!session?.user?.id || !session?.session.expiresAt)
      redirect("/auth/login");

    const expiryUnixEpoch = new Date(session.session.expiresAt).getTime();
    if (new Date(Date.now()).getTime() > expiryUnixEpoch)
      redirect("/auth/login");

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

  public async getMsgsByCursorId(
    conversationId: string,
    take = 25,
    id?: string
  ) {
    const cursor = id ? { id } : undefined;
    const skip = id ? 1 : undefined;

    const getMany = await this.prismaClient.message.findMany({
      where: { conversationId },
      cursor,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        ttsJob: true,
        imageGenJob: true,
        messageBlocks: { orderBy: { ordinal: "asc" } },
        attachments: {
          orderBy: { createdAt: "asc" },
          include: {
            image: true,
            document: true,
            imageGenOutput: true,
            audio: true
          }
        }
      }
    });
    const msgs = getMany.map(t => {
      return {
        ...t,
        ttsJob: t.ttsJob ?? undefined
      };
    });
    return this.bigIntToIntMsg(msgs) satisfies MessageSingleton<true>[];
  }

  public async getMessagesByCursor(
    conversationId: string,
    take = 25,
    id?: string
  ) {
    const cursor = id ? { id } : undefined;
    const skip = id ? 1 : undefined;
    const convo = await this.prismaClient.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        messages: {
          cursor,
          take,
          skip,
          orderBy: { createdAt: "desc" },
          include: {
            ttsJob: true,
            imageGenJob: true,
            messageBlocks: { orderBy: { ordinal: "asc" } },
            attachments: {
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true,
                imageGenOutput: true,
                audio: true
              }
            }
          }
        },
        conversationSettings: true
      }
    });
    const { messages, ...rest } = convo;
    const msgs = messages.map(t => {
      return {
        ...t,
        ttsJob: t.ttsJob ?? undefined
      };
    });

    const c = { ...rest, messages: msgs };
    return this.bigintToInt(c) satisfies ConversationSingleton<true>;
  }

  public async getConvoInitial(conversationId: string, take = 25) {
    const convo = await this.prismaClient.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        messages: {
          take,
          orderBy: { createdAt: "desc" },
          include: {
            ttsJob: true,
            imageGenJob: true,
            messageBlocks: { orderBy: { ordinal: "asc" } },
            attachments: {
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true,
                imageGenOutput: true,
                audio: true
              }
            }
          }
        },
        conversationSettings: true
      }
    });
    const { messages, ...rest } = convo;
    const msgs = messages.map(t => {
      return {
        ...t,
        ttsJob: t.ttsJob ?? undefined
      };
    });

    const c = { ...rest, messages: msgs };
    return this.bigintToInt(c) satisfies ConversationSingleton<true>;
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
            ttsJob: true,
            imageGenJob: true,
            messageBlocks: { orderBy: { ordinal: "asc" } },
            attachments: {
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true,
                imageGenOutput: true,
                audio: true
              }
            }
          }
        },
        conversationSettings: true
      }
    });
    const { messages, ...rest } = convo;
    const msgs = messages.map(t => {
      return {
        ...t,
        ttsJob: t.ttsJob ?? undefined
      };
    });

    const c = { ...rest, messages: msgs };
    return this.bigintToInt(c) satisfies ConversationSingleton<true>;
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
