import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { AssetType, MessageType } from "@slipstream/db/enums-node";
import type { Provider } from "@slipstream/types";

dotenv.config({ quiet: true });

type MapItRT =
  | {
      thinking: string | null;
      thoughtFor: number | null;
      msgNumber: number;
      content: string;
      timestamp: Date;
      id: string;
      provider: "openai" | "gemini" | "grok" | "anthropic" | "meta" | "vercel";
      model: string;
      sender: "USER" | "AI" | "SYSTEM";
      assetUrl: {
        cdnUrl: string;
        ext: string;
        msgId: string;
        filename: string;
        batchId: string;
        assetType: AssetType;
        size: number;
        msgType: MessageType;
      }[];
    }[]
  | undefined;

class ScriptGen extends Fs {
  constructor(public override cwd: string) {
    super(process.cwd() ?? cwd);
  }

  private safeErrMsg(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return String(err);
  }

  private data = async (env: string, id: string) => {
    const { PrismaClient } =
      await import("@slipstream/db/node/generated/client");
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
              attachments: {
                where: {
                  OR: [
                    { origin: { not: "GENERATED" } },
                    {
                      AND: [
                        { origin: "GENERATED" },
                        { imageGenOutput: { kind: "FINAL" } }
                      ]
                    }
                  ]
                },
                orderBy: { createdAt: "asc" },
                include: {
                  image: true,
                  document: true,
                  imageGenOutput: true
                }
              }
            }
          }
        }
      });
    } catch (err) {
      console.error(this.safeErrMsg(err));
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
      console.log(s.title);
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
      console.log(s.title);
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
        `src/__out__/conversations/${sss.title && sss.title.length < 128 ? sss.title : "summoning-the-muse"}/${sss.id}.json`,
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
        ext: string;
        msgId: string;
        filename: string;
        batchId: string;
        assetType: AssetType;
        size: number;
        msgType: MessageType;
      }>();
      const content = msg.content,
        timestamp = new Date(msg.createdAt),
        id = msg.id,
        thoughtFor = msg.senderType === "USER" ? null : msg.thinkingDuration,
        provider = msg.provider.toLowerCase() as Provider,
        model = msg.model ?? "",
        sender = msg.senderType as "USER" | "AI" | "SYSTEM",
        thinking = msg.thinkingText ?? null;
      msg.attachments.length > 0
        ? msg.attachments.map(t => {
            const attObj = {
              cdnUrl: "",
              msgId: msg.id,
              filename: "",
              ext: "",
              size: 0,
              assetType: "UNKNOWN" as AssetType,
              batchOrSeriesId: "",
              msgType: msg.messageType
            };
            attObj.assetType = t.assetType;
            if (t.compatStatus === "ACTIVE") {
              if (t.compatCdnUrl) {
                attObj.cdnUrl = t.compatCdnUrl;
              }
              if (t.filename) {
                attObj.filename = t.filename;
              }
              if (t.compatExt) {
                attObj.ext = t.compatExt;
              }
              if (t.size) {
                attObj.size += Number(t.size);
              }
              if (attObj.msgType === "IMAGE_GEN") {
                if (t.seriesId) {
                  attObj.batchOrSeriesId = t.seriesId;
                }
              }
              if (msg.messageType === "TEXT") {
                if (t.batchId) {
                  attObj.batchOrSeriesId = t.batchId;
                }
              }
            }
            if (t.compatStatus === "ALIASED") {
              if (t.cdnUrl) {
                attObj.cdnUrl = t.cdnUrl;
              }
              if (t.filename) {
                attObj.filename = t.filename;
              }
              if (t.ext) {
                attObj.ext = t.ext;
              }
              if (t.size) {
                attObj.size += Number(t.size);
              }
              if (attObj.msgType === "IMAGE_GEN") {
                if (t.seriesId) {
                  attObj.batchOrSeriesId = t.seriesId;
                }
              }
              if (msg.messageType === "TEXT") {
                if (t.batchId) {
                  attObj.batchOrSeriesId = t.batchId;
                }
              }
            }
            const { batchOrSeriesId, ...rest } = attObj;
            assetUrl.push({ batchId: batchOrSeriesId, ...rest });
          })
        : null;
      return {
        thinking,
        msgNumber: i,
        content,
        thoughtFor,
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
          ext: string;
          msgId: string;
          filename: string;
          batchId: string;
          assetType: AssetType;
          size: number;
          msgType: MessageType;
        }[]
      ) => {
        return target
          .map(v => {
            if (v.assetType === "IMAGE") {
              return `![${v.filename}](${v.cdnUrl})`;
            } else {
              return `[${v.filename}](${v.cdnUrl})`;
            }
          })
          .join("\n\n");
      };
      const thinkingDur = p.thoughtFor
        ? `\n\n*thought for ${p.thoughtFor / 1000} seconds*\n\n`
        : `\n\n`;
      const agg =
        p.sender === "AI"
          ? withThinking === "true"
            ? p.thinking
              ? `${p.msgNumber}. ${p.model} (${handleProvider}) ${thinkingDur}${p.thinking}\n\n${p.content}\n\n${handleAssets(p.assetUrl)}\n\n${d}\n`
              : `${p.msgNumber}. ${p.model} (${handleProvider})${thinkingDur}${p.content}\n\n${p.assetUrl.length > 0 ? handleAssets(p.assetUrl) : ""}\n\n${d}\n`
            : `${p.msgNumber}. ${p.model}(${handleProvider}) ${thinkingDur}${p.content}\n\n${p.assetUrl.length > 0 ? handleAssets(p.assetUrl) : ""}\n\n${d}\n`
          : p.assetUrl.length > 0
            ? `${p.msgNumber}. andrew (user)\n\n${p.content}\n\n${handleAssets(p.assetUrl)}\n\n${d}\n`
            : `${p.msgNumber}. andrew (user)\n\n${p.content}\n\n${d}\n`;

      arr.push(agg);
    }

    return arr;
  }
  // prettier-ignore
  private withFrontmatter = (content: string, title: string) => {
  // prettier-ignore
    return`### ${title}\n\n${content}`};

  private toTranscript(data: string[], toSlug: string, title: string) {
    return new Promise(res =>
      res(
        this.withWs(
          `src/test/__out__/condensed/test/${toSlug}.md`,
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
    const toSlug =
      raw.title.length > 96
        ? raw.title
            .replace(/ /gim, "-")
            .replace(/:/gim, "--")
            .replace(/'/gim, "")
            .slice(0, 95)
        : raw.title
            .replace(/ /gim, "-")
            .replace(/:/gim, "--")
            .replace(/'/gim, "");
    try {
      await this.toTranscript(data, toSlug, raw.title);
    } catch (err) {
      throw new Error("error in script-gen: ".concat(this.safeErrMsg(err)));
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
