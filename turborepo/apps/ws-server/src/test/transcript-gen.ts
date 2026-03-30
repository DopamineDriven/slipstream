import { Fs, UnwrapPromise } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { Client } from "pg";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AllModelsUnion,
  AttachmentSingleton,
  ConversationSingleton,
  ImageGenJobSingleton,
  MessageSingleton
} from "@slipstream/types";

dotenv.config({ quiet: true });

type MapItRT = {
  thinking: string | null;
  thoughtFor: number | null;
  msgNumber: number;
  content: string;
  timestamp: Date;
  msgType: $Enums.MessageType;
  id: string;
  provider: Lowercase<$Enums.Provider>;
  model: AllModelsUnion | (string & {});
  sender: $Enums.SenderType;
  asset: {
    cdnUrl: string;
    ext: string;
    msgId: string;
    filename: string;
    batchId: string;
    assetType: $Enums.AssetType;
    size: number;
    msgType: $Enums.MessageType;
  }[];
};

class ScriptGen extends Fs {
  constructor() {
    super(process.cwd());
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

  private async getRawData(
    connectionString: string,
    env: "dev" | "prod",
    id: string
  ) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 30000
    });
    await client.connect();
    try {
      const convResult = await client.query<ConversationSingleton<true>>(
        `SELECT * FROM "Conversation" WHERE "id" = $1 LIMIT 1`,
        [id]
      );
      const conversation = convResult.rows?.[0];

      if (!conversation) {
        throw new Error(
          `No Conversation found with id: ${id} targeting the ${env} environment`
        );
      }

      const messagesResult = await client.query<
        MessageSingleton<true> & { imageGenJob: ImageGenJobSingleton<true> }
      >(
        `
  SELECT
    m.*,
    row_to_json(igj.*) AS "imageGenJob"
  FROM "Message" m
  LEFT JOIN "ImageGenJob" igj ON igj."requestMessageId" = m."id"
  WHERE m."conversationId" = $1
  ORDER BY m."createdAt" ASC
    `,
        [id]
      );

      console.log(`message count: ${messagesResult.rows.length}`);

      const msgIds = messagesResult.rows.map(i => i.id);

      const attachmentsResult = await client.query<AttachmentSingleton<true>>(
        `
    SELECT
      a.*,
      row_to_json(img.*) AS "image",
      row_to_json(doc.*) AS "document",
      row_to_json(igo.*) AS "imageGenOutput"
    FROM "Attachment" a
    LEFT JOIN "ImageMetadata"   img ON img."attachmentId" = a."id"
    LEFT JOIN "DocumentMetadata" doc ON doc."attachmentId" = a."id"
    LEFT JOIN "ImageGenOutput"  igo ON igo."attachmentId" = a."id"
    WHERE a."messageId" = ANY($1::text[])
      AND (
        a."origin" != 'GENERATED'
        OR (a."origin" = 'GENERATED' AND igo."kind" = 'FINAL')
      )
    ORDER BY a."createdAt" ASC
    `,
        [msgIds]
      );

      const attachmentsByMessageId = new Map<
        string,
        typeof attachmentsResult.rows
      >();

      for (const att of attachmentsResult.rows) {
        if (!att.messageId) continue;
        const bucket = attachmentsByMessageId.get(att.messageId);
        if (bucket) {
          bucket.push(att);
        } else {
          attachmentsByMessageId.set(att.messageId, [att]);
        }
      }

      // 5) Assemble hydrated messages
      const messages = messagesResult.rows.map(
        ({ imageGenJob, ...msgRest }) => {
          const rawAttachments = attachmentsByMessageId.get(msgRest.id) ?? [];

          const attachments = rawAttachments.map(
            ({ image, document, imageGenOutput, ...attRest }) => ({
              ...attRest,
              size: Number(attRest.size ?? 0),
              // row_to_json of an all-NULL join row gives {"attachmentId":null,...}
              // normalise to null when the PK field is null
              image: image?.attachmentId ? image : null,
              document: document?.attachmentId ? document : null,
              imageGenOutput: imageGenOutput?.id ? imageGenOutput : null
            })
          );

          return {
            ...msgRest,
            imageGenJob: imageGenJob?.id ? imageGenJob : null,
            attachments
          };
        }
      );
      return {
        ...conversation,
        conversationSettings: null,
        messages
      } satisfies ConversationSingleton<true>;
    } catch {
      //
    } finally {
      await client.end();
    }
  }

  private data = async (env: "dev" | "prod", id: string) => {
    const datasourceUrl = await this.resolveDbUrl(env);
    try {
      const c = await this.getRawData(datasourceUrl, env, id);
      if (!c?.messages) throw new Error("invalid messages");
      const cleanS = c?.messages.map(t => {
        const cleanAttachments = t.attachments.map(v => {
          return { ...v, size: Number(v.size ?? 0) };
        });
        return { ...t, attachments: cleanAttachments };
      });

      const cleanedData = { ...c, messages: cleanS };

      const slug = this.toSlug(cleanedData.title ?? "");

      this.withWs(
        `src/__out__/conversations/${slug}/${cleanedData.id}.json`,
        JSON.stringify(cleanedData, null, 2)
      );

      return { ...c, messages: cleanS };
    } catch (err) {
      console.error(this.safeErrMsg(err));
    }
  };

  private async resolveDbUrl(target: "dev" | "prod") {
    if (target === "dev" && process.env.DATABASE_URL) {
      return process.env.DATABASE_URL;
    } else {
      const { Credentials } = await import("@slipstream/credentials");
      const cred = new Credentials();
      return await cred.get("DATABASE_URL");
    }
  }

  private async envScopedData(
    target: "dev" | "prod",
    id = "pblzm3c6sxxlaooikmpzxkwd"
  ) {
    return await this.data(target, id);
  }

  private toSlug(title: string) {
    return title.length > 96
      ? title
          .replace(/ /gim, "-")
          .replace(/:/gim, "--")
          .replace(/'/gim, "")
          .slice(0, 95)
      : title.replace(/ /gim, "-").replace(/:/gim, "--").replace(/'/gim, "");
  }

  private mapIt(data: UnwrapPromise<ReturnType<typeof this.data>>) {
    return data?.messages.map((msg, i) => {
      ++i;
      const asset = Array.of<MapItRT["asset"][number]>();
      const content = msg.content,
        timestamp = new Date(msg.createdAt),
        id = msg.id,
        thoughtFor = msg.senderType === "USER" ? null : msg.thinkingDuration,
        provider = msg.provider.toLowerCase() as Lowercase<$Enums.Provider>,
        model = msg.model ?? "",
        sender = msg.senderType,
        thinking = msg.thinkingText ?? null;
      msg.attachments.length > 0
        ? msg.attachments.map(t => {
            const attObj = {
              cdnUrl: "",
              msgId: msg.id,
              filename: "",
              ext: "",
              size: 0,
              assetType: "UNKNOWN" as $Enums.AssetType,
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
            asset.push({ batchId: batchOrSeriesId, ...rest });
          })
        : null;
      return {
        thinking,
        msgNumber: i,
        content,
        thoughtFor,
        msgType: msg.messageType,
        timestamp,
        id,
        provider,
        model,
        sender,
        asset
      };
    });
  }

  private assetsToMdFormat(target: MapItRT["asset"]) {
    return target
      .map(v => {
        if (v.assetType === "IMAGE") {
          return `![${v.filename}](${v.cdnUrl})`;
        } else {
          return `[${v.filename}](${v.cdnUrl})`;
        }
      })
      .join("\n\n");
  }

  private transcriptFormat(
    dataRaw: UnwrapPromise<ReturnType<typeof this.data>>,
    withThinking: boolean | `${boolean}` = `${false}`
  ) {
    const arr = Array.of<string>();
    const data = this.mapIt(dataRaw) satisfies MapItRT[] | undefined;
    if (!data) return;
    for (const p of data) {
      const d = p.timestamp.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour12: false,
        timeZone: decodeURIComponent("America/Chicago")
      });
      const handleProvider =
        p.provider === "grok"
          ? "xai"
          : p.provider === "gemini"
            ? "google"
            : p.provider;
      const thinkingDur = p.thoughtFor
        ? `\n\n*thought for ${p.thoughtFor / 1000} seconds*\n\n`
        : `\n\n`;
      const includeThinking =
        p.msgType === "IMAGE_GEN" && p.sender === "AI"
          ? `${p.thinking ? p.thinking.concat("\n\n") : ``}`
          : ``;
      const transcriptMsg =
        p.sender === "AI"
          ? withThinking === "true"
            ? p.thinking
              ? `${p.msgNumber}. ${p.model} (${handleProvider})${thinkingDur}${p.thinking}\n\n${p.content}\n\n${this.assetsToMdFormat(p.asset)}\n\n${d}\n`
              : `${p.msgNumber}. ${p.model} (${handleProvider})${thinkingDur}${p.content}\n\n${p.asset.length > 0 ? this.assetsToMdFormat(p.asset) : ""}\n\n${d}\n`
            : `${p.msgNumber}. ${p.model} (${handleProvider})${thinkingDur}${includeThinking}${p.content}\n\n${p.asset.length > 0 ? this.assetsToMdFormat(p.asset) : ""}\n\n${d}\n`
          : p.asset.length > 0
            ? `${p.msgNumber}. andrew (user)\n\n${p.content}\n\n${this.assetsToMdFormat(p.asset)}\n\n${d}\n`
            : `${p.msgNumber}. andrew (user)\n\n${p.content}\n\n${d}\n`;

      arr.push(transcriptMsg);
    }
    return arr;
  }

  private toTranscript(data: string[], toSlug: string, title: string) {
    const content = `### ${title}\n\n${data.join(`\n`)}`;
    return new Promise(res =>
      res(this.withWs(`src/test/__out__/condensed/${toSlug}.md`, content))
    );
  }

  public async gen(
    target: "dev" | "prod",
    id?: string,
    withThinking: boolean | `${boolean}` = false
  ) {
    const dbData = await this.envScopedData(target, id);
    const data = this.transcriptFormat(dbData, withThinking);
    if (!data) return;
    if (!dbData) return;
    if (!dbData.title) return;
    const toSlug = this.toSlug(dbData.title);
    try {
      await this.toTranscript(data, toSlug, dbData.title);
    } catch (err) {
      throw new Error("error in script-gen: ".concat(this.safeErrMsg(err)));
    }
  }
}

if (
  (process.argv[3] === "dev" || process.argv[3] === "prod") &&
  process.argv[5] &&
  /^[a-z0-9]{24}$/.test(process.argv[5])
) {
  const t0 = performance.now();
  const scriptGen = new ScriptGen();
  if (process.argv[7] && process.argv[7] === "true") {
    scriptGen
      .gen(process.argv[3], process.argv[5], process.argv[7])
      .then(() => {
        console.log(`completed in ${performance.now() - t0} ms`);
      });
  } else {
    scriptGen.gen(process.argv[3], process.argv[5]).then(() => {
      console.log(`completed in ${performance.now() - t0} ms`);
    });
  }
}
