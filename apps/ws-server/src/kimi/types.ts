import type { $Enums } from "@slipstream/db/node/generated/client";

interface KimiFunctionTool {
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

type KimiFunctionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type KimiTextContentPart = {
  type: "text";
  text: string;
};

type KimiImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
    detail: "auto" | "low" | "high";
  };
};

type KimiUserContentPart = KimiTextContentPart | KimiImageContentPart;

type KimiSystemMessage = {
  role: "system";
  content: string;
};

type KimiUserMessage = {
  role: "user";
  content: string | readonly KimiUserContentPart[];
};

type KimiAssistantMessage = {
  role: "assistant";
  content: string;
};

type KimiBaseMessage =
  KimiSystemMessage | KimiUserMessage | KimiAssistantMessage;

type KimiAssistantToolCallMessage = {
  role: "assistant";
  content: "";
  tool_calls: readonly KimiFunctionToolCall[];
};

type KimiToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

type KimiRequestMessage =
  KimiBaseMessage | KimiAssistantToolCallMessage | KimiToolMessage;

type KimiReasoningDetail = {
  type: "reasoning.text";
  text: string;
  format: string;
  index: number;
};

type KimiReasoningDelta = {
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: readonly KimiReasoningDetail[];
};

type KimiAccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

interface KimiActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface KimiFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

type KimiForcedLoopStopReason = "MAX_ROUNDS" | null;

export type {
  KimiAccumulatedToolCall,
  KimiActiveMessageBlock,
  KimiAssistantMessage,
  KimiAssistantToolCallMessage,
  KimiBaseMessage,
  KimiFinalizedMessageBlock,
  KimiForcedLoopStopReason,
  KimiFunctionTool,
  KimiFunctionToolCall,
  KimiImageContentPart,
  KimiRequestMessage,
  KimiReasoningDelta,
  KimiReasoningDetail,
  KimiSystemMessage,
  KimiTextContentPart,
  KimiToolMessage,
  KimiUserContentPart,
  KimiUserMessage
};
