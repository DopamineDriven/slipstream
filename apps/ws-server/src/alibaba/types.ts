import type { $Enums } from "@slipstream/db/node/generated/client";

interface AlibabaFunctionTool {
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

type AlibabaFunctionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type AlibabaTextContentPart = {
  type: "text";
  text: string;
};

type AlibabaImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
    detail: "auto" | "low" | "high";
  };
};

type AlibabaUserContentPart =
  | AlibabaTextContentPart
  | AlibabaImageContentPart;

type AlibabaSystemMessage = {
  role: "system";
  content: string;
};

type AlibabaUserMessage = {
  role: "user";
  content: string | readonly AlibabaUserContentPart[];
};

type AlibabaAssistantMessage = {
  role: "assistant";
  content: string;
};

type AlibabaBaseMessage =
  | AlibabaSystemMessage
  | AlibabaUserMessage
  | AlibabaAssistantMessage;

type AlibabaAssistantToolCallMessage = {
  role: "assistant";
  content: "";
  tool_calls: readonly AlibabaFunctionToolCall[];
};

type AlibabaToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

type AlibabaRequestMessage =
  | AlibabaBaseMessage
  | AlibabaAssistantToolCallMessage
  | AlibabaToolMessage;

type AlibabaReasoningDetail = {
  type: "reasoning.text";
  text: string;
  format: string;
  index: number;
};

type AlibabaReasoningDelta = {
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: readonly AlibabaReasoningDetail[];
};

type AlibabaAccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

interface AlibabaActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface AlibabaFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

type AlibabaForcedLoopStopReason = "MAX_ROUNDS" | null;

export type {
  AlibabaAccumulatedToolCall,
  AlibabaActiveMessageBlock,
  AlibabaAssistantMessage,
  AlibabaAssistantToolCallMessage,
  AlibabaBaseMessage,
  AlibabaFinalizedMessageBlock,
  AlibabaForcedLoopStopReason,
  AlibabaFunctionTool,
  AlibabaFunctionToolCall,
  AlibabaImageContentPart,
  AlibabaRequestMessage,
  AlibabaReasoningDelta,
  AlibabaReasoningDetail,
  AlibabaSystemMessage,
  AlibabaTextContentPart,
  AlibabaToolMessage,
  AlibabaUserContentPart,
  AlibabaUserMessage
};
