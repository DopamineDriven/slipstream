import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { Provider } from "@slipstream/types";
import {createCanvas,GlobalFonts} from "@napi-rs/canvas";

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
    GlobalFonts
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

  private withWsAsync(data: string[], toSlug: string, title: string) {
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
    const emojiAnalysis = await this.analyzeEmojis(target, id);

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

    const processedData = data.map(line => {
      return this.preprocessContent(line, emojiAnalysis?.replacements);
    });
    try {
      await Promise.all([this.withWsAsync(processedData, toSlug, raw.title)]).then(() =>
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
              command: `pandoc -i src/test/__out__/condensed/${toSlug}.md -o src/test/__out__/condensed/${toSlug}.pdf --pdf-engine=lualatex`,
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

  private extractEmojiStats(content: string) {
    // Comprehensive emoji regex pattern
    const emojiRegex =
      /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F1E6}-\u{1F1FF}]/gu;

    const emojiCounts: Record<string, number> = {};

    // Find all emojis
    const matches = content.match(emojiRegex);

    if (matches) {
      matches.forEach(emoji => {
        // Get Unicode code point(s)
        const codePoints = Array.from(emoji)
          .map(char => {
            const code = char.codePointAt(0);
            return code
              ? `U+${code.toString(16).toUpperCase().padStart(4, "0")}`
              : "";
          })
          .join(" ");

        // Create key in the format you want
        const key = `${emoji} (${codePoints})`;

        // Count occurrences
        emojiCounts[key] = (emojiCounts[key] ?? 0) + 1;
      });
    }

    return emojiCounts;
  }

  // Method to analyze emojis across all messages
  private async analyzeEmojis(target: "dev" | "prod", id?: string) {
    const data = await this.mapIt(target, id);
    if (!data) return;

    const allContent = data.map(msg => msg.content).join(" ");
    const emojiStats = this.extractEmojiStats(allContent);

    // Sort by count (most frequent first)
    const sortedEmojis = Object.entries(emojiStats)
      .sort(([, a], [, b]) => b - a)
      .reduce(
        (acc, [key, value]) => {
          acc[key] = value;
          return acc;
        },
        {} as Record<string, number>
      );

    // Write to file
    this.withWs(
      `src/test/__out__/aggregate/emoji-stats.json`,
      JSON.stringify(sortedEmojis, null, 2)
    );

    // Create emoji replacement map for LaTeX
    const emojiReplacementMap: Record<string, string> = {};
    Object.keys(sortedEmojis).forEach(key => {
      const emoji = key.split(" ")?.[0] ?? "";
      const unicodeDesc = key.match(/\((.*?)\)/)?.[1] ?? "";
      emojiReplacementMap[emoji] = `[emoji:${unicodeDesc}]`;
    });

    this.withWs(
      `src/test/__out__/aggregate/emoji-replacements.json`,
      JSON.stringify(emojiReplacementMap, null, 2)
    );

    return { stats: sortedEmojis, replacements: emojiReplacementMap };
  }

  // Enhanced preprocessor using the generated map
  private preprocessContent(
    content: string,
    emojiMap?: Record<string, string>
  ) {
    // Use provided map or a default one
    const replacements = emojiMap ?? {
      "🍷": "[wine U+1F377]",
      "😼": "[cat-smirk U+1F63C]",
      "💅": "[nails U+1F485]",
      "✨": "[sparkles U+2728]",
      "🎨": "[art U+1F3A8]"
      // Will be expanded by analyzeEmojis
    };

    let processed = content;
    for (const [emoji, replacement] of Object.entries(replacements)) {
      processed = processed.replace(new RegExp(emoji, "g"), replacement);
    }
    return processed;
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
