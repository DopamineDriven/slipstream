import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import { CliRendererService } from "@/render.ts";
import { CLI_MODELS } from "@/types.ts";
import type { ChatSessionState } from "@/types.ts";

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
    output: process.stdout
  });

  private turn?: PromiseWithResolvers<void>;

  private state: ChatSessionState = {
    conversationId: this.freshConversationId(),
    title: null,
    entry: CLI_MODELS[0],
    systemPrompt: undefined,
    showThinking: true
  };

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
          "/model <alias|fuzzy> · /new · /convo <id> · /system <text|clear> · /think · /quit"
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
        this.renderNotice("fresh conversation");
      }
    ],
    [
      "convo",
      args => {
        const id = args.trim();
        if (!id) {
          this.renderNotice("usage: /convo <conversationId>");
          return;
        }
        this.state.conversationId = id;
        this.state.title = null;
        this.renderNotice(`attached to ${id}`);
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
      this.renderResponse(data);
      this.turn?.resolve();
    });
    this.on("ai_chat_error", data => {
      this.renderNotice(`error frame: ${JSON.stringify(data)}`);
      this.turn?.resolve();
    });
  }

  private async sendPrompt(prompt: string) {
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
