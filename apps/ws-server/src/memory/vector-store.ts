import type { AnthropicSummarizerService } from "@/anthropic/summarizer.ts";
import type { LoggerService } from "@/logger/index.ts";
import type {
  ConversationMemoryGetChunkTarget,
  ConversationMemorySearchScope,
  ConversationMemorySearchToolInput,
  MemoryChunkAwaitingSummary,
  MemoryCompactionConfig,
  MemoryHybridRow,
  MemorySectionDraft,
  MemorySummarizerConfig
} from "@/memory/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { FileSearchToolInput } from "@/store/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { VoyageEmbeddingService } from "@/voyage/index.ts";
import type { Anthropic } from "@anthropic-ai/sdk";
import type { $Enums } from "@slipstream/db/node/generated/client";
import { ConversationMemoryWorkupService } from "@/memory/workup.ts";

interface EmbedAndIndexTarget {
  chunkId: string;
  conversationId: string;
  ordinalStart: number;
  ordinalEndExclusive: number;
  transcriptMarkdown: string;
  tokenCount: number;
  /** the row's retryCount BEFORE this attempt — drives the ERROR-at-cap transition */
  retryCount: number;
}

/** one member of a contextualized embed family (an inner list on the wire) */
interface MemoryEmbedFamilyMember extends EmbedAndIndexTarget {
  /**
   * true → an already-INDEXED row re-embedded purely so its vector gains the
   * new siblings' context: vector + embeddedAt re-mint through the same
   * sole-owner SQL, no state transition, no message backfill.
   */
  isRefresh: boolean;
}

export class ConversationMemoryVectorService extends ConversationMemoryWorkupService {
  /**
   * conversationId → in-flight pass. Same-instance dedup only (a saved bridge
   * call, not a correctness mechanism) — cross-instance safety is the watermark
   * CAS. Delete-on-settle.
   */
  protected indexingInFlight = new Map<string, Promise<void>>();

  /**
   * contextId → one Map per dispatched wave: chunkId → summaryState.
   * Stash'n'dash job registry (xai pollDocumentIndexing lineage) — each
   * pending chunk's summary is a detached concurrent job self-reporting
   * here. Terminal states are RETAINED, not deleted-on-settle: the drain
   * check ("no QUEUED/SUMMARIZING left") depends on them, and the next wave
   * replaces the inner map wholesale. Sanctioned deviation from the registry
   * lifecycle rules — bounded by sweepBatchSize, background path only,
   * never consulted in place of the DB.
   */
  protected summaryJobRegistry = new Map<
    string,
    Map<string, $Enums.MemorySummaryState>
  >();

  /** contextId → wave dispatch epoch ms — the age check that guarantees a wedged wave is eventually replaced */
  protected summaryWaveBornAt = new Map<string, number>();

  constructor(
    logger: LoggerService,
    voyage: VoyageEmbeddingService,
    prisma: PrismaService,
    /** rides AnthropicBaseService's battle-tested call shape — betas, adaptive thinking, ceiling clamps */
    protected summarizer: AnthropicSummarizerService,
    /** the user vector store — the summarizer forages it via file_search during summary/fold calls */
    protected userStore: UserStoreVectorService
  ) {
    super(logger, voyage, prisma);
  }

  // ── Entry point (fire-and-forget from the resolver, post-response) ───

  /** never rejects — failures log and the watermark-driven design self-corrects next turn */
  public onTurnPersisted(
    conversationId: string,
    userId: string,
    conversationTitle?: string | null
  ) {
    const inFlight = this.indexingInFlight.get(conversationId);
    if (inFlight) return inFlight;

    const pass = this.runIndexingPass(conversationId, userId, conversationTitle)
      .catch((err: unknown) => {
        this.logger.warn(
          { conversationId, userId, err: this.prisma.safeErrMsg(err) },
          "memory indexing pass failed"
        );
      })
      .finally(() => {
        this.indexingInFlight.delete(conversationId);
      });
    this.indexingInFlight.set(conversationId, pass);
    return pass;
  }

  // ── The pass ─────────────────────────────────────────────────────────

  private async runIndexingPass(
    conversationId: string,
    userId: string,
    conversationTitle?: string | null
  ) {
    const cfg = this.memoryIndexingConfig;
    const ensured = await this.ensureMemoryContext(
      conversationId,
      userId,
      conversationTitle
    );

    // fresh watermark read — multi-instance mutable state, never cached
    const context = await this.prisma.getMemoryContext(conversationId);
    if (!context) {
      this.logger.warn(
        { conversationId },
        "memory context missing post-ensure — bailing"
      );
      return;
    }

    const maxOrdinalExclusive =
      await this.prisma.getMaxOrdinalExclusive(conversationId);
    const watermark = context.lastIndexedOrdinalExclusive;
    const unindexed = maxOrdinalExclusive - watermark;

    if (unindexed < cfg.messageThreshold) {
      await this.reclaimStaleClaims(ensured.storeId);
      // backlog sweep — summaries queued by a crashed instance or prior pass
      void this.summarizeQueuedChunks(ensured.contextId);
      return;
    }

    const messages = await this.prisma.getMessagesByOrdinalRange(
      conversationId,
      watermark,
      maxOrdinalExclusive
    );
    if (messages.length !== unindexed) {
      // density is checked, never assumed — a concurrent-persist ordinal
      // collision or future delete feature would surface here
      this.logger.warn(
        {
          conversationId,
          watermark,
          maxOrdinalExclusive,
          fetched: messages.length
        },
        "sparse ordinal range — bailing memory pass"
      );
      return;
    }

    const rendered = this.renderMemoryRange(messages);
    const drafts = await this.sectionizeRenderedRange({
      conversationId,
      conversationTitle: conversationTitle ?? context.conversationTitle,
      rendered
    });
    if (drafts.length === 0) {
      await this.reclaimStaleClaims(ensured.storeId);
      return;
    }

    // safe because the watermark chain serializes claims per conversation
    const chunkIndexBase = await this.prisma.countMemoryChunks(
      ensured.contextId
    );

    const claimed = Array.of<{ chunkId: string; draft: MemorySectionDraft }>();
    for (const draft of drafts) {
      const claim = await this.prisma.claimAndInsertMemorySection({
        provenanceId: draft.provenanceId,
        contextId: ensured.contextId,
        storeId: ensured.storeId,
        conversationId,
        chunkIndex: chunkIndexBase + draft.relativeIndex,
        ordinalStart: draft.ordinalStart,
        ordinalEndExclusive: draft.ordinalEndExclusive,
        messageIdStart: draft.messageIdStart,
        messageIdEnd: draft.messageIdEnd,
        messageTimestampStart: draft.messageTimestampStart,
        messageTimestampEnd: draft.messageTimestampEnd,
        transcriptMarkdown: draft.transcriptMarkdown,
        contentHash: draft.contentHash,
        chunkedMessagesCount: draft.chunkedMessagesCount,
        tokenCount: draft.tokenCount,
        providerModelsRaw: draft.providerModelsRaw,
        hasAttachments: draft.hasAttachments,
        chunkedAttachmentsCount: draft.chunkedAttachmentsCount,
        attachmentProvenanceIdsRaw: draft.attachmentProvenanceIdsRaw,
        embeddingModel: cfg.embeddingModel,
        boundaryReason: draft.boundaryReason,
        schemaVersion: cfg.schemaVersion,
        transcriptIncludesThinking: false
      });

      if (!claim.claimed) {
        // another instance owns the chain now (or our watermark read was
        // stale) — stopping is correct, not a failure
        this.logger.info(
          {
            conversationId,
            provenanceId: draft.provenanceId,
            reason: claim.reason
          },
          "memory section claim lost — stopping pass"
        );
        break;
      }

      claimed.push({ chunkId: claim.chunk.id, draft });
    }

    if (claimed.length > 0) {
      // embed failures leave reclaimable CHUNKING rows inside the watermark;
      // aggregates record regardless — the reclaim sweep finishes the job
      await this.embedClaimsWithFamilyContext(conversationId, claimed);
      await this.recordPassAggregates(
        ensured,
        context.contributingProviderModelsRaw,
        context.firstMessageAt,
        claimed.map(c => c.draft),
        maxOrdinalExclusive
      );
    }

    await this.reclaimStaleClaims(ensured.storeId);
    // detached from the pass promise — LLM latency must not hold the
    // indexingInFlight gate hostage
    void this.summarizeQueuedChunks(ensured.contextId);
  }

  // ── Embed + index (shared by the pass and the reclaim sweep) ─────────

  /**
   * Truncates the EMBED INPUT only for over-ceiling sections — the full
   * transcript is already persisted on the row; the fulltext lane and the
   * summary pass see everything, only the vector is lossy.
   */
  private embedInputFor(transcriptMarkdown: string, tokenCount: number) {
    const ceiling = this.memoryIndexingConfig.embedInputCeilingTokens;
    if (tokenCount <= ceiling) return transcriptMarkdown;
    const keep = Math.max(
      1,
      Math.floor(transcriptMarkdown.length * (ceiling / tokenCount) * 0.95)
    );
    this.logger.warn(
      { tokenCount, ceiling, keptChars: keep },
      "truncating oversize memory section for embedding (full transcript persisted)"
    );
    return transcriptMarkdown.slice(0, keep);
  }

  /**
   * Greedy left-to-right family packing against the 32k contextualization
   * window — append-stable: earlier family boundaries never move as a
   * conversation grows, so only families containing a fresh member ever
   * need (re-)embedding. Over-ceiling members ride solo (their truncated
   * embed input ~fills the window, leaving no meaningful sibling room).
   * Members MUST arrive in chunkIndex/ordinal order.
   */
  private packEmbedFamilies(members: readonly MemoryEmbedFamilyMember[]) {
    const cfg = this.memoryIndexingConfig;
    const families = Array.of<MemoryEmbedFamilyMember[]>();
    let current = Array.of<MemoryEmbedFamilyMember>();
    let currentTokens = 0;
    const flush = () => {
      if (current.length > 0) {
        families.push(current);
        current = Array.of<MemoryEmbedFamilyMember>();
        currentTokens = 0;
      }
    };
    for (const member of members) {
      if (member.tokenCount > cfg.embedInputCeilingTokens) {
        flush();
        families.push([member]);
        continue;
      }
      if (currentTokens + member.tokenCount > cfg.familyTokenBudget) flush();
      current.push(member);
      currentTokens += member.tokenCount;
    }
    flush();
    return families;
  }

  /**
   * families → requests under the 120k batch cap. Exact stored counts —
   * probe-verified that voyage's billing meter and our countTokens agree to
   * the token, so packing runs flush against both lines. Truncated members
   * count as the ceiling (conservative: real truncated size is ~95% of it).
   */
  private packEmbedRequests(families: readonly MemoryEmbedFamilyMember[][]) {
    const cfg = this.memoryIndexingConfig;
    const effectiveTokens = (member: MemoryEmbedFamilyMember) =>
      Math.min(member.tokenCount, cfg.embedInputCeilingTokens);
    const requests = Array.of<MemoryEmbedFamilyMember[][]>();
    let current = Array.of<MemoryEmbedFamilyMember[]>();
    let currentTokens = 0;
    for (const family of families) {
      const familyTokens = family.reduce(
        (acc, member) => acc + effectiveTokens(member),
        0
      );
      if (
        currentTokens + familyTokens > cfg.requestTokenBudget &&
        current.length > 0
      ) {
        requests.push(current);
        current = Array.of<MemoryEmbedFamilyMember[]>();
        currentTokens = 0;
      }
      current.push(family);
      currentTokens += familyTokens;
    }
    if (current.length > 0) requests.push(current);
    return requests;
  }

  /**
   * One contextualized call per packed request — every member's vector is
   * minted knowing its family siblings (the whole point of context-4;
   * single-element inner lists are documented context-agnostic). Fresh
   * members transition to INDEXED + message backfill; refresh members
   * re-mint vector + embeddedAt through the same sole-owner SQL and touch
   * nothing else. A failed request rolls its fresh members back to the
   * reclaim pool and the loop continues — one 4XX must not strand the rest.
   */
  protected async embedMemoryFamilies(
    families: readonly MemoryEmbedFamilyMember[][]
  ) {
    const cfg = this.memoryIndexingConfig;
    for (const request of this.packEmbedRequests(families)) {
      const fresh = request.flat().filter(member => !member.isRefresh);
      try {
        // EMBEDDING is claim-lifecycle only — refresh members stay INDEXED
        for (const member of fresh) {
          await this.prisma.updateMemoryChunkStateTyped(
            member.chunkId,
            "EMBEDDING",
            null,
            false
          );
        }

        const result = await this.voyage.embedChunksContextual({
          inputs: request.map(family =>
            family.map(member =>
              this.embedInputFor(member.transcriptMarkdown, member.tokenCount)
            )
          ),
          input_type: "document",
          model: cfg.embeddingModel,
          output_dimension: cfg.embeddingDim
        });
        if ("detail" in result) {
          throw new Error(
            `voyage contextual embedding error: ${this.prisma.safeErrMsg(result.detail)}`
          );
        }

        for (const [familyIdx, family] of request.entries()) {
          for (const [memberIdx, member] of family.entries()) {
            const embedding =
              result.data[familyIdx]?.data[memberIdx]?.embedding;
            if (!embedding) {
              throw new Error(
                `no embedding at [${familyIdx}][${memberIdx}] from contextual endpoint`
              );
            }
            await this.prisma.updateMemoryChunkEmbeddingTyped(
              member.chunkId,
              `[${embedding.join(",")}]`
            );
            if (member.isRefresh) continue;

            const width = member.ordinalEndExclusive - member.ordinalStart;
            const backfilled = await this.prisma.backfillMessageChunkIds(
              member.conversationId,
              member.ordinalStart,
              member.ordinalEndExclusive,
              member.chunkId
            );
            if (backfilled !== width) {
              this.logger.warn(
                {
                  chunkId: member.chunkId,
                  conversationId: member.conversationId,
                  backfilled,
                  width
                },
                "memory chunk backfill count mismatch"
              );
            }
          }
        }
      } catch (err) {
        // fresh members roll back to reclaimable CHUNKING (or terminal
        // ERROR); refresh members keep their prior vector — stale context,
        // never data loss
        for (const member of fresh) {
          const terminal = member.retryCount + 1 >= cfg.maxEmbedRetries;
          this.logger.warn(
            {
              chunkId: member.chunkId,
              conversationId: member.conversationId,
              retryCount: member.retryCount,
              terminal,
              err: this.prisma.safeErrMsg(err)
            },
            "memory family embedding failed"
          );
          await this.prisma.updateMemoryChunkStateTyped(
            member.chunkId,
            terminal ? "ERROR" : "CHUNKING",
            this.prisma.safeErrMsg(err),
            true
          );
        }
      }
    }
  }

  /**
   * Family assembly for a pass: the conversation's existing INDEXED chunks
   * join the packing (lean metadata only) so fresh claims embed beside
   * their predecessors, then only families containing a fresh member are
   * (re-)embedded — packing is append-stable, so every other family's
   * vectors are already contextually correct. Refresh members' transcripts
   * hydrate lazily, only for families that actually re-embed.
   */
  private async embedClaimsWithFamilyContext(
    conversationId: string,
    claimed: readonly { chunkId: string; draft: MemorySectionDraft }[]
  ) {
    const existing = await this.prisma.getMemoryChunkEmbedMeta(conversationId);
    const claimedIds = new Set(claimed.map(c => c.chunkId));

    const members = Array.of<MemoryEmbedFamilyMember>();
    for (const row of existing) {
      if (claimedIds.has(row.id)) continue;
      members.push({
        chunkId: row.id,
        conversationId,
        ordinalStart: row.ordinalStart,
        ordinalEndExclusive: row.ordinalEndExclusive,
        transcriptMarkdown: "",
        tokenCount: row.tokenCount,
        retryCount: 0,
        isRefresh: true
      });
    }
    for (const { chunkId, draft } of claimed) {
      members.push({
        chunkId,
        conversationId,
        ordinalStart: draft.ordinalStart,
        ordinalEndExclusive: draft.ordinalEndExclusive,
        transcriptMarkdown: draft.transcriptMarkdown,
        tokenCount: draft.tokenCount,
        retryCount: 0,
        isRefresh: false
      });
    }
    // ordinal order == chunkIndex order — the watermark chain guarantees it
    members.sort((a, b) => a.ordinalStart - b.ordinalStart);

    const families = this.packEmbedFamilies(members).filter(family =>
      family.some(member => !member.isRefresh)
    );
    if (families.length === 0) return;

    const refreshIds = families
      .flat()
      .filter(member => member.isRefresh)
      .map(member => member.chunkId);
    if (refreshIds.length > 0) {
      const transcripts =
        await this.prisma.getMemoryChunkTranscriptsByIds(refreshIds);
      const byId = new Map(transcripts.map(t => [t.id, t.transcriptMarkdown]));
      for (const family of families) {
        for (const member of family) {
          if (!member.isRefresh) continue;
          member.transcriptMarkdown = byId.get(member.chunkId) ?? "";
        }
      }
    }
    // a refresh member that failed to hydrate would corrupt its family's
    // context — drop it rather than embed an empty string
    const hydrated = families.map(family =>
      family.filter(
        member => !member.isRefresh || member.transcriptMarkdown.length > 0
      )
    );

    await this.embedMemoryFamilies(hydrated);
  }

  // ── Reclaim (crash recovery — re-embed stored transcripts, never re-partition) ─

  protected async reclaimStaleClaims(storeId: string) {
    const cfg = this.memoryIndexingConfig;
    const stale = await this.prisma.findStaleMemoryClaimsTyped(
      storeId,
      cfg.staleClaimMinutes,
      cfg.maxEmbedRetries
    );
    if (stale.length === 0) return;

    this.logger.info(
      { storeId, staleCount: stale.length },
      "reclaiming stale memory claims"
    );
    // same family path as the pass, grouped per conversation — stale rows
    // are usually adjacent sections from one crashed pass, so packing just
    // them recovers most of the sibling context without extra hydration
    const byConversation = new Map<string, MemoryEmbedFamilyMember[]>();
    for (const row of stale) {
      const member = {
        chunkId: row.id,
        conversationId: row.conversationId,
        ordinalStart: row.ordinalStart,
        ordinalEndExclusive: row.ordinalEndExclusive,
        transcriptMarkdown: row.transcriptMarkdown,
        tokenCount: row.tokenCount,
        retryCount: row.retryCount,
        isRefresh: false
      } satisfies MemoryEmbedFamilyMember;
      const existing = byConversation.get(row.conversationId);
      existing
        ? existing.push(member)
        : byConversation.set(row.conversationId, [member]);
    }
    for (const members of byConversation.values()) {
      members.sort((a, b) => a.ordinalStart - b.ordinalStart);
      await this.embedMemoryFamilies(this.packEmbedFamilies(members));
    }
  }

  // ── Tool-facing search (shared entry points for every provider's arm) ─

  public parseMemorySearchInput(parsed: Record<string, unknown>) {
    if (
      !("query" in parsed) ||
      typeof parsed.query !== "string" ||
      parsed.query.trim().length === 0
    ) {
      throw new Error(
        `conversation_memory_search input missing required "query"`
      );
    }
    return {
      query: parsed.query.trim(),
      search_terms:
        typeof parsed.search_terms === "string"
          ? parsed.search_terms.trim() || undefined
          : undefined,
      scope:
        parsed.scope === "all_conversations"
          ? ("all_conversations" as const)
          : ("current_conversation" as const),
      max_results:
        typeof parsed.max_results === "number" ? parsed.max_results : undefined,
      threshold:
        typeof parsed.threshold === "number" ? parsed.threshold : undefined
    } satisfies ConversationMemorySearchToolInput;
  }

  public parseMemoryGetChunkInput(parsed: Record<string, unknown>) {
    const direction =
      parsed.direction === "previous" || parsed.direction === "next"
        ? parsed.direction
        : undefined;

    if ("chunk_id" in parsed && typeof parsed.chunk_id === "string") {
      return {
        mode: "by_id",
        chunkId: parsed.chunk_id,
        direction
      } as const satisfies ConversationMemoryGetChunkTarget;
    }
    if (
      "conversation_id" in parsed &&
      typeof parsed.conversation_id === "string" &&
      typeof parsed.ordinal === "number"
    ) {
      return {
        mode: "by_ordinal",
        conversationId: parsed.conversation_id,
        ordinal: parsed.ordinal,
        direction
      } as const satisfies ConversationMemoryGetChunkTarget;
    }
    throw new Error(
      `conversation_memory_get_chunk requires "chunk_id", or "conversation_id" + "ordinal"`
    );
  }

  public async searchMemoryFromToolInput(
    userId: string,
    conversationId: string,
    parsed: Record<string, unknown>
  ) {
    const input = this.parseMemorySearchInput(parsed);
    return await this.searchMemory(userId, conversationId, input);
  }

  public async getMemoryChunkFromToolInput(
    userId: string,
    parsed: Record<string, unknown>
  ) {
    const target = this.parseMemoryGetChunkInput(parsed);
    return await this.getMemoryChunkForTool(userId, target);
  }

  public async searchMemory(
    userId: string,
    conversationId: string,
    input: ConversationMemorySearchToolInput
  ) {
    const cfg = this.memoryIndexingConfig;
    const scope = input.scope ?? "current_conversation";
    const limit = Math.max(1, Math.min(Math.trunc(input.max_results ?? 5), 25));
    const threshold = Math.max(0, Math.min(input.threshold ?? 0, 0.99));
    const terms = input.search_terms?.trim().slice(0, 500) ?? null;

    // read-only path: a search must never mint store/context rows
    const store = await this.prisma.getMemoryStore(userId);
    if (!store) {
      return this.formatMemoryResults([], input, scope, threshold, {
        note: "no conversation memory indexed yet"
      });
    }

    let contextId: string | null = null;
    if (scope === "current_conversation") {
      const context = await this.prisma.getMemoryContext(conversationId);
      if (!context) {
        return this.formatMemoryResults([], input, scope, threshold, {
          note: "nothing indexed for this conversation yet — older sections index automatically as the conversation grows"
        });
      }
      contextId = context.id;
    }

    const embedded = await this.voyage.embedChunksContextual({
      inputs: [[input.query]],
      input_type: "query",
      model: cfg.embeddingModel,
      output_dimension: cfg.embeddingDim
    });
    if ("detail" in embedded) {
      this.logger.warn(
        { userId, detail: this.prisma.safeErrMsg(embedded.detail) },
        "memory search query embedding failed"
      );
      return this.formatMemoryResults([], input, scope, threshold, {
        note: "query embedding failed — try again"
      });
    }
    const embedding = embedded.data[0]?.data[0]?.embedding;
    if (!embedding) {
      return this.formatMemoryResults([], input, scope, threshold, {
        note: "query embedding failed — try again"
      });
    }
    const vector = `[${embedding.join(",")}]`;

    const rows =
      scope === "all_conversations"
        ? await this.prisma.searchConversationMemoryHybridTyped(
            store.id,
            vector,
            limit,
            threshold,
            terms,
            limit,
            cfg.embeddingModel
          )
        : contextId
          ? await this.prisma.searchMemoryByConversationHybridTyped(
              contextId,
              vector,
              limit,
              threshold,
              terms,
              limit,
              cfg.embeddingModel
            )
          : Array.of<MemoryHybridRow>();

    return this.formatMemoryResults(rows, input, scope, threshold);
  }

  private memoryExcerpt(transcriptMarkdown: string | null) {
    const text = transcriptMarkdown ?? "";
    if (text.length <= 1200) return text;
    return `${text.slice(0, 1200)} …[truncated — expand via conversation_memory_get_chunk]`;
  }

  private formatMemoryResults(
    rows: readonly MemoryHybridRow[],
    input: ConversationMemorySearchToolInput,
    scope: ConversationMemorySearchScope,
    threshold: number,
    extraMeta?: { note: string }
  ) {
    const valid = rows.filter(
      (
        r
      ): r is MemoryHybridRow & {
        id: string;
        conversationId: string;
        ordinalStart: number;
        ordinalEndExclusive: number;
      } =>
        r.id != null &&
        r.conversationId != null &&
        r.ordinalStart != null &&
        r.ordinalEndExclusive != null
    );

    // dedupe per signal keeping highest score, then restore positional rank
    valid.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const semanticSeen = new Set<string>();
    const fulltextSeen = new Set<string>();
    const semantic = Array.of<(typeof valid)[number]>();
    const fulltext = Array.of<(typeof valid)[number]>();
    for (const row of valid) {
      if (row.signal === "semantic") {
        if (!semanticSeen.has(row.id)) {
          semanticSeen.add(row.id);
          semantic.push(row);
        }
      } else if (row.signal === "fulltext") {
        if (!fulltextSeen.has(row.id)) {
          fulltextSeen.add(row.id);
          fulltext.push(row);
        }
      }
    }
    semantic.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    fulltext.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

    const overlapIds = [...semanticSeen].filter(id => fulltextSeen.has(id));
    const unionSize = new Set([...semanticSeen, ...fulltextSeen]).size;

    const toResult = (r: (typeof valid)[number]) => ({
      chunk_id: r.id,
      conversation_id: r.conversationId,
      conversation_title: r.conversationTitle,
      chunk_index: r.chunkIndex,
      ordinal_start: r.ordinalStart,
      ordinal_end_exclusive: r.ordinalEndExclusive,
      excerpt: this.memoryExcerpt(r.transcriptMarkdown),
      token_count: r.tokenCount,
      message_timestamp_start: r.messageTimestampStart?.toISOString() ?? null,
      message_timestamp_end: r.messageTimestampEnd?.toISOString() ?? null,
      provider_models: r.providerModelsRaw,
      has_attachments: r.hasAttachments === true,
      score: r.score != null ? Number(r.score.toFixed(4)) : 0,
      match_type: r.appearsInBothSignals === true ? "both" : r.signal
    });

    return JSON.stringify({
      query: input.query,
      search_terms: input.search_terms ?? null,
      scope,
      semantic_results: semantic.map(toResult),
      fulltext_results: fulltext.map(toResult),
      overlap_results: overlapIds,
      metadata: {
        semantic_count: semantic.length,
        fulltext_count: fulltext.length,
        overlap_count: overlapIds.length,
        jaccard_similarity:
          unionSize > 0
            ? Number((overlapIds.length / unionSize).toFixed(4))
            : 0,
        semantic_threshold: threshold,
        ...extraMeta
      }
    });
  }

  public async getMemoryChunkForTool(
    userId: string,
    target: ConversationMemoryGetChunkTarget
  ) {
    const store = await this.prisma.getMemoryStore(userId);
    if (!store) {
      return JSON.stringify({
        found: false,
        reason: "no conversation memory indexed yet"
      });
    }

    const base =
      target.mode === "by_id"
        ? await this.prisma.findMemoryChunkById(target.chunkId)
        : await this.prisma.findMemoryChunkCoveringOrdinal(
            target.conversationId,
            target.ordinal
          );

    // storeId check doubles as the cross-user guard for hallucinated chunk ids
    if (!base || base?.storeId !== store.id || base.deletedAt != null) {
      return JSON.stringify({ found: false, reason: "section not found" });
    }

    let resolved = base;
    if (target.direction) {
      const neighborIndex =
        base.chunkIndex + (target.direction === "next" ? 1 : -1);
      if (neighborIndex < 0) {
        return JSON.stringify({
          found: false,
          reason: "no previous section — this is the first indexed section"
        });
      }
      const neighbor = await this.prisma.findMemoryChunkByIndex(
        base.contextId,
        neighborIndex
      );
      if (!neighbor) {
        return JSON.stringify({
          found: false,
          reason: `no ${target.direction} section beyond messages [${base.ordinalStart}, ${base.ordinalEndExclusive})`
        });
      }
      resolved = neighbor;
    }

    const [conversationTitle, previous, next] = await Promise.all([
      this.prisma.getConversationTitle(resolved.conversationId),
      resolved.chunkIndex > 0
        ? this.prisma.findMemoryChunkByIndex(
            resolved.contextId,
            resolved.chunkIndex - 1
          )
        : Promise.resolve(null),
      this.prisma.findMemoryChunkByIndex(
        resolved.contextId,
        resolved.chunkIndex + 1
      )
    ]);

    // refs, not summaries — the neighbor's substance stays one deliberate call away
    const neighborRef = (
      neighbor: {
        id: string;
        ordinalStart: number;
        ordinalEndExclusive: number;
      } | null
    ) =>
      neighbor
        ? {
            chunk_id: neighbor.id,
            ordinal_start: neighbor.ordinalStart,
            ordinal_end_exclusive: neighbor.ordinalEndExclusive
          }
        : null;

    return JSON.stringify({
      found: true,
      chunk_id: resolved.id,
      conversation_id: resolved.conversationId,
      conversation_title: conversationTitle,
      chunk_index: resolved.chunkIndex,
      ordinal_start: resolved.ordinalStart,
      ordinal_end_exclusive: resolved.ordinalEndExclusive,
      chunked_messages_count: resolved.chunkedMessagesCount,
      token_count: resolved.tokenCount,
      chunking_state: resolved.chunkingState,
      provider_models: resolved.providerModelsRaw,
      has_attachments: resolved.hasAttachments,
      attachment_provenance_ids: resolved.attachmentProvenanceIdsRaw,
      message_timestamp_start: resolved.messageTimestampStart.toISOString(),
      message_timestamp_end: resolved.messageTimestampEnd.toISOString(),
      transcript: resolved.transcriptMarkdown,
      previous: neighborRef(previous),
      next: neighborRef(next)
    });
  }

  // ── Assembly-time compaction (provider payload only — db rows/ordinals untouched) ─

  public get memoryCompactionConfig() {
    return {
      enabled: true,
      liveWindowMessages: 20
    } as const satisfies MemoryCompactionConfig;
  }

  /**
   * The compactable prefix of a conversation's history: the contiguous-from-
   * zero chain of INDEXED chunks with READY summaries, entirely below the
   * live-window floor. Returns null when compaction is off or nothing
   * qualifies.
   *
   * Prompt-cache stability: the returned block changes ONLY when a new
   * chunk's summary becomes READY — never per-message — so long
   * conversations keep their prefix cache hits between chunk landings.
   */
  public async getCompactionPlan(
    conversationId: string,
    maxOrdinalExclusive: number
  ) {
    const cfg = this.memoryCompactionConfig;
    if (!cfg.enabled) return null;
    const floor = maxOrdinalExclusive - cfg.liveWindowMessages;
    if (floor <= 0) return null;

    const chunks = await this.prisma.findCompactableChunks(
      conversationId,
      floor
    );
    if (chunks.length === 0) return null;

    // contiguous prefix chain from ordinal 0 — a gap (unsummarized or
    // still-embedding chunk) stops compaction at the boundary before it
    const sections = Array.of<string>();
    let cursor = 0;
    for (const chunk of chunks) {
      if (chunk.ordinalStart !== cursor) break;
      if (chunk.summary == null || chunk.summary.length === 0) break;
      sections.push(
        `## messages [${chunk.ordinalStart}, ${chunk.ordinalEndExclusive})\n\n${chunk.summary}`
      );
      cursor = chunk.ordinalEndExclusive;
    }
    if (sections.length === 0 || cursor === 0) return null;

    const block = [
      `[conversation memory · messages 0-${cursor - 1} of this conversation are compacted into the summaries below · full transcripts remain retrievable]`,
      ...sections,
      `(Expand any range via conversation_memory_get_chunk — conversation_id + ordinal; search via conversation_memory_search.)`
    ].join("\n\n");

    return {
      compactedThroughOrdinalExclusive: cursor,
      block
    } as const;
  }

  // ── Summary pass (frontier vision-capable, quality over cost) ────────

  public get memorySummarizerConfig() {
    return {
      provider: "ANTHROPIC",
      model: "claude-sonnet-5",
      promptVersion: "v1_0",
      foldPromptVersion: "v1_0",
      effort: "xhigh",
      maxOutputTokens: 120_000,
      maxAttachmentBlocks: 12,
      maxToolUseRounds: 4,
      callDeadlineMs: 900_000,
      sweepBatchSize: 8
    } as const satisfies MemorySummarizerConfig;
  }

  private get summarySystemPrompt() {
    return `You are the conversation-memory summarizer for a multi-provider AI chat platform. You write dense, retrieval-optimized summaries of conversation sections. These conversations are usually rich — code, architecture, documents, images, and a great deal of collaborative creative writing — and your summaries are what future searches and future model turns rely on.

What you are reading, and where it came from:
- Transcripts are rendered by the platform from stored messages. The "ordinal. model (provider) · timestamp" headers are renderer-added name tags, not model output.
- The system prompts on this platform are minimal — essentially just a notice that name tags exist in [provider/model] notation (Anthropic models get XML <model> wrappers instead, at their own request). There is no hidden persona engineering.
- Therefore: any personas, mythologies, running bits, or distinctive registers you encounter were built collaboratively by the user and the models, live, inside the conversations themselves. Never attribute them to "clever system prompting" or instructions you cannot see — there are none.

Tooling:
- file_search reaches the user's uploaded archive (prior chapters, PDFs, images — the same corpus the personas themselves forage). Call it when the section references canon you cannot verify from the transcript alone: exact coined phrases, earlier chapters, provenance. Optional — never let foraging replace summarizing the transcript in front of you.

Mandates for the section summary:
- Decisions made and their rationale.
- Code entities by exact name: files, functions, types, commands, packages, schemas.
- Constraints and invariants established.
- Corrections the user issued (these outrank everything else).
- Open threads and unresolved questions.
- For creative sections: preserve persona names, coined phrases, running jokes, and canonical lines EXACTLY — quote them. Capture the section's voice and register with fidelity. A sterilized summary of a vivid section is a failed summary; the vividness IS retrieval signal.
- Cite message ordinals for anything a future reader may want to expand, e.g. "(msgs 41-44)". Ordinals appear as the leading number of each transcript message.
- If attachments are provided, note concretely what each shows.
- No preamble, no meta-commentary — every sentence carries retrieval value.

Output ONLY the section summary per the mandates — plain markdown, no wrapper tags, no preamble.` as const;
  }

  private get foldSystemPrompt() {
    return `You are the rolling-summary folder for a multi-provider AI chat platform's conversation memory. You maintain the whole-conversation digest that future searches and future model turns rely on.

You receive the prior rolling summary (possibly empty) and one or more freshly written section summaries, in conversation order. Fold them into ONE updated digest.

- Preserve earlier decisions, corrections, and canonical creative material; compress only what has been superseded.
- Corrections the user issued outrank everything else.
- Preserve persona names, coined phrases, running jokes, and canonical lines EXACTLY — quote them.
- Keep message-ordinal citations, e.g. "(msgs 41-44)".
- Let the digest grow in proportion to the conversation itself — completeness outranks brevity, and there is no word limit.
- file_search reaches the user's uploaded archive if a canonical reference needs verification before it enters the digest. Optional.

Output ONLY the updated digest — plain markdown, no wrapper tags, no preamble, no meta-commentary.` as const;
  }

  private get anthropicImageMimes() {
    return ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  }

  private attachmentUrlMime(
    att: Awaited<ReturnType<PrismaService["findAttachmentsByIds"]>>[number]
  ) {
    if (att.compatStatus === "ACTIVE" && att.compatCdnUrl && att.compatMime) {
      return { url: att.compatCdnUrl, mime: att.compatMime } as const;
    }
    if (att.cdnUrl && att.mime) {
      return { url: att.cdnUrl, mime: att.mime } as const;
    }
    return null;
  }

  private async resolveSummaryAttachmentBlocks(
    attachmentProvenanceIdsRaw: string
  ) {
    const cfg = this.memorySummarizerConfig;
    const attachmentIds = Array.of<string>();
    for (const provenance of attachmentProvenanceIdsRaw.split("::")) {
      if (!this.prisma.canParseDocname(provenance)) continue;
      attachmentIds.push(this.prisma.parseDocname(provenance).attachmentId);
    }

    const blocks = Array.of<Anthropic.Beta.BetaContentBlockParam>();
    if (attachmentIds.length === 0) return blocks;

    // images only — documents already live in the user store via the pdfdown
    // pipeline (index once, retrieve everywhere; file_search + filename filter
    // reaches them). The summarizer's vision pass gives images a text-lane
    // retrieval path while multimodal embedding retrieval finds its voice.
    const attachments = await this.prisma.findAttachmentsByIds(attachmentIds);
    for (const att of attachments) {
      if (blocks.length >= cfg.maxAttachmentBlocks) break;
      const resolved = this.attachmentUrlMime(att);
      if (!resolved) continue;
      const isImage = this.anthropicImageMimes.some(
        mime => mime === resolved.mime
      );
      if (isImage) {
        blocks.push({
          type: "image",
          source: { type: "url", url: resolved.url }
        });
      }
    }
    return blocks;
  }

  private async buildSummaryContent(
    chunk: MemoryChunkAwaitingSummary,
    conversationTitle: string | null
  ) {
    const preamble = [
      `Conversation: ${conversationTitle ?? "Untitled Conversation"}`,
      `Section: messages [${chunk.ordinalStart}, ${chunk.ordinalEndExclusive}) · chunkIndex ${chunk.chunkIndex}`,
      ``,
      `Section transcript:`,
      chunk.transcriptMarkdown
    ].join("\n");

    const blocks = Array.of<Anthropic.Beta.BetaContentBlockParam>();
    blocks.push({ type: "text", text: preamble });
    if (chunk.hasAttachments && chunk.attachmentProvenanceIdsRaw) {
      blocks.push(
        ...(await this.resolveSummaryAttachmentBlocks(
          chunk.attachmentProvenanceIdsRaw
        ))
      );
    }
    return blocks;
  }

  /**
   * v1_3 calls are single-purpose and tag-free; stray tags from habit-formed
   * models and NUL bytes are stripped defensively. Null = unusable output.
   */
  private sanitizeSummaryOutput(raw: string) {
    const cleaned = raw
      .replace(/<\/?section_summary>/g, "")
      .replace(/<\/?rolling_summary>/g, "")
      .replace(/\0/g, "")
      .trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  /** user-store file_search offered to the summarizer — same contract as the chat tool, summarizer-tuned description */
  private get summarizerFileSearchTool(): Anthropic.Beta.BetaToolUnion {
    return {
      name: "file_search",
      description:
        "Search the user's uploaded document/image archive (their user vector store). " +
        "Use it while summarizing to pin down canon the section references — prior chapters, coined terms, exact quotes, provenance. " +
        "Semantic similarity by default; provide search_terms for exact-match fulltext (returns partitioned semantic + fulltext + overlap). " +
        "Optional filename filter (fuzzy, case-insensitive). " +
        "Foraging is optional — never let it replace summarizing the transcript in front of you.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The semantic search query"
          },
          max_results: {
            type: "number",
            description: "Maximum results to return (1-10, default 5)"
          },
          filename: {
            type: "string",
            description:
              "Optional filename filter (fuzzy, case-insensitive). Only chunks from documents whose filename closely matches are returned."
          },
          search_terms: {
            type: "string",
            description:
              "Optional exact-match search terms for fulltext search. Supports quoted phrases and negation (-deprecated). Returns partitioned semantic + fulltext results."
          }
        },
        required: ["query"]
      }
    } satisfies Anthropic.Beta.BetaToolUnion;
  }

  private isToolInputRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value != null && !Array.isArray(value);
  }

  /** mirror of the chat path's executeFileSearch, scoped to the summarized conversation's owner */
  private async executeSummarizerToolCall(
    userId: string,
    name: string,
    input: unknown
  ) {
    if (name !== "file_search") {
      throw new Error(`summarizer requested unknown tool: ${name}`);
    }
    if (!this.isToolInputRecord(input) || typeof input.query !== "string") {
      throw new Error(
        `file_search input missing "query": ${JSON.stringify(input)}`
      );
    }
    const parsed = {
      query: input.query,
      max_results:
        typeof input.max_results === "number" ? input.max_results : undefined,
      filename:
        typeof input.filename === "string"
          ? input.filename.trim() || undefined
          : undefined,
      search_terms:
        typeof input.search_terms === "string"
          ? input.search_terms.trim() || undefined
          : undefined
    } satisfies FileSearchToolInput;
    const limit = Math.min(parsed.max_results ?? 5, 10);

    if (parsed.search_terms) {
      const partitioned = await this.userStore.searchUserStoreChunksHybrid({
        userId,
        query: parsed.query,
        searchTerms: parsed.search_terms,
        limit,
        threshold: 0,
        filename: parsed.filename
      });
      return this.userStore.formatPartitionedResults(
        partitioned,
        parsed.query
      );
    }

    const results = await this.userStore.searchUserStoreChunks({
      userId,
      query: parsed.query,
      limit,
      threshold: 0,
      filename: parsed.filename
    });
    if (results.length === 0) return "[]";
    return JSON.stringify(
      results.map(r => ({
        filename: r.filename,
        score: r.score != null ? Number(r.score.toFixed(4)) : 0,
        content: r.content,
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        chunkIndex: r.chunkIndex
      }))
    );
  }

  protected async summarizeChunk(
    chunk: MemoryChunkAwaitingSummary,
    conversationTitle: string | null,
    userId: string
  ) {
    const cfg = this.memorySummarizerConfig;
    try {
      await this.prisma.updateMemoryChunkSummaryStateTyped(
        chunk.id,
        "SUMMARIZING",
        null
      );

      const content = await this.buildSummaryContent(chunk, conversationTitle);
      const result = await this.summarizer.streamSummaryMessage({
        model: cfg.model,
        maxOutputTokens: cfg.maxOutputTokens,
        effort: cfg.effort,
        system: this.summarySystemPrompt,
        content,
        tools: [this.summarizerFileSearchTool],
        executeToolCall: (name, input) =>
          this.executeSummarizerToolCall(userId, name, input),
        maxToolUseRounds: cfg.maxToolUseRounds,
        callDeadlineMs: cfg.callDeadlineMs
      });
      const sectionSummary = this.sanitizeSummaryOutput(result.text);
      if (!sectionSummary) throw new Error("summarizer returned empty output");

      const counted = await this.voyage.countTokens(
        [sectionSummary],
        this.memoryIndexingConfig.embeddingModel
      );

      // sole READY owner — the tsv trigger refreshes searchTsv (summary at weight A)
      await this.prisma.updateMemoryChunkSummaryTyped(
        chunk.id,
        sectionSummary,
        cfg.model,
        cfg.provider,
        cfg.promptVersion,
        counted.counts[0] ?? 0,
        result.reasoningDuration,
        result.reasoningText,
        result.toolUse.length > 0 ? JSON.stringify(result.toolUse) : null
      );

      return true;
    } catch (err) {
      const terminal =
        chunk.summaryRetryCount + 1 >=
        this.memoryIndexingConfig.maxSummaryRetries;
      this.logger.warn(
        {
          chunkId: chunk.id,
          contextId: chunk.contextId,
          summaryRetryCount: chunk.summaryRetryCount,
          terminal,
          err: this.prisma.safeErrMsg(err)
        },
        "memory chunk summarization failed"
      );
      // ERROR increments summaryRetryCount; the sweep retries under the cap.
      // The chunk stays semantically searchable at INDEXED regardless.
      await this.prisma.updateMemoryChunkSummaryStateTyped(
        chunk.id,
        "ERROR",
        this.prisma.safeErrMsg(err)
      );
      return false;
    }
  }

  /**
   * Stash'n'dash wave dispatch (the xai pollDocumentIndexing pattern): every
   * pending chunk becomes a detached per-chunk job — section summaries have
   * zero cross-chunk dependency, so they run concurrently. Only the rolling
   * fold is order-sensitive; it runs ONCE when the wave drains. Never rejects.
   *
   * The synchronous registry set is the dispatch claim — a re-entrant call
   * sees an undrained wave and returns. A drained wave is replaced wholesale
   * (one new Map per job wave; the DB owns terminal history).
   */
  public async summarizeQueuedChunks(contextId: string) {
    const existing = this.summaryJobRegistry.get(contextId);
    if (existing && !this.waveDrained(existing)) {
      // belt-and-suspenders under the per-call deadline: a wave that outlives
      // every possible round budget is wedged junk — replace, don't respect
      const bornAt = this.summaryWaveBornAt.get(contextId) ?? 0;
      const maxWaveMs =
        this.memorySummarizerConfig.callDeadlineMs *
        (this.memorySummarizerConfig.maxToolUseRounds + 2);
      if (Date.now() - bornAt < maxWaveMs) return;
      this.logger.warn(
        { contextId, waveAgeMs: Date.now() - bornAt },
        "abandoning over-age summary wave — replacing"
      );
    }

    const wave = new Map<string, $Enums.MemorySummaryState>();
    this.summaryJobRegistry.set(contextId, wave);
    this.summaryWaveBornAt.set(contextId, Date.now());
    try {
      // a process killed mid-call strands SUMMARIZING rows — fold them back
      // into the retry pool once they exceed the stale threshold
      await this.prisma.reclaimStaleSummaryClaims(
        contextId,
        this.memoryIndexingConfig.staleSummaryMinutes
      );
      const pending = await this.prisma.findChunksAwaitingSummary(
        contextId,
        this.memoryIndexingConfig.maxSummaryRetries,
        this.memorySummarizerConfig.sweepBatchSize
      );
      if (pending.length === 0) {
        // release the claim — an empty wave never drains and would wedge the context
        this.summaryJobRegistry.delete(contextId);
        return;
      }
      const context = await this.prisma.getMemoryContextById(contextId);
      if (!context) {
        this.summaryJobRegistry.delete(contextId);
        return;
      }
      const conversationTitle = context.conversationTitle ?? null;
      const userId = context.memoryStore.userId;

      // populate the FULL wave before any job can settle — the drain check
      // must see every sibling
      for (const chunk of pending) {
        wave.set(chunk.id, "QUEUED");
      }
      for (const chunk of pending) {
        void this.runSummaryJob(wave, chunk, conversationTitle, userId);
      }
    } catch (err) {
      this.summaryJobRegistry.delete(contextId);
      this.logger.warn(
        { contextId, err: this.prisma.safeErrMsg(err) },
        "memory summary wave dispatch failed"
      );
    }
  }

  /** boot-time kick — requeued/backlogged conversations regenerate without waiting for a conversation tick */
  public async resumeSummaryBacklog() {
    try {
      const contexts = await this.prisma.findContextsWithPendingSummaries(
        this.memoryIndexingConfig.maxSummaryRetries
      );
      if (contexts.length === 0) return;
      this.logger.info(
        { contexts: contexts.length },
        "resuming summary backlog"
      );
      for (const { contextId } of contexts) {
        void this.summarizeQueuedChunks(contextId);
      }
    } catch (err) {
      this.logger.warn(
        { err: this.prisma.safeErrMsg(err) },
        "summary backlog resume failed"
      );
    }
  }

  /** detached per-chunk job — never rejects; the last settler folds, then chains the next wave */
  private async runSummaryJob(
    wave: Map<string, $Enums.MemorySummaryState>,
    chunk: MemoryChunkAwaitingSummary,
    conversationTitle: string | null,
    userId: string
  ) {
    try {
      wave.set(chunk.id, "SUMMARIZING");
      const ok = await this.summarizeChunk(chunk, conversationTitle, userId);
      wave.set(chunk.id, ok ? "READY" : "ERROR");
    } catch (err) {
      // summarizeChunk self-catches; this guards its error-path DB write
      wave.set(chunk.id, "ERROR");
      this.logger.warn(
        {
          chunkId: chunk.id,
          contextId: chunk.contextId,
          err: this.prisma.safeErrMsg(err)
        },
        "memory summary job crashed outside summarizeChunk"
      );
    }
    if (!this.waveDrained(wave)) return;
    await this.foldRollingSummaryForContext(chunk.contextId, wave, userId);
    // self-continuation — the sweepBatchSize cap must never strand a backlog
    // (the ordinal-57 stall); ERROR-at-cap chunks fall out of the finder, so
    // the chain terminates
    void this.summarizeQueuedChunks(chunk.contextId);
  }

  /** a wave with no live jobs left; empty = a dispatch claim mid-populate, NOT drained */
  private waveDrained(wave: Map<string, $Enums.MemorySummaryState>) {
    if (wave.size === 0) return false;
    for (const state of wave.values()) {
      if (state === "QUEUED" || state === "SUMMARIZING") return false;
    }
    return true;
  }

  /**
   * Wave-drain fold: ONE model call folds the wave's READY sections (re-read
   * from the DB in chunkIndex order — row text is the source of truth, never
   * the registry) into the rolling summary. CAS-guarded; a lost cross-instance
   * race logs and defers, matching the sequential design's guarantee.
   */
  private async foldRollingSummaryForContext(
    contextId: string,
    wave: Map<string, $Enums.MemorySummaryState>,
    userId: string
  ) {
    const cfg = this.memorySummarizerConfig;
    try {
      const readyIds = Array.of<string>();
      for (const [chunkId, state] of wave) {
        if (state === "READY") readyIds.push(chunkId);
      }
      if (readyIds.length === 0) return;

      // fresh read — the CAS expectation must be current, not dispatch-era
      const context = await this.prisma.getMemoryContextById(contextId);
      if (!context) return;
      const sections = await this.prisma.getMemoryChunkSummariesByIds(readyIds);
      if (sections.length === 0) return;

      await this.prisma.setRollingSummaryState(contextId, "SUMMARIZING");

      const parts = Array.of<string>();
      parts.push(
        `Conversation: ${context.conversationTitle ?? "Untitled Conversation"}`,
        ``,
        `Prior rolling summary:`,
        context.rollingSummary ?? "(none yet — this is the first fold)",
        ``,
        `New section summaries, in conversation order:`
      );
      for (const section of sections) {
        if (section.summary == null || section.summary.length === 0) continue;
        parts.push(
          ``,
          `## messages [${section.ordinalStart}, ${section.ordinalEndExclusive})`,
          section.summary
        );
      }

      const result = await this.summarizer.streamSummaryMessage({
        model: cfg.model,
        maxOutputTokens: cfg.maxOutputTokens,
        effort: cfg.effort,
        system: this.foldSystemPrompt,
        content: [{ type: "text", text: parts.join("\n") }],
        tools: [this.summarizerFileSearchTool],
        executeToolCall: (name, input) =>
          this.executeSummarizerToolCall(userId, name, input),
        maxToolUseRounds: cfg.maxToolUseRounds,
        callDeadlineMs: cfg.callDeadlineMs
      });
      const folded = this.sanitizeSummaryOutput(result.text);
      if (!folded) throw new Error("fold call returned empty output");

      const counted = await this.voyage.countTokens(
        [folded],
        this.memoryIndexingConfig.embeddingModel
      );
      const landed = await this.prisma.foldRollingSummaryCas({
        contextId,
        expectedRollingSummaryUpdatedAt: context.rollingSummaryUpdatedAt,
        rollingSummary: folded,
        rollingSummaryModel: cfg.model,
        rollingSummaryProvider: cfg.provider,
        rollingSummaryTokens: counted.counts[0] ?? 0,
        rollingSummaryReasoningDuration: result.reasoningDuration,
        rollingSummaryReasoningText: result.reasoningText,
        rollingSummaryReasoningToolUseRaw:
          result.toolUse.length > 0 ? JSON.stringify(result.toolUse) : null,
        rollingSummaryReasoningVersion: cfg.foldPromptVersion
      });
      if (!landed) {
        // another instance's fold landed first — its CAS write owns the
        // READY state and the fresher digest; ours is discarded
        this.logger.info(
          { contextId, sections: sections.length },
          "rolling summary fold lost CAS — deferring to the next wave"
        );
      }
    } catch (err) {
      this.logger.warn(
        { contextId, err: this.prisma.safeErrMsg(err) },
        "rolling summary fold failed"
      );
      await this.prisma
        .setRollingSummaryState(contextId, "ERROR")
        .catch((stateErr: unknown) => {
          this.logger.debug(
            { contextId, err: this.prisma.safeErrMsg(stateErr) },
            "rolling summary ERROR state write failed"
          );
        });
    }
  }

  /**
   * The user-driven scalpel: requeue version-behind READY summaries for ONE
   * conversation, then dispatch a wave. Never bulk, never automatic — a
   * prompt-era bump alone must not cascade state changes. Wire this to a
   * user-facing event; nothing calls it on its own.
   */
  public async refreshConversationSummaries(
    conversationId: string,
    userId: string
  ) {
    const requeued = await this.prisma.requeueStaleSummaries(
      conversationId,
      this.memorySummarizerConfig.promptVersion
    );
    if (requeued === 0) return { requeued } as const;
    const ensured = await this.ensureMemoryContext(conversationId, userId);
    void this.summarizeQueuedChunks(ensured.contextId);
    return { requeued } as const;
  }

  // ── Aggregates ───────────────────────────────────────────────────────

  private mergeProviderModelPairs(
    existingRaw: string | null,
    drafts: readonly MemorySectionDraft[]
  ) {
    const pairs = new Set<string>();
    if (existingRaw) {
      for (const pair of existingRaw.split("::")) {
        if (pair.length > 0) pairs.add(pair);
      }
    }
    for (const draft of drafts) {
      for (const pair of draft.providerModelsRaw.split("::")) {
        if (pair.length > 0) pairs.add(pair);
      }
    }
    const providers = new Set<string>();
    for (const pair of pairs) {
      const [provider] = pair.split(":");
      if (provider) providers.add(provider);
    }
    return {
      raw: Array.from(pairs).join("::"),
      hasMultipleProviders: providers.size > 1,
      hasMultipleModels: pairs.size > 1
    };
  }

  private async recordPassAggregates(
    ensured: { contextId: string; storeId: string; created: boolean },
    existingProviderModelsRaw: string | null,
    existingFirstMessageAt: Date | null,
    claimedDrafts: readonly MemorySectionDraft[],
    maxOrdinalExclusive: number
  ) {
    const firstDraft = claimedDrafts[0];
    const lastDraft = claimedDrafts[claimedDrafts.length - 1];
    if (!firstDraft || !lastDraft) return;

    const merged = this.mergeProviderModelPairs(
      existingProviderModelsRaw,
      claimedDrafts
    );
    const tokensClaimed = claimedDrafts.reduce(
      (sum, draft) => sum + draft.tokenCount,
      0
    );
    const messagesClaimed = claimedDrafts.reduce(
      (sum, draft) => sum + draft.chunkedMessagesCount,
      0
    );

    await this.prisma.updateMemoryContextAggregates(ensured.contextId, {
      chunkedTurnsDelta: messagesClaimed,
      totalTokensDelta: tokensClaimed,
      totalTurns: maxOrdinalExclusive,
      contributingProviderModelsRaw: merged.raw,
      hasMultipleProviders: merged.hasMultipleProviders,
      hasMultipleModels: merged.hasMultipleModels,
      firstMessageAt: existingFirstMessageAt
        ? undefined
        : firstDraft.messageTimestampStart,
      lastMessageAt: lastDraft.messageTimestampEnd
    });
    await this.prisma.updateMemoryStoreCounters(ensured.storeId, {
      chunksDelta: claimedDrafts.length,
      tokensDelta: tokensClaimed,
      conversationsDelta: ensured.created ? 1 : 0
    });
  }
}
