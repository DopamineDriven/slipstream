import type { $Enums } from "@slipstream/db/node/generated/client";

interface MiniMaxFunctionTool {
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

type MiniMaxFunctionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type MiniMaxTextContentPart = {
  type: "text";
  text: string;
};

type MiniMaxImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
    detail: "auto" | "low" | "high";
  };
};

type MiniMaxUserContentPart =
  | MiniMaxTextContentPart
  | MiniMaxImageContentPart;

type MiniMaxSystemMessage = {
  role: "system";
  content: string;
};

type MiniMaxUserMessage = {
  role: "user";
  content: string | readonly MiniMaxUserContentPart[];
};

type MiniMaxAssistantMessage = {
  role: "assistant";
  content: string;
};

type MiniMaxBaseMessage =
  | MiniMaxSystemMessage
  | MiniMaxUserMessage
  | MiniMaxAssistantMessage;

type MiniMaxAssistantToolCallMessage = {
  role: "assistant";
  content: "";
  tool_calls: readonly MiniMaxFunctionToolCall[];
};

type MiniMaxToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

type MiniMaxRequestMessage =
  | MiniMaxBaseMessage
  | MiniMaxAssistantToolCallMessage
  | MiniMaxToolMessage;

type MiniMaxReasoningDetail = {
  type: "reasoning.text";
  text: string;
  format: string;
  index: number;
};

type MiniMaxReasoningDelta = {
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: readonly MiniMaxReasoningDetail[];
};

type MiniMaxAccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

interface MiniMaxActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface MiniMaxFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

type MiniMaxForcedLoopStopReason = "MAX_ROUNDS" | null;

export type {
  MiniMaxAccumulatedToolCall,
  MiniMaxActiveMessageBlock,
  MiniMaxAssistantMessage,
  MiniMaxAssistantToolCallMessage,
  MiniMaxBaseMessage,
  MiniMaxFinalizedMessageBlock,
  MiniMaxForcedLoopStopReason,
  MiniMaxFunctionTool,
  MiniMaxFunctionToolCall,
  MiniMaxImageContentPart,
  MiniMaxRequestMessage,
  MiniMaxReasoningDelta,
  MiniMaxReasoningDetail,
  MiniMaxSystemMessage,
  MiniMaxTextContentPart,
  MiniMaxToolMessage,
  MiniMaxUserContentPart,
  MiniMaxUserMessage
};
