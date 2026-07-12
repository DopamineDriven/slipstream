import pc from "picocolors";
import { formatHydratedTail } from "@/hydrated-history.ts";
import { CliProviderContextService } from "@/provider-context.ts";
import type { EventTypeMap } from "@slipstream/types";

/**
 * Streaming renderer — raw passthrough for text deltas (minimal processing
 * between upstream and terminal, the house doctrine), dim thinking blocks,
 * provider-tinted name tags, a finalize line on ai_chat_response.
 */
export class CliRendererService extends CliProviderContextService {
  private wasThinking = false;
  private thinkingAgg = "";
  protected showThinking = true;

  /** reset per-turn render state — call at send time */
  protected beginTurnRender() {
    this.wasThinking = false;
    this.thinkingAgg = "";
  }

  protected nameTag(provider: string, model: string | undefined) {
    return pc.cyan(`[${provider.toLowerCase()}/${model ?? "unknown"}]`);
  }

  protected renderChunk(data: EventTypeMap["ai_chat_chunk"]) {
    if (data.thinkingText) {
      // providers MIX thinking semantics — anthropic streams deltas, gemini
      // interleaves deltas with full-aggregate frames (thinkingAgg re-sent
      // per text chunk). Print only the unseen suffix: correct for both.
      const incoming = data.thinkingText;
      let printable: string;
      if (incoming.startsWith(this.thinkingAgg)) {
        printable = incoming.slice(this.thinkingAgg.length);
        this.thinkingAgg = incoming;
      } else if (this.thinkingAgg.endsWith(incoming)) {
        printable = ""; // stale re-send of a suffix we already printed
      } else {
        printable = incoming;
        this.thinkingAgg += incoming;
      }
      if (!this.showThinking || printable.length === 0) return;
      if (!this.wasThinking) {
        process.stdout.write(pc.dim("\n∴ thinking…\n"));
        this.wasThinking = true;
      }
      process.stdout.write(pc.dim(printable));
      return;
    }
    if (data.chunk) {
      if (this.wasThinking) {
        process.stdout.write("\n\n");
        this.wasThinking = false;
      }
      process.stdout.write(data.chunk);
    }
  }

  protected renderResponse(data: EventTypeMap["ai_chat_response"]) {
    this.wasThinking = false;
    const meta = Array.of<string>();
    if (data.title) meta.push(data.title);
    if (typeof data.usage === "number") meta.push(`${data.usage} tokens`);
    if (typeof data.thinkingDuration === "number" && data.thinkingDuration > 0)
      meta.push(`thought ${(data.thinkingDuration / 1000).toFixed(1)}s`);
    process.stdout.write(
      `\n${pc.dim("─".repeat(3))} ${pc.dim(meta.join(" · "))}\n`
    );
  }

  protected renderNotice(text: string) {
    process.stdout.write(`${pc.yellow("•")} ${pc.dim(text)}\n`);
  }

  protected speakerTag(msg: {
    ordinal: number;
    senderType: string;
    provider: string;
    model: string | null;
  }) {
    return msg.senderType === "USER"
      ? pc.green(`[${msg.ordinal}] you`)
      : `${pc.dim(`[${msg.ordinal}]`)} ${this.nameTag(msg.provider, msg.model ?? undefined)}`;
  }

  /** full message body — /expand <ordinal> from the local index */
  protected renderExpanded(msg: {
    ordinal: number;
    senderType: string;
    provider: string;
    model: string | null;
    content: string;
  }) {
    process.stdout.write(`\n${this.speakerTag(msg)}\n${msg.content}\n\n`);
  }

  /**
   * pathological-message safeguard for the resume window — generous enough
   * that ordinary long answers render whole; a capped message prints an
   * explicit marker with the exact /expand recovery, never a silent collapse
   */
  protected hydratedMessageCharCap = 10_000;

  /**
   * readable resume — the tail of a hydrated conversation renders with full
   * bodies, normal speaker headers, and preserved whitespace on /convo
   * attach. Recovering working context is the point of resuming; the window
   * must be lossless for the selected message count (Phase 2.0).
   */
  protected renderHydratedTail(
    data: EventTypeMap["hydrate_conversation_ack"],
    tailCount = 8
  ) {
    const tail = formatHydratedTail(data.pages, {
      tailCount,
      perMessageCharCap: this.hydratedMessageCharCap
    });
    for (const msg of tail.messages) {
      process.stdout.write(`\n${this.speakerTag(msg)}\n${msg.body}\n`);
      if (msg.truncated) {
        process.stdout.write(
          `${pc.yellow("…")} ${pc.dim(
            `truncated for display — ${msg.totalChars.toLocaleString()} chars total · /expand ${msg.ordinal} for the full message`
          )}\n`
        );
      }
    }
    process.stdout.write("\n");
    const window =
      tail.shownFromOrdinal !== null
        ? ` · showing messages ${tail.shownFromOrdinal}-${tail.shownToOrdinal} of ${tail.totalHydrated} hydrated`
        : ` · ${tail.totalHydrated} message(s) hydrated`;
    this.renderNotice(`attached · ${tail.title ?? "untitled"}${window}`);
    return tail.title;
  }
}
