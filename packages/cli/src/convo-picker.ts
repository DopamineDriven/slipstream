import pc from "picocolors";
import type { PickerIo, PickerView } from "@/types.ts";
import { MarkdownAnsiService } from "@/markdown-ansi.ts";
import type { ConversationListEntry } from "@slipstream/types";

/**
 * The conversation picker (CLI-layer 2A). Typed text is ONLY ever a filter —
 * never a parsed identifier — and attachment happens by selecting an entry
 * object the server itself supplied via conversation_list acks. Invalid input
 * is therefore unrepresentable: there is nothing to mistype, and nothing
 * unvalidated ever crosses the wire (web achieves the same impossibility via
 * routing; this is the terminal's equivalent).
 *
 * Pure decisions (ranking, windowing, selection clamping) live on
 * ConvoPickerService in the chain, under test; the raw-mode keypress shell
 * (CliConvoPicker) is deliberately thin and receives the service by
 * constructor injection. Framework-free per the CLI charter — keypress bytes
 * + ANSI repaint.
 */
export class ConvoPickerService extends MarkdownAnsiService {
  /** match-quality tiers — lower is better; updatedAt desc breaks ties */
  protected get pickerRanks() {
    return {
      exact: 0,
      titlePrefix: 1,
      wordPrefix: 2,
      titleSubstring: 3,
      idSubstring: 4
    } as const;
  }

  private rankEntry(entry: ConversationListEntry, query: string) {
    const ranks = this.pickerRanks;
    const title = entry.title?.toLowerCase() ?? null;
    if (title !== null) {
      if (title === query) return ranks.exact;
      if (title.startsWith(query)) return ranks.titlePrefix;
      if (title.split(/\s+/).some(word => word.startsWith(query))) {
        return ranks.wordPrefix;
      }
      if (title.includes(query)) return ranks.titleSubstring;
    }
    if (entry.id.toLowerCase().includes(query)) return ranks.idSubstring;
    return null;
  }

  /**
   * ranked filter over the frozen snapshot — exact > title-prefix >
   * word-prefix > substring > id-substring, updatedAt desc within a rank.
   * Empty query = everything, newest first.
   */
  public rankConversationEntries(
    entries: ConversationListEntry[],
    query: string
  ) {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    const ranked = Array.of<{ entry: ConversationListEntry; rank: number }>();
    for (const entry of entries) {
      const rank = this.rankEntry(entry, q);
      if (rank !== null) ranked.push({ entry, rank });
    }
    return ranked
      .sort((a, b) => a.rank - b.rank || b.entry.updatedAt - a.entry.updatedAt)
      .map(r => r.entry);
  }

  /**
   * pure view-model: filter against the frozen snapshot, clamp the selection
   * into range, and window maxRows rows around it (selection stays visible).
   */
  public buildPickerView(
    snapshot: ConversationListEntry[],
    query: string,
    requestedIndex: number,
    maxRows: number
  ) {
    const matches = this.rankConversationEntries(snapshot, query);
    if (matches.length === 0) {
      return { matches, rows: [], selectedIndex: null } satisfies PickerView;
    }
    const selectedIndex = Math.min(
      Math.max(requestedIndex, 0),
      matches.length - 1
    );
    const windowStart = Math.min(
      Math.max(selectedIndex - Math.floor(maxRows / 2), 0),
      Math.max(matches.length - maxRows, 0)
    );
    const rows = matches
      .slice(windowStart, windowStart + maxRows)
      .map((entry, i) => ({
        entry,
        selected: windowStart + i === selectedIndex
      }));
    return { matches, rows, selectedIndex } satisfies PickerView;
  }

  /**
   * titles are untrusted display text — some carry embedded newlines or run
   * to paragraph length (old title-gen artifacts). A picker row must be
   * exactly one physical terminal line or the repaint arithmetic
   * (renderedLines vs wrapped lines) corrupts the erase — collapse
   * whitespace and truncate.
   */
  public sanitizePickerTitle(title: string | null, budget: number) {
    const oneLine = (title ?? "(untitled)").replace(/\s+/g, " ").trim();
    const safeBudget = Math.max(4, budget);
    return oneLine.length > safeBudget
      ? `${oneLine.slice(0, safeBudget - 1)}…`
      : oneLine;
  }

  public relativeTime(updatedAt: number, now: number) {
    const deltaSec = Math.max(0, Math.round((now - updatedAt) / 1000));
    if (deltaSec < 60) return `${deltaSec}s ago`;
    if (deltaSec < 3600) return `${Math.round(deltaSec / 60)}m ago`;
    if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h ago`;
    return `${Math.round(deltaSec / 86_400)}d ago`;
  }
}

/**
 * One interactive selection over a frozen snapshot. ↑/↓ move, Enter attaches
 * the highlighted entry, Esc (or Ctrl+C) cancels, printable characters and
 * backspace edit the filter. Resolves the selected entry object — or null on
 * cancel/no-match — so the caller never touches user-typed text as identity.
 *
 * Ephemeral per invocation; the pure picker decisions come from the injected
 * ConvoPickerService (the repl passes itself — it sits down-chain).
 */
export class CliConvoPicker {
  private query: string;
  private index = 0;
  private renderedLines = 0;

  constructor(
    private readonly svc: ConvoPickerService,
    private readonly io: PickerIo,
    /** frozen at open — incoming list pages never reshuffle mid-navigation */
    private readonly snapshot: ConversationListEntry[],
    initialQuery = "",
    private readonly maxRows = 10
  ) {
    this.query = initialQuery;
  }

  public run() {
    const { stdin, stdout } = this.io;
    if (!stdin.isTTY || !stdout.isTTY) {
      return Promise.resolve(null);
    }
    const { promise, resolve } =
      Promise.withResolvers<ConversationListEntry | null>();
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    const finish = (picked: ConversationListEntry | null) => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      this.clear();
      resolve(picked);
    };

    const onData = (chunk: Buffer) => {
      const view = this.svc.buildPickerView(
        this.snapshot,
        this.query,
        this.index,
        this.maxRows
      );
      const bytes = chunk.toString("utf8");
      if (bytes === "\x03" || bytes === "\x1b") {
        finish(null);
        return;
      }
      if (bytes === "\r" || bytes === "\n") {
        finish(
          view.selectedIndex === null
            ? null
            : (view.matches[view.selectedIndex] ?? null)
        );
        return;
      }
      if (bytes === "\x1b[A") {
        this.index = (view.selectedIndex ?? 0) - 1;
      } else if (bytes === "\x1b[B") {
        this.index = (view.selectedIndex ?? 0) + 1;
      } else if (bytes === "\x7f" || bytes === "\b") {
        this.query = this.query.slice(0, -1);
        this.index = 0;
      } else if (!bytes.startsWith("\x1b")) {
        const printable = [...bytes]
          .filter(ch => ch >= " " && ch !== "\x7f")
          .join("");
        if (printable.length > 0) {
          this.query += printable;
          this.index = 0;
        }
      }
      this.render();
    };

    stdin.on("data", onData);
    this.render();
    return promise;
  }

  private clear() {
    if (this.renderedLines > 0) {
      this.io.stdout.write(`\x1b[${this.renderedLines}A\r\x1b[0J`);
      this.renderedLines = 0;
    }
  }

  private render() {
    const view = this.svc.buildPickerView(
      this.snapshot,
      this.query,
      this.index,
      this.maxRows
    );
    this.index = view.selectedIndex ?? 0;
    const now = Date.now();
    const lines = Array.of<string>(
      `${pc.green("❯")} ${pc.dim("filter:")} ${this.query}${pc.dim("▌")}`
    );
    const columns = this.io.stdout.columns ?? 120;
    for (const row of view.rows) {
      const metaText = `${row.entry.messageCount} msgs · ${this.svc.relativeTime(row.entry.updatedAt, now)}`;
      const title = this.svc.sanitizePickerTitle(
        row.entry.title,
        columns - metaText.length - 5
      );
      const meta = pc.dim(metaText);
      lines.push(
        row.selected
          ? `${pc.cyan("❯")} ${pc.cyan(title)} ${meta}`
          : `  ${title} ${meta}`
      );
    }
    if (view.matches.length === 0) {
      lines.push(pc.dim("  no matches — Esc to cancel"));
    }
    lines.push(
      pc.dim(
        `  ↑↓ move · Enter attach · Esc cancel · ${view.matches.length} match(es)`
      )
    );
    this.clear();
    this.io.stdout.write(`${lines.join("\n")}\n`);
    this.renderedLines = lines.length;
  }
}
