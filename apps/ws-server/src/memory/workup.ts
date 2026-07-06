import { createHash } from "node:crypto";
import type { LoggerService } from "@/logger/index.ts";
import type {
  ConversationMemoryGetChunkTarget,
  ConversationMemoryIndexingConfig,
  ConversationMemorySearchScope,
  ConversationMemorySearchToolInput,
  MemoryContextRegistryEntry,
  MemoryEmbedFamilyMember,
  MemoryHybridRow,
  MemoryRangeMessage,
  MemorySectionDraft,
  MemorySectionPartition,
  RenderedMemoryMessage
} from "@/memory/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { VoyageEmbeddingService } from "@/voyage/index.ts";
import type { Logger as PinoLogger } from "pino";
import type { $Enums } from "@slipstream/db/node/generated/client";

export class ConversationMemoryWorkupService {
  protected logger: PinoLogger;

  // ── Registries ───────────────────────────────────────────────────────

  /** userId → memory storeId (ConversationMemoryStore.userId is @unique; immutable once created) */
  public memoryStoreRegistry = new Map<string, string>();

  /** conversationId → { contextId, storeId } — immutable ids only; the watermark lives in the DB */
  public contextRegistry = new Map<string, MemoryContextRegistryEntry>();

  constructor(
    logger: LoggerService,
    protected voyage: VoyageEmbeddingService,
    protected prisma: PrismaService
  ) {
    this.logger = logger
      .getPinoInstance()
      .child({ node_version: process.version }, { msgPrefix: "[memory] " });
  }

  // ── Config ───────────────────────────────────────────────────────────

  public get memoryIndexingConfig() {
    return {
      messageThreshold: 12,
      // 0 = indexing chases the conversation tip; the sectioner's
      // minSectionTokens band is the natural "not a decent chunk yet"
      // holdback. Recency staging lives at ASSEMBLY (liveWindowMessages,
      // Part II §1) — not here.
      indexingHorizonOffset: 0,
      targetSectionTokens: 8_000,
      maxSectionTokens: 24_000,
      minSectionTokens: 2_000,
      headingTokenAllowance: 16,
      embedInputCeilingTokens: 30_000,
      // a sliver under the probed caps: boundary semantics at exactly-32k/120k
      // are unprobed, and a boundary 400 can't self-heal (reclaim repacks the
      // identical family) — Flowchart's real counts hit 32,000 on the nose
      familyTokenBudget: 31_900,
      requestTokenBudget: 119_500,
      staleClaimMinutes: 10,
      staleSummaryMinutes: 30,
      maxEmbedRetries: 3,
      maxSummaryRetries: 2,
      embeddingModel: "voyage-context-4",
      embeddingDim: 1024,
      schemaVersion: "v1_0"
    } as const satisfies ConversationMemoryIndexingConfig;
  }

  // ── Ensure (registry → db check → create) ────────────────────────────

  public async ensureMemoryStore(userId: string) {
    const cached = this.memoryStoreRegistry.get(userId);
    if (cached) return cached;

    const existing = await this.prisma.getMemoryStore(userId);
    if (existing) {
      this.memoryStoreRegistry.set(userId, existing.id);
      return existing.id;
    }

    const created = await this.prisma.createMemoryStore({
      userId,
      embeddingModel: this.memoryIndexingConfig.embeddingModel,
      embeddingDim: this.memoryIndexingConfig.embeddingDim,
      schemaVersion: this.memoryIndexingConfig.schemaVersion
    });
    this.memoryStoreRegistry.set(userId, created.id);
    return created.id;
  }

  /** `created` feeds store counter deltas (totalConversations) in the orchestration layer */
  public async ensureMemoryContext(
    conversationId: string,
    userId: string,
    conversationTitle?: string | null
  ) {
    const cached = this.contextRegistry.get(conversationId);
    if (cached) return { ...cached, created: false };

    const storeId = await this.ensureMemoryStore(userId);
    const existing = await this.prisma.getMemoryContext(conversationId);
    if (existing) {
      const entry = {
        contextId: existing.id,
        storeId: existing.storeId
      } satisfies MemoryContextRegistryEntry;
      this.contextRegistry.set(conversationId, entry);
      return { ...entry, created: false };
    }

    const created = await this.prisma.createMemoryContext({
      storeId,
      conversationId,
      conversationTitle: conversationTitle ?? null,
      schemaVersion: this.memoryIndexingConfig.schemaVersion
    });
    const entry = {
      contextId: created.id,
      storeId
    } satisfies MemoryContextRegistryEntry;
    this.contextRegistry.set(conversationId, entry);
    return { ...entry, created: true };
  }

  // ── Provenance ───────────────────────────────────────────────────────

  /** "${conversationId}-${ordinalStart}-${ordinalEndExclusive}-${schemaVersion}" (cuid2 has no dashes; parsing is unambiguous) */
  public buildMemoryProvenanceId(
    conversationId: string,
    ordinalStart: number,
    ordinalEndExclusive: number,
    schemaVersion: $Enums.MemorySchemaVersion = this.memoryIndexingConfig
      .schemaVersion
  ) {
    return `${conversationId}-${ordinalStart}-${ordinalEndExclusive}-${schemaVersion}` as const;
  }

  // ── Renderer (memory-transcript-v1_0) ────────────────────────────────

  private get providerLookup() {
    return {
      ANTHROPIC: "anthropic",
      COHERE: "cohere",
      DEEPSEEK: "deepseek",
      GEMINI: "gemini",
      GROK: "grok",
      META: "meta",
      MISTRAL: "mistral",
      MOONSHOTAI: "moonshotai",
      OPENAI: "openai",
      VERCEL: "vercel",
      ZAI: "zai",
      ALIBABA: "alibaba",
      MINIMAX: "minimax",
      SAKANA: "sakana"
    } as const satisfies Record<$Enums.Provider, Lowercase<$Enums.Provider>>;
  }

  protected memoryProviderDisplay(provider: $Enums.Provider) {
    const lower = this.providerLookup[provider];
    return lower === "grok" ? "xai" : lower === "gemini" ? "google" : lower;
  }

  /**
   * Postgres text rejects \0 outright (the claim insert would fail, not
   * just to_tsvector), and persisted ANTHROPIC content can carry history-format
   * <model provider="..." name="..."> wrappers that would poison the tsv.
   */
  protected sanitizeMemoryContent(content: string, provider: $Enums.Provider) {
    const nullByteFree = content.replace(/\0/g, "");
    if (provider === "ANTHROPIC") {
      return nullByteFree
        .replace(/<model\s+provider="[^"]*"\s+name="[^"]*"\s*>/g, "")
        .replace(/<\/model>/g, "")
        .trim();
    }
    return nullByteFree;
  }

  protected attachmentProvenanceOrNull(
    att: MemoryRangeMessage["attachments"][number]
  ) {
    // toVectorStoreFilename throws on these — guard its preconditions, don't catch
    if (!att.cdnUrl || !att.conversationId || !att.messageId) return null;
    if (att.compatStatus !== "ACTIVE" && att.compatStatus !== "ALIASED") {
      return null;
    }
    return this.prisma.toVectorStoreFilename({
      ...att,
      size: att.size == null ? null : Number(att.size)
    });
  }

  protected renderMemoryMessage(
    msg: MemoryRangeMessage,
    includeThinking = false
  ) {
    const textParts = Array.of<string>();
    const thinkingParts = Array.of<string>();
    let thinkingDurMs = 0;

    for (const block of msg.messageBlocks) {
      if (block.type === "TEXT") {
        textParts.push(this.sanitizeMemoryContent(block.content, msg.provider));
      } else if (block.type === "THINKING") {
        thinkingDurMs += block.durationMs;
        if (includeThinking) {
          thinkingParts.push(
            this.sanitizeMemoryContent(block.content, msg.provider)
          );
        }
      } else {
        // ENCRYPTED_THINKING never renders — ciphertext is store-only
        thinkingDurMs += block.durationMs;
      }
    }

    // deprecated Message.content is the fallback for pre-block rows
    const content =
      textParts.length > 0
        ? textParts.join("\n")
        : this.sanitizeMemoryContent(msg.content, msg.provider);

    const attachmentLines = Array.of<string>();
    const attachmentProvenanceIds = Array.of<string>();
    for (const att of msg.attachments) {
      const provenance = this.attachmentProvenanceOrNull(att);
      if (provenance) {
        attachmentProvenanceIds.push(provenance);
        attachmentLines.push(
          `[attachment: ${att.filename ?? provenance} → userStore:${provenance}]`
        );
      } else {
        attachmentLines.push(
          `[attachment: ${att.filename ?? att.assetType.toLowerCase()}]`
        );
      }
    }

    // the rendered number IS the 0-based db ordinal — the machine key
    const header =
      msg.senderType === "AI"
        ? `${msg.ordinal}. ${msg.model ?? "unknown-model"} (${this.memoryProviderDisplay(msg.provider)})`
        : msg.senderType === "USER"
          ? `${msg.ordinal}. user`
          : `${msg.ordinal}. system`;

    const thinkingSegment =
      includeThinking && thinkingParts.length > 0
        ? `*thought for ${(thinkingDurMs / 1000).toFixed(1)}s*\n\n${thinkingParts.join("\n")}\n\n`
        : "";

    const attachmentSegment =
      attachmentLines.length > 0 ? `\n\n${attachmentLines.join("\n")}` : "";

    const markdown = `${header} · ${msg.createdAt.toISOString()}\n\n${thinkingSegment}${content}${attachmentSegment}\n`;

    return {
      ordinal: msg.ordinal,
      messageId: msg.id,
      markdown,
      createdAt: msg.createdAt,
      provider: msg.provider,
      model: msg.model,
      senderType: msg.senderType,
      attachmentCount: msg.attachments.length,
      attachmentProvenanceIds
    } satisfies RenderedMemoryMessage;
  }

  public renderMemoryRange(
    messages: readonly MemoryRangeMessage[],
    includeThinking = false
  ) {
    return messages.map(msg => this.renderMemoryMessage(msg, includeThinking));
  }

  protected sectionHeading(
    conversationTitle: string | null | undefined,
    ordinalStart: number,
    ordinalEndExclusive: number
  ) {
    return `### ${conversationTitle ?? "Untitled Conversation"} — messages [${ordinalStart}, ${ordinalEndExclusive})\n\n`;
  }

  // ── Exact token counting (one batched bridge call, prefix sums) ──────

  public async countRenderedTokens(rendered: readonly RenderedMemoryMessage[]) {
    if (rendered.length === 0) {
      return { counts: Array.of<number>(), prefix: [0] };
    }
    const result = await this.voyage.countTokens(
      rendered.map(r => r.markdown),
      this.memoryIndexingConfig.embeddingModel
    );
    if (result.counts.length !== rendered.length) {
      throw new Error(
        `voyage tokenize returned ${result.counts.length} counts for ${rendered.length} rendered messages`
      );
    }
    const prefix = Array.of<number>(0);
    for (const count of result.counts) {
      const current = this.readArrayValue(
        prefix,
        prefix.length - 1,
        "prefixTokenCounts"
      );
      prefix.push(current + count);
    }
    return { counts: result.counts, prefix };
  }

  // ── DP sectioner (token-based port of the transcript-gen partitioner) ─

  private readArrayValue<T>(
    values: readonly T[],
    index: number,
    arrayName: string
  ) {
    const value = values[index];
    if (typeof value === "undefined") {
      throw new Error(`${arrayName}[${index}] is undefined`);
    }
    return value;
  }

  protected sectionPenalty(tokenCount: number) {
    const { maxSectionTokens, minSectionTokens, targetSectionTokens } =
      this.memoryIndexingConfig;
    const distanceFromTarget = Math.abs(targetSectionTokens - tokenCount);
    const bandPenalty =
      tokenCount < minSectionTokens
        ? minSectionTokens - tokenCount
        : tokenCount > maxSectionTokens
          ? tokenCount - maxSectionTokens
          : 0;

    return distanceFromTarget * 10 + bandPenalty;
  }

  protected sectionTokenCount(
    prefixTokenCounts: readonly number[],
    startIdx: number,
    endIdxExclusive: number
  ) {
    const messageCount = endIdxExclusive - startIdx;
    const messageTokens =
      this.readArrayValue(
        prefixTokenCounts,
        endIdxExclusive,
        "prefixTokenCounts"
      ) - this.readArrayValue(prefixTokenCounts, startIdx, "prefixTokenCounts");
    const separatorTokens = messageCount > 0 ? messageCount - 1 : 0;

    return (
      this.memoryIndexingConfig.headingTokenAllowance +
      messageTokens +
      separatorTokens
    );
  }

  public partitionMemorySections(
    rendered: readonly RenderedMemoryMessage[],
    prefixTokenCounts: readonly number[]
  ) {
    if (rendered.length === 0) return Array.of<MemorySectionPartition>();

    const bestCosts = Array.from(
      { length: rendered.length + 1 },
      () => Number.POSITIVE_INFINITY
    );
    const partCounts = Array.from(
      { length: rendered.length + 1 },
      () => Number.POSITIVE_INFINITY
    );
    const previousSplitIdxs = Array.from(
      { length: rendered.length + 1 },
      () => -1
    );

    bestCosts[0] = 0;
    partCounts[0] = 0;

    for (
      let endIdxExclusive = 1;
      endIdxExclusive <= rendered.length;
      ++endIdxExclusive
    ) {
      for (let startIdx = 0; startIdx < endIdxExclusive; ++startIdx) {
        const priorCost = this.readArrayValue(bestCosts, startIdx, "bestCosts");
        if (!Number.isFinite(priorCost)) continue;
        const priorPartCount = this.readArrayValue(
          partCounts,
          startIdx,
          "partCounts"
        );
        const tokenCount = this.sectionTokenCount(
          prefixTokenCounts,
          startIdx,
          endIdxExclusive
        );
        const candidateCost = priorCost + this.sectionPenalty(tokenCount);
        const candidatePartCount = priorPartCount + 1;
        const currentBestCost = this.readArrayValue(
          bestCosts,
          endIdxExclusive,
          "bestCosts"
        );
        const currentBestPartCount = this.readArrayValue(
          partCounts,
          endIdxExclusive,
          "partCounts"
        );
        const shouldUseCandidate =
          candidateCost < currentBestCost ||
          (candidateCost === currentBestCost &&
            candidatePartCount < currentBestPartCount);

        if (!shouldUseCandidate) continue;
        bestCosts[endIdxExclusive] = candidateCost;
        partCounts[endIdxExclusive] = candidatePartCount;
        previousSplitIdxs[endIdxExclusive] = startIdx;
      }
    }

    const reversedPartitions = Array.of<MemorySectionPartition>();
    let cursor = rendered.length;

    while (cursor > 0) {
      const startIdx = this.readArrayValue(
        previousSplitIdxs,
        cursor,
        "previousSplitIdxs"
      );
      if (startIdx < 0) {
        throw new Error(
          `unable to partition memory sections ending at rendered index ${cursor}`
        );
      }

      reversedPartitions.push({
        startIdx,
        endIdxExclusive: cursor,
        dpTokenCount: this.sectionTokenCount(
          prefixTokenCounts,
          startIdx,
          cursor
        )
      });
      cursor = startIdx;
    }

    return reversedPartitions.reverse();
  }

  /**
   * The trailing partition below minSectionTokens stays unclaimed — the tail
   * accumulates more messages and gets sectioned on a later pass. Middle
   * partitions always claim (the watermark chain cannot skip ranges).
   */
  protected dropSubMinimumTail(partitions: readonly MemorySectionPartition[]) {
    if (partitions.length === 0) return Array.of<MemorySectionPartition>();
    const tail = this.readArrayValue(
      partitions,
      partitions.length - 1,
      "partitions"
    );
    if (tail.dpTokenCount < this.memoryIndexingConfig.minSectionTokens) {
      return partitions.slice(0, -1);
    }
    return [...partitions];
  }

  // ── Section assembly ─────────────────────────────────────────────────

  private buildSectionTranscript(
    conversationTitle: string | null | undefined,
    rendered: readonly RenderedMemoryMessage[],
    partition: MemorySectionPartition
  ) {
    const slice = rendered.slice(partition.startIdx, partition.endIdxExclusive);
    const first = this.readArrayValue(slice, 0, "sectionSlice");
    const last = this.readArrayValue(slice, slice.length - 1, "sectionSlice");
    const heading = this.sectionHeading(
      conversationTitle,
      first.ordinal,
      last.ordinal + 1
    );
    return `${heading}${slice.map(r => r.markdown).join("\n")}`;
  }

  private sectionProviderModelsRaw(slice: readonly RenderedMemoryMessage[]) {
    const seen = new Set<string>();
    for (const r of slice) {
      if (r.senderType !== "AI") continue;
      seen.add(`${r.provider}:${r.model ?? "unknown-model"}`);
    }
    return Array.from(seen).join("::");
  }

  /**
   * rendered range → claimable MemorySectionDraft[] (pure — no DB writes).
   * Two batched exact-count bridge calls total: per-message counts drive DP
   * boundaries; assembled-transcript counts become the stored tokenCounts.
   */
  public async sectionizeRenderedRange(params: {
    conversationId: string;
    conversationTitle?: string | null;
    rendered: readonly RenderedMemoryMessage[];
    includesThinking?: boolean;
    schemaVersion?: $Enums.MemorySchemaVersion;
  }) {
    const {
      conversationId,
      conversationTitle,
      rendered,
      schemaVersion = this.memoryIndexingConfig.schemaVersion
    } = params;

    if (rendered.length === 0) return Array.of<MemorySectionDraft>();

    const { prefix } = await this.countRenderedTokens(rendered);
    const partitions = this.dropSubMinimumTail(
      this.partitionMemorySections(rendered, prefix)
    );
    if (partitions.length === 0) return Array.of<MemorySectionDraft>();

    const transcripts = partitions.map(partition =>
      this.buildSectionTranscript(conversationTitle, rendered, partition)
    );
    const exact = await this.voyage.countTokens(
      transcripts,
      this.memoryIndexingConfig.embeddingModel
    );
    if (exact.counts.length !== transcripts.length) {
      throw new Error(
        `voyage tokenize returned ${exact.counts.length} counts for ${transcripts.length} section transcripts`
      );
    }

    const drafts = Array.of<MemorySectionDraft>();
    for (const [relativeIndex, partition] of partitions.entries()) {
      const slice = rendered.slice(
        partition.startIdx,
        partition.endIdxExclusive
      );
      const first = this.readArrayValue(slice, 0, "sectionSlice");
      const last = this.readArrayValue(slice, slice.length - 1, "sectionSlice");
      const transcriptMarkdown = this.readArrayValue(
        transcripts,
        relativeIndex,
        "sectionTranscripts"
      );
      const tokenCount = this.readArrayValue(
        exact.counts,
        relativeIndex,
        "sectionTokenCounts"
      );

      const ordinalStart = first.ordinal;
      const ordinalEndExclusive = last.ordinal + 1;
      const attachmentProvenanceIds = slice.flatMap(
        r => r.attachmentProvenanceIds
      );
      const attachmentCount = slice.reduce(
        (sum, r) => sum + r.attachmentCount,
        0
      );

      drafts.push({
        relativeIndex,
        provenanceId: this.buildMemoryProvenanceId(
          conversationId,
          ordinalStart,
          ordinalEndExclusive,
          schemaVersion
        ),
        conversationId,
        ordinalStart,
        ordinalEndExclusive,
        messageIdStart: first.messageId,
        messageIdEnd: last.messageId,
        messageTimestampStart: first.createdAt,
        messageTimestampEnd: last.createdAt,
        transcriptMarkdown,
        contentHash: createHash("sha256")
          .update(
            `${transcriptMarkdown}:${ordinalStart}:${ordinalEndExclusive}:${schemaVersion}`
          )
          .digest("hex"),
        chunkedMessagesCount: slice.length,
        tokenCount,
        providerModelsRaw: this.sectionProviderModelsRaw(slice),
        hasAttachments: attachmentCount > 0,
        chunkedAttachmentsCount: attachmentCount > 0 ? attachmentCount : null,
        attachmentProvenanceIdsRaw:
          attachmentProvenanceIds.length > 0
            ? attachmentProvenanceIds.join("::")
            : null,
        boundaryReason:
          tokenCount >= this.memoryIndexingConfig.maxSectionTokens
            ? "TOKEN_LIMIT"
            : "MESSAGE_COUNT",
        exceedsEmbedCeiling:
          tokenCount > this.memoryIndexingConfig.embedInputCeilingTokens
      } satisfies MemorySectionDraft);
    }

    return drafts;
  }

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
    const conversationTitle =
      typeof parsed.conversation_title === "string"
        ? parsed.conversation_title.trim().slice(0, 200) || undefined
        : undefined;
    return {
      query: parsed.query.trim(),
      search_terms:
        typeof parsed.search_terms === "string"
          ? parsed.search_terms.trim() || undefined
          : undefined,
      // providing a title IS the opt-in to broad reunification — it implies
      // all_conversations regardless of the scope the model passed
      scope:
        parsed.scope === "all_conversations" || conversationTitle
          ? ("all_conversations" as const)
          : ("current_conversation" as const),
      conversation_title: conversationTitle,
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

  private memoryExcerpt(transcriptMarkdown: string | null) {
    const text = transcriptMarkdown ?? "";
    if (text.length <= 1200) return text;
    return `${text.slice(0, 1200)} …[truncated — expand via conversation_memory_get_chunk]`;
  }

  protected formatMemoryResults(
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
  /**
   * Truncates the EMBED INPUT only for over-ceiling sections — the full
   * transcript is already persisted on the row; the fulltext lane and the
   * summary pass see everything, only the vector is lossy.
   */
  protected embedInputFor(transcriptMarkdown: string, tokenCount: number) {
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
  protected packEmbedFamilies(members: readonly MemoryEmbedFamilyMember[]) {
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
  protected packEmbedRequests(families: readonly MemoryEmbedFamilyMember[][]) {
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

  protected async recordPassAggregates(
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
