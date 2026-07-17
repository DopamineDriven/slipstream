import type { BlockBearingMessage } from "@/types.ts";
import { ConvoPickerService } from "@/convo-picker.ts";
import pc from "picocolors";
import type { ChatChunkAndResMsgBlock, EventTypeMap } from "@slipstream/types";

/**
 * Streaming renderer — block-authoritative, mirroring the web store's
 * ordinal-keyed fold (store-types.ts §blocks) adapted to append-only stdout.
 * The block's `type` — not which delta field is populated — decides
 * reasoning vs answer, so interleaved thinking/text/tool switches render
 * seamlessly across every provider. Each block's `content` accumulates and
 * streams piece-by-piece within its ordinal; a per-ordinal printed-length
 * watermark yields exactly the unseen suffix (correct for anthropic deltas
 * AND gemini full-aggregate re-sends alike).
 */
export class CliRendererService extends ConvoPickerService {
  constructor(wsUrl?: string) {
    super(wsUrl);
  }

  protected showThinking = true;

  /** ordinal → chars already written for that block (the stream watermark) */
  private printedByOrdinal = new Map<number, number>();
  /** last block class rendered — drives the ∴ header and the reasoning→answer gap */
  private lastRenderedClass?: "reasoning" | "text";
  /**
   * per-turn markdown line buffer — transforms the emitted VIEW of TEXT
   * pieces only; the watermark above keeps counting SOURCE characters, so
   * the dedup/reconcile math is untouched. The pending partial line spans
   * block ordinals safely (consecutive TEXT blocks concatenate exactly as
   * the raw path did).
   */
  private mdStream = this.createMarkdownStream();

  /** reset per-turn render state — call at send time */
  protected beginTurnRender() {
    this.printedByOrdinal.clear();
    this.lastRenderedClass = undefined;
    this.mdStream = this.createMarkdownStream();
  }

  protected nameTag(provider: string, model: string | undefined) {
    return pc.cyan(`[${provider.toLowerCase()}/${model ?? "unknown"}]`);
  }

  /**
   * emit the unseen tail of a block, styled by its type. Reasoning blocks
   * (THINKING / ENCRYPTED_THINKING) render dim under a single ∴ header;
   * TEXT renders raw. Re-entering reasoning after text re-shows the header —
   * interleaving is handled by the type switch, never guessed.
   */
  private emitBlockPiece(type: ChatChunkAndResMsgBlock["type"], piece: string) {
    if (piece.length === 0) return;
    if (this.isReasoningBlock(type)) {
      if (!this.showThinking) return;
      if (this.lastRenderedClass !== "reasoning") {
        // entering reasoning mid-answer: the pending partial text line must
        // land before the ∴ header or it visually attaches to the thinking
        const pendingText = this.mdStream.flush();
        if (pendingText.length > 0) process.stdout.write(pendingText);
        process.stdout.write(pc.dim("\n∴ thinking…\n"));
        this.lastRenderedClass = "reasoning";
      }
      process.stdout.write(pc.dim(piece));
      return;
    }
    if (this.lastRenderedClass === "reasoning") {
      process.stdout.write("\n\n");
    }
    this.lastRenderedClass = "text";
    process.stdout.write(this.mdStream.push(piece));
  }

  /** advance the watermark and emit only the growth for a block's ordinal */
  private renderBlock(block: ChatChunkAndResMsgBlock) {
    const already = this.printedByOrdinal.get(block.ordinal) ?? 0;
    const piece = block.content.slice(already);
    this.printedByOrdinal.set(
      block.ordinal,
      Math.max(already, block.content.length)
    );
    this.emitBlockPiece(block.type, piece);
  }

  protected renderChunk(data: EventTypeMap["ai_chat_chunk"]) {
    // ai_chat_chunk carries ONE block — the authoritative unit. Type drives
    // the switch; the watermark drives the delta.
    if (data.messageBlocks) {
      this.renderBlock(data.messageBlocks);
      return;
    }
    // fallback for the rare block-less frame (e.g. a resume replay with no
    // block): text passthrough via the same line buffer, thinking dropped
    // (unclassifiable here)
    if (data.chunk) {
      if (this.lastRenderedClass === "reasoning") {
        process.stdout.write("\n\n");
      }
      this.lastRenderedClass = "text";
      process.stdout.write(this.mdStream.push(data.chunk));
    }
  }

  protected renderResponse(data: EventTypeMap["ai_chat_response"]) {
    // reconcile: print any authoritative block content the live stream never
    // showed. The shared watermark makes this zero-duplication — a fully
    // streamed block slices to empty; a dropped block prints in full.
    if (data.messageBlocks) {
      for (const block of [...data.messageBlocks].sort(
        (a, b) => a.ordinal - b.ordinal
      )) {
        this.renderBlock(block);
      }
    }
    // the final answer line rarely ends with \n — land it before the meta rule
    const pendingText = this.mdStream.flush();
    if (pendingText.length > 0) process.stdout.write(pendingText);
    this.lastRenderedClass = undefined;
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

  /**
   * full message body — /expand <ordinal> from the local index. Reasoning
   * blocks render dim above the answer (TEXT), mirroring the live stream;
   * block-authoritative with the flat column as legacy fallback.
   */
  protected renderExpanded(
    msg: {
      ordinal: number;
      senderType: string;
      provider: string;
      model: string | null;
    } & BlockBearingMessage
  ) {
    const body = this.renderableBlocks(msg)
      .map(b =>
        this.isReasoningBlock(b.type)
          ? pc.dim(b.content)
          : msg.senderType === "USER"
            ? b.content
            : this.styleMarkdown(b.content)
      )
      .join("\n\n");
    process.stdout.write(`\n${this.speakerTag(msg)}\n${body}\n\n`);
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
    const tail = this.formatHydratedTail(data.pages, {
      tailCount,
      perMessageCharCap: this.hydratedMessageCharCap
    });
    for (const msg of tail.messages) {
      // AI markdown styles; user-typed text stays byte-exact (the lossless
      // resume contract applies to what the human actually wrote)
      const body =
        msg.senderType === "USER" ? msg.body : this.styleMarkdown(msg.body);
      process.stdout.write(`\n${this.speakerTag(msg)}\n${body}\n`);
      if (msg.truncated) {
        process.stdout.write(
          `${pc.yellow("…")} ${pc.dim(
            `truncated for display — ${msg.totalChars.toLocaleString()} chars total · /expand ${msg.ordinal} for the full message`
          )}\n`
        );
      }
    }
    process.stdout.write("\n");
    // ordinals and counts are different units — "85-92 of 48" reads as a bug
    const window =
      tail.shownFromOrdinal !== null
        ? ` · showing messages ${tail.shownFromOrdinal}-${tail.shownToOrdinal} · ${tail.totalHydrated} hydrated`
        : ` · ${tail.totalHydrated} message(s) hydrated`;
    this.renderNotice(`attached · ${tail.title ?? "untitled"}${window}`);
    return tail.title;
  }
}
