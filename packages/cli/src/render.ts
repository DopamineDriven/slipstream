import pc from "picocolors";
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

  /** compact tail of a hydrated conversation — context on /convo attach */
  protected renderHydratedTail(
    data: EventTypeMap["hydrate_conversation_ack"],
    tailCount = 8
  ) {
    const messages = data.pages
      .flatMap(page => page.convo.messages)
      .sort((a, b) => a.ordinal - b.ordinal);
    const title = data.pages[0]?.convo.title ?? null;
    const tail = messages.slice(-tailCount);
    process.stdout.write("\n");
    for (const msg of tail) {
      const oneLine = msg.content.replace(/\s+/g, " ").trim();
      const preview =
        oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine;
      process.stdout.write(`${this.speakerTag(msg)} ${pc.dim(preview)}\n`);
    }
    this.renderNotice(
      `attached · ${title ?? "untitled"} · ${messages.length} message(s) hydrated (showing last ${tail.length})`
    );
    return title;
  }
}
