import { Fs } from "@d0paminedriven/fs";
import { Provider } from "@t3-chat-clone/types";
import conversation from "../__out__/conversations/Grok's Favorite Hobby: A Quick Overview/k10gv81xj02pd2snd454o8xy.json" with { type: "json" };

conversation.messages;
class ScriptGen extends Fs {
  constructor(
    public override cwd: string,
    public msgs: typeof conversation.messages
  ) {
    super(process.cwd() ?? cwd);
  }

  private mapIt() {
    return this.msgs.map((msg, i) => {
      ++i;
      const content = msg.content,
        timestamp = new Date(msg.createdAt),
        id = msg.id,
        provider = msg.provider.toLowerCase() as Provider,
        model = msg.model ?? "",
        sender = msg.senderType as "USER" | "AI" | "SYSTEM",
        thinking = msg.thinkingText ?? null;
      return { thinking, msgNumber: i, content, timestamp, id, provider, model, sender };
    });
  }

  public out(
    props: {
      content: string;
      timestamp: Date;
      id: string;
      provider: Provider;
      thinking: string | null;
      model: string;
      sender: "USER" | "AI" | "SYSTEM";
      msgNumber: number;
    }[] = this.mapIt()
  ) {
    const arr = Array.of<string>();
    for (const p of props) {
      /**
               ? p.provider === "anthropic"
          ? `<model provider="${p.provider}" name="${p.model}">\n${p.content}\n</model>`
       */
      const d = p.timestamp.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour12: false,
        timeZone: decodeURIComponent("america/chicago")
      });
      const agg =
        p.sender === "AI"
          ? p.thinking ? `(${p.msgNumber})\n\n[${p.provider}/${p.model}]\n\n${p.thinking}\n${p.content}\n\n${d}\n\n` : `(${p.msgNumber})\n\n[${p.provider}/${p.model}]\n\n${p.content}\n${d}\n`
          : `(${p.msgNumber})\n\n[user/andrew]\n\n${p.content}\n\n${d}\n\n`;
      arr.push(agg);
    }

    return arr;
  }
}

const t = new ScriptGen(process.cwd(), conversation.messages);

const toMd = t
  .out()
  .map(co => co)
  .join(`\n`);

t.withWs(`src/test/__out__/${conversation.title}.md`, toMd);
