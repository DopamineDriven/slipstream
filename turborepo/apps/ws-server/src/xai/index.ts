import type {
  MessageSingleton,
  ProviderChatRequestEntity,
  S3FinalizePayload
} from "@/types/index.ts";
import type {
  xAIChatCompletionsRes,
  xAIChoiceActive,
  xAIImgGenResponse
} from "@/xai/sse.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/metadata";
import type { Logger as PinoLogger } from "pino";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { ModelService } from "@/models/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import {
  createXAISSEParser,
  isContentDelta,
  isFinishChoice,
  isReasoningDelta,
  isStartDelta
} from "@/xai/sse.ts";
import type {
  AIChatResponseImgGenSubFields,
  EventTypeMap,
  GrokModelIdUnion,
  ImgMetadataEntity,
  S3Checksum,
  S3StorageClass
} from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

type ImageGenPartialArr = [
  number, // partial-to-final-index tracking (0 <= n <= 3) n partial images + final response)
  string, // cdnUrl (cloudfront url returned post-s3 upload)
  string, // itemId (shared by all partials and final image)
  number, // width
  number, // height
  string, // mime type
  string, // s3 bucket
  string, // s3 key
  string, // s3 versionId
  string, // s3ObjectId
  string | undefined, // filename
  string | undefined, // extension
  string | undefined, // etag
  number | undefined, // size
  string | undefined, // s3 last modified
  string | undefined, // content disposition
  string | undefined, // cache control
  S3Checksum | undefined, // s3 checksum={checksumSha256, checksumAlgo}
  S3StorageClass | undefined, // s3 storage class
  string, // generationGroupId (unique resp_id via openai -> resp_0769a1845e4ca883016900c9bfb9388193a9efbb12edd87b37 )
  ImgMetadataEntity | undefined, // ImageMetadata via extractor package
  number | undefined, // upload duration
  string | undefined, // requestMessageId
  string | undefined, // jobId
  string | undefined, // revised_prompt
  S3FinalizePayload,
  ExpandedImgSpecs
];

export class xAIService extends ModelService {
  private readonly baseUrl = "https://api.x.ai/v1/chat/completions";
  private readonly baseImgGenUrl = "https://api.x.ai/v1/images/generations";
  private logger: PinoLogger;
  /** key: storename; val: storeId; */
  constructor(
    logger: LoggerService,
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private extract: ExtractService,
    private s3: S3Storage,
    private isProd: boolean,
    private apiKey?: string
  ) {
    super();
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[xai] " }
      );
  }

  private handleMostRecentMsgForImg(
    mostRecentMsg:
      | {
          role: "user";
          content:
            | string
            | readonly (
                | {
                    type: "text";
                    text: string;
                  }
                | {
                    type: "image_url";
                    image_url: {
                      url: string;
                      detail?: "low" | "medium" | "high" | undefined;
                    };
                  }
              )[];
        }
      | {
          role: "system" | "assistant";
          content: string;
        }
      | undefined
  ) {
    return typeof mostRecentMsg?.content === "string"
      ? mostRecentMsg.content
      : (mostRecentMsg?.content
          ?.map((t, o) =>
            t.type === "text" ? t.text : `![img ${o++}](${t.image_url.url})`
          )
          .join("\n") ?? "");
  }
  private async *stream(
    model = "grok-4-0709" satisfies GrokModelIdUnion,
    messages: readonly (
      | {
          role: "user";
          content:
            | string
            | readonly (
                | { type: "text"; text: string }
                | {
                    type: "image_url";
                    image_url: {
                      url: string;
                      detail?: "low" | "medium" | "high";
                    };
                  }
              )[];
        }
      | { role: "system" | "assistant"; content: string }
    )[],
    apiKey?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
    }
  ): AsyncGenerator<xAIChatCompletionsRes, void, unknown> {
    const key = apiKey ?? this.apiKey;
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...(options && {
          temperature: options.temperature,
          top_p: options.top_p,
          max_tokens: options.max_tokens
        })
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `xAI API error (${response.status}, ${response.statusText}): ${errorText}`
      );
    }

    const parser = createXAISSEParser(response);
    for await (const event of parser) {
      yield event.data;
    }
  }

  private async handleImgGen(
    model = "grok-2-image-1212" satisfies GrokModelIdUnion,
    n = 1,
    messages: readonly (
      | {
          role: "user";
          content:
            | string
            | readonly (
                | { type: "text"; text: string }
                | {
                    type: "image_url";
                    image_url: {
                      url: string;
                      detail?: "low" | "medium" | "high";
                    };
                  }
              )[];
        }
      | { role: "system" | "assistant"; content: string }
    )[],
    userId: string,
    apiKey?: string
  ) {
    const mostRecentMsg = messages.slice(-1)?.[0];
    const key = apiKey ?? this.apiKey;
    if (model === ("grok-2-image-1212" satisfies GrokModelIdUnion)) {
      const imgResponse = await fetch(this.baseImgGenUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "grok-2-image-1212" satisfies GrokModelIdUnion,
          prompt: this.handleMostRecentMsgForImg(mostRecentMsg),
          n,
          response_format: "b64_json",
          user: userId
        })
      });
      if (!imgResponse.ok) {
        const errorText = await imgResponse.text();
        throw new Error(
          `xAI API error (${imgResponse.status}, ${imgResponse.statusText}): ${errorText}`
        );
      }
      return (await imgResponse.json()) as xAIImgGenResponse;
    }
  }

  private prependProviderModelTag(
    msgs: Pick<
      MessageSingleton<true>,
      "senderType" | "provider" | "model" | "content"
    >[]
  ) {
    return msgs.map(msg => {
      if (msg.senderType === "USER") {
        return { role: "user", content: msg.content } as const;
      } else {
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "";
        const modelIdentifier = `[${provider}/${model}]`;
        return {
          role: "assistant",
          content: `${modelIdentifier} \n` + msg.content
        } as const;
      }
    });
  }

  private formatMsgs(
    msgs: readonly (
      | { readonly role: "user"; readonly content: string }
      | { readonly role: "assistant"; readonly content: string }
    )[],
    systemPrompt?: string
  ): readonly (
    | { readonly role: "system"; readonly content: string }
    | { readonly role: "user"; readonly content: string }
    | { readonly role: "assistant"; readonly content: string }
  )[] {
    const basePrompt =
      "Note: previous responses in this conversation may be tagged with their source model in [PROVIDER/MODEL] notation for context.";
    const enhancedSystemPrompt = systemPrompt
      ? `${systemPrompt}\n\n${basePrompt}`
      : basePrompt;
    return [
      { role: "system", content: enhancedSystemPrompt } as const,
      ...msgs
    ] as const;
  }

  private xAiFormat(
    isNewChat: boolean,
    model: GrokModelIdUnion,
    msgs: ProviderChatRequestEntity["msgs"],
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"],
    detail: "low" | "medium" | "high" = "medium"
  ): readonly (
    | { role: "system"; content: string }
    | {
        role: "user";
        content:
          | string
          | readonly (
              | { type: "text"; text: string }
              | {
                  type: "image_url";
                  image_url: {
                    url: string;
                    detail?: "low" | "medium" | "high";
                  };
                }
            )[];
      }
    | { role: "assistant"; content: string }
  )[] {
    // Helper to build content parts from a message's attachments + text
    const buildUserContent = (
      m: MessageSingleton<true>,
      model: GrokModelIdUnion
    ) => {
      const parts: (
        | { type: "text"; text: string }
        | {
            type: "image_url";
            image_url: { url: string; detail?: "low" | "medium" | "high" };
          }
      )[] = [];
      if (
        (model === "grok-2-image-1212" ||
          model === "grok-2-vision-1212" ||
          model === "grok-4-0709" ||
          model === "grok-4-fast-non-reasoning" ||
          model === "grok-4-fast-reasoning") &&
        m.attachments &&
        m.attachments.length > 0
      ) {
        for (const att of m.attachments) {
          const url = att.cdnUrl ?? att.sourceUrl;
          if (url && att.mime?.startsWith("image/")) {
            parts.push({ type: "image_url", image_url: { url, detail } });
          }
        }
      }
      parts.push({ type: "text", text: m.content });
      return parts;
    };

    if (isNewChat) {
      const first = msgs[0];
      if (!first) {
        // Fallback: include system prompt if present and an empty user turn
        return systemPrompt
          ? ([
              { role: "system", content: systemPrompt },
              { role: "user", content: "" }
            ] as const)
          : ([{ role: "user", content: "" }] as const);
      }
      const parts = buildUserContent(first, model);
      const userMsg =
        parts.length === 1 && parts?.[0] && parts?.[0].type === "text"
          ? ({ role: "user", content: parts?.[0]?.text } as const)
          : ({ role: "user", content: parts } as const);
      if (systemPrompt) {
        return [{ role: "system", content: systemPrompt }, userMsg] as const;
      }
      return [userMsg] as const;
    }

    // Existing chat: include history (assistant tags), and for the last
    // user turn, include its attachments inline, if any.
    const last = msgs.at(-1);
    if (last?.senderType === "USER") {
      const history = this.prependProviderModelTag(msgs.slice(0, -1));
      const base = this.formatMsgs(history, systemPrompt);
      const parts = buildUserContent(last, model);
      const userMsg =
        parts.length === 1 && parts?.[0]?.type === "text"
          ? ({ role: "user", content: parts?.[0].text } as const)
          : ({ role: "user", content: parts } as const);
      return [...base, userMsg] as const;
    }

    // If last is assistant or not present, just map entire history
    const formatted = this.formatMsgs(
      this.prependProviderModelTag(msgs),
      systemPrompt
    );
    return formatted;
  }

  private async generateId(target: "seriesId" | "generationGroupId") {
    const { nanoid } = await import("nanoid");
    if (target === "generationGroupId") {
      const generationGroupId = "resp_" + nanoid();
      return generationGroupId;
    } else return nanoid();
  }

  private mapPersistenceImgGenArr(props: ImageGenPartialArr[]) {
    return props.map((t, o) => {
      return {
        index: t[0] ?? o,
        cdnUrl: t[1],
        itemId: t[2],
        width: t[3],
        height: t[4],
        mime: t[5],
        bucket: t[6],
        key: t[7],
        versionId: t[8],
        s3ObjectId: t[9],
        filename: t[10],
        ext: t[11],
        etag: t[12],
        size: t[13],
        s3LastModified: t[14],
        ContentDisposition: t[15],
        CacheControl: t[16],
        Checksum: t[17],
        StorageClass: t[18],
        generationGroupId: t[19],
        image: t[20],
        uploadDuration: t[21],
        requestMessageId: t[22],
        jobId: t[23],
        jobIndex: 0,
        seriesIndex: t[0],
        seriesId: t[2],

        kind: "FINAL"
      } as const;
    });
  }

  public mapPersistenceImgGenArrr(userId: string, props: ImageGenPartialArr[]) {
    return props.map((t, o) => {
      const rt = t[25];
      const expImg = t[26];
      const p = rt.cdnUrl?.split(/\//gm);
      const filename = p?.at(-1);
      const pathFragments = filename?.split(/-/gm);
      const _timestamp = pathFragments?.[0];
      const seriesIndex = pathFragments?.[2]?.split(".")?.[0];
      return {
        index: t[0],
        cdnUrl: rt.cdnUrl,
        itemId: t[2],
        width: t[3],
        height: t[4],
        mime: t[5],
        bucket: t[6],
        key: t[7],
        versionId: t[8],
        s3ObjectId: t[9],
        filename: t[10] ?? null,
        batchId: null,
        draftId: null,
        cacheControl: rt.cacheControl ?? null,
        checksumAlgo: rt?.checksum?.algo ?? "CRC32",
        checksumSha256: rt.checksum?.value ?? null,
        compatCdnUrl: rt.cdnUrl,
        compatExt: rt.extension ?? t?.[11] ?? expImg.format,
        compatKey: rt.key,
        compatS3ObjectId: rt.s3ObjectId,
        compatMime: t[5],
        compatReadyAt: null,
        compatStatus: "ALIASED",
        compatVersionId: rt.versionId,
        contentDisposition: rt.contentDisposition ?? null,
        contentEncoding: null,
        createdAt: new Date(Date.now()),
        ext: t[11] ?? rt.extension ?? expImg.format,
        deletedAt: null,
        document: null,
        expiresAt: rt.expires,
        origin: "GENERATED",
        publicUrl: rt.publicUrl,
        region: "us-east-1",
        sourceUrl: "buffer",
        sseAlgorithm: null,
        sseKmsKeyId: null,
        status: "READY",
        storageClass: rt.storageClass ?? null,
        thumbnailKey: null,
        updatedAt: new Date(Date.now()),
        userId,
        etag: rt.etag ?? null,
        size: t?.[13] ?? null,
        s3LastModified: rt.lastModified ? new Date(rt.lastModified) : null,
        generationGroupId: t[19],
        image: {
          animated: expImg.animated,
          width: expImg.width,
          height: expImg.height,
          colorModel:
            expImg.colorModel === "grayscale-alpha"
              ? "grayscale_alpha"
              : expImg.colorModel,
          aspectRatio: expImg.width / expImg.height,
          cameraMake: null,
          cameraModel: null,
          colorSpace: expImg.colorSpace,
          dominantColorHex: null,
          exifDateTimeOriginal: expImg.exifDateTimeOriginal
            ? new Date(expImg.exifDateTimeOriginal)
            : null,
          format: expImg.format,
          frames: expImg.frames,
          gpsLat: null,
          gpsLon: null,
          hasAlpha: expImg.hasAlpha,
          iccProfile: expImg.iccProfile,
          lensModel: null,
          orientation: expImg.orientation
        },
        imageGenOutput: {
          ext: expImg.format,
          height: expImg.height,
          width: expImg.width,
          jobId: t[23] ?? "",
          isPartial: true,
          jobIndex: 0,
          kind: "FINAL",
          mime: t[5],
          revisedPrompt: null,
          seriesId: t[2],
          seriesIndex: seriesIndex ? Number.parseInt(seriesIndex, 10) : o++
        },
        uploadDuration: t[21] ?? null,
        requestMessageId: t[22],
        jobId: t[23] ?? "",
        jobIndex: 0,
        seriesIndex: t[0],
        seriesId: t[2],
        revisedPrompt: t[24],
        kind: "FINAL"
      } as const satisfies AIChatResponseImgGenSubFields;
    });
  }

  public async handleXAIAiChatRequest({
    chunks,
    conversationId,
    streamChannel,
    msgs,
    thinkingChunks,
    apiKey,
    ws,
    userId,
    isNewChat,
    max_tokens,
    model = "grok-4-0709" satisfies GrokModelIdUnion,
    systemPrompt,
    temperature,
    imgGenEnabled,
    imgGenFields,
    requestMessageId,
    jobId,
    title,
    topP
  }: ProviderChatRequestEntity) {
    let partialImgArr = Array.of<ImageGenPartialArr>(),
      tInitial = 0,
      tDelta = 0,
      totalDur = 0;
    const provider = "grok" as const;
    let grokThinkingStartTime: number | null = null,
      grokThinkingDuration = 0,
      grokIsCurrentlyThinking = false,
      grokThinkingAgg = "",
      grokAgg = "",
      iThink = 0,
      hasAggregateFinal = false;
    const m = model as GrokModelIdUnion;
    if (m === "grok-2-image-1212" && imgGenEnabled) {
      const generationGroupId = await this.generateId("generationGroupId");
      const n = this.handleImgGenCount(provider, m, {
        n: imgGenFields?.n
      });
      totalDur = performance.now();
      const res = await this.handleImgGen(
        m,
        n,
        this.xAiFormat(isNewChat, m, msgs, systemPrompt, "high"),
        userId,
        apiKey ?? undefined
      );
      grokAgg += "*Image Gen In Process...*";
      // fire off the very first message for UX
      ws.send(
        JSON.stringify({
          type: "ai_chat_chunk",
          conversationId,
          userId,
          title,
          provider,
          systemPrompt,
          temperature,
          thinkingDuration: undefined,
          isThinking: false,
          topP,
          model: m,
          chunk: grokAgg,
          done: false
        })
      );
      if (!res) {
        ws.send(
          JSON.stringify({
            type: "ai_chat_error",
            provider: provider,
            conversationId,
            model: m,
            systemPrompt,
            temperature,
            topP,
            title,
            userId,
            done: true,
            message: "something went wrong with image gen..."
          })
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_error", {
          type: "ai_chat_error",
          provider,
          conversationId,
          model: m,
          title,
          systemPrompt,
          temperature,
          topP,
          userId,
          done: true,
          message: "Something went wrong with image gen..."
        });
        return;
      } else {
        let i = 0,
          a;
        i < (n ?? 1);

        for (const d of res.data) {
          i++;
          const b64 = Buffer.from(d.b64_json, "base64");

          const [getIt, seriesId] = await Promise.all([
            this.extract.extractRemote(
              b64,
              4096 * 48
            ) as Promise<ExpandedImgSpecs>,
            this.generateId("seriesId")
          ]);
          const itemId = seriesId.concat(`-${0}`);
          const filename = itemId
            .concat("-")
            .concat("0")
            .concat(`.${getIt.format}`);

          tInitial = performance.now();
          const rtHelper = await this.s3.uploadGenerated(b64, this.isProd, {
            contentType: getIt.contentType ?? "image/jpeg",
            filename,
            origin: "GENERATED",
            userId,
            size: getIt.byteSize,
            conversationId
          });
          a = rtHelper;
          tDelta = performance.now() - tInitial;
          const uploadTime = tDelta;
          partialImgArr.push([
            0,
            rtHelper.cdnUrl ?? "",
            itemId,
            getIt.width,
            getIt.height,
            getIt.contentType ?? rtHelper.contentType ?? "",
            rtHelper.bucket,
            rtHelper.key,
            rtHelper.versionId,
            rtHelper.s3ObjectId,
            filename,
            rtHelper.extension,
            rtHelper?.etag,
            getIt?.byteSize ?? rtHelper?.size,
            rtHelper?.lastModified,
            rtHelper?.contentDisposition,
            rtHelper?.cacheControl,
            rtHelper?.checksum,
            rtHelper?.storageClass,
            itemId,
            {
              animated: getIt.animated,
              aspectRatio: getIt.width / getIt.height,
              cameraMake: null,
              cameraModel: null,
              colorSpace: getIt.colorSpace,
              dominantColorHex: null,
              exifDateTimeOriginal: getIt.exifDateTimeOriginal
                ? new Date(getIt.exifDateTimeOriginal)
                : null,
              format: getIt.format !== "unknown" ? getIt.format : "jpeg",
              frames: getIt.frames,
              gpsLat: null,
              gpsLon: null,
              hasAlpha: getIt.hasAlpha ?? false,
              height: getIt.height,
              width: getIt.width,
              iccProfile: getIt.iccProfile ?? null,
              lensModel: null,
              orientation: getIt.orientation,
              createdAt: undefined,
              updatedAt: undefined
            },
            uploadTime,
            requestMessageId,
            jobId,
            d.revised_prompt,
            rtHelper,
            getIt
          ]);
          tInitial = 0;
          tDelta = 0;
          continue;
        }
        const remapFinals = this.mapPersistenceImgGenArr(partialImgArr).map(
          v => {
            const { generationGroupId: _placeholder, ...rest } = v;
            return {
              ...rest,
              generationGroupId
            };
          }
        );

        const dur = performance.now() - totalDur;
        await this.prisma.handleAiChatResponse({
          chunk: grokAgg,
          conversationId,
          done: true,
          provider,
          title,
          userId,
          model: m,
          systemPrompt,
          thinkingDuration: undefined,
          thinkingText: undefined,
          temperature,
          topP,
          imgGenEnabled: true,
          jobId,
          uploadDuration: dur,
          requestMessageId,
          usage: undefined,
          imgGenFields: {
            partialImages: undefined,
            images: this.mapPersistenceImgGenArrr(userId, partialImgArr),
            activeImage: this.mapPersistenceImgGenArrr(
              userId,
              partialImgArr
            ).find(t => t.index === partialImgArr.length - 1),
            actualCount: remapFinals.length,
            duration: dur,
            outputAspectRatio:
              (remapFinals[0]?.width ?? 0) / (remapFinals[0]?.height ?? 0),
            outputBackground: undefined,
            outputCompression: undefined,
            outputFormat: a?.extension,
            outputHeight: remapFinals[0]?.height,
            outputWidth: remapFinals[0]?.width,
            outputMime: remapFinals[0]?.mime,
            outputQuality: undefined,
            outputSize: undefined,
            partialImagesActual: 0,
            partialImagesRequested: 0,
            requestedCount: imgGenFields?.n,
            revisedPrompt: partialImgArr?.[0]?.[24],
            seed: undefined,
            size: a?.size
          }
        });

        ws.send(
          JSON.stringify({
            type: "ai_chat_response",
            conversationId,
            userId,
            provider,
            systemPrompt,
            thinkingDuration: undefined,
            thinkingText: undefined,
            title,
            temperature,
            topP,
            model: m,
            chunk: grokAgg,
            done: true,
            imgGenEnabled: true,
            imgGenFields: {
              partialImages: undefined,
              images: this.mapPersistenceImgGenArrr(userId, partialImgArr),
              activeImage: this.mapPersistenceImgGenArrr(
                userId,
                partialImgArr
              ).find(t => t.index === partialImgArr.length - 1),
              actualCount: remapFinals.length,
              duration: dur,
              outputAspectRatio:
                (remapFinals[0]?.width ?? 0) / (remapFinals[0]?.height ?? 0),
              outputBackground: undefined,
              outputCompression: undefined,
              outputFormat: a?.extension,
              outputHeight: remapFinals[0]?.height,
              outputWidth: remapFinals[0]?.width,
              outputMime: remapFinals[0]?.mime,
              outputQuality: undefined,
              outputSize: undefined,
              partialImagesActual: 0,
              partialImagesRequested: 0,
              requestedCount: imgGenFields?.n,
              revisedPrompt: partialImgArr?.[0]?.[24],
              seed: undefined,
              size: a?.size
            }
          } satisfies EventTypeMap["ai_chat_response"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
          type: "ai_chat_response",
          conversationId,
          userId,
          systemPrompt,
          temperature,
          title,
          thinkingDuration:
            grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
          thinkingText: grokThinkingAgg,
          topP,
          provider,
          model: m,
          chunk: grokAgg,
          done: true,
          imgGenEnabled: true,
          imgGenFields: {
            partialImages: undefined,
            images: this.mapPersistenceImgGenArrr(userId, partialImgArr),
            activeImage: this.mapPersistenceImgGenArrr(
              userId,
              partialImgArr
            ).find(t => t.index === partialImgArr.length - 1),
            actualCount: remapFinals.length,
            duration: dur,
            outputAspectRatio:
              (remapFinals[0]?.width ?? 0) / (remapFinals[0]?.height ?? 0),
            outputBackground: undefined,
            outputCompression: undefined,
            outputFormat: a?.extension,
            outputHeight: remapFinals[0]?.height,
            outputWidth: remapFinals[0]?.width,
            outputMime: remapFinals[0]?.mime,
            outputQuality: undefined,
            outputSize: undefined,
            partialImagesActual: 0,
            partialImagesRequested: 0,
            requestedCount: imgGenFields?.n,
            revisedPrompt: partialImgArr?.[0]?.[24],
            seed: undefined,
            size: a?.size
          }
        });

        // Clear saved state on successful completion
        void this.redis.del(`stream:state:${conversationId}`);
        return;
      }
    }
    try {
      const formatted = this.xAiFormat(
        isNewChat,
        m,
        msgs,
        systemPrompt,
        "high"
      );

      // this.logger.debug(JSON.stringify(formatted, null, 2));
      const streamer = this.stream(m, formatted, apiKey ?? undefined, {
        max_tokens,
        top_p: topP,
        temperature
      });

      for await (const chunk of streamer) {
        let text: string | undefined = undefined,
          thinkingText: string | undefined = undefined,
          done: boolean | undefined = undefined,
          finalThinkingChunk = "";

        // Final usage-only chunk
        if ("usage" in chunk && chunk.usage !== undefined) {
          done = true;
        }

        if (chunk.choices) {
          for (const choice of chunk.choices) {
            // Check for finish reason
            if (isFinishChoice(choice)) {
              done = true;
              continue;
            }

            const delta = (choice as xAIChoiceActive).delta;

            // Handle grok-4 initial role-only delta
            if (
              isStartDelta(delta) &&
              !isContentDelta(delta) &&
              !isReasoningDelta(delta)
            ) {
              // grok-4 behavior: initial role only; ignore for content/think
              continue;
            }

            if (isReasoningDelta(delta)) {
              if (typeof grokThinkingStartTime !== "number") {
                grokThinkingStartTime = performance.now();
              }
              if (grokIsCurrentlyThinking === false) {
                grokIsCurrentlyThinking = true;
              }
              thinkingText = delta.reasoning_content;
            }
            if (isContentDelta(delta)) {
              if (grokIsCurrentlyThinking === true && grokThinkingStartTime) {
                grokIsCurrentlyThinking = false;
                const endThinkingTime = performance.now();
                grokThinkingDuration = Math.round(
                  endThinkingTime - grokThinkingStartTime
                );
              }
              text = delta.content;
            }
          }
        }

        // Special handling for grok-code-fast-1 aggregate reasoning behavior (similar to v0)
        if (
          thinkingText &&
          grokIsCurrentlyThinking &&
          (m === ("grok-code-fast-1" satisfies GrokModelIdUnion) ||
            m === ("grok-3-mini" satisfies GrokModelIdUnion) ||
            m === ("grok-4-0709" satisfies GrokModelIdUnion) ||
            m === ("grok-4-fast-reasoning" satisfies GrokModelIdUnion))
        ) {
          iThink++;
          console.info(`[${iThink}]: ${thinkingText}`);
          if (hasAggregateFinal) {
            grokThinkingAgg += finalThinkingChunk;
            if (finalThinkingChunk) thinkingChunks.push(finalThinkingChunk);
          } else {
            grokThinkingAgg += thinkingText;
            thinkingChunks.push(thinkingText);
          }

          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              userId,
              title,
              provider,
              systemPrompt,
              temperature,
              thinkingText: hasAggregateFinal
                ? finalThinkingChunk
                : thinkingText,
              isThinking: grokIsCurrentlyThinking,
              thinkingDuration: grokThinkingStartTime
                ? performance.now() - grokThinkingStartTime
                : undefined,
              topP,
              model: m,
              done: false
            } satisfies EventTypeMap["ai_chat_chunk"])
          );

          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model: m,
            title,
            isThinking: grokIsCurrentlyThinking,
            thinkingDuration: grokThinkingStartTime
              ? performance.now() - grokThinkingStartTime
              : undefined,
            thinkingText: hasAggregateFinal ? finalThinkingChunk : thinkingText,
            systemPrompt,
            temperature,
            topP,
            provider,
            chunk: text,
            done: false
          });
        }

        if (text) {
          chunks.push(text);
          grokAgg += text;

          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              userId,
              title,
              provider,
              systemPrompt,
              temperature,
              thinkingDuration:
                grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
              isThinking: false,
              topP,
              model: m,
              chunk: text,
              done: false
            } satisfies EventTypeMap["ai_chat_chunk"])
          );

          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model: m,
            title,
            thinkingDuration:
              grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
            isThinking: false,
            thinkingText: grokThinkingAgg,
            systemPrompt,
            temperature,
            topP,
            provider,
            chunk: text,
            done: false
          });

          if (chunks.length % 10 === 0) {
            void this.redis.saveStreamState(
              conversationId,
              chunks,
              {
                model: m,
                provider,
                title,
                totalChunks: chunks.length,
                completed: false,
                systemPrompt,
                temperature,
                topP
              },
              thinkingChunks
            );
          }
        }

        if (done) {
          await this.prisma.handleAiChatResponse({
            chunk: grokAgg,
            conversationId,
            done,
            provider,
            title,
            userId,
            model: m,
            systemPrompt,
            thinkingDuration:
              grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
            thinkingText: grokThinkingAgg,
            temperature,
            topP
          });

          ws.send(
            JSON.stringify({
              type: "ai_chat_response",
              conversationId,
              userId,
              provider,
              systemPrompt,
              thinkingDuration:
                grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
              thinkingText: grokThinkingAgg,
              title,
              temperature,
              topP,
              model: m,
              chunk: grokAgg,
              done
            } satisfies EventTypeMap["ai_chat_response"])
          );

          void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
            type: "ai_chat_response",
            conversationId,
            userId,
            systemPrompt,
            temperature,
            title,
            thinkingDuration:
              grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
            thinkingText: grokThinkingAgg,
            topP,
            provider,
            model: m,
            chunk: grokAgg,
            done
          });

          // Clear saved state on successful completion
          void this.redis.del(`stream:state:${conversationId}`);
          break;
        }
      }
    } catch (err) {
      // Surface error as stream error
      ws.send(
        JSON.stringify({
          type: "ai_chat_error",
          provider: provider,
          conversationId,
          model: m,
          systemPrompt,
          temperature,
          topP,
          title,
          userId,
          done: true,
          message: err instanceof Error ? err.message : String(err)
        } satisfies EventTypeMap["ai_chat_error"])
      );
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_error", {
        type: "ai_chat_error",
        provider,
        conversationId,
        model: m,
        title,
        systemPrompt,
        temperature,
        topP,
        userId,
        done: true,
        message: err instanceof Error ? err.message : String(err)
      });
      void this.redis.saveStreamState(
        conversationId,
        chunks,
        {
          model: m,
          provider,
          title,
          totalChunks: chunks.length,
          completed: false,
          systemPrompt,
          temperature,
          topP
        },
        thinkingChunks
      );
    }
  }
}
