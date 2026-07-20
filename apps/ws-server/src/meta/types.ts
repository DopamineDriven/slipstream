import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  CanonicalToolDefinition,
  LocalToolName
} from "@slipstream/types";

/**
 * Local read-only tool bridge (Sovereign CLI) — llama's completions
 * dialect takes plain JSON Schema, so the canonical inputSchema IS the
 * wire payload (near-identity, like the mistral/kimi mappers).
 */
export interface MetaLocalToolFunctionTool<T = string> {
  type: "function";
  function: {
    name: LocalToolName | (T & {});
    description: string;
    parameters: CanonicalToolDefinition["inputSchema"];
  };
}

export interface LlamaFunctionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: { [key: string]: unknown };
    strict?: boolean;
  };
}

export interface MetaActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "TEXT";
}

export interface MetaFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export type LlamaAccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
  ordinal: number;
};

export type LlamaForcedLoopStopReason = "MAX_ROUNDS" | null;
