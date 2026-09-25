import type { ExtractService } from "@/extract/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { GetConversationHydrationPagesParams } from "@/prisma/types.ts";
import { PrismaChatResponseService } from "@/prisma/chat-response.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type {
  ConversationSingleton,
  HydrateConversationPage
} from "@slipstream/types";

export class PrismaConvoHydrationService extends PrismaChatResponseService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    logger: LoggerService,
    isProd: boolean
  ) {
    super(prisma, extractor, logger, isProd);
  }
  protected CONVERSATION_PAGE_SIZE = 12;
  protected MAX_CONVERSATION_HYDRATE_PAGES = 4;
  protected MAX_CONVERSATION_HYDRATE_TAKE = 50;

  public async *getConversationHydrationPages({
    userId,
    conversationId,
    lowestLoadedOrdinal,
    take = this.CONVERSATION_PAGE_SIZE,
    maxPages = this.MAX_CONVERSATION_HYDRATE_PAGES
  }: GetConversationHydrationPagesParams) {
    if (!Number.isInteger(lowestLoadedOrdinal) || lowestLoadedOrdinal <= 0) {
      return;
    }

    const requestedTake = Number.isInteger(take)
      ? take
      : this.CONVERSATION_PAGE_SIZE;
    const clampedTake = Math.max(
      1,
      Math.min(requestedTake, this.MAX_CONVERSATION_HYDRATE_TAKE)
    );
    const requestedMaxPages = Number.isInteger(maxPages)
      ? maxPages
      : this.MAX_CONVERSATION_HYDRATE_PAGES;
    const clampedMaxPages = Math.max(1, requestedMaxPages);
    const seenCursors = new Set<number>();
    let cursor = lowestLoadedOrdinal;

    for (let pageNumber = 0; pageNumber < clampedMaxPages; pageNumber += 1) {
      if (seenCursors.has(cursor)) break;
      seenCursors.add(cursor);

      const convo = await this.prismaClient.conversation.findFirstOrThrow({
        where: { id: conversationId, userId },
        include: {
          messages: {
            where: { ordinal: { lt: cursor } },
            orderBy: { ordinal: "desc" },
            take: clampedTake,
            include: {
              ttsJob: true,
              messageBlocks: { orderBy: { ordinal: "asc" } },
              imageGenJob: true,
              audioGenJob: true,
              attachments: {
                orderBy: { createdAt: "asc" },
                include: {
                  imageGenOutput: true,
                  audioGenOutput: true,
                  image: true,
                  inlineImageGenOutput: true,
                  document: true,
                  audio: true
                }
              }
            }
          },
          conversationSettings: true
        }
      });

      const { messages, ...rest } = convo;
      const firstMessage = messages[0];
      const lastMessage = messages.at(-1);
      if (!firstMessage || !lastMessage) break;
      const s = messages.map(p => {
        const { attachments, ttsJob, ...rest } = p;
        const att = attachments.map(v => {
          return {
            ...v,
            size: v.size ? Number(v.size) : null,
            inlineImageGenOutput: v.inlineImageGenOutput ?? undefined
          };
        });

        const tts = ttsJob
          ? {
              ...ttsJob,
              sizeBytes: ttsJob?.sizeBytes ? Number(ttsJob.sizeBytes) : null
            }
          : undefined;
        return {
          ...rest,
          attachments: att,
          ttsJob: tts
        };
      });
      const c = { ...rest, messages: s } satisfies ConversationSingleton<true>;
      const firstOrdinal = firstMessage.ordinal;
      const lastOrdinal = lastMessage.ordinal;
      const hasMore = lastOrdinal > 0;
      const page = {
        cursor,
        firstOrdinal,
        lastOrdinal,
        convo: c,
        hasMore
      } satisfies HydrateConversationPage;

      yield page;

      if (!hasMore || lastOrdinal >= cursor) break;
      cursor = lastOrdinal;
    }
  }
}
