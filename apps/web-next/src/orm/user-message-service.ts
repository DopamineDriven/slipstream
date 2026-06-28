import type { PrismaClientBase } from "@/lib/prisma";
import { ErrorHelperService } from "@/orm/err-helper";
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

  /**
   * One ordinal-cursored page of a conversation, returned as the `{ convo, nextCursor, hasMore }` envelope the SWR
   * loader expects. `convo` is a `ConversationSingleton<true>` (same shape `ai_chat_response.convo` returns), so
   * the client tree ingests it without translation. Page 0 passes no cursor; older pages pass the previous page's
   * `nextCursor`.
   *
   * Ordinals are gapless `0..n-1` per conversation (`@@unique([conversationId, ordinal])`), so pagination is
   * probe-free: order `ordinal: "desc"`, take `take`, and the OLDEST row in the page (`.at(-1)`, smallest ordinal)
   * tells us exactly how many older rows remain — `hasMore = oldestOrdinal > 0`, next cursor = that ordinal. No
   * `take + 1` probe, no count query, no `createdAt` tie-break.
   */
  public async getConversationMessagesPage(
    conversationId: string,
    take = 25,
    cursorOrdinal?: number
  ) {
    const convo = await this.prismaClient.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        messages: {
          where:
            typeof cursorOrdinal !== "undefined"
              ? { ordinal: { lt: cursorOrdinal } }
              : undefined,
          take,
          orderBy: { ordinal: "desc" },
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

    /**
    const msgs = getMany.map(t => {
      const { ttsJob, ...rest } = t;
      if (ttsJob) {
        const { sizeBytes, ...restTTS } = ttsJob;
        return {
          ttsJob: { ...restTTS, sizeBytes: sizeBytes ? Number(sizeBytes) : 0 },
          ...rest
        };
      }
      return {
        ...rest,
        ttsJob: undefined
      };
    });
     */
    const msgs = messages.map(t => {
      return {
        ...t,
        ttsJob: t.ttsJob ?? undefined
      };
    });

    // Ordered desc, so the last element is the smallest (oldest) ordinal in this page.
    const oldestOrdinal = msgs.at(-1)?.ordinal ?? 0;
    const hasMore = oldestOrdinal > 0;
    return {
      convo: this.bigintToInt({
        ...rest,
        messages: msgs
      }) satisfies ConversationSingleton<true>,
      nextCursor: hasMore ? oldestOrdinal : null,
      hasMore
    };
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
