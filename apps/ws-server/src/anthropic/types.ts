import type { ProviderChatRequestEntity } from "@/types/index.ts";
import Anthropic from "@anthropic-ai/sdk";
import { Stream } from "@anthropic-ai/sdk/core/streaming.mjs";
import type { searchUserStoreChunksByStore } from "@slipstream/db/sql-node";
import type {
  AnthropicModelIdUnion,
  MessageSingleton,
  UTR
} from "@slipstream/types";

export interface AnthropicFileRecord {
  id: string;
  size_bytes: number;
  created_at: string;
  filename: string;
  mime_type: string;
  lastAccessedAt?: Date;
  dbRecordId?: string;
}

export interface ProviderAnthropicChatRequestEntity extends ProviderChatRequestEntity {
  user_location?: {
    type: "approximate";
    city?: string | null | undefined;
    country?: string | null | undefined;
    region?: string | null | undefined;
    timezone?: string | null | undefined;
  };
}

export type RequestOptions<T extends "0" | "1" = "1"> = Exclude<
  Parameters<InstanceType<typeof Anthropic>["messages"]["create"]>[T],
  undefined
>;

export type MessageInputParams = {
  isNewChat: boolean;
  messages: MessageSingleton<true>[];
  userId: string;
  apiKey: string | undefined;
  keyId: string | null;
  max_tokens: number | undefined;
  model: string | undefined;
  systemPrompt: string | undefined;
  temperature: number | undefined;
  topP: number | undefined;
  container?: string | Anthropic.Beta.Messages.BetaContainerParams;
  user_location:
    | {
        type: "approximate";
        city?: string | null | undefined;
        country?: string | null | undefined;
        region?: string | null | undefined;
        timezone?: string | null | undefined;
      }
    | undefined;
};

export type CreateMessageStreamRT =
  Stream<Anthropic.Beta.BetaRawMessageStreamEvent> & {
    _request_id?: string | null;
  };

/** Direct alias of the typed SQL search result — includes joined doc fields + computed score */
export type LocalSearchResult = searchUserStoreChunksByStore.Result;

export interface FileSearchToolInput {
  query: string;
  max_results?: number;
  filename?: string;
  search_terms?: string;
}

export interface ToolUseAccumulator {
  id: string;
  name: string;
  inputJson: string;
  callerType: "code_execution_20250825";
  callerToolId: string;
}

export interface BlockBuilder {
  type: string;
  id?: string;
  name?: string;
  text?: string;
  thinking?: string;
  inputJson?: string;
  input?: Record<string, any>;
  signature?: string;
  caller?: Anthropic.Beta.BetaServerToolCaller;
  tool_use_id?: string;
  codeExecutionContent?: Anthropic.Beta.BetaCodeExecutionToolResultBlockParam["content"];
}
export type CodeExecutionContentRT = UTR<
  Anthropic.Beta.BetaCodeExecutionToolResultBlockParam["content"],
  "type"
>;
export type ContentBlockParamObj = UTR<
  Anthropic.Beta.BetaContentBlockParam,
  "type"
>;

export interface RoundRecord {
  round: number;
  requestId: string | null;
  containerId: string | undefined;
  assistantBlocks: Anthropic.Beta.BetaContentBlockParam[];
  toolResults: Anthropic.Beta.BetaToolResultBlockParam[];
}
export type BetaRawMessageStreamRecord = UTR<
  Anthropic.Beta.Messages.BetaRawMessageStreamEvent,
  "type"
>;

export type ContentBlockObj = UTR<Anthropic.Beta.BetaContentBlockParam, "type">;

export type MapContentBlock<T extends keyof ContentBlockObj> = {
  [P in T]: ContentBlockObj[P];
}[T];

/** one traced in-house tool round-trip — persisted raw for data-driven config feedback */
export interface SummarizerToolCallRecord {
  round: number;
  name: string;
  input: unknown;
  output: string;
  isError: boolean;
}

export interface StreamSummaryMessageParams {
  model: AnthropicModelIdUnion;
  maxOutputTokens: number;
  effort: "high" | "xhigh" | "max";
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  /** in-house tools offered to the call (e.g. user-store file_search) */
  tools?: Anthropic.Beta.BetaToolUnion[];
  /** executes one tool call; results feed back into the loop until end_turn */
  executeToolCall?: (name: string, input: unknown) => Promise<string>;
  /** hard cap on tool round-trips — defense against foraging spirals */
  maxToolUseRounds?: number;
  /** per-round wall-clock deadline; a stalled stream aborts instead of living forever */
  callDeadlineMs?: number;
}
