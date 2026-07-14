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
  { alias: "fugu", model: "fugu", provider: "sakana" },
  { alias: "opus", model: "claude-opus-4-6", provider: "anthropic" },
  { alias: "kimi", model: "kimi-k2.6", provider: "moonshotai" },
  { alias: "glm", model: "glm-5.2", provider: "zai" },
  { alias: "mistral", model: "mistral-medium-3.5", provider: "mistral" },
  { alias: "qwen", model: "qwen3.7-plus", provider: "alibaba" },
  { alias: "deepseek", model: "deepseek-v4-pro", provider: "deepseek" },
  { alias: "gpt", model: "gpt-5.6-sol", provider: "openai" },
  { alias: "minimax", model: "minimax-m3", provider: "minimax" },
  { alias: "grok", model: "grok-4.5", provider: "grok" },
  { alias: "gemini", model: "gemini-3.1-pro-preview", provider: "gemini" },
  { alias: "cohere", model: "command-a-plus-05-2026", provider: "cohere" }
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

export interface EdgeClientContext {
  hostname: string;
  locale: string;
  viewport: string;
  browserName: string;
  browserVersion: string;
  ios: string;
  latlng: string;
  tz: string;
  ua: string;
  ip: string;
  country: string;
  city: string;
  isMac: string;
  region: string;
  postalCode: string;
}

/** CLI-authored identity fields — never taken from the edge payload */
export interface CliIdentity {
  ua: string;
  browserName: string;
  browserVersion: string;
  viewport: string;
}

/**
 * The exact twelve keys the ws-server's parsedCookies() allowlist accepts —
 * anything else in the header is dropped server-side, so anything else in
 * the payload (hostname, ios, isMac) never serializes.
 */
export const COOKIE_KEYS = [
  "city",
  "locale",
  "ua",
  "ip",
  "country",
  "latlng",
  "tz",
  "region",
  "postalCode",
  "browserName",
  "browserVersion",
  "viewport"
] as const;

export type CookieKey = "browserName" | "browserVersion" | "city" | "country" | "ip" | "latlng" | "locale" | "postalCode" | "region" | "tz" | "ua" | "viewport"
