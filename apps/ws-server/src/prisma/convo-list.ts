import type { ExtractService } from "@/extract/index.ts";
import { PrismaConversationMemoryService } from "@/prisma/convo-memory-service.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { ConversationListEntry } from "@slipstream/types";

const CONVERSATION_LIST_PAGE_SIZE = 25;
const MAX_CONVERSATION_LIST_PAGE_SIZE = 100;

export class PrismaConvoListService extends PrismaConversationMemoryService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  /**
   * Newest-first conversation metadata in pages until the archive is
   * exhausted — the convo-hydration generator pattern with a compound
   * (updatedAt desc, id desc) ordering (updatedAt alone can tie under batch
   * writes) and the same seen-cursor guard against a broken pagination loop.
   * Metadata only — the resolver sends one conversation_list_ack per page so
   * the client's index warms newest-first, progressively.
   */
  public async *convoListGenerator(
    userId: string,
    take = CONVERSATION_LIST_PAGE_SIZE
  ) {
    const pageSize = Math.max(
      1,
      Math.min(
        Number.isInteger(take) ? take : CONVERSATION_LIST_PAGE_SIZE,
        MAX_CONVERSATION_LIST_PAGE_SIZE
      )
    );
    const seenCursors = new Set<string>();
    let cursorId: string | undefined = undefined;

    for (;;) {
      if (cursorId) {
        if (seenCursors.has(cursorId)) break;
        seenCursors.add(cursorId);
      }
      const rows: {
        id: string;
        title: string | null;
        updatedAt: Date;
        _count: { messages: number };
      }[] = await this.prismaClient.conversation.findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: pageSize,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          id: true,
          title: true,
          updatedAt: true,
          _count: { select: { messages: true } }
        }
      });
      if (rows.length === 0) break;

      const conversations = rows.map(
        ({ _count, updatedAt, id, title }) =>
          ({
            id,
            title,
            updatedAt: updatedAt.getTime(),
            messageCount: _count.messages
          }) satisfies ConversationListEntry
      );
      yield conversations;

      if (rows.length < pageSize) break;
      cursorId = rows.at(-1)?.id;
      if (!cursorId) break;
    }
  }
}
