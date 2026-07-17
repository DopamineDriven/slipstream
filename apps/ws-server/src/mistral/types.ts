import type {
  AssistantMessage,
  ChatCompletionStreamRequest,
  ContentChunk,
  SystemMessage,
  ToolMessage,
  UserMessage
} from "@mistralai/mistralai/models/components";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { CTR, UTR } from "@slipstream/types";

export type MistralMessageReq =
  CTR<AssistantMessage, "role"> | SystemMessage | ToolMessage | UserMessage;

export type ToolTypes = ChatCompletionStreamRequest["tools"];

export interface MistralFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: "string" | "number" | "array" | "boolean";
          description: string;
          enum?: readonly string[];
          items?: { type: "string" };
          minItems?: number;
          maxItems?: number;
        }
      >;
      required: string[];
      additionalProperties: boolean;
    };
  };
}

export type MistralFunctionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
  index: number;
};

export type MistralAssistantToolCallMessage = {
  role: "assistant";
  content: "";
  toolCalls: readonly MistralFunctionToolCall[];
  prefix?: false;
};

export type MistralToolMessage = {
  role: "tool";
  toolCallId: string;
  content: string;
  name?: string;
};

export type MistralAccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
  index: number;
};

export interface MistralActiveMessageBlock {
  content: string;
  reasoningChunkCount: number;
  sawAggregateTail: boolean;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

export interface MistralFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export type MistralForcedLoopStopReason = "MAX_ROUNDS" | null;

export type MistralTextChunk = {
  type?: "text";
  text: string;
};

export type MistralReferenceChunk = {
  type?: "reference";
  referenceIds: readonly (number | string)[];
};

export type MistralToolReferenceChunk = {
  type?: "tool_reference";
  tool: string;
  title: string;
  url?: string | null;
  favicon?: string | null;
  description?: string | null;
};

export type MistralContentChunk = UTR<ContentChunk, "type">;

export interface MistralDeltaContentHandlers {
  emitTextChunk(text: string): void;
  emitThinkingChunk(text: string): void;
}
