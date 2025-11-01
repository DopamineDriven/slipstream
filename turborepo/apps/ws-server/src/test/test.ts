import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { Provider } from "@slipstream/types";

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
    const { PrismaClient } = await import(
      "@slipstream/db/node/generated/client"
    );
    const prismaClient = new PrismaClient({ datasourceUrl: env });
    try {
      prismaClient.$connect();
      return await prismaClient.conversation.findUnique({
        where: { id: id },

        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            include: {
              imageGenJob: true,
              attachments: { include: { imageGenOutput: true } }
            }
          }
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      prismaClient.$disconnect();
    }
  };

  public async Prod(id = "gmj835g3xfgw9bft2ui0bblx") {
    const { Credentials } = await import("@slipstream/credentials");
    const cred = new Credentials();
    const env = await cred.get("DIRECT_URL");
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
    return await this.data(process.env.DIRECT_URL ?? "", id).then(s => {
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

  private async out(env: "dev" | "prod", id?: string, withThinking = "false") {
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
        timeZone: decodeURIComponent("America/Chicago")
      });
      if (p.assetUrl.length > 0) console.log(p.assetUrl);
      const handleProvider =
        p.provider === "grok"
          ? "xai"
          : p.provider === "gemini"
            ? "google"
            : p.provider;
      const handleAssets = (
        target: {
          cdnUrl: string;
          msgId: string;
          filename: string;
          batchId: string;
        }[]
      ) => {
        return target
          .map(v => {
            if (
              v.cdnUrl.endsWith("webp") ||
              v.cdnUrl.endsWith("avif") ||
              v.cdnUrl.endsWith("tiff")
            ) {
              return `source: ${v.cdnUrl}`;
            }
            return `![${v.filename}](${v.cdnUrl})`;
          })
          .join("\n\n");
      };
      if (
        p.model === "grok-2-image-1212" &&
        p.content.includes(
          `(https://imgen.x.ai/xai-imgen/xai-tmp-imgen-8a2c7f9b-ef9a-4da8-aa79-db47b2ee4d0e.jpeg)`
        )
      )
        p.content.replace(
          `(https://imgen.x.ai/xai-imgen/xai-tmp-imgen-8a2c7f9b-ef9a-4da8-aa79-db47b2ee4d0e.jpeg)`,
          "https://assets-dev.aicoalesce.com/generated/nrr6h4r4480f6kviycyo1zhf/1761729305749-ig_0d3912d56a96ce82016901dab7fa2c81a1886deddf5b1edfd1-4.png"
        );

      const agg =
        p.sender === "AI"
          ? withThinking === "true"
            ? p.thinking
              ? `${p.msgNumber}. ${p.model} (${handleProvider}) \n\n${p.thinking}\n\n${p.content}\n\n${d}\n`
              : `${p.msgNumber}. ${p.model} (${handleProvider})\n\n${p.content}\n\n${d}\n`
            : `${p.msgNumber}. ${p.model} (${handleProvider})\n\n${p.content}\n\n${d}\n`
          : p.assetUrl.length > 0
            ? `${p.msgNumber}. andrew (user)\n\n${p.content}\n\n${handleAssets(p.assetUrl)}\n\n${d}\n`
            : `${p.msgNumber}. andrew (user)\n\n${p.content}\n\n${d}\n`;
      arr.push(agg);
    }

    return arr;
  }
  // prettier-ignore
  private withFrontmatter = (content: string, title: string | null) => {
    const t = title ?? "no-title";
  // prettier-ignore
    return`---
papersize: letterpaper
geometry: portrait,margin=0.75in
fontsize: 10pt
header-includes: |
  \\usepackage{fontspec}
  \\newfontfamily\\FiraCode{Fira Code}
  \\usepackage{listings}
  \\lstset{
    basicstyle=\\FiraCode\\small,
    breaklines=true,
    aboveskip=4pt,
    belowskip=4pt
  }
  \\usepackage{fancyhdr}
  \\usepackage[useregional=false,style=iso]{datetime2}
  \\DTMsetdatestyle{iso}
  \\pagestyle{fancy}
  \\fancyhf{}
  \\fancyhead[C]{${t}}
  \\fancyfoot[C]{\\thepage}
  \\renewcommand{\\sectionmark}[1]{\\markboth{#1}{}}
---\n\n${content}`};

  private withWsAsyncs(data: string[], toSlug: string, title: string) {
    return new Promise(res =>
      res(
        this.withWs(
          `src/test/__out__/condensed/${toSlug}.md`,
          this.withFrontmatter(data.join(`\n`), title)
        )
      )
    );
  }

  public async gen(
    target: "dev" | "prod",
    id?: string,
    withThinking = "false"
  ) {
    const [data, raw] = await Promise.all([
      this.out(target, id, withThinking),
      this.targeted(target, id)
    ]);
    if (!data) return;
    if (!raw) return;
    if (!raw.title) return;
    const toSlug = raw.title
      .replace(/ /gim, "-")
      .replace(/:/gim, "--")
      .replace(/'/gim, "");
    try {
      await Promise.all([this.withWsAsyncs(data, toSlug, raw.title)]).then(() =>
        this.wait(2000)
          .then(() => {
            if (this.exists(`src/test/__out__/condensed/${toSlug}.md`)) {
              return;
            } else {
              return this.wait(3000).then(() => {
                return;
              });
            }
          })
          .then(() =>
            this.executeCommand({
              command: `pandoc -i src/test/__out__/condensed/${toSlug}.md -o src/test/__out__/condensed/${toSlug}.pdf --pdf-engine=xelatex`,
              cwd: this.cwd
            })
          )
      );
    } catch (err) {
      throw new Error(
        "error in script-gen".concat(
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : JSON.stringify(err, null, 2)
        )
      );
    }
  }
}

const scriptGen = new ScriptGen(process.cwd());

(async () => {
  return await scriptGen.gen(
    (process.argv?.[3] as "dev" | "prod") ?? "dev",
    process.argv[5],
    process.argv[7]
  );
})();
