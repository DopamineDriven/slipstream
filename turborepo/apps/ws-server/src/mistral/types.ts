import type {
  AssistantMessage,
  GuardrailConfig,
  Prediction,
  ResponseFormat,
  SystemMessage,
  Tool,
  ToolChoice,
  ToolMessage,
  UserMessage
} from "@mistralai/mistralai/models/components";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { CTR, MistralModelIdUnion } from "@slipstream/types";

export type ChatCompletionRequest = {
  model: MistralModelIdUnion;
  temperature?: number | null | undefined;
  top_p?: number | undefined;
  max_tokens?: number | null | undefined;
  stream: boolean;
  stop?: string | string[] | undefined;
  random_seed?: number | null | undefined;
  metadata?: { [k: string]: any } | null | undefined;
  messages: (
    | CTR<AssistantMessage, "role">
    | SystemMessage
    | ToolMessage
    | UserMessage
  )[];
  response_format?: ResponseFormat | undefined;
  tools?: Tool[] | null | undefined;
  tool_choice?: ToolChoice | string | undefined;
  presence_penalty?: number | undefined;
  frequency_penalty?: number | undefined;
  n?: number | null | undefined;
  prediction?: Prediction | undefined;
  parallel_tool_calls?: boolean | undefined;
  reasoning_effort?: string | null | undefined;
  prompt_mode?: string | null | undefined;
  guardrails?: GuardrailConfig[] | null | undefined;
  safe_prompt?: boolean | undefined;
};

export type MistralMessageReq = (
  | CTR<AssistantMessage, "role">
  | SystemMessage
  | ToolMessage
  | UserMessage
);

export type MistralReqMessage = (
  | SystemMessage
  | ToolMessage
  | UserMessage
  | (AssistantMessage & { role: "assistant" })
)[];

export type MistralMessageContentChunk = Exclude<
  UserMessage["content"],
  string | null
>[number];

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

export type MistralFunctionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
  index: number;
};

export type MistralBaseMessage =
  | UserMessage
  | (AssistantMessage & { role: "assistant" });

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

export type MistralThinkingChunk = {
  type?: "thinking";
  thinking: readonly (
    | MistralReferenceChunk
    | MistralTextChunk
    | MistralToolReferenceChunk
  )[];
  closed?: boolean;
};

export type MistralContentChunk =
  | MistralTextChunk
  | MistralThinkingChunk
  | MistralReferenceChunk
  | MistralToolReferenceChunk
  | {
      type?: string;
    };
