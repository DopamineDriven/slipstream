import pc from "picocolors";
import { FormatHydratedTailService } from "@/hydrated-history.ts";

/**
 * Markdown → ANSI (line-buffered) for the append-only renderer. The web's
 * unified/rehype pipeline targets a DOM React re-renders freely; a terminal
 * gets one shot at every byte, so full-document parsing is out and the unit
 * of styling is the COMPLETE LINE — inline markdown almost never crosses
 * lines in model output, block constructs are line-prefixes, and the only
 * cross-line state is "inside a code fence". Markdown degrades gracefully
 * by design: anything unparseable emits literally, so the styler only ever
 * has to be better than raw, never perfect. Zero new deps — picocolors
 * (already shipped) plus OSC 8 hyperlinks where the terminal supports
 * color at all.
 *
 * Chain service (pure decisions, under test); MarkdownStreamState below is
 * the per-turn ephemeral buffer, the CliConvoPicker pattern.
 */
export class MarkdownAnsiService extends FormatHydratedTailService {
  /** off switch — NO_COLOR convention or explicit --no-markdown flag */
  protected get markdownEnabled() {
    return (
      typeof process.env.NO_COLOR === "undefined" &&
      !process.argv.includes("--no-markdown")
    );
  }

  /** ``` or ~~~ (with optional indent + info string) opens/closes a fence */
  public isFenceDelimiter(line: string) {
    return /^\s*(?:```|~~~)/.test(line);
  }

  /** fence delimiters and fenced code lines: dim, no inline processing */
  public styleCodeLine(line: string) {
    return this.markdownEnabled ? pc.dim(line) : line;
  }

  /**
   * one complete line → styled line. Block constructs dispatch on the line
   * prefix; everything else flows through the inline styler.
   */
  public styleLine(line: string) {
    if (!this.markdownEnabled) return line;

    // horizontal rule
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      return pc.dim("─".repeat(24));
    }

    // headings — bold+cyan whole-line, no inline processing (nested ANSI
    // resets inside an outer style aren't worth the fight)
    const heading = /^(\s*)(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const [, indent = "", hashes = "", rest = ""] = heading;
      return `${indent}${pc.bold(pc.cyan(`${hashes} ${rest}`))}`;
    }

    // blockquote gutter
    const quote = /^(\s*)>\s?(.*)$/.exec(line);
    if (quote) {
      const [, indent = "", rest = ""] = quote;
      return `${indent}${pc.dim("│ ")}${pc.italic(this.styleInline(rest))}`;
    }

    // unordered list bullet
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      const [, indent = "", rest = ""] = bullet;
      return `${indent}${pc.cyan("•")} ${this.styleInline(rest)}`;
    }

    // ordered list marker
    const ordered = /^(\s*)(\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (ordered) {
      const [, indent = "", marker = "", rest = ""] = ordered;
      return `${indent}${pc.cyan(marker)} ${this.styleInline(rest)}`;
    }

    return this.styleInline(line);
  }

  /**
   * inline spans within one line: code first (its contents are protected
   * from every other transform), then images/links (OSC 8 hyperlinks when
   * color is supported, `text (url)` when piped), bold, italic, strike.
   * Unclosed spans fail every regex and emit literally — the degradation
   * contract.
   */
  public styleInline(text: string) {
    if (!this.markdownEnabled) return text;
    const segments = Array.of<string>();
    const codeSpan = /`([^`]+)`/g;
    let cursor = 0;
    for (let m = codeSpan.exec(text); m !== null; m = codeSpan.exec(text)) {
      segments.push(this.styleNonCode(text.slice(cursor, m.index)));
      segments.push(pc.cyan(m[1] ?? ""));
      cursor = m.index + m[0].length;
    }
    segments.push(this.styleNonCode(text.slice(cursor)));
    return segments.join("");
  }

  private styleNonCode(text: string) {
    return (
      text
        // images: alt text as a dim tagged hyperlink
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, url: string) =>
          this.hyperlink(pc.dim(`[img: ${alt.length > 0 ? alt : url}]`), url)
        )
        // links
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) =>
          this.hyperlink(pc.cyan(pc.underline(label)), url)
        )
        // bold before italic so ** is consumed first
        .replace(/\*\*(.+?)\*\*/g, (_, inner: string) => pc.bold(inner))
        .replace(/__(.+?)__/g, (_, inner: string) => pc.bold(inner))
        .replace(/(?<![*\w])\*(?!\s)([^*]+?)(?<!\s)\*(?![*\w])/g, (_, inner: string) =>
          pc.italic(inner)
        )
        // underscore italic guarded against snake_case identifiers
        .replace(/(?<![\w])_(?!\s)([^_]+?)(?<!\s)_(?![\w])/g, (_, inner: string) =>
          pc.italic(inner)
        )
        .replace(/~~(.+?)~~/g, (_, inner: string) => pc.strikethrough(inner))
    );
  }

  /** OSC 8 clickable hyperlink; `label (url)` when output is piped/colorless */
  private hyperlink(label: string, url: string) {
    return pc.isColorSupported
      ? `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`
      : `${label} (${url})`;
  }

  /**
   * complete text (resume tail, /expand) — every line flushes, fresh fence
   * state per message
   */
  public styleMarkdown(text: string) {
    if (!this.markdownEnabled) return text;
    const stream = this.createMarkdownStream();
    const styled = stream.push(text.endsWith("\n") ? text : `${text}\n`);
    const tail = stream.flush();
    return tail.length > 0 ? `${styled}${tail}` : styled;
  }

  /** one per live turn — the renderer resets it in beginTurnRender */
  public createMarkdownStream() {
    return new MarkdownStreamState(this);
  }
}

/**
 * The per-turn streaming buffer: holds back only the current incomplete
 * line, emits styled lines as newlines arrive, tracks fence state across
 * pushes. Ephemeral with real state — constructor-injected service, the
 * CliConvoPicker pattern. Source-character accounting stays with the
 * renderer's watermark; this class only transforms the emitted VIEW.
 */
export class MarkdownStreamState {
  private pending = "";
  private inFence = false;

  constructor(private readonly svc: MarkdownAnsiService) {}

  /** styled output ready to emit for this piece (may be empty) */
  public push(piece: string) {
    this.pending += piece;
    if (!this.pending.includes("\n")) return "";
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    return lines.map(line => `${this.styleOne(line)}\n`).join("");
  }

  /** emit whatever partial line remains (block/turn boundary) */
  public flush() {
    if (this.pending.length === 0) return "";
    const out = this.styleOne(this.pending);
    this.pending = "";
    return out;
  }

  private styleOne(line: string) {
    if (this.svc.isFenceDelimiter(line)) {
      this.inFence = !this.inFence;
      return this.svc.styleCodeLine(line);
    }
    return this.inFence
      ? this.svc.styleCodeLine(line)
      : this.svc.styleLine(line);
  }
}
