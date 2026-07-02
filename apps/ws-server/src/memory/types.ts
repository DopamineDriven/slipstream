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
  | "current_conversation"
  | "all_conversations";

export interface ConversationMemorySearchToolInput {
  query: string;
  search_terms?: string;
  scope?: ConversationMemorySearchScope;
  max_results?: number;
  threshold?: number;
  include_transcript?: boolean;
}

/** discriminated at parse time — the caller picks the lookup, no downstream narrowing */
export type ConversationMemoryGetChunkTarget =
  | {
      readonly mode: "by_id";
      readonly chunkId: string;
      readonly direction?: "previous" | "next";
      readonly includeTranscript: boolean;
    }
  | {
      readonly mode: "by_ordinal";
      readonly conversationId: string;
      readonly ordinal: number;
      readonly direction?: "previous" | "next";
      readonly includeTranscript: boolean;
    };

export interface MemoryCompactionConfig {
  /** master switch — ships false; flip in dev first (plan §14 phase 7) */
  enabled: boolean;
  /** newest N ordinals always render verbatim in provider history */
  liveWindowMessages: number;
}

export interface MemorySummarizerConfig {
  /** recorded per-chunk in summaryProvider — the v1 call path is Anthropic-pinned */
  provider: $Enums.Provider;
  /** typed against the registry — the compiler rejects nonexistent model ids */
  model: AnthropicModelIdUnion;
  promptVersion: string;
  maxOutputTokens: number;
  /** image/document url blocks attached to the summarizer call, capped */
  maxAttachmentBlocks: number;
  /** chunks summarized per sweep (chunkIndex order; remainder waits for the next tick) */
  sweepBatchSize: number;
}

export interface ConversationMemoryIndexingConfig {
  /** unindexed ordinals required before a pass claims sections */
  messageThreshold: number;
  targetSectionTokens: number;
  maxSectionTokens: number;
  minSectionTokens: number;
  /** fixed DP allowance for the per-section heading (exact count reconciles at assembly) */
  headingTokenAllowance: number;
  /** hard guard under voyage-context-4's 32k per-input limit */
  embedInputCeilingTokens: number;
  staleClaimMinutes: number;
  maxEmbedRetries: number;
  maxSummaryRetries: number;
  embeddingModel: Voyage.ModelUnion;
  embeddingDim: Voyage.EmbeddingDims;
  schemaVersion: $Enums.MemorySchemaVersion;
}
