import type { ExtractService } from "@/extract/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import { PrismaUserMetaService } from "@/prisma/user-meta.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { AttachmentWhereInput } from "@slipstream/db/node/generated/models";
import type { AttachmentSingleton } from "@slipstream/types";

export class PrismaAttachmentHydrationService extends PrismaUserMetaService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    logger: LoggerService,
    isProd: boolean
  ) {
    super(prisma, extractor, logger, isProd);
    this.extractor = extractor;
  }

  protected ATTACHMENT_HYDRATION_PAGE_SIZE = 50;
  protected MAX_ATTACHMENT_HYDRATION_PAGE_SIZE = 200;
  /** the bucket key for uploads not yet bound to a conversation */
  protected NEW_CHAT_BUCKET = "new-chat" as const;

  private get attachmentFilter() {
    return {
      status: { not: "FAILED" },
      OR: [
        { origin: { not: "GENERATED" } },
        {
          AND: [{ origin: "GENERATED" }, { imageGenOutput: { kind: "FINAL" } }]
        },
        {
          AND: [
            { origin: "GENERATED" },
            { inlineImageGenOutput: { kind: "FINAL" } }
          ]
        },
        {
          AND: [{ origin: "GENERATED" }, { audioGenOutput: { kind: "FINAL" } }]
        }
      ]
    } as const satisfies AttachmentWhereInput;
  }

  /**
   * The user's non-FAILED attachments, one yield per conversation bucket.
   * Bucket order is decided up front by one metadata query — conversation
   * ids most-recently-active first with their attachment counts — so the
   * on-screen conversation lands first and every yield is a whole bucket
   * (or, past the page size, a known-count slice of one — the resolver's
   * populate merges slices into its Map; the client only ever sees whole
   * buckets). The new-chat bucket (`conversationId: null`, unsent uploads)
   * is yielded before any conversation. Attachments have no ordinal column,
   * so within a bucket this is offset paging over createdAt asc — only rows
   * of one batch are ever created concurrently, so nothing else is needed. Feeds the
   * resolver's registry once per connection — by-id and by-conversation
   * reads come from that cache, never from here.
   */
  public async *attachmentHydrationGenerator(userId: string, take?: number) {
    const pageSize = Math.max(
      1,
      Math.min(
        take && Number.isInteger(take)
          ? take
          : this.ATTACHMENT_HYDRATION_PAGE_SIZE,
        this.MAX_ATTACHMENT_HYDRATION_PAGE_SIZE
      )
    );
    const [unbound, convos] = await Promise.all([
      this.prismaClient.attachment.count({
        where: { userId, conversationId: null, ...this.attachmentFilter }
      }),
      this.prismaClient.conversation.findMany({
        where: { userId, attachments: { some: this.attachmentFilter } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }] as const,
        select: {
          id: true,
          _count: { select: { attachments: { where: this.attachmentFilter } } }
        }
      })
    ]);

    const convoBuckets = convos.map(({ id, _count }) => ({
      conversationId: id,
      total: _count.attachments
    }));

    const buckets = [{ conversationId: null, total: unbound }, ...convoBuckets];

    for (const { conversationId, total } of buckets) {
      for (let skip = 0; skip < total; skip += pageSize) {
        const rows = await this.prismaClient.attachment.findMany({
          where: { userId, conversationId, ...this.attachmentFilter },
          orderBy: { createdAt: "asc" },
          skip,
          take: pageSize,
          include: {
            image: true,
            audioGenOutput: true,
            document: true,
            audio: true,
            imageGenOutput: true,
            inlineImageGenOutput: true,
            messageBlock: true
          }
        });
        if (rows.length === 0) break;

        const attachments = rows.map(
          ({ inlineImageGenOutput, messageBlock, size, ...rest }) =>
            ({
              ...rest,
              size: size ? Number(size) : null,
              inlineImageGenOutput: inlineImageGenOutput ?? undefined,
              messageBlock: messageBlock ?? undefined
            }) satisfies AttachmentSingleton<true>
        );
        yield {
          conversationId: conversationId ?? this.NEW_CHAT_BUCKET,
          attachments: attachments satisfies AttachmentSingleton<true>[]
        };

        if (rows.length < pageSize) break;
      }
    }
  }
}
