import type { AllModelsUnion, Provider, UTR } from "@slipstream/types";

export interface CliModelEntry {
  alias: string;
  model: AllModelsUnion;
  provider: Provider;
}

/**
 * The curated roster (single-operator scope, plan §0.1) — not the 100+
 * registry. Fable-first; GLM 5.2 / MiniMax M3 join later.
 */
export const CLI_MODELS = [
  { alias: "fable", model: "claude-fable-5", provider: "anthropic" },
  { alias: "opus", model: "claude-opus-4-6", provider: "anthropic" },
  { alias: "gpt", model: "gpt-5.5", provider: "openai" },
  { alias: "grok", model: "grok-4.3", provider: "grok" },
  { alias: "gemini", model: "gemini-3.1-pro-preview", provider: "gemini" },
  { alias: "fugu", model: "fugu", provider: "sakana" }
] as const satisfies readonly CliModelEntry[];

export type CliRosterEntry = (typeof CLI_MODELS)[number];

export type CliRosterRecord = UTR<CliRosterEntry, "alias">;

export interface ChatSessionState {
  conversationId: string;
  title: string | null;
  entry: CliRosterEntry;
  systemPrompt: string | undefined;
  showThinking: boolean;
}
