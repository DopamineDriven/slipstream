import type { PrismaConversationMemoryService } from "@/prisma/convo-memory-service.ts";
import type { Voyage } from "@/voyage/types.ts";
import type { ReasoningEffort } from "openai/resources/shared.mjs";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { AlibabaSummarizerService } from "@/alibaba/summarizer.ts";
import type { DeepSeekSummarizerService } from "@/deepseek/summarizer.ts";
import type { KimiSummarizerService } from "@/kimi/summarizer.ts";
import type { MiniMaxSummarizerService } from "@/minimax/summarizer.ts";
import type { ZaiSummarizerService } from "@/zai/summarizer.ts";
import type {
  AlibabaModelIdUnion,
  AnthropicModelIdUnion,
  DeepSeekModelIdUnion,
  KimiModelIdUnion,
  MiniMaxModelIdUnion,
  OpenAiModelIdUnion,
  Unenumerate,
  ZaiModelIdUnion
} from "@slipstream/types";

/** conversationId → immutable ids only — the watermark is NEVER cached in-process */
export interface MemoryContextRegistryEntry {
  contextId: string;
  storeId: string;
}

/** row shape returned by PrismaConversationMemoryService.getMessagesByOrdinalRange */
export type MemoryRangeMessage = Unenumerate<
  Awaited<
    ReturnType<PrismaConversationMemoryService["getMessagesByOrdinalRange"]>
  >
>;
export interface EmbedAndIndexTarget {
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
export interface MemoryEmbedFamilyMember extends EmbedAndIndexTarget {
  /**
   * true → an already-INDEXED row re-embedded purely so its vector gains the
   * new siblings' context: vector + embeddedAt re-mint through the same
   * sole-owner SQL, no state transition, no message backfill.
   */
  isRefresh: boolean;
}

export interface RenderedMemoryMessage {
  ordinal: number;
  messageId: string;
  markdown: string;
  createdAt: Date;
  provider: $Enums.Provider;
  model: string | null;
  senderType: $Enums.SenderType;
  attachmentCount: number;
  attachmentProvenanceIds: string[];
}

/** index range into a RenderedMemoryMessage[] — ordinal mapping happens at assembly */
export interface MemorySectionPartition {
  startIdx: number;
  endIdxExclusive: number;
  /** DP-estimated tokens (prefix sums + heading allowance); exact count lands at assembly */
  dpTokenCount: number;
}

/** everything InsertMemoryChunkParams needs except contextId/storeId/chunkIndex (orchestration adds) */
export interface MemorySectionDraft {
  /** 0-based offset within this pass — orchestration maps to the absolute chunkIndex */
  relativeIndex: number;
  provenanceId: string;
  conversationId: string;
  ordinalStart: number;
  ordinalEndExclusive: number;
  messageIdStart: string;
  messageIdEnd: string;
  messageTimestampStart: Date;
  messageTimestampEnd: Date;
  transcriptMarkdown: string;
  contentHash: string;
  chunkedMessagesCount: number;
  /** exact voyage tokenizer count of the assembled transcript */
  tokenCount: number;
  providerModelsRaw: string;
  hasAttachments: boolean;
  chunkedAttachmentsCount: number | null;
  attachmentProvenanceIdsRaw: string | null;
  boundaryReason: $Enums.MemoryChunkBoundaryReason;
  /** true when the exact count exceeds embedInputCeilingTokens — embed a truncated rendering */
  exceedsEmbedCeiling: boolean;
}

/** row shape returned by PrismaConversationMemoryService.findChunksAwaitingSummary */
export type MemoryChunkAwaitingSummary = Unenumerate<
  Awaited<
    ReturnType<PrismaConversationMemoryService["findChunksAwaitingSummary"]>
  >
>;

/** row shape shared by both hybrid search queries (store- and context-scoped) */
export type MemoryHybridRow = Unenumerate<
  Awaited<
    ReturnType<
      PrismaConversationMemoryService["searchConversationMemoryHybridTyped"]
    >
  >
>;

export type ConversationMemorySearchScope =
  "current_conversation" | "all_conversations";

export interface ConversationMemorySearchToolInput {
  query: string;
  search_terms?: string;
  scope?: ConversationMemorySearchScope;
  /**
   * fuzzy conversation-title filter (pg_trgm, same contract as the user
   * store's filename filter) — providing it implies all_conversations scope
   */
  conversation_title?: string;
  max_results?: number;
  threshold?: number;
}

export interface MemoryAssemblyConfig {
  /** master switch for substitution assembly (HMEM Part II §2) */
  enabled: boolean;
  /**
   * the oldest N ordinals always render verbatim — the charter/primacy
   * anchor. On a 12-provider platform an opening question carouseled across
   * the fleet is [0-23] before the conversation proper starts; 30 covers a
   * full carousel plus follow-through. Serial-position + lost-in-the-middle
   * both favor verbatim material at the top of context
   */
  foundingWindowMessages: number;
  /** the newest N ordinals always render verbatim in provider history — the recency anchor */
  liveWindowMessages: number;
}

/** row shape returned by PrismaConversationMemoryService.findSubstitutableChunks */
export type MemorySubstitutableChunk = Unenumerate<
  Awaited<
    ReturnType<PrismaConversationMemoryService["findSubstitutableChunks"]>
  >
>;

/**
 * The substitution plan for one conversation's provider history: every READY
 * section between the founding window and the live-window floor, gap-tolerant
 * (a gap renders verbatim), each name-tagged to its summarizer. The formatter
 * merges these with the un-covered verbatim messages by ordinal — verbatim at
 * both ends, consolidated episodic traces bridging the middle (the
 * serial-position shape).
 */
export interface MemoryAssemblyPlan {
  /** ordinals < this always render verbatim — the charter/primacy anchor */
  foundingCeilingExclusive: number;
  /** maxOrdinalExclusive - liveWindowMessages; ordinals ≥ this always render verbatim */
  liveWindowFloor: number;
  /** ordered by ordinalStart; each extends past the founding ceiling and never overlaps the live window */
  substitutions: MemorySubstitutableChunk[];
}

/**
 * The claim-driven per-request assembly view formatters iterate with
 * (structural mirror of getHistoryAssemblyView's return — kept structural so
 * pure-function formatters can take it as a parameter without importing the
 * service). claim(ordinal): null → verbatim; { emit: string } → push the
 * block as an assistant turn, drop the message; { emit: null } → drop only.
 */
export interface MemoryAssemblyView {
  claim: (ordinal: number) => { readonly emit: string | null } | null;
}

/** discriminated at parse time — the caller picks the lookup, no downstream narrowing */
export type ConversationMemoryGetChunkTarget =
  | {
      readonly mode: "by_id";
      readonly chunkId: string;
      readonly direction?: "previous" | "next";
    }
  | {
      readonly mode: "by_ordinal";
      readonly conversationId: string;
      readonly ordinal: number;
      readonly direction?: "previous" | "next";
    };

/** roster keys — stable identifiers for rotation membership + fold pinning */
export type SummarizerArmKey =
  | "sonnet"
  | "sol"
  | "deepseek"
  | "minimax"
  | "qwen"
  | "kimi"
  | "glm";

interface SummarizerArmBase {
  key: SummarizerArmKey;
  /** rotation membership — disabled arms stay constructed so re-enabling is a config flip, not a rebuild */
  enabled: boolean;
  maxOutputTokens: number;
}

/**
 * §6.2 MoE roster entry — discriminated on provider so each entry's model is
 * typed against its registry union (the compiler rejects nonexistent ids).
 * ANTHROPIC/OPENAI carry effort knobs (first-party reasoning APIs); the
 * gateway arms reason by default and take no effort parameter.
 */
export type SummarizerArmEntry =
  | (SummarizerArmBase & {
      provider: "ANTHROPIC";
      model: AnthropicModelIdUnion;
      /** adaptive-thinking effort — a background job pays no latency tax, think hard */
      effort: "high" | "xhigh" | "max";
    })
  | (SummarizerArmBase & {
      provider: "OPENAI";
      model: OpenAiModelIdUnion;
      effort: ReasoningEffort;
    })
  | (SummarizerArmBase & { provider: "DEEPSEEK"; model: DeepSeekModelIdUnion })
  | (SummarizerArmBase & { provider: "MOONSHOTAI"; model: KimiModelIdUnion })
  | (SummarizerArmBase & { provider: "MINIMAX"; model: MiniMaxModelIdUnion })
  | (SummarizerArmBase & { provider: "ZAI"; model: ZaiModelIdUnion })
  | (SummarizerArmBase & { provider: "ALIBABA"; model: AlibabaModelIdUnion });

/**
 * the five gateway arm instances — memory-free workup children, ctor-injected
 * into the memory service (the repartition killed the construction cycles)
 */
export interface GatewaySummarizerArms {
  deepseek: DeepSeekSummarizerService;
  kimi: KimiSummarizerService;
  minimax: MiniMaxSummarizerService;
  zai: ZaiSummarizerService;
  alibaba: AlibabaSummarizerService;
}

export interface MemorySummarizerConfig {
  /** section-summary prompt era — the DB enum is the single source of truth */
  promptVersion: $Enums.MemoryChunkSummaryPromptVersion;
  /** fold prompt era — versioned independently of the section prompt */
  foldPromptVersion: $Enums.MemoryRollingSummaryReasoningVersion;
  /** image url blocks attached to the summarizer call, capped — documents stay in the user store (index once, retrieve everywhere) */
  maxAttachmentBlocks: number;
  /**
   * §6.2 MoE roster — rotation = arms.filter(enabled) in declaration order;
   * per-chunk arm = chunkIndex % rotation.length (deterministic, stable
   * across retries, every row carries its arm's receipts). Shared
   * maxToolUseRounds/callDeadlineMs govern every arm so the wave failsafe
   * stays a single computation.
   */
  arms: readonly SummarizerArmEntry[];
  /**
   * the digest editor — folds route to this arm (Sol per the 2026-07-09
   * dev-probe verdict: "Sol remembers, sonnet logs"; sections are parallel
   * workers, the fold is an editor)
   */
  foldArmKey: SummarizerArmKey;
  /**
   * content-delivery A/B (Andrew, 2026-07-07): when true, summarizers
   * alternate between the structured preamble build and the RAW
   * transcriptMarkdown (system prompt + transcript, nothing else —
   * flexibility/diversity of delivery). Factorial against the arm rotation:
   * arm = chunkIndex % N, variant = floor(chunkIndex / N) % 2 (N = enabled
   * rotation length) — the variant bit strides by N so it never confounds
   * with arm identity; cell = chunkIndex % (2·N), derivable from chunkIndex,
   * so no migration. Analysis splits on the recorded summaryModel, which
   * stays authoritative across roster changes. Fold unaffected; attachments
   * ride both variants (content, not structure).
   */
  rawTranscriptAb: boolean;
  /**
   * §8.5 global cap — concurrent summarizer LLM calls (sections + folds)
   * across ALL conversations, per instance. Bounds the boot-resume fan-out
   * (contexts × sweepBatchSize) that would otherwise blow provider OTPM
   */
  maxConcurrentSummaryJobs: number;
  /** hard cap on file_search round-trips per summary/fold call */
  maxToolUseRounds: number;
  /** per-round wall-clock deadline — an immortal stream aborts into the ERROR/retry path instead of wedging its wave */
  callDeadlineMs: number;
  /**
   * exact-count ceiling on the fold input (section corpus + prior digest +
   * live tail), in voyage tokens — cross-tokenizer margin under the
   * summarizer's 200k window. A fold overflow is non-self-healing (identical
   * re-fold every dry tick) without this gate: over budget drops the tail
   * first, then defers the fold with a warning instead of dying
   */
  foldInputBudgetTokens: number;
  /** wave width — pending chunks dispatched as concurrent detached jobs; the drain-fold chains the next wave until the backlog is dry */
  sweepBatchSize: number;
}

export interface ConversationMemoryIndexingConfig {
  /** unindexed ordinals required before a pass claims sections */
  messageThreshold: number;
  /**
   * ordinals held back from indexing at the tip. 0 = chase the tip (the
   * sectioner's minSectionTokens band is the organic holdback); recency
   * staging is an ASSEMBLY concern (liveWindowMessages), not an indexing one
   */
  indexingHorizonOffset: number;
  targetSectionTokens: number;
  maxSectionTokens: number;
  minSectionTokens: number;
  /** fixed DP allowance for the per-section heading (exact count reconciles at assembly) */
  headingTokenAllowance: number;
  /** hard guard under voyage-context-4's 32k per-input limit */
  embedInputCeilingTokens: number;
  /** ≤32k tokens per inner list (one contextualized family) — probe-verified hard cap, meter agrees with countTokens exactly */
  familyTokenBudget: number;
  /** ≤120k tokens per contextualizedembeddings request — probe-verified hard cap */
  requestTokenBudget: number;
  staleClaimMinutes: number;
  /** SUMMARIZING rows older than this rejoin the retry pool — a healthy adaptive-thinking call can run several minutes, keep well above that */
  staleSummaryMinutes: number;
  maxEmbedRetries: number;
  maxSummaryRetries: number;
  embeddingModel: Voyage.ModelUnion;
  embeddingDim: Voyage.EmbeddingDims;
  schemaVersion: $Enums.MemorySchemaVersion;
}
