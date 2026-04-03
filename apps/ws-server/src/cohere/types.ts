import type { Cohere } from "cohere-ai";
import type { $Enums } from "@slipstream/db/node/generated/client";

export type CohereChatRequestMessage =
  | Cohere.ChatMessageV2.Assistant
  | Cohere.ChatMessageV2.System
  | Cohere.ChatMessageV2.Tool
  | Cohere.ChatMessageV2.User;

export interface CohereAccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
  index: number;
}

export interface CohereActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

export interface CohereFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export type CohereForcedLoopStopReason = "MAX_ROUNDS" | null;
