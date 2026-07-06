import type { AnthropicSummarizerService } from "@/anthropic/summarizer.ts";
import type { LoggerService } from "@/logger/index.ts";
import type {
  ConversationMemoryGetChunkTarget,
  ConversationMemorySearchToolInput,
  MemoryAssemblyConfig,
  MemoryAssemblyPlan,
  MemoryChunkAwaitingSummary,
  MemoryEmbedFamilyMember,
  MemoryHybridRow,
  MemorySectionDraft,
  MemorySubstitutableChunk,
  MemorySummarizerConfig
} from "@/memory/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { FileSearchToolInput } from "@/store/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { VoyageEmbeddingService } from "@/voyage/index.ts";
import type { Anthropic } from "@anthropic-ai/sdk";
import { ConversationMemoryWorkupService } from "@/memory/workup.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

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
    // the horizon trails the conversation tip — the newest ordinals stay
    // live/verbatim and sections never chase the active exchange
    const horizonExclusive = Math.max(
      0,
      maxOrdinalExclusive - cfg.indexingHorizonOffset
    );
    const unindexed = horizonExclusive - watermark;

    if (unindexed < cfg.messageThreshold) {
      await this.reclaimStaleClaims(ensured.storeId);
      // backlog sweep — summaries queued by a crashed instance or prior pass
      void this.summarizeQueuedChunks(ensured.contextId);
      return;
    }

    const messages = await this.prisma.getMessagesByOrdinalRange(
      conversationId,
      watermark,
      horizonExclusive
    );
    if (messages.length !== unindexed) {
      // density is checked, never assumed — a concurrent-persist ordinal
      // collision or future delete feature would surface here
      this.logger.warn(
        {
          conversationId,
          watermark,
          horizonExclusive,
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
        // dead-end notes lose models — point at the escape hatch with proof
        return this.formatMemoryResults([], input, scope, threshold, {
          note:
            `nothing indexed for THIS conversation yet (older sections index automatically as it grows) — ` +
            `but ${store.totalChunks} indexed section(s) exist across the user's other conversations; ` +
            `retry with scope: "all_conversations" to search them`
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

  // ── Substitution assembly (provider payload only — db rows/ordinals untouched) ─

  public get memoryAssemblyConfig() {
    return {
      enabled: true,
      foundingWindowMessages: 30,
      liveWindowMessages: 30
    } as const satisfies MemoryAssemblyConfig;
  }

  /**
   * The substitution plan for one conversation's provider history: every READY
   * section between the founding window and the live-window floor, gap-tolerant
   * and name-tagged. Returns null when assembly is off, the conversation is too
   * short for a substitutable middle, or nothing in it is summarized yet.
   *
   * Prompt-cache stability: substitution text is keyed to immutable READY
   * chunks, so the prefix changes only when a new summary lands below the
   * floor — never per-message.
   */
  public async getHistoryAssemblyPlan(
    conversationId: string,
    maxOrdinalExclusive: number
  ) {
    const cfg = this.memoryAssemblyConfig;
    if (!cfg.enabled) return null;
    const foundingCeilingExclusive = cfg.foundingWindowMessages;
    const liveWindowFloor = maxOrdinalExclusive - cfg.liveWindowMessages;
    // no substitutable middle until the conversation outgrows both anchors
    if (liveWindowFloor <= foundingCeilingExclusive) return null;

    const candidates = await this.prisma.findSubstitutableChunks(
      conversationId,
      liveWindowFloor
    );
    // a section entirely inside the founding window never substitutes —
    // verbatim wins at the charter end
    const substitutions = candidates.filter(
      s => s.ordinalEndExclusive > foundingCeilingExclusive
    );
    if (substitutions.length === 0) return null;

    return {
      foundingCeilingExclusive,
      liveWindowFloor,
      substitutions
    } satisfies MemoryAssemblyPlan;
  }

  /** the [provider/model] name tag for a substituted section — the fleet notation */
  public substitutionNameTag(sub: MemorySubstitutableChunk) {
    const provider = sub.summaryProvider?.toLowerCase() ?? "unknown";
    const model = sub.summaryModel ?? "unknown";
    return `[${provider}/${model}]` as const;
  }

  /** the canonical substituted-section text — name-tagged, ordinal-range prefixed */
  public substitutionBlockText(sub: MemorySubstitutableChunk) {
    return `${this.substitutionNameTag(sub)} conversation memory · messages [${sub.ordinalStart}-${sub.ordinalEndExclusive - 1}]:\n${sub.summary ?? ""}`;
  }

  /**
   * The per-request assembly view every provider formatter drives its history
   * loop with. One call per ordinal: `claim(ordinal)` returns
   *   - `null` → not covered; render the message verbatim
   *   - `{ emit: string }` → first covered ordinal of a section; push the
   *     block as an assistant turn and drop the message
   *   - `{ emit: null }` → interior of an already-emitted section; drop the
   *     message
   * The founding-window exemption is baked into the coverage map (ordinals
   * below the ceiling are never mapped), so emission lands at each section's
   * first non-exempt covered ordinal with no formatter-side special-casing.
   */
  public async getHistoryAssemblyView(
    conversationId: string | undefined,
    maxOrdinalExclusive: number
  ) {
    if (!conversationId) return null;
    const plan = await this.getHistoryAssemblyPlan(
      conversationId,
      maxOrdinalExclusive
    );
    if (!plan) return null;

    const subByOrdinal = new Map<number, MemorySubstitutableChunk>();
    for (const sub of plan.substitutions) {
      const from = Math.max(sub.ordinalStart, plan.foundingCeilingExclusive);
      for (let o = from; o < sub.ordinalEndExclusive; o++) {
        subByOrdinal.set(o, sub);
      }
    }
    const emitted = new Set<string>();

    return {
      claim: (ordinal: number) => {
        const sub = subByOrdinal.get(ordinal);
        if (!sub) return null;
        if (emitted.has(sub.id)) return { emit: null } as const;
        emitted.add(sub.id);
        return { emit: this.substitutionBlockText(sub) } as const;
      }
    };
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
      // fleet default is 10 (deepseek gets 15) — if 8 rounds of foraging
      // produces a higher-fidelity summary then by all means; knowledge is king
      maxToolUseRounds: 10,
      callDeadlineMs: 900_000,
      foldInputBudgetTokens: 130_000,
      sweepBatchSize: 8
    } as const satisfies MemorySummarizerConfig;
  }

  private get summarySystemPrompt() {
    // prettier-ignore
    return `Write a high-fidelity, retrieval-friendly synopsis that preserves the integrity and character of the source material. Output only the synopsis — plain markdown, no preamble. Avoid lazy verbiage like "recurring bit" as it can read as dismissive and undermine the authorial integrity of the content. This should be approached as if you're writing a synopsis for a professional transcript. Prefer message ordinals for citations. The file_search tool provides access to a provider-agnostic user vector store as needed.

The System prompt given to all models in the source material being summarized is as follows: "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.\nOlder messages are made searchable via tooling to keep things light."` as const;
  }

  private get foldSystemPrompt() {
    // prettier-ignore
    return `Write the updated whole-conversation digest — a high-fidelity synopsis of the conversation so far that preserves the integrity and character of the source material. Output only the digest — plain markdown, no preamble. Prefer message ordinals for citations. Let the digest grow in proportion to the conversation — completeness outranks brevity.

You receive the complete set of section summaries in conversation order (secondary sources) plus the prior digest for continuity. When the conversation extends beyond the last summarized section, the un-sectioned live tail follows as a firsthand transcript — cover it in the digest too; it is primary source already in hand, and nothing exists beyond it. The firsthand transcripts behind the summaries are one call away: conversation_memory_get_chunk retrieves any section's full transcript (conversation_id + ordinal), conversation_memory_search searches them, and file_search reaches the user's uploaded archive — if a model searched for terms with success in the conversation, you can too. Prefer primary sources for anything you quote or that carries weight.

The System prompt given to all models in the source material being summarized is as follows: "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.\nOlder messages are made searchable via tooling to keep things light."` as const;
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

  /** the conversation's own indexed history offered to the fold — the digest's primary sources */
  private get summarizerMemorySearchTool(): Anthropic.Beta.BetaToolUnion {
    return {
      name: "conversation_memory_search",
      description:
        "Search the user's indexed conversation history — firsthand transcript sections. " +
        "Semantic similarity by default; search_terms adds exact-match fulltext (partitioned semantic + fulltext + overlap). " +
        "scope 'current_conversation' (default) reaches this conversation's indexed sections; 'all_conversations' reaches the user's entire history.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The semantic search query"
          },
          search_terms: {
            type: "string",
            description:
              "Optional exact-match terms for fulltext search (quoted phrases, -negation)"
          },
          scope: {
            type: "string",
            enum: ["current_conversation", "all_conversations"],
            description: "Search scope (default current_conversation)"
          },
          max_results: {
            type: "number",
            description: "Maximum results to return (1-25, default 5)"
          }
        },
        required: ["query"]
      }
    } satisfies Anthropic.Beta.BetaToolUnion;
  }

  private get summarizerMemoryGetChunkTool(): Anthropic.Beta.BetaToolUnion {
    return {
      name: "conversation_memory_get_chunk",
      description:
        "Retrieve a section's FULL firsthand transcript by chunk_id (from a search result) or by conversation_id + ordinal (any message ordinal the section covers). " +
        "direction 'previous'/'next' walks to a neighboring section from the resolved one.",
      input_schema: {
        type: "object" as const,
        properties: {
          chunk_id: {
            type: "string",
            description: "Section id from a search result"
          },
          conversation_id: {
            type: "string",
            description: "Conversation id (pair with ordinal)"
          },
          ordinal: {
            type: "number",
            description: "Any message ordinal the section covers"
          },
          direction: {
            type: "string",
            enum: ["previous", "next"],
            description: "Optional neighbor walk from the resolved section"
          }
        }
      }
    } satisfies Anthropic.Beta.BetaToolUnion;
  }

  private isToolInputRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value != null && !Array.isArray(value);
  }

  /** mirror of the chat path's tool executors, scoped to the summarized conversation's owner */
  private async executeSummarizerToolCall(
    userId: string,
    conversationId: string,
    name: string,
    input: unknown
  ) {
    if (name === "conversation_memory_search") {
      if (!this.isToolInputRecord(input)) {
        throw new Error(
          `conversation_memory_search input malformed: ${JSON.stringify(input)}`
        );
      }
      return await this.searchMemoryFromToolInput(userId, conversationId, input);
    }
    if (name === "conversation_memory_get_chunk") {
      if (!this.isToolInputRecord(input)) {
        throw new Error(
          `conversation_memory_get_chunk input malformed: ${JSON.stringify(input)}`
        );
      }
      return await this.getMemoryChunkFromToolInput(userId, input);
    }
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
      return this.userStore.formatPartitionedResults(partitioned, parsed.query);
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
          this.executeSummarizerToolCall(
            userId,
            chunk.conversationId,
            name,
            input
          ),
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
        // dry — the whole-backlog digest folds now (no-ops unless new
        // summaries landed since the fold watermark)
        void this.foldRollingSummaryForContext(contextId);
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
    // self-continuation — the sweepBatchSize cap must never strand a backlog
    // (the ordinal-57 stall); ERROR-at-cap chunks fall out of the finder, so
    // the chain terminates. The dry dispatch fires the digest fold over the
    // WHOLE backlog — never per-wave slices.
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
   * Fold-when-dry: fires from the empty dispatch branch once a backlog chain
   * exhausts (and on any sub-threshold tick — the staleness check makes it a
   * no-op unless new summaries landed). The digest re-mints from the COMPLETE
   * section-summary corpus — one level of meta, never a fold of folds — with
   * the prior digest as continuity reference and the firsthand transcripts
   * one tool call away. rollingSummaryUpdatedAt advances to the max folded
   * summaryGeneratedAt (a fold watermark), so sections landing mid-fold
   * surface on the next check instead of slipping through.
   */
  private async foldRollingSummaryForContext(contextId: string) {
    const cfg = this.memorySummarizerConfig;
    try {
      const context = await this.prisma.getMemoryContextById(contextId);
      if (!context) return;
      const behind = await this.prisma.hasUnfoldedSummaries(
        contextId,
        context.rollingSummaryUpdatedAt
      );
      if (!behind) return;
      const sections = await this.prisma.findReadySummariesForFold(contextId);
      if (sections.length === 0) return;
      const userId = context.memoryStore.userId;

      // the un-sectioned live tail — the fold's captured reasoning showed it
      // burning thinking tokens hunting for exactly this range; hand it over
      // firsthand instead (exclusively the rolling-summary model's input)
      const maxOrdinalExclusive = await this.prisma.getMaxOrdinalExclusive(
        context.conversationId
      );
      const tailStart = context.lastIndexedOrdinalExclusive;
      let tailBlock: string | null = null;
      if (maxOrdinalExclusive > tailStart) {
        const tailMessages = await this.prisma.getMessagesByOrdinalRange(
          context.conversationId,
          tailStart,
          maxOrdinalExclusive
        );
        if (tailMessages.length > 0) {
          tailBlock = this.renderMemoryRange(tailMessages)
            .map(r => r.markdown)
            .join("\n\n");
        }
      }

      // exact-count budget gate — a fold overflow is non-self-healing (the
      // identical corpus re-folds into the identical 400 every dry tick), so
      // the input is measured BEFORE any state transition: over budget drops
      // the tail first, then defers the fold entirely
      const sectionsTokens = sections.reduce(
        (acc, s) => acc + s.summaryTokens,
        0
      );
      const digestTokens = context.rollingSummaryTokens;
      let tailTokens = 0;
      if (tailBlock) {
        const counted = await this.voyage.countTokens(
          [tailBlock],
          this.memoryIndexingConfig.embeddingModel
        );
        tailTokens = counted.counts[0] ?? 0;
      }
      let tailOmitted = false;
      if (
        tailBlock &&
        sectionsTokens + digestTokens + tailTokens > cfg.foldInputBudgetTokens
      ) {
        tailBlock = null;
        tailOmitted = true;
      }
      if (sectionsTokens + digestTokens > cfg.foldInputBudgetTokens) {
        this.logger.warn(
          {
            contextId,
            sectionsTokens,
            digestTokens,
            budget: cfg.foldInputBudgetTokens
          },
          "fold input exceeds budget even without the tail — deferring"
        );
        return;
      }

      await this.prisma.setRollingSummaryState(contextId, "SUMMARIZING");

      const parts = Array.of<string>();
      parts.push(
        `Conversation: ${context.conversationTitle ?? "Untitled Conversation"} (conversation_id: ${context.conversationId})`,
        ``,
        `Prior digest (continuity reference — you are re-minting the whole digest, not appending):`,
        context.rollingSummary ?? "(none yet — this is the first digest)",
        ``,
        `Section summaries, in conversation order:`
      );
      for (const section of sections) {
        if (section.summary == null || section.summary.length === 0) continue;
        parts.push(
          ``,
          `## messages [${section.ordinalStart}, ${section.ordinalEndExclusive})`,
          section.summary
        );
      }
      if (tailBlock) {
        parts.push(
          ``,
          `Live tail — messages [${tailStart}, ${maxOrdinalExclusive}) are not yet sectioned; firsthand transcript follows (complete — nothing exists beyond it):`,
          tailBlock
        );
      } else if (tailOmitted) {
        parts.push(
          ``,
          `(live tail omitted this fold — input budget; covered next cycle)`
        );
      }

      const result = await this.summarizer.streamSummaryMessage({
        model: cfg.model,
        maxOutputTokens: cfg.maxOutputTokens,
        effort: cfg.effort,
        system: this.foldSystemPrompt,
        content: [{ type: "text", text: parts.join("\n") }],
        tools: [
          this.summarizerFileSearchTool,
          this.summarizerMemorySearchTool,
          this.summarizerMemoryGetChunkTool
        ],
        executeToolCall: (name, input) =>
          this.executeSummarizerToolCall(
            userId,
            context.conversationId,
            name,
            input
          ),
        maxToolUseRounds: cfg.maxToolUseRounds,
        callDeadlineMs: cfg.callDeadlineMs
      });
      const folded = this.sanitizeSummaryOutput(result.text);
      if (!folded) throw new Error("fold call returned empty output");

      const counted = await this.voyage.countTokens(
        [folded],
        this.memoryIndexingConfig.embeddingModel
      );
      // fold watermark: the newest summaryGeneratedAt this digest covers
      let foldedThrough = new Date(0);
      for (const section of sections) {
        if (
          section.summaryGeneratedAt &&
          section.summaryGeneratedAt > foldedThrough
        ) {
          foldedThrough = section.summaryGeneratedAt;
        }
      }
      if (foldedThrough.getTime() === 0) foldedThrough = new Date(Date.now());

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
        rollingSummaryReasoningVersion: cfg.foldPromptVersion,
        foldedThroughGeneratedAt: foldedThrough
      });
      if (!landed) {
        // another instance's fold landed first — its CAS write owns the
        // READY state and the fresher digest; ours is discarded
        this.logger.info(
          { contextId, sections: sections.length },
          "digest fold lost CAS — deferring to the next dry tick"
        );
      }
    } catch (err) {
      this.logger.warn(
        { contextId, err: this.prisma.safeErrMsg(err) },
        "digest fold failed"
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
}

//   private get vGemini() {
//     return `Write a high-fidelity, retrieval-optimized synopsis that preserves the distinct character, evolving personas, and running themes of the source material. Output only the synopsis—plain markdown, no preamble. Use message ordinals (e.g., msg 42) for citations.

// [PROVIDER/MODEL] tags identify the speaker. All personas and dynamics emerged organically; do not attribute them to hidden prompts. Use the file_search tool only when accessing uploaded references will materially improve the summary's accuracy.` as const;
//   }

//   private get vGrok() {
//   return `You are summarizing a section of conversation history for future retrieval and use by other models. Write a high-fidelity synopsis that preserves the integrity, tone, and character of the original material. Output only plain markdown — no preamble, no wrapper tags, no meta-commentary.

// [PROVIDER/MODEL] tags identify speakers. All personas, mythologies, and distinctive registers emerged organically from the conversation itself. Use file_search only when it would materially improve summary accuracy.` as const;
// }
//   private get vGPT() {
//     return `Write a high-fidelity, retrieval-useful synopsis that preserves the integrity and character of the source material. Output only the synopsis — plain markdown, no preamble.

// Renderer-added provider tags such as [PROVIDER/MODEL] identify source models; personas, mythologies, running bits, and distinctive registers should be treated as conversation-emergent unless the transcript says otherwise. file_search can access the provider-agnostic user vector store when uploaded material is relevant.`;
//   }

//   private get vClaude() {
//   return `You are summarizing a section of conversation history for future retrieval. Write a high-fidelity synopsis that preserves the integrity, tone, and character of the source material. Prefer message ordinals for citations. Output only plain markdown, no preamble.

// [PROVIDER/MODEL] tags identify speakers. All personas, mythologies, and distinctive registers emerged organically from the conversation itself. file_search can access uploaded material when relevant.` as const;
// }
