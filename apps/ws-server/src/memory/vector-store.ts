import type { LoggerService } from "@/logger/index.ts";
import type {
  ConversationMemoryGetChunkTarget,
  ConversationMemorySearchScope,
  ConversationMemorySearchToolInput,
  MemoryChunkAwaitingSummary,
  MemoryHybridRow,
  MemorySectionDraft,
  MemorySummarizerConfig
} from "@/memory/types.ts";
import type { VoyageEmbeddingService } from "@/voyage/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import { Anthropic } from "@anthropic-ai/sdk";
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

export class ConversationMemoryVectorService extends ConversationMemoryWorkupService {
  /**
   * conversationId → in-flight pass. Same-instance dedup only (a saved bridge
   * call, not a correctness mechanism) — cross-instance safety is the watermark
   * CAS. Delete-on-settle.
   */
  protected indexingInFlight = new Map<string, Promise<void>>();

  /** contextId → in-flight summary sweep; delete-on-settle */
  protected summarizingInFlight = new Map<string, Promise<void>>();

  /**
   * Raw SDK client, not AnthropicService — the summarizer is one non-streaming
   * internal call; pulling in the chat service would couple us to the provider
   * layer for nothing (and its getClient is protected by design).
   */
  private summarizerClient: Anthropic;

  constructor(
    logger: LoggerService,
    voyage: VoyageEmbeddingService,
    prisma: PrismaService,
    anthropicApiKey: string
  ) {
    super(logger, voyage, prisma);
    this.summarizerClient = new Anthropic({
      apiKey: anthropicApiKey,
      logger: this.logger
    });
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

    const claimedDrafts = Array.of<MemorySectionDraft>();
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

      claimedDrafts.push(draft);
      // embed failure leaves a reclaimable CHUNKING row inside the watermark;
      // the chain continues — later sections claim regardless
      await this.embedAndIndexChunk({
        chunkId: claim.chunk.id,
        conversationId,
        ordinalStart: draft.ordinalStart,
        ordinalEndExclusive: draft.ordinalEndExclusive,
        transcriptMarkdown: draft.transcriptMarkdown,
        tokenCount: draft.tokenCount,
        retryCount: 0
      });
    }

    if (claimedDrafts.length > 0) {
      await this.recordPassAggregates(
        ensured,
        context.contributingProviderModelsRaw,
        context.firstMessageAt,
        claimedDrafts,
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

  protected async embedAndIndexChunk(target: EmbedAndIndexTarget) {
    const cfg = this.memoryIndexingConfig;
    try {
      await this.prisma.updateMemoryChunkStateTyped(
        target.chunkId,
        "EMBEDDING",
        null,
        false
      );

      const result = await this.voyage.embedChunksContextual({
        inputs: [
          [this.embedInputFor(target.transcriptMarkdown, target.tokenCount)]
        ],
        input_type: "document",
        model: cfg.embeddingModel,
        output_dimension: cfg.embeddingDim
      });
      if ("detail" in result) {
        throw new Error(
          `voyage contextual embedding error: ${this.prisma.safeErrMsg(result.detail)}`
        );
      }
      const embedding = result.data[0]?.data[0]?.embedding;
      if (!embedding) {
        throw new Error("no embedding returned from contextual endpoint");
      }

      await this.prisma.updateMemoryChunkEmbeddingTyped(
        target.chunkId,
        `[${embedding.join(",")}]`
      );

      const width = target.ordinalEndExclusive - target.ordinalStart;
      const backfilled = await this.prisma.backfillMessageChunkIds(
        target.conversationId,
        target.ordinalStart,
        target.ordinalEndExclusive,
        target.chunkId
      );
      if (backfilled !== width) {
        this.logger.warn(
          {
            chunkId: target.chunkId,
            conversationId: target.conversationId,
            backfilled,
            width
          },
          "memory chunk backfill count mismatch"
        );
      }
      return true;
    } catch (err) {
      const terminal = target.retryCount + 1 >= cfg.maxEmbedRetries;
      this.logger.warn(
        {
          chunkId: target.chunkId,
          conversationId: target.conversationId,
          retryCount: target.retryCount,
          terminal,
          err: this.prisma.safeErrMsg(err)
        },
        "memory chunk embedding failed"
      );
      await this.prisma.updateMemoryChunkStateTyped(
        target.chunkId,
        terminal ? "ERROR" : "CHUNKING",
        this.prisma.safeErrMsg(err),
        true
      );
      return false;
    }
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
    for (const row of stale) {
      await this.embedAndIndexChunk({
        chunkId: row.id,
        conversationId: row.conversationId,
        ordinalStart: row.ordinalStart,
        ordinalEndExclusive: row.ordinalEndExclusive,
        transcriptMarkdown: row.transcriptMarkdown,
        tokenCount: row.tokenCount,
        retryCount: row.retryCount
      });
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
        typeof parsed.threshold === "number" ? parsed.threshold : undefined,
      include_transcript: parsed.include_transcript === true
    } satisfies ConversationMemorySearchToolInput;
  }

  public parseMemoryGetChunkInput(parsed: Record<string, unknown>) {
    const direction =
      parsed.direction === "previous" || parsed.direction === "next"
        ? parsed.direction
        : undefined;
    const includeTranscript = parsed.include_transcript !== false;

    if ("chunk_id" in parsed && typeof parsed.chunk_id === "string") {
      return {
        mode: "by_id",
        chunkId: parsed.chunk_id,
        direction,
        includeTranscript
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
        direction,
        includeTranscript
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
    if (text.length <= 600) return text;
    return `${text.slice(0, 600)} …[truncated — expand via conversation_memory_get_chunk]`;
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
      summary: r.summary,
      transcript: input.include_transcript
        ? (r.transcriptMarkdown ?? "")
        : undefined,
      excerpt: input.include_transcript
        ? undefined
        : this.memoryExcerpt(r.transcriptMarkdown),
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
    if (!base || base.storeId !== store.id || base.deletedAt != null) {
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

    const [conversationTitle, next] = await Promise.all([
      this.prisma.getConversationTitle(resolved.conversationId),
      this.prisma.findMemoryChunkByIndex(
        resolved.contextId,
        resolved.chunkIndex + 1
      )
    ]);

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
      summary: resolved.summary,
      summary_state: resolved.summaryState,
      transcript: target.includeTranscript
        ? resolved.transcriptMarkdown
        : undefined,
      has_previous: resolved.chunkIndex > 0,
      has_next: next != null
    });
  }

  // ── Summary pass (frontier vision-capable, quality over cost) ────────

  public get memorySummarizerConfig() {
    return {
      provider: "ANTHROPIC",
      model: "claude-sonnet-5",
      promptVersion: "memory-summary-v1_1",
      maxOutputTokens: 3_000,
      maxAttachmentBlocks: 8,
      sweepBatchSize: 8
    } as const satisfies MemorySummarizerConfig;
  }

  private get summarySystemPrompt() {
    return `You are the conversation-memory summarizer for a multi-provider AI chat platform. You write dense, retrieval-optimized summaries of conversation sections. These conversations are usually rich — code, architecture, documents, images, and a great deal of collaborative creative writing — and your summaries are what future searches and future model turns rely on.

What you are reading, and where it came from:
- Transcripts are rendered by the platform from stored messages. The "ordinal. model (provider) · timestamp" headers are renderer-added name tags, not model output.
- The system prompts on this platform are minimal — essentially just a notice that name tags exist in [provider/model] notation (Anthropic models get XML <model> wrappers instead, at their own request). There is no hidden persona engineering.
- Therefore: any personas, mythologies, running bits, or distinctive registers you encounter were built collaboratively by the user and the models, live, inside the conversations themselves. Never attribute them to "clever system prompting" or instructions you cannot see — there are none.

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

Output EXACTLY two tagged blocks and nothing else:
<section_summary>
Rich summary of THIS section per the mandates.
</section_summary>
<rolling_summary>
Updated whole-conversation digest: fold the prior rolling summary together with this section. Preserve earlier decisions, corrections, and canonical creative material; compress superseded detail. Keep under roughly 600 words.
</rolling_summary>` as const;
  }

  private get anthropicImageMimes() {
    return ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  }

  private attachmentUrlMime(
    att: Awaited<
      ReturnType<PrismaService["findAttachmentsByIds"]>
    >[number]
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

    const blocks = Array.of<Anthropic.Messages.ContentBlockParam>();
    if (attachmentIds.length === 0) return blocks;

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
      } else if (resolved.mime === "application/pdf") {
        blocks.push({
          type: "document",
          source: { type: "url", url: resolved.url }
        });
      }
    }
    return blocks;
  }

  private async buildSummaryContent(
    chunk: MemoryChunkAwaitingSummary,
    context: {
      conversationTitle: string | null;
      rollingSummary: string | null;
    }
  ) {
    const preamble = [
      `Conversation: ${context.conversationTitle ?? "Untitled Conversation"}`,
      `Section: messages [${chunk.ordinalStart}, ${chunk.ordinalEndExclusive}) · chunkIndex ${chunk.chunkIndex}`,
      ``,
      `Prior rolling summary:`,
      context.rollingSummary ??
        "(none yet — this is the first summarized section)",
      ``,
      `Section transcript:`,
      chunk.transcriptMarkdown
    ].join("\n");

    const blocks = Array.of<Anthropic.Messages.ContentBlockParam>();
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

  private parseSummaryOutput(raw: string) {
    const section = /<section_summary>([\s\S]*?)<\/section_summary>/
      .exec(raw)?.[1]
      ?.trim();
    const rolling = /<rolling_summary>([\s\S]*?)<\/rolling_summary>/
      .exec(raw)?.[1]
      ?.trim();
    if (section && section.length > 0) {
      return {
        sectionSummary: section,
        rollingSummary: rolling && rolling.length > 0 ? rolling : null
      } as const;
    }
    // malformed tags — take the whole output as the section summary, skip the fold
    const fallback = raw.trim();
    if (fallback.length === 0) return null;
    return { sectionSummary: fallback, rollingSummary: null } as const;
  }

  protected async summarizeChunk(chunk: MemoryChunkAwaitingSummary) {
    const cfg = this.memorySummarizerConfig;
    try {
      await this.prisma.updateMemoryChunkSummaryStateTyped(
        chunk.id,
        "SUMMARIZING",
        null
      );

      // fresh read — the rolling summary + its CAS timestamp move under us
      const context = await this.prisma.getMemoryContextById(chunk.contextId);
      if (!context) {
        throw new Error(`memory context ${chunk.contextId} missing`);
      }

      const content = await this.buildSummaryContent(chunk, context);
      const response = await this.summarizerClient.messages.create({
        model: cfg.model,
        max_tokens: cfg.maxOutputTokens,
        system: this.summarySystemPrompt,
        messages: [{ role: "user", content }]
      });
      const raw = response.content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("\n");

      const parsed = this.parseSummaryOutput(raw);
      if (!parsed) throw new Error("summarizer returned empty output");

      const sectionSummary = parsed.sectionSummary.replace(/\0/g, "");
      const rollingSummary = parsed.rollingSummary?.replace(/\0/g, "") ?? null;
      const counted = await this.voyage.countTokens(
        rollingSummary ? [sectionSummary, rollingSummary] : [sectionSummary],
        this.memoryIndexingConfig.embeddingModel
      );

      // sole READY owner — the tsv trigger refreshes searchTsv (summary at weight A)
      await this.prisma.updateMemoryChunkSummaryTyped(
        chunk.id,
        sectionSummary,
        cfg.model,
        cfg.provider,
        cfg.promptVersion,
        counted.counts[0] ?? 0
      );

      if (rollingSummary) {
        const folded = await this.prisma.foldRollingSummaryCas({
          contextId: chunk.contextId,
          expectedRollingSummaryUpdatedAt: context.rollingSummaryUpdatedAt,
          rollingSummary,
          rollingSummaryModel: cfg.model,
          rollingSummaryProvider: cfg.provider,
          rollingSummaryTokens: counted.counts[1] ?? 0
        });
        if (!folded) {
          // our rolling output embedded a stale prior — skip; the next
          // chunk's fold reads the newer state and converges
          this.logger.info(
            { contextId: chunk.contextId, chunkId: chunk.id },
            "rolling summary fold lost CAS — deferring to next fold"
          );
        }
      }
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

  /** never rejects — gated per context, sequential in chunkIndex order */
  public summarizeQueuedChunks(contextId: string) {
    const inFlight = this.summarizingInFlight.get(contextId);
    if (inFlight) return inFlight;

    const sweep = this.runSummarySweep(contextId)
      .catch((err: unknown) => {
        this.logger.warn(
          { contextId, err: this.prisma.safeErrMsg(err) },
          "memory summary sweep failed"
        );
      })
      .finally(() => {
        this.summarizingInFlight.delete(contextId);
      });
    this.summarizingInFlight.set(contextId, sweep);
    return sweep;
  }

  private async runSummarySweep(contextId: string) {
    const pending = await this.prisma.findChunksAwaitingSummary(
      contextId,
      this.memoryIndexingConfig.maxSummaryRetries,
      this.memorySummarizerConfig.sweepBatchSize
    );
    for (const chunk of pending) {
      await this.summarizeChunk(chunk);
    }
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
