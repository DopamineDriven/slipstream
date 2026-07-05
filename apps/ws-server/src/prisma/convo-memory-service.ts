import type { ExtractService } from "@/extract/index.ts";
import type {
  CreateMemoryContextParams,
  CreateMemoryStoreParams,
  FoldRollingSummaryParams,
  InsertMemoryChunkParams,
  UpdateMemoryContextAggregatesParams,
  UpdateMemoryStoreCountersParams
} from "@/prisma/types.ts";
import { PrismaConvoHydrationService } from "@/prisma/convo-hydration.ts";
import { createId } from "@paralleldrive/cuid2";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { ConversationMemoryStoreSingleton, Rm } from "@slipstream/types";
import {
  claimMemorySection,
  findStaleMemoryClaims,
  getMemoryChunksByConversation,
  insertMemoryChunk,
  searchConversationMemory,
  searchConversationMemoryHybrid,
  searchMemoryByConversation,
  searchMemoryByConversationHybrid,
  updateMemoryChunkEmbedding,
  updateMemoryChunkState,
  updateMemoryChunkSummary,
  updateMemoryChunkSummaryState
} from "@slipstream/db/sql-node";

/**
 * Rollback vehicle for the claim transaction — throwing is Prisma's only
 * mechanism to abort an interactive transaction. This leg is unreachable
 * post-CAS (belt-and-suspenders with the memory_chunk_no_range_overlap
 * exclusion constraint); it is not control flow for an expected path.
 */
class MemoryClaimRollbackError extends Error {
  constructor(provenanceId: string) {
    super(`memory claim insert conflicted post-CAS for ${provenanceId}`);
    this.name = "MemoryClaimRollbackError";
  }
}

export class PrismaConversationMemoryService extends PrismaConvoHydrationService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  // ── BigInt Normalization ─────────────────────────────────────────────

  private memoryStoreBigIntToNum(
    data: Rm<ConversationMemoryStoreSingleton<true | false>, "contexts">
  ) {
    const { totalTokens, ...rest } = data;
    return {
      totalTokens: Number(totalTokens),
      ...rest
    } satisfies Rm<ConversationMemoryStoreSingleton<true>, "contexts">;
  }

  // ── Memory Store CRUD ────────────────────────────────────────────────

  public async getMemoryStore(userId: string) {
    const store = await this.prismaClient.conversationMemoryStore.findUnique({
      where: { userId }
    });
    if (!store) return null;
    return this.memoryStoreBigIntToNum(store);
  }

  public async createMemoryStore({
    userId,
    embeddingModel = "voyage-context-4",
    embeddingDim = 1024,
    schemaVersion = "v1_0"
  }: CreateMemoryStoreParams) {
    return this.memoryStoreBigIntToNum(
      await this.prismaClient.conversationMemoryStore.create({
        data: {
          userId,
          embeddingModel,
          embeddingDim,
          schemaVersion,
          lastSyncedAt: new Date(Date.now())
        }
      })
    );
  }

  public async updateMemoryStoreCounters(
    storeId: string,
    {
      chunksDelta = 0,
      tokensDelta = 0,
      conversationsDelta = 0
    }: UpdateMemoryStoreCountersParams
  ) {
    return this.memoryStoreBigIntToNum(
      await this.prismaClient.conversationMemoryStore.update({
        where: { id: storeId },
        data: {
          totalChunks: { increment: chunksDelta },
          totalTokens: { increment: BigInt(tokensDelta) },
          totalConversations: { increment: conversationsDelta },
          lastSyncedAt: new Date(Date.now())
        }
      })
    );
  }

  // ── Memory Context CRUD ──────────────────────────────────────────────

  public async getMemoryContext(conversationId: string) {
    return await this.prismaClient.conversationMemoryContext.findUnique({
      where: { conversationId }
    });
  }

  public async createMemoryContext({
    storeId,
    conversationId,
    conversationTitle = null,
    schemaVersion = "v1_0"
  }: CreateMemoryContextParams) {
    return await this.prismaClient.conversationMemoryContext.create({
      data: { storeId, conversationId, conversationTitle, schemaVersion }
    });
  }

  public async updateMemoryContextAggregates(
    contextId: string,
    {
      chunkedTurnsDelta,
      totalTokensDelta,
      totalTurns,
      contributingProviderModelsRaw,
      hasMultipleProviders,
      hasMultipleModels,
      firstMessageAt,
      lastMessageAt
    }: UpdateMemoryContextAggregatesParams
  ) {
    return await this.prismaClient.conversationMemoryContext.update({
      where: { id: contextId },
      data: {
        ...(typeof chunkedTurnsDelta === "number"
          ? { chunkedTurns: { increment: chunkedTurnsDelta } }
          : {}),
        ...(typeof totalTokensDelta === "number"
          ? { totalTokens: { increment: totalTokensDelta } }
          : {}),
        totalTurns,
        contributingProviderModelsRaw,
        hasMultipleProviders,
        hasMultipleModels,
        firstMessageAt,
        lastMessageAt
      }
    });
  }

  /**
   * CAS on rollingSummaryUpdatedAt — folds must land in chunkIndex order; a
   * false return means another fold landed first (re-read, re-fold, retry).
   */
  public async foldRollingSummaryCas({
    contextId,
    expectedRollingSummaryUpdatedAt,
    rollingSummary,
    rollingSummaryModel,
    rollingSummaryProvider,
    rollingSummaryTokens,
    rollingSummaryReasoningDuration,
    rollingSummaryReasoningText,
    rollingSummaryReasoningToolUseRaw,
    rollingSummaryReasoningVersion,
    foldedThroughGeneratedAt
  }: FoldRollingSummaryParams) {
    const res = await this.prismaClient.conversationMemoryContext.updateMany({
      where: {
        id: contextId,
        rollingSummaryUpdatedAt: expectedRollingSummaryUpdatedAt
      },
      data: {
        rollingSummary,
        rollingSummaryModel,
        rollingSummaryProvider,
        rollingSummaryTokens,
        // fold watermark, NOT wall-clock: the newest summaryGeneratedAt the
        // digest covers — hasUnfoldedSummaries compares against this
        rollingSummaryUpdatedAt: foldedThroughGeneratedAt,
        rollingSummaryState: "READY",
        rollingSummaryReasoningDuration,
        rollingSummaryReasoningText,
        rollingSummaryReasoningToolUseRaw,
        rollingSummaryReasoningVersion
      }
    });
    return res.count === 1;
  }

  /** fold-job lifecycle setter — READY lands only via foldRollingSummaryCas */
  public async setRollingSummaryState(
    contextId: string,
    state: $Enums.MemorySummaryState
  ) {
    await this.prismaClient.conversationMemoryContext.update({
      where: { id: contextId },
      data: { rollingSummaryState: state }
    });
  }

  /**
   * The user-driven scalpel: requeue ONLY version-behind READY summaries for
   * ONE conversation. Never bulk, never automatic — a prompt-era bump alone
   * must not cascade state changes.
   */
  public async requeueStaleSummaries(
    conversationId: string,
    currentVersion: $Enums.MemoryChunkSummaryPromptVersion
  ) {
    const res = await this.prismaClient.conversationMemoryChunk.updateMany({
      where: {
        conversationId,
        chunkingState: "INDEXED",
        deletedAt: null,
        summaryState: "READY",
        summaryPromptVersion: { not: currentVersion }
      },
      data: { summaryState: "QUEUED" }
    });
    return res.count;
  }

  /**
   * INDEXED chunks whose summary is pending: QUEUED, or ERROR under the retry
   * cap. chunkIndex ASC so rolling-summary folds land in order.
   */
  public async findChunksAwaitingSummary(
    contextId: string,
    maxSummaryRetries: number,
    take: number
  ) {
    return await this.prismaClient.conversationMemoryChunk.findMany({
      where: {
        contextId,
        chunkingState: "INDEXED",
        deletedAt: null,
        OR: [
          { summaryState: "QUEUED" },
          {
            summaryState: "ERROR",
            summaryRetryCount: { lt: maxSummaryRetries }
          }
        ]
      },
      orderBy: { chunkIndex: "asc" },
      take
    });
  }

  /**
   * A process killed mid-call strands summaryState=SUMMARIZING — invisible to
   * findChunksAwaitingSummary forever. Rows past the stale threshold rejoin
   * the retry pool as ERROR (the increment keeps crash-loops bounded by the cap).
   */
  public async reclaimStaleSummaryClaims(
    contextId: string,
    staleSummaryMinutes: number
  ) {
    const cutoff = new Date(Date.now() - staleSummaryMinutes * 60_000);
    const res = await this.prismaClient.conversationMemoryChunk.updateMany({
      where: {
        contextId,
        summaryState: "SUMMARIZING",
        deletedAt: null,
        updatedAt: { lt: cutoff }
      },
      data: {
        summaryState: "ERROR",
        summaryError:
          "stale SUMMARIZING claim reclaimed (process died mid-call)",
        summaryRetryCount: { increment: 1 }
      }
    });
    return res.count;
  }

  /** lean packing metadata — family boundaries derive from exact stored counts; the heavy transcript column stays behind */
  public async getMemoryChunkEmbedMeta(conversationId: string) {
    return await this.prismaClient.conversationMemoryChunk.findMany({
      where: { conversationId, chunkingState: "INDEXED", deletedAt: null },
      select: {
        id: true,
        chunkIndex: true,
        tokenCount: true,
        ordinalStart: true,
        ordinalEndExclusive: true
      },
      orderBy: { chunkIndex: "asc" }
    });
  }

  /** transcript hydration for refresh members whose family is re-embedding */
  public async getMemoryChunkTranscriptsByIds(chunkIds: string[]) {
    return await this.prismaClient.conversationMemoryChunk.findMany({
      where: { id: { in: chunkIds } },
      select: { id: true, transcriptMarkdown: true }
    });
  }

  /** digest staleness check — any READY summary newer than the fold watermark? */
  public async hasUnfoldedSummaries(contextId: string, since: Date | null) {
    const row = await this.prismaClient.conversationMemoryChunk.findFirst({
      where: {
        contextId,
        chunkingState: "INDEXED",
        deletedAt: null,
        summaryState: "READY",
        ...(since ? { summaryGeneratedAt: { gt: since } } : {})
      },
      select: { id: true }
    });
    return row != null;
  }

  /** the digest's complete secondary corpus — every READY section summary in chunkIndex order */
  public async findReadySummariesForFold(contextId: string) {
    return await this.prismaClient.conversationMemoryChunk.findMany({
      where: {
        contextId,
        chunkingState: "INDEXED",
        deletedAt: null,
        summaryState: "READY"
      },
      select: {
        id: true,
        chunkIndex: true,
        ordinalStart: true,
        ordinalEndExclusive: true,
        summary: true,
        summaryGeneratedAt: true,
        // exact stored counts power the fold's input budget gate
        summaryTokens: true
      },
      orderBy: { chunkIndex: "asc" }
    });
  }

  /** boot-resume scan: contexts holding INDEXED chunks with pending (or stranded) summaries */
  public async findContextsWithPendingSummaries(maxSummaryRetries: number) {
    return await this.prismaClient.conversationMemoryChunk.findMany({
      where: {
        chunkingState: "INDEXED",
        deletedAt: null,
        OR: [
          { summaryState: "QUEUED" },
          { summaryState: "SUMMARIZING" },
          {
            summaryState: "ERROR",
            summaryRetryCount: { lt: maxSummaryRetries }
          }
        ]
      },
      select: { contextId: true },
      distinct: ["contextId"]
    });
  }

  public async getMemoryContextById(contextId: string) {
    return await this.prismaClient.conversationMemoryContext.findUnique({
      where: { id: contextId },
      select: {
        id: true,
        conversationId: true,
        conversationTitle: true,
        rollingSummary: true,
        rollingSummaryUpdatedAt: true,
        // exact stored count for the fold's input budget gate
        rollingSummaryTokens: true,
        // where the live tail begins — the fold renders [watermark, max) firsthand
        lastIndexedOrdinalExclusive: true,
        // store scoping for the summarizer's file_search executor
        memoryStore: { select: { userId: true } }
      }
    });
  }

  /** lean scalar select for summarizer attachment blocks — no Singleton juggling */
  public async findAttachmentsByIds(attachmentIds: string[]) {
    return await this.prismaClient.attachment.findMany({
      where: { id: { in: attachmentIds } },
      select: {
        id: true,
        cdnUrl: true,
        compatCdnUrl: true,
        mime: true,
        compatMime: true,
        compatStatus: true,
        assetType: true,
        filename: true
      }
    });
  }

  /**
   * ALL rows regardless of deletedAt — chunkIndex uniqueness spans soft-deleted
   * rows, so the next absolute index must count them.
   */
  public async countMemoryChunks(contextId: string) {
    return await this.prismaClient.conversationMemoryChunk.count({
      where: { contextId }
    });
  }

  /**
   * Substitution-assembly candidates: INDEXED chunks with a READY summary,
   * entirely below the live-window floor. Gap-tolerant — returns ALL of them
   * (not a contiguous prefix); the formatter renders gaps verbatim. Carries
   * summaryModel/summaryProvider so each substituted block name-tags to its
   * summarizer ([provider/model], the fleet notation).
   */
  public async findSubstitutableChunks(
    conversationId: string,
    ordinalCeilingExclusive: number
  ) {
    return await this.prismaClient.conversationMemoryChunk.findMany({
      where: {
        conversationId,
        chunkingState: "INDEXED",
        summaryState: "READY",
        deletedAt: null,
        ordinalEndExclusive: { lte: ordinalCeilingExclusive }
      },
      orderBy: { ordinalStart: "asc" },
      select: {
        id: true,
        ordinalStart: true,
        ordinalEndExclusive: true,
        summary: true,
        summaryModel: true,
        summaryProvider: true
      }
    });
  }

  public async findMemoryChunkById(chunkId: string) {
    return await this.prismaClient.conversationMemoryChunk.findUnique({
      where: { id: chunkId }
    });
  }

  /** the INDEXED chunk covering `ordinal`: ordinalStart <= ordinal < ordinalEndExclusive */
  public async findMemoryChunkCoveringOrdinal(
    conversationId: string,
    ordinal: number
  ) {
    return await this.prismaClient.conversationMemoryChunk.findFirst({
      where: {
        conversationId,
        ordinalStart: { lte: ordinal },
        ordinalEndExclusive: { gt: ordinal },
        chunkingState: "INDEXED",
        deletedAt: null
      },
      orderBy: { chunkIndex: "asc" }
    });
  }

  /** neighbor traversal — the chunkIndex chain is a total order per context */
  public async findMemoryChunkByIndex(contextId: string, chunkIndex: number) {
    return await this.prismaClient.conversationMemoryChunk.findFirst({
      where: { contextId, chunkIndex, deletedAt: null }
    });
  }

  public async getConversationTitle(conversationId: string) {
    const convo = await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true }
    });
    return convo?.title ?? null;
  }

  // ── Ordinal Helpers ──────────────────────────────────────────────────

  /**
   * MAX(ordinal) + 1 — NOT COUNT(*). Ordinal density is an observation, not
   * an invariant; callers assert fetched row counts against the range width.
   */
  public async getMaxOrdinalExclusive(conversationId: string) {
    const agg = await this.prismaClient.message.aggregate({
      where: { conversationId },
      _max: { ordinal: true }
    });
    const maxOrdinal = agg._max.ordinal;
    return maxOrdinal == null ? 0 : maxOrdinal + 1;
  }

  public async getMessagesByOrdinalRange(
    conversationId: string,
    ordinalStart: number,
    ordinalEndExclusive: number
  ) {
    return await this.prismaClient.message.findMany({
      where: {
        conversationId,
        ordinal: { gte: ordinalStart, lt: ordinalEndExclusive }
      },
      orderBy: { ordinal: "asc" },
      include: {
        messageBlocks: { orderBy: { ordinal: "asc" } },
        attachments: {
          include: {
            image: true,
            document: true,
            audio: true,
            imageGenOutput: true
          }
        }
      }
    });
  }

  /** returns the number of messages backfilled — callers assert it equals the range width */
  public async backfillMessageChunkIds(
    conversationId: string,
    ordinalStart: number,
    ordinalEndExclusive: number,
    conversationMemoryChunkId: string
  ) {
    const res = await this.prismaClient.message.updateMany({
      where: {
        conversationId,
        ordinal: { gte: ordinalStart, lt: ordinalEndExclusive }
      },
      data: { conversationMemoryChunkId }
    });
    return res.count;
  }

  // ── Section Claim (watermark CAS + chunk insert, one transaction) ────

  /**
   * The concurrency claim for a section. The watermark CAS requires
   * lastIndexedOrdinalExclusive to equal params.ordinalStart — sections chain
   * from the watermark, so overlaps and gaps are impossible by construction.
   * `claimed: false` is a normal outcome under racing (stop the pass), never
   * an error.
   */
  public async claimAndInsertMemorySection(params: InsertMemoryChunkParams) {
    try {
      return await this.prismaClient.$transaction(async tx => {
        const claimed = await tx.$queryRawTyped(
          claimMemorySection(
            params.conversationId,
            params.ordinalStart,
            params.ordinalEndExclusive
          )
        );
        const claim = claimed[0];
        if (!claim) {
          // CAS matched nothing — another instance owns the chain (or our
          // read was stale). Nothing was written; committing is a no-op.
          return { claimed: false, reason: "WATERMARK_CAS_LOST" } as const;
        }

        const inserted = await tx.$queryRawTyped(
          insertMemoryChunk(
            createId(),
            params.provenanceId,
            params.contextId,
            params.storeId,
            params.conversationId,
            params.chunkIndex,
            params.ordinalStart,
            params.ordinalEndExclusive,
            params.messageIdStart,
            params.messageIdEnd,
            params.messageTimestampStart,
            params.messageTimestampEnd,
            params.transcriptMarkdown,
            params.contentHash,
            params.chunkedMessagesCount,
            params.tokenCount,
            params.providerModelsRaw,
            params.hasAttachments,
            params.chunkedAttachmentsCount ?? null,
            params.attachmentProvenanceIdsRaw ?? null,
            params.embeddingModel ?? "voyage-context-4",
            params.boundaryReason ?? null,
            params.schemaVersion ?? null,
            params.rendererVersion ?? null,
            params.transcriptIncludesThinking ?? false
          )
        );
        const chunk = inserted[0];
        if (!chunk) {
          // The advanced watermark must not survive without its chunk row.
          throw new MemoryClaimRollbackError(params.provenanceId);
        }

        return {
          claimed: true,
          chunk,
          watermark: claim.lastIndexedOrdinalExclusive
        } as const;
      });
    } catch (err) {
      if (err instanceof MemoryClaimRollbackError) {
        return { claimed: false, reason: "CLAIM_INSERT_CONFLICT" } as const;
      }
      throw err;
    }
  }

  // ── Typed SQL Wrappers ───────────────────────────────────────────────

  public async updateMemoryChunkEmbeddingTyped(
    ...args: updateMemoryChunkEmbedding.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      updateMemoryChunkEmbedding(...args)
    );
  }

  public async updateMemoryChunkStateTyped(
    ...args: updateMemoryChunkState.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      updateMemoryChunkState(...args)
    );
  }

  public async updateMemoryChunkSummaryTyped(
    ...args: updateMemoryChunkSummary.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      updateMemoryChunkSummary(...args)
    );
  }

  public async updateMemoryChunkSummaryStateTyped(
    ...args: updateMemoryChunkSummaryState.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      updateMemoryChunkSummaryState(...args)
    );
  }

  public async findStaleMemoryClaimsTyped(
    ...args: findStaleMemoryClaims.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      findStaleMemoryClaims(...args)
    );
  }

  public async getMemoryChunksByConversationTyped(
    ...args: getMemoryChunksByConversation.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      getMemoryChunksByConversation(...args)
    );
  }

  public async searchConversationMemoryTyped(
    ...args: searchConversationMemory.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      searchConversationMemory(...args)
    );
  }

  public async searchMemoryByConversationTyped(
    ...args: searchMemoryByConversation.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      searchMemoryByConversation(...args)
    );
  }

  public async searchConversationMemoryHybridTyped(
    ...args: searchConversationMemoryHybrid.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      searchConversationMemoryHybrid(...args)
    );
  }

  public async searchMemoryByConversationHybridTyped(
    ...args: searchMemoryByConversationHybrid.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      searchMemoryByConversationHybrid(...args)
    );
  }
}
