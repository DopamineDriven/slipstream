import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  CanonicalToolDefinition,
  LocalToolName
} from "@slipstream/types";

/**
 * Local read-only tool bridge (Sovereign CLI) — zai rides the gateway's
 * OpenAI-compatible completions dialect, so the canonical inputSchema IS
 * the wire payload (near-identity, like the kimi/mistral/xai mappers).
 */
interface ZaiLocalToolFunctionTool<T = string> {
  type: "function";
  function: {
    name: LocalToolName | (T & {});
    description: string;
    parameters: CanonicalToolDefinition["inputSchema"];
  };
}

interface ZaiFunctionTool {
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

type ZaiFunctionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type ZaiTextContentPart = {
  type: "text";
  text: string;
};

type ZaiImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
    detail: "auto" | "low" | "high";
  };
};

type ZaiUserContentPart = ZaiTextContentPart | ZaiImageContentPart;

type ZaiSystemMessage = {
  role: "system";
  content: string;
};

type ZaiUserMessage = {
  role: "user";
  content: string | readonly ZaiUserContentPart[];
};

type ZaiAssistantMessage = {
  role: "assistant";
  content: string;
};

type ZaiBaseMessage = ZaiSystemMessage | ZaiUserMessage | ZaiAssistantMessage;

type ZaiAssistantToolCallMessage = {
  role: "assistant";
  content: "";
  tool_calls: readonly ZaiFunctionToolCall[];
};

type ZaiToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

type ZaiRequestMessage =
  ZaiBaseMessage | ZaiAssistantToolCallMessage | ZaiToolMessage;

type ZaiReasoningDetail = {
  type: "reasoning.text";
  text: string;
  format: string;
  index: number;
};

type ZaiReasoningDelta = {
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: readonly ZaiReasoningDetail[];
};

type ZaiAccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

interface ZaiActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface ZaiFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

type ZaiForcedLoopStopReason = "MAX_ROUNDS" | null;

export type {
  ZaiAccumulatedToolCall,
  ZaiActiveMessageBlock,
  ZaiAssistantMessage,
  ZaiAssistantToolCallMessage,
  ZaiBaseMessage,
  ZaiFinalizedMessageBlock,
  ZaiForcedLoopStopReason,
  ZaiFunctionTool,
  ZaiLocalToolFunctionTool,
  ZaiFunctionToolCall,
  ZaiImageContentPart,
  ZaiRequestMessage,
  ZaiReasoningDelta,
  ZaiReasoningDetail,
  ZaiSystemMessage,
  ZaiTextContentPart,
  ZaiToolMessage,
  ZaiUserContentPart,
  ZaiUserMessage
};
