import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import { wsDebug } from "@/chat-ws-client.ts";
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
   * /convos refresh. Powers Tab-completion and title-based /convo attach.
   */
  private convoIndex = new Map<string, ConversationListEntry>();

  /** the order /convos last printed — powers the `/convo <number>` shortcut */
  private lastListing = Array.of<ConversationListEntry>();

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
  /** a trailing message from `/convo <id> <msg>` — sent once the attach acks */
  private pendingPrompt?: string;

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

  /** shared attach: repoint state, clear the index, hydrate the tail */
  private attachTo(id: string, followUp?: string) {
    if (followUp) this.pendingPrompt = followUp;
    this.state.conversationId = id;
    this.state.title = null;
    this.messageIndex.clear();
    // hydrate the tail over the wire (ordinal < cursor server-side).
    // int4 max — MAX_SAFE_INTEGER overflows Postgres integer (22003)
    this.send({
      type: "hydrate_conversation",
      conversationId: id,
      lowestLoadedOrdinal: 2_147_483_647
    });
    this.renderNotice(`attaching to ${id}…`);
  }

  private freshConversationId() {
    // the LITERAL sentinel — chat-request.ts branches on exact equality
    // (=== "new-chat"); anything else routes to the UPDATE path and P2025s
    return "new-chat" as const;
  }

  private commands = new Map<string, (args: string) => void>([
    [
      "help",
      () =>
        this.renderNotice(
          "/model <alias|fuzzy> · /new · /convos · /convo <id|title> [msg] · /expand <ordinal> · /system <text|clear> · /think · /debug · /quit — Tab completes"
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
      args => {
        const raw = args.trim();
        if (!raw) {
          this.renderNotice("usage: /convo <id|title> [first message]");
          return;
        }
        // resolution order: /convos listing number → title prefix → raw id.
        // Remainder after the resolved portion is a prompt to send post-attach
        const numbered = /^(\d{1,2})(?:\s+(.*))?$/.exec(raw);
        const nth = numbered
          ? this.lastListing[Number.parseInt(numbered[1] ?? "", 10) - 1]
          : undefined;
        if (numbered && nth) {
          this.attachTo(nth.id, numbered[2]?.trim() || undefined);
          return;
        }
        const byTitle = [...this.convoIndex.values()].find(
          c => c.title && raw.toLowerCase().startsWith(c.title.toLowerCase())
        );
        let id: string;
        let followUp: string;
        if (byTitle?.title) {
          id = byTitle.id;
          followUp = raw.slice(byTitle.title.length).trim();
        } else {
          const [first = "", ...rest] = raw.split(/\s+/);
          id = first;
          followUp = rest.join(" ");
        }
        this.attachTo(id, followUp || undefined);
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
      () => {
        this.send({ type: "conversation_list" });
        const entries = [...this.convoIndex.values()].sort(
          (a, b) => b.updatedAt - a.updatedAt
        );
        if (entries.length === 0) {
          this.renderNotice("index warming — try again in a moment");
          return;
        }
        this.lastListing = entries.slice(0, 25);
        for (const [i, c] of this.lastListing.entries()) {
          this.renderNotice(
            `${i + 1}. ${c.title ?? "(untitled)"} · ${c.messageCount} msgs`
          );
        }
        this.renderNotice(
          `${entries.length} conversation(s) indexed — /convo <number|title|id> attaches`
        );
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
      this.turn?.resolve();
    });
    this.on("ai_chat_error", data => {
      this.renderNotice(`error frame: ${JSON.stringify(data)}`);
      this.turn?.resolve();
    });
    this.on("conversation_list_ack", data => {
      for (const entry of data.conversations) {
        this.convoIndex.set(entry.id, entry);
      }
    });
    this.on("hydrate_conversation_ack", data => {
      if (data.conversationId !== this.state.conversationId) return;
      for (const page of data.pages) {
        for (const msg of page.convo.messages) {
          this.messageIndex.set(msg.ordinal, msg);
        }
      }
      const title = this.renderHydratedTail(data);
      if (title) this.state.title = title;
      if (this.pendingPrompt) {
        const prompt = this.pendingPrompt;
        this.pendingPrompt = undefined;
        process.stdout.write("\n");
        void this.sendPrompt(prompt);
      }
    });
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
          this.turn.resolve();
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
          handler(rest.join(" "));
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
