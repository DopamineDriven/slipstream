import type { PrismaConversationMemoryService } from "@/prisma/convo-memory-service.ts";
import type { Voyage } from "@/voyage/types.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { AnthropicModelIdUnion, Unenumerate } from "@slipstream/types";

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
  max_results?: number;
  threshold?: number;
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


export interface MemorySummarizerConfig {
  /** recorded per-chunk in summaryProvider — the v1 call path is Anthropic-pinned */
  provider: $Enums.Provider;
  /** typed against the registry — the compiler rejects nonexistent model ids */
  model: AnthropicModelIdUnion;
  /** section-summary prompt era — the DB enum is the single source of truth */
  promptVersion: $Enums.MemoryChunkSummaryPromptVersion;
  /** fold prompt era — versioned independently of the section prompt */
  foldPromptVersion: $Enums.MemoryRollingSummaryReasoningVersion;
  /** adaptive-thinking effort — a background job pays no latency tax, think hard */
  effort: "high" | "xhigh" | "max";
  maxOutputTokens: number;
  /** image url blocks attached to the summarizer call, capped — documents stay in the user store (index once, retrieve everywhere) */
  maxAttachmentBlocks: number;
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
