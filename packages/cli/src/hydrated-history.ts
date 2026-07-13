import { messageAnswerText } from "@/message-blocks.ts";
import type { BlockBearingMessage } from "@/message-blocks.ts";

/**
 * Pure formatting decisions for the hydrated-history window rendered on
 * /convo attach (Phase 2.0 — readable resume). No terminal, color, or
 * transport concerns live here: the renderer owns speaker tags, ANSI, and
 * stdout; this module owns selection, ordering, and the pathological-message
 * safety cap. Structural message type so the module needs no service imports.
 * The resume body is block-authoritative (TEXT blocks, ordinal-joined) with
 * the flat `content` column as legacy fallback — see message-blocks.ts.
 */

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

export function formatHydratedTail(
  pages: HydratedTailPage[],
  options: FormatHydratedTailOptions
) {
  const all = pages
    .flatMap(page => page.convo.messages)
    .sort((a, b) => a.ordinal - b.ordinal);
  const title = pages[0]?.convo.title ?? null;
  const tail = options.tailCount > 0 ? all.slice(-options.tailCount) : [];

  const messages = tail.map(msg => {
    // block-authoritative body — the TEXT blocks (the model's answer),
    // ordinal-joined, falling back to the flat column for legacy rows
    const full = messageAnswerText(msg);
    const totalChars = full.length;
    const truncated = totalChars > options.perMessageCharCap;
    return {
      ordinal: msg.ordinal,
      senderType: msg.senderType,
      provider: msg.provider,
      model: msg.model,
      body: truncated ? full.slice(0, options.perMessageCharCap) : full,
      truncated,
      totalChars
    } satisfies FormattedTailMessage;
  });

  return {
    title,
    messages,
    totalHydrated: all.length,
    shownFromOrdinal: messages[0]?.ordinal ?? null,
    shownToOrdinal: messages[messages.length - 1]?.ordinal ?? null
  } satisfies FormattedHydratedTail;
}
