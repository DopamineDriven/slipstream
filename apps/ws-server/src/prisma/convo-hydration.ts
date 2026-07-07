import type { ExtractService } from "@/extract/index.ts";
import type { GetConversationHydrationPagesParams } from "@/prisma/types.ts";
import { PrismaChatResponseService } from "@/prisma/chat-response.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type {
  ConversationSingleton,
  HydrateConversationPage
} from "@slipstream/types";

const CONVERSATION_PAGE_SIZE = 12;
const MAX_CONVERSATION_HYDRATE_PAGES = 4;
const MAX_CONVERSATION_HYDRATE_TAKE = 50;

export class PrismaConvoHydrationService extends PrismaChatResponseService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  public async *getConversationHydrationPages({
    userId,
    conversationId,
    lowestLoadedOrdinal,
    take = CONVERSATION_PAGE_SIZE,
    maxPages = MAX_CONVERSATION_HYDRATE_PAGES
  }: GetConversationHydrationPagesParams) {
    if (!Number.isInteger(lowestLoadedOrdinal) || lowestLoadedOrdinal <= 0) {
      return;
    }

    const requestedTake = Number.isInteger(take)
      ? take
      : CONVERSATION_PAGE_SIZE;
    const clampedTake = Math.max(
      1,
      Math.min(requestedTake, MAX_CONVERSATION_HYDRATE_TAKE)
    );
    const requestedMaxPages = Number.isInteger(maxPages)
      ? maxPages
      : MAX_CONVERSATION_HYDRATE_PAGES;
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
              attachments: {
                orderBy: { createdAt: "asc" },
                include: {
                  imageGenOutput: true,
                  image: true,
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

      const ttv = messages.map(t => {
        const { ttsJob, ...rest } = t;
        return {
          ttsJob: ttsJob
            ? {
                ...ttsJob,
                sizeBytes: ttsJob?.sizeBytes ? Number(ttsJob.sizeBytes) : null
              }
            : undefined,
          ...rest
        };
      });
      const firstOrdinal = firstMessage.ordinal;
      const lastOrdinal = lastMessage.ordinal;
      const hasMore = lastOrdinal > 0;
      const page = {
        cursor,
        firstOrdinal,
        lastOrdinal,
        convo: this.bigintToInt({
          messages: ttv,
          ...rest
        }) satisfies ConversationSingleton<true>,
        hasMore
      } satisfies HydrateConversationPage;

      yield page;

      if (!hasMore || lastOrdinal >= cursor) break;
      cursor = lastOrdinal;
    }
  }
}
