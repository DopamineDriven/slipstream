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
  protected showThinking = true;

  protected nameTag(provider: string, model: string | undefined) {
    return pc.cyan(`[${provider.toLowerCase()}/${model ?? "unknown"}]`);
  }

  protected renderChunk(data: EventTypeMap["ai_chat_chunk"]) {
    if (data.thinkingText) {
      if (!this.showThinking) return;
      if (!this.wasThinking) {
        process.stdout.write(pc.dim("\n∴ thinking…\n"));
        this.wasThinking = true;
      }
      process.stdout.write(pc.dim(data.thinkingText));
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
      const speaker =
        msg.senderType === "USER"
          ? pc.green(`[${msg.ordinal}] you`)
          : `${pc.dim(`[${msg.ordinal}]`)} ${this.nameTag(msg.provider, msg.model ?? undefined)}`;
      process.stdout.write(`${speaker} ${pc.dim(preview)}\n`);
    }
    this.renderNotice(
      `attached · ${title ?? "untitled"} · ${messages.length} message(s) hydrated (showing last ${tail.length})`
    );
    return title;
  }
}
