import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import { wsDebug } from "@/chat-ws-client.ts";
import { CliConvoPicker } from "@/convo-picker.ts";
import { CliRendererService } from "@/render.ts";
import { CLI_MODELS } from "@/types.ts";
import type { ChatSessionState } from "@/types.ts";
import type {
  ConversationListEntry,
  MessageSingleton
} from "@slipstream/types";

/**
 * The loop — orchestration top of the chain (config → client → renderer →
 * repl). One persistent readline; lines starting with "/" hit the hand-rolled
 * command router, everything else becomes an ai_chat_request against the
 * active conversation/model state. The prompt yields while a response
 * streams (Promise.withResolvers resolved by ai_chat_response).
 */
export class SlipstreamReplService extends CliRendererService {
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
    if (line.startsWith("/model ")) {
      const partial = line.slice("/model ".length);
      const hits = CLI_MODELS.map(m => m.alias).filter(a =>
        a.startsWith(partial.toLowerCase())
      );
      return [hits, partial];
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
  private async pickConversation(initialFilter: string) {
    // background refresh — pages warm the index for NEXT open; this open
    // renders a frozen snapshot so rows never reshuffle mid-navigation
    this.send({ type: "conversation_list" });
    const snapshot = [...this.convoIndex.values()];
    if (snapshot.length === 0) {
      this.renderNotice("index warming — try again in a moment");
      return;
    }
    this.rl.pause();
    const picker = new CliConvoPicker(
      { stdin: process.stdin, stdout: process.stdout },
      snapshot,
      initialFilter
    );
    const picked = await picker.run();
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
          "/model <alias|fuzzy> · /new · /convos [filter] · /convo [filter] — picker: type filters, ↑↓ move, Enter attaches, Esc cancels · /expand <ordinal> · /system <text|clear> · /think · /debug · /quit"
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

  private setModel(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.renderNotice(
        `roster: ${CLI_MODELS.map(m => `${m.alias} (${m.model})`).join(" · ")}`
      );
      return;
    }
    const hit =
      CLI_MODELS.find(m => m.alias === q) ??
      CLI_MODELS.find(
        m => m.alias.includes(q) || m.model.toLowerCase().includes(q)
      );
    if (!hit) {
      this.renderNotice(`no roster match for "${q}" — /model to list`);
      return;
    }
    this.state.entry = hit;
    this.renderNotice(`→ ${hit.provider}/${hit.model}`);
  }

  private wireEvents() {
    this.on("ai_chat_chunk", data => {
      // first chunk carries the real conversationId + title — the
      // deterministic rekey contract. No router to deceive here: the CLI
      // adopts the real id immediately (the easy half of the web's dance)
      if (data.conversationId && this.state.conversationId === "new-chat") {
        this.state.conversationId = data.conversationId;
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
    this.send({
      type: "ai_chat_request",
      conversationId: this.state.conversationId,
      prompt,
      provider: this.state.entry.provider,
      model: this.state.entry.model,
      systemPrompt: this.state.systemPrompt,
      metadata: this.userMetadata,
      // web parity — BYOK-vs-server key resolution reads these
      ...this.providerFlags(this.state.entry.provider)
    });
    await this.turn.promise;
  }

  public async start() {
    this.renderNotice(`slipstream · ${this.wsUrl}`);
    // handlers register BEFORE connect — connection_established lands
    // milliseconds post-handshake and must not race the registration
    this.wireEvents();
    this.wireProviderContext();
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
    const gotContext = await this.awaitProviderContext();
    this.renderNotice(
      gotContext
        ? `connected · ${this.state.entry.alias} (${this.state.entry.model}) · /help`
        : `connected (no provider context yet) · ${this.state.entry.alias} (${this.state.entry.model}) · /help`
    );
    this.rl.on("SIGINT", () => {
      process.stdout.write("\n");
      process.exit(0);
    });
    for (;;) {
      const line = (await this.rl.question(pc.green("❯ "))).trim();
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
