import pc from "picocolors";
import type {
  ModelPickerModelRow,
  ModelPickerOutcome,
  ModelPickerProviderRow,
  PickerIo
} from "@/types.ts";
import { ConvoPickerService } from "@/convo-picker.ts";
import type { Provider } from "@slipstream/types";
import { modelIdsByProvider, modelIdToDisplayName } from "@slipstream/types";

/** vercel is never pickable (dead first-party API) — narrowed out of the type */
export type PickableProvider = Exclude<Provider, "vercel">;
/** the registry's model id union — what ai_chat_request.model accepts */
export type PickableModelId = (typeof modelIdsByProvider)[Provider][number];

/**
 * Model picker decisions (config-planning §5) — the two-stage provider →
 * model selector, built ENTIRELY on the registry (modelIdsByProvider +
 * modelIdToDisplayName): no alias table, ids are identity, display names
 * are labels. Provider selection is never terminal — it branches into the
 * provider's model list, and the pair only leaves the picker when a model
 * is chosen. Pure view-models live here under test; the raw-mode shell
 * (CliModelPicker) is thin and receives this service by injection.
 */
export class ModelPickerService extends ConvoPickerService {
  constructor(wsUrl?: string) {
    super(wsUrl);
  }

  /**
   * the registry's provider order — stable across opens. vercel is excluded
   * (v0's first-party API was dismantled in March 2026 — a lingering
   * appendage, never a pickable option)
   */
  public get pickerProviders() {
    return Object.keys(modelIdsByProvider).filter(
      (p): p is PickableProvider => p !== "vercel"
    );
  }

  /** nested registry map (provider → id → name); falls back to the id */
  public modelDisplayName(provider: Provider, modelId: string) {
    const names: Record<string, string> = modelIdToDisplayName[provider];
    return names[modelId] ?? modelId;
  }

  /** the model id a typed display name OR id resolves to, else undefined */
  public resolveTypedModel(text: string) {
    const trimmed = text.trim();
    for (const provider of this.pickerProviders) {
      const ids: readonly PickableModelId[] = modelIdsByProvider[provider];
      const byId = ids.find(id => id === trimmed);
      if (byId) return { provider, modelId: byId } as const;
      const byName = ids.find(
        id =>
          this.modelDisplayName(provider, id).toLowerCase() ===
          trimmed.toLowerCase()
      );
      if (byName) return { provider, modelId: byName } as const;
    }
    return undefined;
  }

  public buildProviderRows(
    defaultProvider: Provider | undefined,
    sessionProvider: Provider
  ) {
    return this.pickerProviders.map(
      provider =>
        ({
          provider,
          modelCount: modelIdsByProvider[provider].length,
          isDefault: provider === defaultProvider,
          isSession: provider === sessionProvider
        }) satisfies ModelPickerProviderRow
    );
  }

  public buildModelRows(
    provider: Provider,
    defaultModelId: string | undefined,
    sessionModelId: string
  ) {
    const ids: readonly PickableModelId[] = modelIdsByProvider[provider];
    return ids.map(
      modelId =>
        ({
          provider,
          modelId,
          displayName: this.modelDisplayName(provider, modelId),
          isDefault: modelId === defaultModelId,
          isSession: modelId === sessionModelId
        }) satisfies ModelPickerModelRow
    );
  }

  /** filter rows by a typed query against label + id; empty = all */
  public filterModelRows(rows: ModelPickerModelRow[], query: string) {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return rows;
    return rows.filter(
      r =>
        r.displayName.toLowerCase().includes(q) ||
        r.modelId.toLowerCase().includes(q)
    );
  }

  /** windowing shared by both stages — keeps the selection visible */
  public windowRows<T>(rows: T[], selectedIndex: number, maxRows: number) {
    if (rows.length === 0) return { start: 0, slice: Array.of<T>() };
    const start = Math.min(
      Math.max(selectedIndex - Math.floor(maxRows / 2), 0),
      Math.max(rows.length - maxRows, 0)
    );
    return { start, slice: rows.slice(start, start + maxRows) };
  }
}

/**
 * One interactive selection: stage 1 lists providers, Enter/→ descends into
 * that provider's models, ←/Backspace-on-empty ascends. In the model stage,
 * Enter resolves { kind: "default" } (the caller persists via
 * cli_config_update), `s` resolves { kind: "session" } (ChatSessionState
 * only), Esc/Ctrl+C cancels. Typing filters the model list. Ephemeral per
 * invocation, framework-free — keypress bytes + ANSI repaint, mirroring
 * CliConvoPicker.
 */
export class CliModelPicker {
  private stage: "provider" | "model" = "provider";
  private provider?: Provider = undefined;
  private providerIndex = 0;
  private modelIndex = 0;
  private query = "";
  private renderedLines = 0;

  constructor(
    private readonly svc: ModelPickerService,
    private readonly io: PickerIo,
    private readonly current: {
      defaultProvider?: Provider;
      defaultModelId?: string;
      sessionProvider: Provider;
      sessionModelId: string;
    },
    private readonly maxRows = 12
  ) {
    // open on the provider holding the roaming default (else the session's)
    const anchor: Provider = current.defaultProvider ?? current.sessionProvider;
    const idx = this.svc.pickerProviders.findIndex(p => p === anchor);
    this.providerIndex = idx === -1 ? 0 : idx;
  }

  public run() {
    const { stdin, stdout } = this.io;
    if (!stdin.isTTY || !stdout.isTTY) {
      return Promise.resolve({ kind: "cancel" } as const satisfies ModelPickerOutcome);
    }
    const { promise, resolve } = Promise.withResolvers<ModelPickerOutcome>();
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    const finish = (outcome: ModelPickerOutcome) => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      this.clear();
      resolve(outcome);
    };

    const onData = (chunk: Buffer) => {
      const bytes = chunk.toString("utf8");
      if (bytes === "\x03" || bytes === "\x1b") {
        finish({ kind: "cancel" });
        return;
      }
      if (this.stage === "provider") {
        this.handleProviderKey(bytes);
      } else {
        const outcome = this.handleModelKey(bytes);
        if (outcome) {
          finish(outcome);
          return;
        }
      }
      this.render();
    };

    stdin.on("data", onData);
    this.render();
    return promise;
  }

  private providerRows() {
    return this.svc.buildProviderRows(
      this.current.defaultProvider,
      this.current.sessionProvider
    );
  }

  private modelRows() {
    if (!this.provider) return Array.of<ModelPickerModelRow>();
    return this.svc.filterModelRows(
      this.svc.buildModelRows(
        this.provider,
        this.current.defaultModelId,
        this.current.sessionModelId
      ),
      this.query
    );
  }

  private handleProviderKey(bytes: string) {
    const rows = this.providerRows();
    if (bytes === "\x1b[A") {
      this.providerIndex = Math.max(this.providerIndex - 1, 0);
    } else if (bytes === "\x1b[B") {
      this.providerIndex = Math.min(this.providerIndex + 1, rows.length - 1);
    } else if (bytes === "\r" || bytes === "\n" || bytes === "\x1b[C") {
      const row = rows[this.providerIndex];
      if (row) {
        this.provider = row.provider;
        this.stage = "model";
        this.query = "";
        // land on the default/session model within this provider when present
        const models = this.modelRows();
        const anchor = models.findIndex(m => m.isDefault || m.isSession);
        this.modelIndex = anchor === -1 ? 0 : anchor;
      }
    }
  }

  /**
   * a burst of DEL/BS bytes (paste, fast typing, pty chunking) arrives as one
   * string — treat each as its own keystroke so backspace is never swallowed
   */
  private isBackspaceBurst(bytes: string) {
    return bytes.length > 0 && [...bytes].every(ch => ch === "\x7f" || ch === "\b");
  }

  private handleModelKey(bytes: string): ModelPickerOutcome | undefined {
    const rows = this.modelRows();
    if (bytes === "\x1b[A") {
      this.modelIndex = Math.max(this.modelIndex - 1, 0);
      return undefined;
    }
    if (bytes === "\x1b[B") {
      this.modelIndex = Math.min(this.modelIndex + 1, Math.max(rows.length - 1, 0));
      return undefined;
    }
    if (bytes === "\x1b[D") {
      this.ascend();
      return undefined;
    }
    if (this.isBackspaceBurst(bytes)) {
      for (const _ of bytes) {
        if (this.query.length === 0) {
          // backspace on an empty filter ascends — once, then stop
          this.ascend();
          return undefined;
        }
        this.query = this.query.slice(0, -1);
      }
      this.modelIndex = 0;
      return undefined;
    }
    const selected = rows[Math.min(this.modelIndex, Math.max(rows.length - 1, 0))];
    if (bytes === "\r" || bytes === "\n") {
      return selected
        ? { kind: "default", provider: selected.provider, modelId: selected.modelId }
        : undefined;
    }
    if (bytes === "s" && this.query.length === 0) {
      return selected
        ? { kind: "session", provider: selected.provider, modelId: selected.modelId }
        : undefined;
    }
    if (!bytes.startsWith("\x1b")) {
      const printable = [...bytes].filter(ch => ch >= " " && ch !== "\x7f").join("");
      if (printable.length > 0) {
        this.query += printable;
        this.modelIndex = 0;
      }
    }
    return undefined;
  }

  private ascend() {
    this.stage = "provider";
    this.provider = undefined;
    this.query = "";
  }

  private clear() {
    if (this.renderedLines > 0) {
      this.io.stdout.write(`\x1b[${this.renderedLines}A\r\x1b[0J`);
      this.renderedLines = 0;
    }
  }

  private render() {
    const lines = Array.of<string>();
    if (this.stage === "provider") {
      const rows = this.providerRows();
      lines.push(pc.bold(pc.cyan("Select provider")));
      lines.push(
        pc.dim("Providers are umbrellas — pick one to browse its models. Enter/→ to descend.")
      );
      lines.push("");
      const { start, slice } = this.svc.windowRows(rows, this.providerIndex, this.maxRows);
      if (start > 0) lines.push(pc.dim(`  ↑ ${start} more above`));
      slice.forEach((row, i) => {
        const idx = start + i;
        const selected = idx === this.providerIndex;
        const marks = `${row.isDefault ? pc.magenta(" ✔") : ""}${row.isSession && !row.isDefault ? pc.dim(" ·session") : ""}`;
        const label = `${String(idx + 1).padStart(2)}. ${row.provider}`;
        const count: number = row.modelCount;
        const meta = pc.dim(`${count} model${count === 1 ? "" : "s"}`);
        lines.push(
          selected
            ? `${pc.cyan("❯")} ${pc.cyan(label)}${marks}  ${meta}`
            : `  ${label}${marks}  ${meta}`
        );
      });
      const below = rows.length - (start + slice.length);
      if (below > 0) lines.push(pc.dim(`  ↓ ${below} more below`));
      lines.push("");
      lines.push(pc.dim("Enter/→ browse models · Esc cancel"));
    } else {
      const rows = this.modelRows();
      lines.push(pc.bold(pc.cyan(`Select model · ${this.provider ?? ""}`)));
      lines.push(
        pc.dim("Enter sets your roaming default (persists across machines). s uses it this session only.")
      );
      lines.push(`${pc.green("❯")} ${pc.dim("filter:")} ${this.query}${pc.dim("▌")}`);
      const clamped = Math.min(this.modelIndex, Math.max(rows.length - 1, 0));
      const { start, slice } = this.svc.windowRows(rows, clamped, this.maxRows);
      if (start > 0) lines.push(pc.dim(`  ↑ ${start} more above`));
      slice.forEach((row, i) => {
        const idx = start + i;
        const selected = idx === clamped;
        const marks = `${row.isDefault ? pc.magenta(" ✔") : ""}${row.isSession && !row.isDefault ? pc.dim(" ·session") : ""}`;
        const label = `${String(idx + 1).padStart(2)}. ${row.displayName}`;
        const meta = pc.dim(row.modelId);
        lines.push(
          selected
            ? `${pc.cyan("❯")} ${pc.cyan(label)}${marks}  ${meta}`
            : `  ${label}${marks}  ${meta}`
        );
      });
      const below = rows.length - (start + slice.length);
      if (below > 0) lines.push(pc.dim(`  ↓ ${below} more below`));
      if (rows.length === 0) lines.push(pc.dim("  no matches — Backspace to clear"));
      lines.push("");
      lines.push(
        pc.dim("Enter set as default · s this session only · ← back to providers · Esc cancel")
      );
    }
    this.clear();
    this.io.stdout.write(`${lines.join("\n")}\n`);
    this.renderedLines = lines.length;
  }
}
