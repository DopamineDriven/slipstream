import type { $Enums } from "@slipstream/db/node/generated/client";

export interface V0FunctionTool {
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

export type V0FunctionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type V0TextContentPart = {
  type: "text";
  text: string;
};

export type V0ImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
    detail: "auto" | "low" | "high";
  };
};

export type V0UserContentPart = V0TextContentPart | V0ImageContentPart;

export type V0SystemMessage = {
  role: "system";
  content: string;
};

export type V0UserMessage = {
  role: "user";
  content: string | readonly V0UserContentPart[];
};

export type V0AssistantMessage = {
  role: "assistant";
  content: string;
};

export type V0BaseMessage = V0SystemMessage | V0UserMessage | V0AssistantMessage;

export type V0AssistantToolCallMessage = {
  role: "assistant";
  content: "";
  tool_calls: readonly V0FunctionToolCall[];
};

export type V0ToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

export type V0RequestMessage =
  V0BaseMessage | V0AssistantToolCallMessage | V0ToolMessage;

export type V0AccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export interface V0ActiveMessageBlock {
  content: string;
  reasoningChunkCount: number;
  sawAggregateTail: boolean;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

export interface V0FinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export type V0ForcedLoopStopReason = "MAX_ROUNDS" | null;
