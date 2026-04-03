import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type { ImageGenPartialArr, xAIImgGenResponse } from "@/xai/types.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import { GrokCollectionsService } from "@/xai/collections.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AIChatRequestImgGenFields,
  AIChatResponseImgGenSubFields,
  EventTypeMap,
  GrokImagineARUnion,
  GrokImagineImageGenOpts,
  GrokImagineImgModelUnion,
  GrokImgGenModels,
  GrokModelIdUnion,
  MessageSingleton
} from "@slipstream/types";

type xAIImageEditsInput = {
  url: string;
};

export interface xAIImgGenFields {
  readonly model: GrokImagineImgModelUnion;
  readonly prompt: string;
  readonly n: number;
  readonly aspect_ratio: GrokImagineARUnion;
  readonly resolution: GrokImagineImageGenOpts["resolution"];
  readonly response_format: "b64_json";
  readonly user: string;
}

export class GrokImgGenService extends GrokCollectionsService {
  protected nanoid: Promise<(typeof import("nanoid"))["nanoid"]>;
  constructor(
    protected redis: EnhancedRedisPubSub,
    protected s3: S3Storage,
    logger: LoggerService,
    prisma: PrismaService,
    userStore: UserStoreVectorService,
    apiKey: string,
    managementKey: string
  ) {
    super(logger, prisma, userStore, apiKey, managementKey);
    this.nanoid = import("nanoid").then(d => d.nanoid);
  }

  private handleMostRecentImagineMsg(
    msgs: MessageSingleton<true>[],
    requestMessageId: string
  ) {
    const getUserMsg = msgs.find(t => t.id === requestMessageId);

    if (!getUserMsg) throw new Error("no message found for grok image gen");

    const images = Array.of<xAIImageEditsInput>();
    for (const att of getUserMsg.attachments) {
      const url = att.compatStatus === "ACTIVE" ? att.compatCdnUrl : att.cdnUrl;
      const mime = att.compatStatus === "ACTIVE" ? att.compatMime : att.mime;

      if (att.assetType === "IMAGE" && url && mime) {
        images.push({ url });
      }
    }

    if (images.length > 3) {
      throw new Error(
        "xAI image edits supports a maximum of 3 input images per request."
      );
    }

    return {
      prompt: this.messageText(getUserMsg),
      images
    } as const;
  }

  private resolveGrokImagineImgOpts(imgGenFields?: AIChatRequestImgGenFields) {
    const rawAspectRatio = imgGenFields?.output_size;
    const rawResolution = imgGenFields?.output_quality;

    let ar: GrokImagineARUnion;
    let r: "1k" | "2k";

    if (rawAspectRatio && this.prisma.isValidGrokAR(rawAspectRatio)) {
      ar = rawAspectRatio;
    } else {
      ar = "auto" as const;
    }

    if (rawResolution && this.prisma.isValidGrokQuality(rawResolution)) {
      r = rawResolution;
    } else {
      r = "2k";
    }

    return {
      aspect_ratio: ar,
      resolution: r
    } as const satisfies {
      aspect_ratio: GrokImagineARUnion;
      resolution: "1k" | "2k";
    };
  }

  private async handleImgGenReq(
    key: string,
    url: typeof this.baseImgGenUrl | typeof this.baseImgEditsUrl,
    body: Record<string, unknown>
  ) {
    const imgResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!imgResponse.ok) {
      const errorText = await imgResponse.text();
      throw new Error(
        `xAI API error (${imgResponse.status}, ${imgResponse.statusText}) at ${url}: ${errorText}`
      );
    }
    return await imgResponse.json<xAIImgGenResponse>();
  }

  private async handleImgGen(
    model = "grok-imagine-image" satisfies GrokImgGenModels,
    n = 1,
    imageCount: number,
    messages: MessageSingleton<true>[],
    userId: string,
    requestMessageId: string,
    imgGenFields?: AIChatRequestImgGenFields,
    apiKey?: string
  ) {
    const key = apiKey ?? this.xaiKey;
    if (this.prisma.grokImagineImgGenModel(model)) {
      const { prompt, images } = this.handleMostRecentImagineMsg(
        messages,
        requestMessageId
      );
      const { aspect_ratio, resolution } =
        this.resolveGrokImagineImgOpts(imgGenFields);
      const baseBody = {
        model,
        prompt,
        n,
        aspect_ratio,
        resolution,
        response_format: "b64_json",
        user: userId
      } as const satisfies {
        model: "grok-imagine-image" | "grok-imagine-image-pro";
        prompt: string;
        n: number;
        aspect_ratio: GrokImagineARUnion;
        resolution: "1k" | "2k";
        response_format: "b64_json";
        user: string;
      };

      if (imageCount > 0) {
        return await this.handleImgGenReq(key, this.baseImgEditsUrl, {
          ...baseBody,
          images
        } satisfies typeof baseBody & { images: xAIImageEditsInput[] });
      }

      return await this.handleImgGenReq(key, this.baseImgGenUrl, baseBody);
    }
  }

  private async generateId(target: "seriesId" | "generationGroupId") {
    const nanoid = await this.nanoid;
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

  private mapPersistenceImgGenArrr(
    userId: string,
    props: ImageGenPartialArr[]
  ) {
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

  protected async handleXAIAiImageGenRequest({
    conversationId,
    streamChannel,
    msgs,
    apiKey,
    ws,
    userId,
    model = "grok-imagine-image",
    systemPrompt,
    temperature,
    imgCounts,
    imgGenEnabled,
    imgGenFields,
    userMsgId,
    requestMessageId,
    jobId,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const m = model as GrokModelIdUnion;
    if (!imgGenFields || !imgGenEnabled || !this.isNativeImgModel(m)) return;

    let partialImgArr = Array.of<ImageGenPartialArr>(),
      tInitial = 0,
      tDelta = 0,
      totalDur = 0,
      grokAgg = "",
      grokChunks = Array.of<string>();
    let nextOrdinal = 0;

    const roundTrack = Array.of<{
      type: "TEXT";
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();

    const provider = "grok" as const;

    try {
      let text: string | undefined = undefined;

      const generationGroupId = await this.generateId("generationGroupId");

      const n = this.prisma.handleImgGenCount(m, {
        n: imgGenFields?.n
      });

      totalDur = performance.now();

      const res = await this.handleImgGen(
        m,
        n,
        imgCounts,
        msgs,
        userId,
        requestMessageId ?? "",
        imgGenFields,
        apiKey ?? undefined
      );

      text = "*Image Gen In Process...*";
      grokChunks.push(grokAgg);
      // fire off the very first message for UX
      if (text) {
        const currentMessageBlock = {
          type: "TEXT",
          content: text,
          durationMs: 0,
          ordinal: nextOrdinal,
          conversationId
        } as const;
        roundTrack.push(currentMessageBlock);
        nextOrdinal += 1;
        grokAgg += text;
        grokChunks.push(grokAgg);

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            title,
            provider,
            userMsgId,
            systemPrompt,
            temperature,
            thinkingDuration: undefined,
            isThinking: false,
            topP,
            model: m,
            imgGenEnabled: true,
            chunk: grokAgg,
            messageBlocks: currentMessageBlock,
            done: false
          } satisfies EventTypeMap["ai_chat_chunk"])
        );
        text = undefined;
      }

      if (!res) {
        ws.send(
          JSON.stringify({
            type: "ai_chat_error",
            provider: provider,
            conversationId,
            model: m,
            imgGenEnabled: true,
            userMsgId,
            imgGenFields,
            systemPrompt,
            temperature,
            topP,
            title,
            userId,
            done: true,
            message: "something went wrong with image gen..."
          } satisfies EventTypeMap["ai_chat_error"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_error", {
          type: "ai_chat_error",
          provider,
          conversationId,
          imgGenFields,
          model: m,
          userMsgId,
          title,
          systemPrompt,
          imgGenEnabled: true,
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
            this.prisma.extractor.extractRemote(
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
          const rtHelper = await this.s3.uploadGenerated(
            b64,
            this.prisma.isProd,
            {
              contentType: getIt.contentType ?? "image/jpeg",
              filename,
              origin: "GENERATED",
              userId,
              size: getIt.byteSize,
              conversationId
            }
          );
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
              colorModel:
                getIt.colorModel === "grayscale-alpha"
                  ? "grayscale_alpha"
                  : getIt.colorModel,
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

        const d = await this.prisma.handleAiChatResponse({
          chunk: grokAgg,
          conversationId,
          userMsgId,
          done: true,
          provider,
          mime: remapFinals[0]?.mime,
          title,
          userId,
          model: m,
          systemPrompt,
          thinkingDuration: undefined,
          thinkingText: undefined,
          messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
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
            aiMsgId: d.aiMsgId,
            systemPrompt,
            thinkingDuration: undefined,
            thinkingText: undefined,
            title,
            temperature,
            imgGenAttachmentId: d.imgGenAttachmentId,
            userMsgId,
            topP,
            model: m,
            chunk: grokAgg,
            done: true,
            messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
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
          userMsgId,
          aiMsgId: d.aiMsgId,
          imgGenAttachmentId: d.imgGenAttachmentId,
          temperature,
          title,
          thinkingDuration: undefined,
          thinkingText: undefined,
          messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
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
          userMsgId,
          topP,
          title,
          userId,
          aiMsgId: undefined,
          imgGenEnabled,
          done: true,
          message: this.prisma.safeErrMsg(err)
        } satisfies EventTypeMap["ai_chat_error"])
      );
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_error", {
        type: "ai_chat_error",
        provider,
        conversationId,
        userMsgId,
        model: m,
        title,
        imgGenFields,
        systemPrompt,
        aiMsgId: undefined,
        imgGenEnabled,
        temperature,
        topP,
        userId,
        done: true,
        message: this.prisma.safeErrMsg(err)
      });
      void this.redis.saveStreamState(
        conversationId,
        grokChunks,
        {
          model: m,
          provider,
          title,
          totalChunks: grokChunks.length,
          completed: false,
          systemPrompt,
          temperature,
          topP
        },
        undefined
      );
    }
  }
}
