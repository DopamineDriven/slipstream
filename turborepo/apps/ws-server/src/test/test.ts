import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { Provider } from "@t3-chat-clone/types";

dotenv.config({ quiet: true });

type MapItRT =
  | {
      thinking: string | null;
      msgNumber: number;
      content: string;
      timestamp: Date;
      id: string;
      provider: "openai" | "gemini" | "grok" | "anthropic" | "meta" | "vercel";
      model: string;
      sender: "USER" | "AI" | "SYSTEM";
      assetUrl: {
        cdnUrl: string;
        msgId: string;
        filename: string;
        batchId: string;
      }[];
    }[]
  | undefined;

class ScriptGen extends Fs {
  constructor(public override cwd: string) {
    super(process.cwd() ?? cwd);
  }

  private data = async (env: string, id: string) => {
    const { PrismaClient } = await import("@/generated/client/client.ts");
    const prismaClient = new PrismaClient({ datasourceUrl: env });
    try {
      prismaClient.$connect();
      return await prismaClient.conversation.findUnique({
        where: { id: id },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            include: { attachments: true }
          }
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      prismaClient.$disconnect();
    }
  };

  public async Prod(id = "a13m4v5zc7792tci9epltfy2") {
    const { Credentials } = await import("@t3-chat-clone/credentials");
    const cred = new Credentials();
    const env = await cred.get("DATABASE_URL");
    return await this.data(env, id).then(s => {
      if (!s) return;
      const { messages, ...rest } = s;
      const cleanS = messages.map(t => {
        const { attachments, ...rest } = t;
        const cleanAttachments = attachments.map(v => {
          return { ...v, size: Number(v.size ?? 0) };
        });
        return { ...rest, attachments: cleanAttachments };
      });
      const sss = { messages: cleanS, ...rest };
      this.withWs(
        `src/__out__/conversations/${sss.title}/${sss.id}.json`,
        JSON.stringify(sss, null, 2)
      );
      return s;
    });
  }

  public async Dev(id = "tsc8ukfhxdddj4pykubzix1i") {
    return await this.data(process.env.DATABASE_URL ?? "", id).then(s => {
      if (!s) return;

      const { messages, ...rest } = s;
      const cleanS = messages.map(t => {
        const { attachments, ...rest } = t;
        const cleanAttachments = attachments.map(v => {
          return { ...v, size: Number(v.size ?? 0) };
        });
        return { ...rest, attachments: cleanAttachments };
      });
      const sss = { messages: cleanS, ...rest };
      this.withWs(
        `src/__out__/conversations/${sss.title}/${sss.id}.json`,
        JSON.stringify(sss, null, 2)
      );
      return s;
    });
  }

  public async targeted(target: "dev" | "prod", id?: string) {
    if (target === "dev") {
      return await this.Dev(id);
    } else return await this.Prod(id);
  }

  private async mapIt(target: "dev" | "prod", id?: string) {
    return (await this.targeted(target, id))?.messages.map((msg, i) => {
      ++i;
      const assetUrl = Array.of<{
        cdnUrl: string;
        msgId: string;
        filename: string;
        batchId: string;
      }>();
      const content = msg.content,
        timestamp = new Date(msg.createdAt),
        id = msg.id,
        provider = msg.provider.toLowerCase() as Provider,
        model = msg.model ?? "",
        sender = msg.senderType as "USER" | "AI" | "SYSTEM",
        thinking = msg.thinkingText ?? null;
      msg.attachments.length > 0
        ? msg.attachments.map(t => {
            if (t.cdnUrl && t.filename && t.batchId) {
              assetUrl.push({
                cdnUrl: t.cdnUrl,
                msgId: id,
                filename: t.filename,
                batchId: t.batchId
              });
            }
          })
        : null;
      return {
        thinking,
        msgNumber: i,
        content,
        timestamp,
        id,
        provider,
        model,
        sender,
        assetUrl
      };
    }) satisfies MapItRT;
  }

  private async out(env: "dev" | "prod", id?: string) {
    const arr = Array.of<string>();
    const data = await this.mapIt(env, id);
    if (!data) return;
    for (const p of data) {
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
      console.log(p.assetUrl);
      const agg =
        p.sender === "AI"
          ? p.thinking
            ? `(${p.msgNumber})\n[${p.provider}/${p.model}]\n\n${p.thinking}\n\n${p.content}\n\n${d}\n`
            : `(${p.msgNumber})\n[${p.provider}/${p.model}]\n${p.content}\n\n${d}\n`
          : p.assetUrl.length > 0
            ? `(${p.msgNumber})\n[user/andrew]\n${p.content}\n\n![${p.assetUrl[0]?.filename}](${p.assetUrl[0]?.cdnUrl})\n\nbatchId: ${p.assetUrl[0]?.batchId}\n\n${d}\n`
            : `(${p.msgNumber})\n[user/andrew]\n${p.content}\n\n${d}\n`;
      arr.push(agg);
    }

    return arr;
  }

  public async gen(target: "dev" | "prod", id?: string) {
    const [data, raw] = await Promise.all([
      this.out(target, id),
      this.targeted(target, id)
    ]);
    if (!data) return;
    if (!raw) return;
    this.withWs(`src/test/__out__/condensed/${raw.title}.md`, data.join(`\n`));
  }
}

const scriptGen = new ScriptGen(process.cwd());

(async () => {
  return await scriptGen.gen(
    (process.argv?.[3] as "dev" | "prod") ?? "dev",
    process.argv[5]
  );
})();
