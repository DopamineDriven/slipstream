import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import { wsDebug } from "@/chat-ws-client.ts";
import { CliConvoPicker } from "@/convo-picker.ts";
import { CliLocalToolsService } from "@/local-tools.ts";
import { CliModelPicker } from "@/model-picker.ts";
import { CLI_MODELS } from "@/types.ts";
import type { ChatSessionState, CliActiveModel } from "@/types.ts";
import type {
  AllModelsUnion,
  ConversationListEntry,
  MessageSingleton,
  Provider
} from "@slipstream/types";

/**
 * The loop — orchestration top of the chain (config → client → renderer →
 * repl). One persistent readline; lines starting with "/" hit the hand-rolled
 * command router, everything else becomes an ai_chat_request against the
 * active conversation/model state. The prompt yields while a response
 * streams (Promise.withResolvers resolved by ai_chat_response).
 */
export class SlipstreamReplService extends CliLocalToolsService {
  constructor(wsUrl?: string) {
    super(wsUrl);
  }

  private rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string): [string[], string] => this.complete(line)
  });

  /**
   * id → conversation metadata, warmed by the post-handshake push (one ack
   * per generator page, newest first) and kept fresh by rekey upserts +
   * /convos refresh. Powers Tab-completion and the picker snapshot — every
   * attachable id comes from here (server-fed), never from typed text.
   */
  private convoIndex = new Map<string, ConversationListEntry>();

  /**
   * readline Tab-completion — commands, roster aliases, conversation titles.
   * Contract: return [candidates, matchedPortion] where candidates REPLACE
   * the matched portion — readline inline-completes their common prefix and
   * lists them on ambiguity. Returning the whole line as matchedPortion (the
   * v1 bug) made inline completion impossible and dumped the full list.
   */
  private complete(line: string): [string[], string] {
    if (line.startsWith("/convo ")) {
      const partial = line.slice("/convo ".length);
      const q = partial.toLowerCase();
      const titles = [...this.convoIndex.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(c => c.title ?? c.id);
      const starts = titles.filter(t => t.toLowerCase().startsWith(q));
      // startsWith hits inline-complete; fall back to listing contains-hits
      const hits =
        starts.length > 0
          ? starts
          : titles.filter(t => t.toLowerCase().includes(q));
      return [hits, partial];
    }
    if (line.startsWith("/model ") || line.startsWith("/config model ")) {
      const prefix = line.startsWith("/model ") ? "/model " : "/config model ";
      const partial = line.slice(prefix.length);
      const q = partial.toLowerCase();
      // aliases first (fast lane), then every registry id — the picker's
      // universe, so anything selectable is also completable
      const aliases = CLI_MODELS.map(m => m.alias).filter(a => a.startsWith(q));
      const ids = this.pickerProviders
        .flatMap(p => this.buildModelRows(p, undefined, "").map(r => r.modelId))
        .filter(id => id.toLowerCase().startsWith(q));
      return [[...aliases, ...ids], partial];
    }
    if (line.startsWith("/")) {
      const hits = [...this.commands.keys()]
        .map(cmd => `/${cmd}`)
        .filter(cmd => cmd.startsWith(line));
      return [hits, line];
    }
    return [[], line];
  }

  private turn?: PromiseWithResolvers<void>;

  /** popup re-entrancy guard — one picker owns stdin at a time */
  private pickerOpen = false;
  /** true only while the prompt is awaiting a line — popups trigger nowhere else */
  private awaitingLine = false;
  /**
   * set by the keypress watcher the moment the buffer becomes "/convo …"
   * or "/model …" (the SPACE is the trigger, not Enter) — the pending
   * question is force-submitted and the loop opens the matching picker
   * seeded with whatever followed (Claude-Code @-mention UX: live)
   */
  private pickerRequest?: { kind: "convo" | "model"; seed: string };

  /**
   * transactional attach — the active session stays intact until the
   * hydration ack for THIS id arrives; mismatched/late acks are discarded and
   * a quiet server means a timeout notice, not a corrupted session
   */
  private pendingAttach?: {
    id: string;
    label: string;
    timeout: NodeJS.Timeout;
  };

  /**
   * ordinal → full message, fed by hydration acks AND live response commits
   * (idempotent upserts — the ChatStore.byId discipline, keyed by ordinal).
   * /expand reads from here; cleared on /new and /convo.
   */
  private messageIndex = new Map<number, MessageSingleton<true>>();

  private state: ChatSessionState = {
    conversationId: this.freshConversationId(),
    title: null,
    entry: CLI_MODELS[0],
    systemPrompt: undefined,
    showThinking: true
  };

  /**
   * identity-plane hooks (config-planning §5) — seeding happens ONCE at
   * hydrate (startup); update acks narrate + reconcile (the DTO on every
   * ack is canonical truth; the chain link already assigned it)
   */
  private wireIdentityHooks() {
    this.onCliConfigHydrated = config => {
      // the wire DTO carries the model as a plain string (a registry regen
      // may retire an id) — resolve it against THIS build's registry before
      // adopting; an unknown id keeps the shipped default and says so
      const target = this.resolveTypedModel(config.defaultModel);
      if (!target) {
        this.renderNotice(
          `roaming default ${config.defaultProvider}/${config.defaultModel} is not in this build's registry — keeping ${this.describeEntry(this.state.entry)}`
        );
      } else {
        const changed =
          this.state.entry.provider !== target.provider ||
          this.state.entry.model !== target.modelId;
        this.state.entry = this.activeModelFor(target.provider, target.modelId);
        if (changed) {
          this.renderNotice(`roaming default · ${this.describeEntry(this.state.entry)}`);
        }
      }
      this.showThinking = config.showThinking;
      this.state.showThinking = config.showThinking;
    };
    this.onCliConfigUpdateAck = ack => {
      this.renderNotice(
        ack.success
          ? `default saved · ${ack.cliConfig.defaultProvider}/${ack.cliConfig.defaultModel} · thinking ${ack.cliConfig.showThinking ? "shown" : "hidden"}`
          : `config update rejected · ${ack.reason ?? "unknown reason"} — server kept ${ack.cliConfig.defaultProvider}/${ack.cliConfig.defaultModel}`
      );
    };
  }

  /**
   * resume lens helpers — recency ids land async (ack) and entries land
   * async (conversation_list_ack pages), so both attach paths poll for the
   * overlap with a bounded window (the awaitProviderContext pattern)
   */
  private async awaitRecentEntry(index: number, timeoutMs = 4_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const id = this.recentConversationIds[index];
      if (typeof id !== "undefined") {
        const entry = this.convoIndex.get(id);
        if (entry) return entry;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return undefined;
  }

  /** --continue: attach straight to the most recent CLI conversation */
  private async continueMostRecent() {
    const entry = await this.awaitRecentEntry(0);
    if (!entry) {
      this.renderNotice(
        "no CLI-recent conversation to continue — fresh session"
      );
      return;
    }
    this.attachTo(entry);
  }

  /** /resume + --resume: the picker narrowed to the recency lens */
  private async resumeFromRecent() {
    this.refreshRecentConvos();
    await this.awaitRecentEntry(0, 2_500);
    if (this.recentConversationIds.length === 0) {
      this.renderNotice(
        "no CLI activity recorded yet — /convos ranges the whole archive"
      );
      return;
    }
    if (!process.stdin.isTTY) {
      for (const id of this.recentConversationIds) {
        const c = this.convoIndex.get(id);
        this.renderNotice(c ? `${c.title ?? "(untitled)"} · ${c.id}` : id);
      }
      return;
    }
    await this.pickConversation("", this.recentConversationIds);
  }

  /** /config model <alias|model-id|display-name> — the persistent lane */
  private async setDefaultModel(raw: string) {
    const target = this.resolveModelTarget(raw);
    if (!target) {
      this.renderNotice(
        `"${raw.trim()}" is not a roster alias, model id, or display name — /model opens the picker`
      );
      return;
    }
    await this.persistDefaultModel(target.provider, target.modelId);
  }

  /**
   * transactional attach — entry objects come from the server-fed index only
   * (picker selection or exact-match resolution), so nothing unvalidated ever
   * crosses the wire. State commits in the ack handler, not here.
   */
  private attachTo(entry: ConversationListEntry) {
    if (this.pendingAttach) clearTimeout(this.pendingAttach.timeout);
    const label = entry.title ?? entry.id;
    this.pendingAttach = {
      id: entry.id,
      label,
      timeout: setTimeout(() => {
        this.pendingAttach = undefined;
        this.renderNotice(
          `hydration for "${label}" never arrived — still on ${this.state.title ?? this.state.conversationId}`
        );
      }, 10_000)
    };
    // hydrate the tail over the wire (ordinal < cursor server-side).
    // int4 max — MAX_SAFE_INTEGER overflows Postgres integer (22003)
    this.send({
      type: "hydrate_conversation",
      conversationId: entry.id,
      lowestLoadedOrdinal: 2_147_483_647
    });
    this.renderNotice(`attaching to ${label}…`);
  }

  /**
   * the picker owns raw stdin while open — pause readline around it and
   * flush any line noise it buffered before handing the prompt back
   */
  private async pickConversation(
    initialFilter: string,
    filterIds?: readonly string[]
  ) {
    // background refresh — pages warm the index for NEXT open; this open
    // renders a frozen snapshot so rows never reshuffle mid-navigation
    this.send({ type: "conversation_list" });
    let snapshot = [...this.convoIndex.values()];
    // resume lens (config-planning §5.5): narrow to the recency ids in
    // their served order — narrows, never hides (/convos stays unfiltered)
    if (filterIds) {
      const order = new Map(filterIds.map((id, i) => [id, i] as const));
      snapshot = snapshot
        .filter(c => order.has(c.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    if (snapshot.length === 0) {
      this.renderNotice("index warming — try again in a moment");
      return;
    }
    // burst/paste race: when "/convo Expan" arrives as one stdin chunk, the
    // watcher fires at the space and force-submits, and the trailing chars
    // land in readline's FRESH buffer before this continuation runs —
    // harvest them into the seed instead of losing them to the ctrl+u
    const strays = this.rl.line.trim();
    const seed = `${initialFilter}${initialFilter.length === 0 ? strays : ""}`;
    this.rl.write(null, { ctrl: true, name: "u" });
    this.rl.pause();
    this.pickerOpen = true;
    const picker = new CliConvoPicker(
      this,
      { stdin: process.stdin, stdout: process.stdout },
      snapshot,
      seed
    );
    const picked = await picker.run();
    this.pickerOpen = false;
    this.rl.write(null, { ctrl: true, name: "u" });
    this.rl.resume();
    if (!picked) {
      if (!process.stdin.isTTY) {
        this.renderNotice(
          "picker needs a TTY — non-interactive attach takes an exact id or exact title"
        );
        return;
      }
      this.renderNotice("attach cancelled");
      return;
    }
    this.attachTo(picked);
  }

  /**
   * non-interactive escape hatch: exact id or unique exact title from the
   * server-fed index — anything else is rejected HERE, never sent (invalid
   * conversation input is impossible on web via routing; this is the CLI's
   * equivalent gate)
   */
  private resolveExact(text: string) {
    const byId = this.convoIndex.get(text);
    if (byId) return byId;
    const q = text.toLowerCase();
    const byTitle = [...this.convoIndex.values()].filter(
      c => c.title !== null && c.title.toLowerCase() === q
    );
    return byTitle.length === 1 ? byTitle[0] : undefined;
  }

  private freshConversationId() {
    // the LITERAL sentinel — chat-request.ts branches on exact equality
    // (=== "new-chat"); anything else routes to the UPDATE path and P2025s
    return "new-chat" as const;
  }

  private commands = new Map<string, (args: string) => void | Promise<void>>([
    [
      "help",
      () =>
        this.renderNotice(
          "/model ⎵ — provider → model picker (Enter sets default, Tab this session, type to filter) · /model <alias|id> session fast lane · /new · /convos [filter] · /convo [filter] — picker: type filters, ↑↓ move, Enter attaches, Esc cancels · /resume — recent CLI convos · /config [model <alias|id>|think on|off] — roaming defaults · /expand <ordinal> · /system <text|clear> · /think · /debug · /quit"
        )
    ],
    [
      "quit",
      () => {
        this.rl.close();
        process.exit(0);
      }
    ],
    ["model", args => this.setModel(args)],
    ["resume", async () => this.resumeFromRecent()],
    [
      "config",
      async args => {
        const [sub = "", ...restArr] = args.trim().split(/\s+/);
        const rest = restArr.join(" ");
        if (sub.length === 0) {
          const c = this.cliConfig;
          this.renderNotice(
            c
              ? `roaming defaults · ${c.defaultProvider}/${c.defaultModel} · thinking ${c.showThinking ? "shown" : "hidden"} · ${c.schemaVersion}`
              : "config not hydrated yet — try again in a moment"
          );
          this.renderNotice("usage: /config model <alias> · /config think on|off");
          return;
        }
        if (sub === "model") {
          await this.setDefaultModel(rest);
          return;
        }
        if (sub === "think") {
          const v = rest === "on" ? true : rest === "off" ? false : undefined;
          if (typeof v === "undefined") {
            this.renderNotice("usage: /config think on|off");
            return;
          }
          this.sendCliConfigUpdate({ showThinking: v });
          return;
        }
        this.renderNotice(`unknown /config subcommand "${sub}" — model | think`);
      }
    ],
    [
      "new",
      () => {
        this.state.conversationId = this.freshConversationId();
        this.state.title = null;
        this.messageIndex.clear();
        this.renderNotice("fresh conversation");
      }
    ],
    [
      "convo",
      async args => {
        const raw = args.trim();
        // TTY: typed text is only ever a filter seeding the picker — the
        // number/title/id parsing ambiguity class is gone by construction
        if (process.stdin.isTTY) {
          await this.pickConversation(raw);
          return;
        }
        const hit = raw ? this.resolveExact(raw) : undefined;
        if (!hit) {
          this.renderNotice(
            raw
              ? `"${raw}" is not an exact id or unique exact title in your index — rejected locally, nothing sent`
              : "usage (non-TTY): /convo <exact-id|exact-title>"
          );
          return;
        }
        this.attachTo(hit);
      }
    ],
    [
      "system",
      args => {
        const text = args.trim();
        this.state.systemPrompt =
          text === "clear" || text.length === 0 ? undefined : text;
        this.renderNotice(
          this.state.systemPrompt ? "system prompt set" : "system prompt cleared"
        );
      }
    ],
    [
      "think",
      () => {
        this.showThinking = !this.showThinking;
        this.renderNotice(`thinking ${this.showThinking ? "shown" : "hidden"}`);
      }
    ],
    [
      "convos",
      async args => {
        if (process.stdin.isTTY) {
          await this.pickConversation(args.trim());
          return;
        }
        // non-TTY: static newest-first listing for scripts/glancing
        const entries = [...this.convoIndex.values()].sort(
          (a, b) => b.updatedAt - a.updatedAt
        );
        if (entries.length === 0) {
          this.renderNotice("index warming — try again in a moment");
          return;
        }
        for (const c of entries.slice(0, 25)) {
          this.renderNotice(
            `${c.title ?? "(untitled)"} · ${c.messageCount} msgs · ${c.id}`
          );
        }
        this.renderNotice(`${entries.length} conversation(s) indexed`);
      }
    ],
    [
      "expand",
      args => {
        const ordinal = Number.parseInt(args.trim(), 10);
        if (Number.isNaN(ordinal)) {
          this.renderNotice("usage: /expand <ordinal>");
          return;
        }
        const msg = this.messageIndex.get(ordinal);
        if (!msg) {
          this.renderNotice(
            `ordinal ${ordinal} not in the local index — hydrated tails and live turns populate it`
          );
          return;
        }
        this.renderExpanded(msg);
      }
    ],
    [
      "debug",
      () => {
        wsDebug.enabled = !wsDebug.enabled;
        this.renderNotice(
          `transport narration ${wsDebug.enabled ? "on" : "off"}`
        );
      }
    ]
  ]);

  /** registry pair → session-state shape (alias attached when the roster has one) */
  private activeModelFor(provider: Provider, model: AllModelsUnion) {
    const alias = CLI_MODELS.find(
      m => m.provider === provider && m.model === model
    )?.alias;
    return { provider, model, alias } satisfies CliActiveModel;
  }

  private describeEntry(entry: CliActiveModel) {
    const name = this.modelDisplayName(entry.provider, entry.model);
    return entry.alias
      ? `${entry.alias} · ${name} (${entry.provider}/${entry.model})`
      : `${name} (${entry.provider}/${entry.model})`;
  }

  /**
   * a roster alias, registry model id, or display name → its (provider,
   * model) pair — the registry is the authority; aliases are a fast lane
   */
  private resolveModelTarget(raw: string) {
    const text = raw.trim();
    const alias = CLI_MODELS.find(m => m.alias === text.toLowerCase());
    if (alias) return { provider: alias.provider, modelId: alias.model } as const;
    return this.resolveTypedModel(text);
  }

  /**
   * /model — bare opens the two-stage provider → model picker; with an
   * argument it is the SESSION fast lane (no persistence, mirrors `s` in
   * the picker). Persisting is Enter in the picker or /config model.
   */
  private async setModel(query: string) {
    const text = query.trim();
    if (text.length === 0) {
      await this.pickModel();
      return;
    }
    const target = this.resolveModelTarget(text);
    if (!target) {
      this.renderNotice(
        `"${text}" is not a roster alias, model id, or display name — /model opens the picker`
      );
      return;
    }
    this.state.entry = this.activeModelFor(target.provider, target.modelId);
    this.renderNotice(`→ ${this.describeEntry(this.state.entry)} (this session)`);
  }

  /** the picker owns raw stdin — same pause/resume dance as the convo picker */
  private async pickModel(initialFilter = "") {
    if (!process.stdin.isTTY) {
      this.renderNotice("the model picker needs a TTY — /model <alias|model-id> instead");
      return;
    }
    this.rl.write(null, { ctrl: true, name: "u" });
    this.rl.pause();
    this.pickerOpen = true;
    // burst/paste race (same as the convo picker): trailing chars after
    // the trigger land in readline's FRESH buffer — harvest them into the seed
    const strays = this.rl.line.trim();
    const seed = `${initialFilter}${initialFilter.length === 0 ? strays : ""}`;
    const picker = new CliModelPicker(
      this,
      { stdin: process.stdin, stdout: process.stdout },
      {
        defaultProvider: this.cliConfig?.defaultProvider,
        defaultModelId: this.cliConfig?.defaultModel,
        sessionProvider: this.state.entry.provider,
        sessionModelId: this.state.entry.model
      },
      seed
    );
    const outcome = await picker.run();
    this.pickerOpen = false;
    this.rl.write(null, { ctrl: true, name: "u" });
    this.rl.resume();
    if (outcome.kind === "cancel") {
      this.renderNotice("model unchanged");
      return;
    }
    if (outcome.kind === "session") {
      this.state.entry = this.activeModelFor(outcome.provider, outcome.modelId);
      this.renderNotice(`→ ${this.describeEntry(this.state.entry)} (this session)`);
      return;
    }
    await this.persistDefaultModel(outcome.provider, outcome.modelId);
  }

  /**
   * the ONE confirmation (config-planning §3): crossing providers asks
   * "updating to X will change your default provider to Y — proceed?".
   * Nested rl.question is safe here — command handlers run after the
   * loop's await settles, so awaitingLine is false and the keypress
   * watcher sleeps. Also adopts the pair for the session on success.
   */
  private async persistDefaultModel(provider: Provider, modelId: AllModelsUnion) {
    const current = this.cliConfig;
    if (current !== undefined && current.defaultProvider !== provider) {
      if (!process.stdin.isTTY) {
        this.renderNotice(
          `updating to ${modelId} would change your default provider ${current.defaultProvider} → ${provider} — confirmation needs a TTY, nothing sent`
        );
        return;
      }
      const answer = (
        await this.rl.question(
          pc.yellow(
            `updating to ${this.modelDisplayName(provider, modelId)} will change your default provider to ${provider} — proceed? [y/N] `
          )
        )
      )
        .trim()
        .toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        this.renderNotice("default unchanged");
        return;
      }
    }
    this.state.entry = this.activeModelFor(provider, modelId);
    this.sendCliConfigUpdate({ defaultProvider: provider, defaultModel: modelId });
  }

  private wireEvents() {
    this.on("ai_chat_chunk", data => {
      if (wsDebug.enabled) {
        process.stdout.write(
          pc.dim(
            `[chunk c:${data.chunk?.length ?? 0} t:${data.thinkingText?.length ?? 0} isT:${String(data.isThinking)} done:${String(data.done)} cv:…${data.conversationId.slice(-6)}]\n`
          )
        );
      }
      // first chunk carries the real conversationId + title — the
      // deterministic rekey contract. No router to deceive here: the CLI
      // adopts the real id immediately (the easy half of the web's dance)
      if (data.conversationId && this.state.conversationId === "new-chat") {
        this.state.conversationId = data.conversationId;
        // the local-tool turn gate follows the rekey or every tool request
        // in a fresh conversation would reject as TURN_MISMATCH
        this.rekeyLocalToolTurn(data.conversationId);
        // own-session freshness: the rekey hands us id + title — the index
        // stays current without a push-on-create event
        this.convoIndex.set(data.conversationId, {
          id: data.conversationId,
          title: data.title ?? null,
          updatedAt: Date.now(),
          messageCount: 0
        });
      }
      if (data.title && !this.state.title) {
        this.state.title = data.title;
      }
      this.renderChunk(data);
    });
    this.on("ai_chat_response", data => {
      if (wsDebug.enabled) {
        process.stdout.write(
          pc.dim(
            `[response chunk:${data.chunk.length} msgs:${data.convo.messages.length} cv:…${data.conversationId.slice(-6)}]\n`
          )
        );
      }
      if (!this.isActiveTurnFrame(data.conversationId)) return;
      if (data.conversationId) {
        this.state.conversationId = data.conversationId;
      }
      if (data.title) {
        this.state.title = data.title;
      }
      for (const msg of data.convo.messages) {
        this.messageIndex.set(msg.ordinal, msg);
      }
      this.renderResponse(data);
      this.settleTurn();
    });
    this.on("ai_chat_error", data => {
      if (!this.isActiveTurnFrame(data.conversationId)) return;
      this.renderNotice(
        `${data.provider ?? "provider"} error: ${data.message}`
      );
      this.settleTurn();
    });
    this.on("conversation_list_ack", data => {
      for (const entry of data.conversations) {
        this.convoIndex.set(entry.id, entry);
      }
    });
    this.on("hydrate_conversation_ack", data => {
      // transactional commit: only the ack for the PENDING attach mutates
      // session state; mismatched/late acks are discarded (two rapid
      // attaches: the loser's ack arrives after the pending id moved on)
      const pending = this.pendingAttach;
      if (!pending) return;
      if (data.conversationId !== pending.id) return;
      clearTimeout(pending.timeout);
      this.pendingAttach = undefined;
      this.state.conversationId = data.conversationId;
      this.state.title = null;
      this.messageIndex.clear();
      for (const page of data.pages) {
        for (const msg of page.convo.messages) {
          this.messageIndex.set(msg.ordinal, msg);
        }
      }
      const title = this.renderHydratedTail(data);
      if (title) this.state.title = title;
    });
  }

  /**
   * one settle path — clear the record so a later idle disconnect can never
   * misreport as a mid-turn interruption
   */
  private settleTurn() {
    this.turn?.resolve();
    this.turn = undefined;
  }

  /**
   * a frame settles the turn only when it targets the active conversation;
   * "new-chat" means the rekey is still in flight, so the first real id is
   * accepted (and adopted by the chunk/response handlers)
   */
  private isActiveTurnFrame(conversationId: string) {
    return (
      this.state.conversationId === "new-chat" ||
      conversationId === this.state.conversationId
    );
  }

  private async sendPrompt(prompt: string) {
    this.beginTurnRender();
    this.turn = Promise.withResolvers<void>();
    // arm the local-tool gate for exactly this turn's lifetime — dormant
    // sessions advertise nothing (localTools undefined) and reject any
    // stray request as TURN_MISMATCH
    this.beginLocalToolTurn(this.state.conversationId);
    try {
      this.send({
        type: "ai_chat_request",
        conversationId: this.state.conversationId,
        prompt,
        provider: this.state.entry.provider,
        model: this.state.entry.model,
        systemPrompt: this.state.systemPrompt,
        metadata: this.userMetadata,
        localTools: this.localToolCapabilities,
        // web parity — BYOK-vs-server key resolution reads these
        ...this.providerFlags(this.state.entry.provider)
      });
      await this.turn.promise;
    } finally {
      this.endLocalToolTurn();
    }
  }

  public async start() {
    this.renderNotice(`aic · ${this.wsUrl}`);
    // handlers register BEFORE connect — connection_established lands
    // milliseconds post-handshake and must not race the registration
    this.wireEvents();
    this.wireProviderContext();
    this.wireIdentityConfig();
    this.wireIdentityHooks();
    // --workspace opt-in: arm the read-only local tool bridge (handler
    // registration must also precede connect)
    const workspaceArg = this.parseWorkspaceArg(process.argv);
    if (workspaceArg !== undefined) {
      const root = await this.initializeLocalTools(workspaceArg);
      this.renderNotice(`local read tools armed · ${root}`);
    }
    await this.connect();
    // settle an in-flight turn if the socket dies mid-stream (the repl
    // otherwise awaits a response that can never arrive)
    if (this.wsClient) {
      this.wsClient.onDisconnect = code => {
        if (this.turn) {
          this.renderNotice(
            `connection lost mid-turn (code ${code}) — partial response above; reconnect + resend to continue`
          );
          this.settleTurn();
        }
      };
    }
    // the identity plane pulls itself on connection_established
    // (wireIdentityConfig) — the acks seed session defaults via the hooks
    const gotContext = await this.awaitProviderContext();
    this.renderNotice(
      gotContext
        ? `connected · ${this.describeEntry(this.state.entry)} · /help`
        : `connected (no provider context yet) · ${this.describeEntry(this.state.entry)} · /help`
    );
    if (process.argv.includes("--continue")) {
      await this.continueMostRecent();
    } else if (process.argv.includes("--resume")) {
      await this.resumeFromRecent();
    }
    this.rl.on("SIGINT", () => {
      process.stdout.write("\n");
      process.exit(0);
    });
    // live popup trigger — the moment the prompt buffer reads "/convo " (or
    // /convos), take over: clear + auto-submit the pending question and open
    // the picker seeded with whatever followed the command. Claude-Code-style
    // @-mention UX: the list appears and filters BY KEYSTROKE, Enter never
    // opens it. readline applies the keypress to rl.line before we run (its
    // internal listener registered first), so the buffer read is current.
    if (process.stdin.isTTY) {
      emitKeypressEvents(process.stdin);
      process.stdin.on("keypress", () => {
        // fire ONLY while the prompt is genuinely awaiting a line — never
        // over a command handler, a streaming turn, or an open picker
        if (
          !this.awaitingLine ||
          this.pickerOpen ||
          this.pickerRequest !== undefined
        ) {
          return;
        }
        const trigger = /^\/(convos?|model)\s(.*)$/.exec(this.rl.line);
        if (!trigger) return;
        this.pickerRequest = {
          kind: trigger[1] === "model" ? "model" : "convo",
          seed: trigger[2] ?? ""
        };
        // force-submit the pending question: clear the buffer, newline ends
        // the await; the loop reads pickerRequest and opens the picker
        this.rl.write(null, { ctrl: true, name: "u" });
        this.rl.write("\n");
      });
    }
    for (;;) {
      this.awaitingLine = true;
      const line = (await this.rl.question(pc.green("❯ "))).trim();
      this.awaitingLine = false;
      if (this.pickerRequest !== undefined) {
        const { kind, seed } = this.pickerRequest;
        this.pickerRequest = undefined;
        if (kind === "model") await this.pickModel(seed);
        else await this.pickConversation(seed);
        continue;
      }
      if (line.length === 0) continue;
      if (line.startsWith("/")) {
        const [cmd = "", ...rest] = line.slice(1).split(" ");
        const handler = this.commands.get(cmd);
        if (handler) {
          await handler(rest.join(" "));
        } else {
          this.renderNotice(`unknown command /${cmd} — /help`);
        }
        continue;
      }
      process.stdout.write("\n");
      await this.sendPrompt(line);
    }
  }
}
