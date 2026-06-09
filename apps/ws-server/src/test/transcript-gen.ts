import type { UnwrapPromise } from "@d0paminedriven/fs";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AllModelsUnion,
  AttachmentSingleton,
  ConversationSingleton,
  MessageBlockSingleton,
  MessageSingleton,
  TTSJobSingleton
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
  messageBlocks?: MessageBlockSingleton<true>[];
  ttsJob?: TTSJobSingleton<true>;
  asset: {
    cdnUrl: string;
    ext: string;
    msgId: string;
    filename: string;
    batchId: string;
    assetType: $Enums.AssetType;
    size: number;
    msgType: $Enums.MessageType;
    duration: number;
  }[];
};

type RenderedTranscriptMessageRT = {
  readonly lineCount: number;
  readonly markdown: string;
  readonly msgNumber: number;
};

type TranscriptPartRT = {
  readonly lineCount: number;
  readonly messages: readonly RenderedTranscriptMessageRT[];
  readonly partNumber: number;
};

interface TranscriptAssetAccumulator {
  cdnUrl: string;
  msgId: string;
  filename: string;
  ext: string;
  size: number;
  assetType: $Enums.AssetType;
  batchOrSeriesId: string;
  msgType: $Enums.MessageType;
  duration: number;
}

type TranscriptPartitionConfigRT = {
  readonly maxLoc: number;
  readonly minLoc: number;
  readonly targetLoc: number;
};

type RomanNumeralTupleRT = {
  readonly numeral: string;
  readonly value: number;
};

class ScriptGen extends Fs {
  constructor() {
    super(process.cwd());
  }

  private sanitizeBlockContent(content: string, model = "claude-opus-4-6") {
    const out = content
      .replace(/<model\s+provider="[^"]*"\s+name="[^"]*"\s*>/g, "")
      .replace(/<\/model>/g, "")
      .trim();

    return `<model provider="anthropic" name="${model}">\n\n${out}\n\n</model>`;
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
    const { Client } = await import("pg");
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

      const messagesResult = await client.query<MessageSingleton<true>>(
        `
  SELECT
    m.*,
    row_to_json(igj.*) AS "imageGenJob",
    row_to_json(tts.*) AS "ttsJob",
    COALESCE(
      (SELECT json_agg(mb ORDER BY mb."ordinal" ASC)
       FROM "MessageBlock" mb
       WHERE mb."messageId" = m."id"),
      '[]'::json
    ) AS "messageBlocks"
  FROM "Message" m
  LEFT JOIN "ImageGenJob" igj ON igj."requestMessageId" = m."id"
  LEFT JOIN "TTSJob" tts ON tts."sourceMessageId" = m."id"
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
      row_to_json(audio.*) AS "audio",
      row_to_json(doc.*) AS "document",
      row_to_json(igo.*) AS "imageGenOutput"
    FROM "Attachment" a
    LEFT JOIN "ImageMetadata" img ON img."attachmentId" = a."id"
    LEFT JOIN "AudioMetadata" audio ON audio."attachmentId" = a."id"
    LEFT JOIN "DocumentMetadata" doc ON doc."attachmentId" = a."id"
    LEFT JOIN "ImageGenOutput"  igo ON igo."attachmentId" = a."id"
    WHERE a."messageId" = ANY($1::text[])
      AND (
        a."origin" != 'GENERATED'
        OR (a."origin" = 'GENERATED' AND a."assetType" != 'IMAGE')
        OR (a."origin" = 'GENERATED' AND a."assetType" = 'IMAGE' AND igo."kind" = 'FINAL')
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
        ({ imageGenJob, messageBlocks, ttsJob, ...msgRest }) => {
          const rawAttachments = attachmentsByMessageId.get(msgRest.id) ?? [];

          const attachments = rawAttachments.map(
            ({ image, audio, document, imageGenOutput, ...attRest }) => ({
              ...attRest,
              size: Number(attRest.size ?? 0),
              // row_to_json of an all-NULL join row gives {"attachmentId":null,...}
              // normalise to null when the PK field is null

              image: image?.attachmentId ? image : null,
              audio: audio?.attachmentId ? audio : null,
              document: document?.attachmentId ? document : null,
              imageGenOutput: imageGenOutput?.id ? imageGenOutput : null
            })
          );

          return {
            ...msgRest,
            imageGenJob: imageGenJob?.id ? imageGenJob : null,
            messageBlocks,
            attachments,
            ttsJob: ttsJob
              ? {
                  ...ttsJob,
                  sizeBytes: ttsJob?.sizeBytes ? Number(ttsJob.sizeBytes) : null
                }
              : undefined
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
      let thinkingDur = 0;
      const thinkingContent = Array.of<string>();
      const textContent = Array.of<string>();
      if (msg.messageBlocks) {
        for (const b of msg.messageBlocks) {
          if (b.type === "THINKING" || b.type === "ENCRYPTED_THINKING") {
            thinkingDur += b.durationMs;
            thinkingContent.push(b.content);
          }
          if (b.type === "TEXT") {
            if (msg.provider === "ANTHROPIC" && msg.senderType === "AI") {
              textContent.push(
                this.sanitizeBlockContent(b.content, msg.model ?? undefined)
              );
            } else {
              textContent.push(b.content);
            }
          }
        }
      }
      const content = textContent.join(`\n`),
        timestamp = new Date(msg.createdAt),
        id = msg.id,
        thoughtFor = msg.senderType === "USER" ? null : thinkingDur,
        provider = this.providerToLowercase(msg.provider),
        model = msg.model ?? "",
        sender = msg.senderType,
        thinking =
          thinkingContent.length > 0 ? thinkingContent.join(`\n`) : null;
      msg.attachments.length > 0
        ? msg.attachments.map(t => {
            const attObj: TranscriptAssetAccumulator = {
              cdnUrl: "",
              msgId: msg.id,
              filename: "",
              ext: "",
              size: 0,
              assetType: "UNKNOWN",
              batchOrSeriesId: "",
              msgType: msg.messageType,
              duration: 0
            };
            attObj.assetType = t.assetType;
            if (msg?.ttsJob?.cdnUrl) {
              console.log(msg.ttsJob);
              attObj.cdnUrl = msg.ttsJob.cdnUrl;
              attObj.batchOrSeriesId = msg.ttsJob.id;
              attObj.assetType = "AUDIO";
              attObj.size = msg.ttsJob.sizeBytes ?? 0;
              attObj.ext = msg.ttsJob.codec;
              attObj.duration = msg.ttsJob.durationMs ?? 0;
            }
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
                if (t.assetType === "DOCUMENT" && t.audio?.duration) {
                  attObj.filename = `duration: ${t.audio.duration / 1000 / 60} min`;
                } else {
                  attObj.filename = t.filename;
                }
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
        messageBlocks: msg.messageBlocks,
        asset
      };
    });
  }

  private assetsToMdFormat(target: MapItRT["asset"]) {
    return target
      .map(v => {
        if (v.assetType === "IMAGE") {
          return `![${v.filename}](${v.cdnUrl})`;
        } else if (v.assetType === "AUDIO") {
          return `[duration: ${(v.duration / 1000 / 60).toPrecision(6)} min](${v.cdnUrl})`;
        } else {
          return `[${v.filename}](${v.cdnUrl})`;
        }
      })
      .join("\n\n");
  }

  private get condensedOutputDir() {
    return "src/test/__out__/condensed" as const;
  }

  private get transcriptPartitionConfig() {
    return {
      maxLoc: 2000,
      minLoc: 1500,
      targetLoc: 1750
    } as const satisfies TranscriptPartitionConfigRT;
  }

  private get providerLookup() {
    return {
      ANTHROPIC: "anthropic",
      COHERE: "cohere",
      DEEPSEEK: "deepseek",
      GEMINI: "gemini",
      GROK: "grok",
      META: "meta",
      MISTRAL: "mistral",
      MOONSHOTAI: "moonshotai",
      OPENAI: "openai",
      VERCEL: "vercel",
      ZAI: "zai",
      ALIBABA: "alibaba",
      MINIMAX: "minimax"
    } as const satisfies Record<$Enums.Provider, Lowercase<$Enums.Provider>>;
  }

  private countLines(content: string) {
    if (content.length === 0) return 0;
    const newlineCount = content.match(/\n/g)?.length ?? 0;
    return content.endsWith("\n") ? newlineCount : newlineCount + 1;
  }

  private transcriptHeading(title: string) {
    return `### ${title}\n\n`;
  }

  private buildTranscriptContent(
    messages: readonly RenderedTranscriptMessageRT[],
    title: string
  ) {
    return `${this.transcriptHeading(title)}${messages.map(t => t.markdown).join("\n")}`;
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private removeStaleTranscriptParts(toSlug: string) {
    if (!this.exists(this.condensedOutputDir)) return;
    const matcher = new RegExp(
      `^${this.escapeRegex(toSlug)}-Part-[IVXLCDM]+\\.md$`
    );
    for (const file of this.readDir(this.condensedOutputDir, {
      recursive: false
    })) {
      if (!matcher.test(file)) continue;
      this.rmFile(`${this.condensedOutputDir}/${file}`);
    }
  }

  private toRoman(value: number) {
    const numerals = [
      { numeral: "M", value: 1000 },
      { numeral: "CM", value: 900 },
      { numeral: "D", value: 500 },
      { numeral: "CD", value: 400 },
      { numeral: "C", value: 100 },
      { numeral: "XC", value: 90 },
      { numeral: "L", value: 50 },
      { numeral: "XL", value: 40 },
      { numeral: "X", value: 10 },
      { numeral: "IX", value: 9 },
      { numeral: "V", value: 5 },
      { numeral: "IV", value: 4 },
      { numeral: "I", value: 1 }
    ] as const satisfies readonly RomanNumeralTupleRT[];
    let remaining = value;
    let out = "";
    for (const entry of numerals) {
      while (remaining >= entry.value) {
        out = out.concat(entry.numeral);
        remaining -= entry.value;
      }
    }
    return out;
  }

  private transcriptPartPath(toSlug: string, partNumber: number) {
    return `${this.condensedOutputDir}/${toSlug}-Part-${this.toRoman(partNumber)}.md`;
  }

  private providerToLowercase(provider: $Enums.Provider) {
    return this.providerLookup[provider];
  }

  private readArrayValue<T>(
    values: readonly T[],
    index: number,
    arrayName: string
  ) {
    const value = values[index];
    if (typeof value === "undefined") {
      throw new Error(`${arrayName}[${index}] is undefined`);
    }
    return value;
  }

  private partitionPenalty(lineCount: number) {
    const { maxLoc, minLoc, targetLoc } = this.transcriptPartitionConfig;
    const distanceFromTarget = Math.abs(targetLoc - lineCount);
    const bandPenalty =
      lineCount < minLoc
        ? minLoc - lineCount
        : lineCount > maxLoc
          ? lineCount - maxLoc
          : 0;

    return distanceFromTarget * 10 + bandPenalty;
  }

  private partLineCount(
    prefixLineCounts: readonly number[],
    headingLineCount: number,
    startIdx: number,
    endIdxExclusive: number
  ) {
    const messageCount = endIdxExclusive - startIdx;
    const messageLines =
      this.readArrayValue(
        prefixLineCounts,
        endIdxExclusive,
        "prefixLineCounts"
      ) - this.readArrayValue(prefixLineCounts, startIdx, "prefixLineCounts");
    const separatorLines = messageCount > 0 ? messageCount - 1 : 0;

    return headingLineCount + messageLines + separatorLines;
  }

  private partitionTranscriptMessages(
    messages: readonly RenderedTranscriptMessageRT[],
    title: string
  ) {
    if (messages.length === 0) return Array.of<TranscriptPartRT>();
    const headingLineCount = this.countLines(this.transcriptHeading(title));
    const prefixLineCounts = Array.of<number>(0);
    for (const message of messages) {
      const currentPrefixTotal = this.readArrayValue(
        prefixLineCounts,
        prefixLineCounts.length - 1,
        "prefixLineCounts"
      );
      prefixLineCounts.push(currentPrefixTotal + message.lineCount);
    }

    const bestCosts = Array.from(
      { length: messages.length + 1 },
      () => Number.POSITIVE_INFINITY
    );
    const partCounts = Array.from(
      { length: messages.length + 1 },
      () => Number.POSITIVE_INFINITY
    );
    const previousSplitIdxs = Array.from(
      { length: messages.length + 1 },
      () => -1
    );

    bestCosts[0] = 0;
    partCounts[0] = 0;

    for (
      let endIdxExclusive = 1;
      endIdxExclusive <= messages.length;
      ++endIdxExclusive
    ) {
      for (let startIdx = 0; startIdx < endIdxExclusive; ++startIdx) {
        const priorCost = this.readArrayValue(bestCosts, startIdx, "bestCosts");
        if (!Number.isFinite(priorCost)) continue;
        const priorPartCount = this.readArrayValue(
          partCounts,
          startIdx,
          "partCounts"
        );
        const lineCount = this.partLineCount(
          prefixLineCounts,
          headingLineCount,
          startIdx,
          endIdxExclusive
        );
        const candidateCost = priorCost + this.partitionPenalty(lineCount);
        const candidatePartCount = priorPartCount + 1;
        const currentBestCost = this.readArrayValue(
          bestCosts,
          endIdxExclusive,
          "bestCosts"
        );
        const currentBestPartCount = this.readArrayValue(
          partCounts,
          endIdxExclusive,
          "partCounts"
        );
        const shouldUseCandidate =
          candidateCost < currentBestCost ||
          (candidateCost === currentBestCost &&
            candidatePartCount < currentBestPartCount);

        if (!shouldUseCandidate) continue;
        bestCosts[endIdxExclusive] = candidateCost;
        partCounts[endIdxExclusive] = candidatePartCount;
        previousSplitIdxs[endIdxExclusive] = startIdx;
      }
    }

    const reversedParts = Array.of<TranscriptPartRT>();
    let cursor = messages.length;

    while (cursor > 0) {
      const startIdx = this.readArrayValue(
        previousSplitIdxs,
        cursor,
        "previousSplitIdxs"
      );
      if (startIdx < 0) {
        throw new Error(
          `unable to partition transcript ending at message index ${cursor}`
        );
      }

      reversedParts.push({
        lineCount: this.partLineCount(
          prefixLineCounts,
          headingLineCount,
          startIdx,
          cursor
        ),
        messages: messages.slice(startIdx, cursor),
        partNumber: reversedParts.length + 1
      });
      cursor = startIdx;
    }

    return reversedParts.reverse().map((part, i) => ({
      ...part,
      partNumber: i + 1
    }));
  }

  private transcriptFormat(
    dataRaw: UnwrapPromise<ReturnType<typeof this.data>>,
    withThinking: boolean | `${boolean}` = `${false}`
  ) {
    const arr = Array.of<RenderedTranscriptMessageRT>();
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

      arr.push({
        lineCount: this.countLines(transcriptMsg),
        markdown: transcriptMsg,
        msgNumber: p.msgNumber
      });
    }
    return arr;
  }

  private toTranscript(
    data: readonly RenderedTranscriptMessageRT[],
    toSlug: string,
    title: string
  ) {
    const content = this.buildTranscriptContent(data, title);
    this.withWs(`${this.condensedOutputDir}/${toSlug}.md`, content);
  }

  private toTranscriptParts(
    data: readonly RenderedTranscriptMessageRT[],
    toSlug: string,
    title: string
  ) {
    this.removeStaleTranscriptParts(toSlug);
    const parts = this.partitionTranscriptMessages(data, title);
    for (const part of parts) {
      const content = this.buildTranscriptContent(part.messages, title);
      this.withWs(this.transcriptPartPath(toSlug, part.partNumber), content);
    }
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
      this.toTranscript(data, toSlug, dbData.title);
      this.toTranscriptParts(data, toSlug, dbData.title);
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
