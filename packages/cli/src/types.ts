import type {
  AllModelsUnion,
  ChatChunkAndResMsgBlock,
  ConversationListEntry,
  Provider,
  UTR
} from "@slipstream/types";

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

export type CookieKey =
  | "browserName"
  | "browserVersion"
  | "city"
  | "country"
  | "ip"
  | "latlng"
  | "locale"
  | "postalCode"
  | "region"
  | "tz"
  | "ua"
  | "viewport";

/**
 * Block-authoritative rendering helpers (shared by the live stream and the
 * resume/expand paths). MessageBlock is the newer, ordinal-keyed contract —
 * the flat `content` column is legacy fallback. Three block types exist;
 * `type` is the switch between reasoning and the model's actual answer.
 */

/** the wire block-type enum, sourced through the types package (no db dep) */
export type BlockType = ChatChunkAndResMsgBlock["type"];

/** structural minimum both MessageSingleton and the hydrated-tail shape satisfy */
export interface BlockBearingMessage {
  content: string;
  messageBlocks?: {
    type: BlockType | null;
    content: string | null;
    ordinal: number | null;
  }[];
}
export interface RenderableBlock {
  type: BlockType;
  content: string;
}

export interface HydratedTailMessage extends BlockBearingMessage {
  ordinal: number;
  senderType: string;
  provider: string;
  model: string | null;
  content: string;
}

/** structural mirror of hydrate_conversation_ack's pages for this module's needs */
export interface HydratedTailPage {
  convo: {
    title: string | null;
    messages: HydratedTailMessage[];
  };
}

export interface FormatHydratedTailOptions {
  /** newest N messages render in full — the resume window */
  tailCount: number;
  /**
   * per-message display cap in characters — an operational safeguard against
   * pathological single messages (an accidental 100 KB paste), NOT a summary
   * mechanism. Generous by design: ordinary long answers render whole. A
   * capped message carries explicit truncation metadata so the renderer can
   * print a marker and the exact /expand recovery command; /expand and the
   * local message index remain lossless.
   */
  perMessageCharCap: number;
}

export interface FormattedTailMessage {
  ordinal: number;
  senderType: string;
  provider: string;
  model: string | null;
  /** full body, or the capped prefix when truncated — whitespace preserved exactly */
  body: string;
  truncated: boolean;
  /** original character count — surfaced in the truncation marker */
  totalChars: number;
}

export interface FormattedHydratedTail {
  title: string | null;
  messages: FormattedTailMessage[];
  /** every hydrated message, not just the rendered window */
  totalHydrated: number;
  shownFromOrdinal: number | null;
  shownToOrdinal: number | null;
}

export interface PickerRow {
  entry: ConversationListEntry;
  selected: boolean;
}

export interface PickerView {
  matches: ConversationListEntry[];
  rows: PickerRow[];
  /** clamped into the match list; null when there are no matches */
  selectedIndex: number | null;
}

export interface PickerIo {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
}
