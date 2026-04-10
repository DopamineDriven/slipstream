import type { $Enums } from "@slipstream/db/node/generated/client";

interface DeepSeekFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: "string" | "number" | "array";
          description: string;
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

type DeepSeekFunctionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type DeepSeekTextContentPart = {
  type: "text";
  text: string;
};

type DeepSeekImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
    detail: "auto" | "low" | "high";
  };
};

type DeepSeekUserContentPart =
  | DeepSeekTextContentPart
  | DeepSeekImageContentPart;

type DeepSeekSystemMessage = {
  role: "system";
  content: string;
};

type DeepSeekUserMessage = {
  role: "user";
  content: string | readonly DeepSeekUserContentPart[];
};

type DeepSeekAssistantMessage = {
  role: "assistant";
  content: string;
};

type DeepSeekBaseMessage =
  | DeepSeekSystemMessage
  | DeepSeekUserMessage
  | DeepSeekAssistantMessage;

type DeepSeekAssistantToolCallMessage = {
  role: "assistant";
  content: "";
  tool_calls: readonly DeepSeekFunctionToolCall[];
};

type DeepSeekToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

type DeepSeekRequestMessage =
  | DeepSeekBaseMessage
  | DeepSeekAssistantToolCallMessage
  | DeepSeekToolMessage;

type DeepSeekReasoningDetail = {
  type: "reasoning.text";
  text: string;
  format: string;
  index: number;
};

type DeepSeekReasoningDelta = {
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: readonly DeepSeekReasoningDetail[];
};

type DeepSeekAccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

interface DeepSeekActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface DeepSeekFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

type DeepSeekForcedLoopStopReason = "MAX_ROUNDS" | null;

export type {
  DeepSeekAccumulatedToolCall,
  DeepSeekActiveMessageBlock,
  DeepSeekAssistantMessage,
  DeepSeekAssistantToolCallMessage,
  DeepSeekBaseMessage,
  DeepSeekFinalizedMessageBlock,
  DeepSeekForcedLoopStopReason,
  DeepSeekFunctionTool,
  DeepSeekFunctionToolCall,
  DeepSeekImageContentPart,
  DeepSeekRequestMessage,
  DeepSeekReasoningDelta,
  DeepSeekReasoningDetail,
  DeepSeekSystemMessage,
  DeepSeekTextContentPart,
  DeepSeekToolMessage,
  DeepSeekUserContentPart,
  DeepSeekUserMessage
};
