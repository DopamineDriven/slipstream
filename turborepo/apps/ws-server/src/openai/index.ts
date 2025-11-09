import type {
  ImageGenPartialArr,
  OpenAIImgApiStreamFinal,
  OpenAIImgApiStreamPartial
} from "@/openai/types.ts";
import type {
  ProviderOpenaiRequestEntity,
  S3FinalizePayload
} from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/metadata";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import { Stream } from "openai/core/streaming.mjs";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import type {
  AIChatResponseImgGenSubFields,
  EventTypeMap,
  GptImageAndFacilitatorsImgGenWorkupRT,
  OpenAiModelIdUnion
} from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";
import { OpenAIServiceWorkup } from "./workup.ts";

export class OpenAIService extends OpenAIServiceWorkup {
  private defaultClient: OpenAI;
  private logger: PinoLogger;
  /** key: storename; val: storeId; */
  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected extractor: ExtractService,
    protected s3: S3Storage,
    protected isProd: boolean,
    protected redis: EnhancedRedisPubSub,
    protected apiKey: string
  ) {
    super(prisma);

    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[openai] " }
      );
    this.defaultClient = new OpenAI({
      logLevel: "debug",
      apiKey: this.apiKey,
      logger: this.logger
    });
  }

  public getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }

    return client;
  }

  public async handleOpenaiAiNativeImageRequestGptImage1({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    userId,
    thinkingChunks,
    ws,
    apiKey,
    jobId,
    requestMessageId,
    keyId,
    systemPrompt,
    temperature,
    topP,
    model = "gpt-image-1" satisfies OpenAiModelIdUnion,
    title,
    currentMsgBoundAssets,
    imgGenEnabled,
    imgGenFields
  }: ProviderOpenaiRequestEntity) {
    // use most recent message id for image gen requests to update Im

    const m = model as OpenAiModelIdUnion;

    const provider = "openai" as const;

    const partialImgArr = Array.of<ImageGenPartialArr>();

    let tInitial = 0,
      tDelta = 0,
      openaiAgg = "",
      partialImgsRequested = false,
      outputFormat: "png" | "jpeg" | "webp" = "png",
      uploadtInitial = 0,
      uploadtDelta = 0,
      usage = 0,
      partialArr = Array.of<OpenAIImgApiStreamPartial>();

    let streamPartial: OpenAIImgApiStreamPartial | null = null;

    let finalImgObj: OpenAIImgApiStreamFinal | null = null;

    const client = this.getClient(apiKey ?? undefined);

    const formatted = await this.formatOpenAiWithUploads(
      isNewChat,
      msgs,
      client,
      userId,
      keyId ?? undefined
    );

    // image api doesn't return a resp_id like responses api does:
    const generationGroupId = await this.generateId("generationGroupId");
    const itemId = await this.generateId("itemId");
    const _hasImages = this.hasImages(formatted);

    const _hasFiles = this.hasFiles(formatted);

    const fileIds = this.fileIds(formatted);

    let vectorStoreId: string | undefined;
    if (fileIds.length > 0) {
      vectorStoreId = await this.ensureUserVectorStoreId(client, null, userId);
      await client.vectorStores.fileBatches.createAndPoll(vectorStoreId, {
        file_ids: fileIds
      });
    }

    const resImg = this.responsesImgGen(
      imgGenEnabled ?? false,
      m,
      imgGenFields,
      currentMsgBoundAssets
    );

    if (typeof resImg === "undefined")
      throw new Error(
        "image options must be defined for the image endpoint api!"
      );

    if (
      (m === "gpt-image-1" || m === "gpt-image-1-mini") &&
      this.isImgGenModel("openai", m) &&
      (resImg.model === "gpt-image-1" || resImg.model === "gpt-image-1-mini") &&
      resImg.n === 1
    ) {
      const r = resImg satisfies GptImageAndFacilitatorsImgGenWorkupRT;
      partialImgsRequested = typeof r.partialImagesRequested !== "undefined";
      outputFormat = r.output_format;
      uploadtInitial = performance.now();

      const safeN = this.handleImgGenCount("openai", m, { n: r.n });
      const o = (await client.images.generate(
        {
          prompt: msgs?.[0]?.content ?? "",
          background: r.output_background,
          output_compression: r.output_compression,
          user: userId,
          output_format: r.output_format,
          model: m,
          moderation: r.moderation,
          n: safeN,
          partial_images: r.partialImagesRequested,
          quality: r.output_quality,
          size: r.output_size,
          stream: true
        },
        { stream: true }
      )) satisfies Stream<OpenAI.Images.ImageGenStreamEvent> & {
        _request_id?: string | null;
      };

      for await (const stream of o) {
        openaiAgg += "Image generation in progress...";

        let text: string | undefined = undefined,
          done = false,
          rtHelper: S3FinalizePayload | undefined;
        if (stream.type === "image_generation.partial_image") {
          streamPartial = {
            ...stream
          };
        }

        if (stream.type === "image_generation.completed") {
          stream;
          finalImgObj = stream;
          done = true;
        }
        if (streamPartial) {
          partialArr.push(streamPartial);
          const b64 = Buffer.from(streamPartial.b64_json, "base64");
          const imgSpecs = (await this.extractor.extractRemote(
            b64,
            4096 * 32
          )) as ExpandedImgSpecs;
          const format = streamPartial.output_format;
          const filename = itemId
            .concat("-")
            .concat(streamPartial.partial_image_index.toString(10))
            .concat(`.${format}`);

          tInitial = performance.now();
          rtHelper = await this.s3.uploadGenerated(b64, this.isProd, {
            contentType:
              imgSpecs.contentType ??
              this.getGenMime(streamPartial.output_format),
            filename,
            origin: "GENERATED",
            userId,
            size: imgSpecs.byteSize,
            conversationId
          });
          tDelta = performance.now() - tInitial;

          partialImgArr.push([
            streamPartial.partial_image_index,
            rtHelper.cdnUrl ?? "",
            itemId,
            imgSpecs.width,
            imgSpecs.height,
            imgSpecs.contentType ??
              this.getGenMime(streamPartial.output_format),
            rtHelper.bucket,
            rtHelper.key,
            rtHelper.versionId,
            rtHelper.s3ObjectId,
            filename,
            rtHelper.extension ?? streamPartial.output_format,
            rtHelper.etag,
            imgSpecs?.byteSize ?? rtHelper.size,
            rtHelper.lastModified,
            rtHelper.contentDisposition,
            rtHelper.cacheControl,
            rtHelper.checksum,
            rtHelper.storageClass,
            itemId,
            {
              animated: imgSpecs.animated,
              aspectRatio: imgSpecs.width / imgSpecs.height,
              cameraMake: null,
              cameraModel: null,
              colorSpace: imgSpecs.colorSpace,
              dominantColorHex: null,
              exifDateTimeOriginal: imgSpecs.exifDateTimeOriginal
                ? new Date(imgSpecs.exifDateTimeOriginal)
                : null,
              format: imgSpecs.format !== "unknown" ? imgSpecs.format : "jpeg",
              frames: imgSpecs.frames,
              gpsLat: null,
              gpsLon: null,
              hasAlpha: imgSpecs.hasAlpha ?? false,
              height: imgSpecs.height,
              width: imgSpecs.width,
              iccProfile: imgSpecs.iccProfile ?? null,
              lensModel: null,
              orientation: imgSpecs.orientation,
              createdAt: undefined,
              updatedAt: undefined
            },
            tDelta,
            requestMessageId,
            jobId,
            undefined,
            rtHelper,
            imgSpecs
          ]);

          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              done: false,
              userId,
              model,
              provider,
              imgGenEnabled: true,
              imgGenFields: {
                outputWidth: imgSpecs.width,
                outputHeight: imgSpecs.height,
                duration: performance.now() - uploadtInitial,
                outputAspectRatio: imgSpecs.width / imgSpecs.height,
                outputBackground: streamPartial.background,
                outputFormat: streamPartial.output_format,
                outputMime: this.getGenMime(streamPartial.output_format),
                outputQuality: streamPartial.quality,
                partialImagesRequested: imgGenFields?.output_partial_images,
                requestedCount: imgGenFields?.n,
                outputCompression: imgGenFields?.output_compression,
                outputSize: streamPartial.size,
                size: imgSpecs.byteSize,
                partialImagesActual: partialImgArr.length,
                revisedPrompt: undefined,
                seed: undefined,
                partialImages: this.mapPersistenceImgGenArr(
                  userId,
                  partialImgArr
                ),
                images: undefined,
                activeImage: this.mapPersistenceImgGenArr(
                  userId,
                  partialImgArr
                ).find(t => t.index === partialImgArr.length - 1)
              },
              systemPrompt,
              chunk: openaiAgg,
              temperature,
              title,
              topP,
              thinkingText: undefined,
              thinkingDuration: undefined,
              isThinking: undefined
            } satisfies EventTypeMap["ai_chat_chunk"])
          );
          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model,
            thinkingDuration: undefined,
            title,
            systemPrompt,
            imgGenFields: {
              outputWidth: imgSpecs.width,
              outputHeight: imgSpecs.height,
              duration: performance.now() - uploadtInitial,
              outputAspectRatio: imgSpecs.width / imgSpecs.height,
              outputBackground: streamPartial.background,
              outputFormat: streamPartial.output_format,
              outputMime: this.getGenMime(streamPartial.output_format),
              outputQuality: streamPartial.quality,
              partialImagesRequested: imgGenFields?.output_partial_images,
              requestedCount: imgGenFields?.n,
              outputCompression: imgGenFields?.output_compression,
              outputSize: streamPartial.size,
              size: imgSpecs.byteSize,
              partialImagesActual: partialImgArr.length,
              revisedPrompt: undefined,
              seed: undefined,
              partialImages: this.mapPersistenceImgGenArr(
                userId,
                partialImgArr
              ),
              images: undefined,
              activeImage: this.mapPersistenceImgGenArr(
                userId,
                partialImgArr
              ).find(t => t.index === partialImgArr.length - 1)
            },
            temperature,
            imgGenEnabled: true,
            topP,
            provider,
            thinkingText: undefined,
            isThinking: undefined,
            done: false
          });
          console.log(partialImgArr);

          tInitial = 0;
          tDelta = 0;
          rtHelper = undefined;
        }

        text = "Image generation in progress...";

        if (text) {
          openaiAgg += text;
          chunks.push(text);
          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              userId,
              provider,
              title,
              imgGenEnabled,
              model,
              systemPrompt,
              imgGenFields: {
                partialImagesActual: partialImgArr.length,
                partialImages: this.mapPersistenceImgGenArr(
                  userId,
                  partialImgArr
                ),
                activeImage: this.mapPersistenceImgGenArr(
                  userId,
                  partialImgArr
                ).find(t => t.index === partialImgArr.length - 1)
              },
              temperature,
              topP,
              chunk: text,
              isThinking: false,
              thinkingDuration: undefined,
              done: false
            } satisfies EventTypeMap["ai_chat_chunk"])
          );
          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model,
            title,
            imgGenEnabled,
            systemPrompt,
            temperature,
            topP,
            imgGenFields: {
              partialImagesActual: partialImgArr.length,
              partialImages: this.mapPersistenceImgGenArr(
                userId,
                partialImgArr
              ),
              activeImage: this.mapPersistenceImgGenArr(
                userId,
                partialImgArr
              ).find(t => t.index === partialImgArr.length - 1)
            },
            provider,

            chunk: text,
            done: false
          });
          if (chunks.length % 10 === 0) {
            void this.redis.saveStreamState(
              conversationId,
              chunks,
              {
                model,
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
        if (done === true && finalImgObj) {
          const b64 = Buffer.from(finalImgObj.b64_json, "base64");

          const filename = itemId
            .concat("-")
            .concat(partialImgArr.length.toString(10))
            .concat(`.${finalImgObj.output_format}`);

          const getIt = (await this.extractor.extractRemote(
            b64,
            4096 * 32
          )) as ExpandedImgSpecs;

          tInitial = performance.now();
          const rt = await this.s3.uploadGenerated(b64, this.isProd, {
            contentType: this.getGenMime(finalImgObj.output_format),
            filename,
            origin: "GENERATED",
            userId,
            conversationId,
            size: getIt?.byteSize
          });

          tDelta = performance.now() - tInitial;

          const duration = performance.now() - uploadtInitial;

          const imgMeta = this.handleAssetMetadata(getIt).img;

          const imgFinal = {
            cdnUrl: rt.cdnUrl,
            index: partialImgArr.length,
            itemId,
            width: getIt.width,
            height: getIt.height,
            mime:
              getIt.contentType ??
              rt.contentType ??
              this.getGenMime(outputFormat),
            bucket: rt.bucket,
            key: rt.key,
            versionId: rt.versionId,
            s3ObjectId: rt.s3ObjectId,
            filename,
            ext: getIt.format ?? finalImgObj.output_format,
            etag: rt.etag ?? null,
            size: getIt.byteSize ?? rt.size ?? null,
            s3LastModified: rt?.lastModified ? new Date(rt.lastModified) : null,
            contentDisposition: rt.contentDisposition ?? null,
            cacheControl: rt.cacheControl ?? null,
            checksumAlgo: rt.checksum?.algo ?? "CRC32",
            checksumSha256: rt.checksum?.value ?? null,
            storageClass: rt.storageClass ?? null,
            generationGroupId,
            image: {
              ...imgMeta,
              width: getIt.width,
              height: getIt.height,
              animated: getIt.animated,
              aspectRatio: getIt.width / getIt.height,
              cameraMake: null,
              cameraModel: null,
              colorModel:
                getIt.colorModel === "grayscale-alpha"
                  ? "grayscale_alpha"
                  : getIt.colorModel,
              colorSpace: getIt.colorSpace,
              dominantColorHex: null,
              exifDateTimeOriginal: getIt.exifDateTimeOriginal
                ? new Date(getIt.exifDateTimeOriginal)
                : null,
              frames: getIt.frames,
              gpsLat: null,
              gpsLon: null,
              hasAlpha: getIt.hasAlpha,
              iccProfile: getIt.iccProfile,
              lensModel: null,
              orientation: getIt.orientation,
              format: imgMeta?.format ?? "jpeg"
            },
            document: null,
            uploadDuration: uploadtDelta,
            requestMessageId,
            jobId: jobId ?? "",
            jobIndex: 0,
            seriesId: itemId,
            seriesIndex: partialImgArr.length,
            kind: "FINAL",
            revisedPrompt:
              "revised_prompt" in finalImgObj &&
              typeof finalImgObj.revised_prompt === "string"
                ? finalImgObj.revised_prompt
                : undefined,
            region: "us-east-1",
            batchId: null,
            compatCdnUrl: rt.cdnUrl,
            compatExt: rt.extension ?? getIt.format,
            compatKey: rt.key,
            compatMime: rt.contentType ?? this.getGenMime(getIt.format),
            compatReadyAt: null,
            compatStatus: "ALIASED",
            compatS3ObjectId: rt.s3ObjectId,
            compatVersionId: rt.versionId,
            contentEncoding: null,
            createdAt: new Date(Date.now()),
            updatedAt: new Date(Date.now()),
            deletedAt: null,
            origin: "GENERATED",
            publicUrl: rt.publicUrl,
            sourceUrl: "buffer",
            sseAlgorithm: null,
            sseKmsKeyId: null,
            status: "READY",
            thumbnailKey: null,
            userId,
            draftId: null,
            expiresAt: rt.expires,
            imageGenOutput: {
              ext: getIt.format ?? finalImgObj.output_format,
              height: getIt.height,
              width: getIt.width,
              isPartial: false,
              jobId: jobId ?? "",
              jobIndex: 0,
              kind: "FINAL",
              mime: rt.contentType ?? this.getGenMime(getIt.format),
              revisedPrompt:
                "revised_prompt" in finalImgObj &&
                typeof finalImgObj.revised_prompt === "string"
                  ? finalImgObj.revised_prompt
                  : null,
              seriesId: itemId,
              seriesIndex: partialImgArr.length
            }
          } as const satisfies AIChatResponseImgGenSubFields;

          const remapPartials = this.mapPersistenceImgGenArr(
            userId,
            partialImgArr
          ).map(v => {
            const {
              generationGroupId: _placeholder,
              revisedPrompt: _r,
              ...rest
            } = v;
            return {
              ...rest,
              revisedPrompt:
                finalImgObj &&
                "revised_prompt" in finalImgObj &&
                typeof finalImgObj.revised_prompt === "string"
                  ? finalImgObj.revised_prompt
                  : undefined,
              generationGroupId
            };
          });

          const height = getIt?.height ?? 1024,
            width = getIt?.width ?? 1024,
            outputAspectRatio = width / height;

          await this.prisma.handleAiChatResponse({
            chunk: openaiAgg,
            conversationId,
            done: true,
            title,
            temperature,
            topP,
            provider,
            userId,
            systemPrompt,
            usage,
            jobId,
            requestMessageId,
            mime: this.getGenMime(finalImgObj.output_format),
            model,
            imgGenEnabled: true,
            imgGenFields: {
              duration,
              revisedPrompt:
                "revised_prompt" in finalImgObj &&
                typeof finalImgObj.revised_prompt === "string"
                  ? finalImgObj.revised_prompt
                  : undefined,
              outputQuality: finalImgObj.quality,
              actualCount: partialImgArr.length,
              outputAspectRatio,
              outputFormat: finalImgObj.output_format,
              outputBackground: finalImgObj.background,
              outputCompression: imgGenFields?.output_compression,
              seed: imgGenFields?.seed ?? undefined,
              partialImagesRequested: partialImgsRequested
                ? (imgGenFields?.output_partial_images ?? undefined)
                : 0,
              requestedCount: imgGenFields?.n ?? 1,
              outputSize: finalImgObj.size,
              outputMime:
                getIt.contentType ?? this.getGenMime(finalImgObj.output_format),
              outputWidth: width,
              outputHeight: height,
              size: getIt.byteSize ?? 0,
              partialImagesActual: partialImgArr.length,
              partialImages: remapPartials,
              images: [{ ...imgFinal }]
            },
            thinkingText: undefined,
            thinkingDuration: undefined
          });
          ws.send(
            JSON.stringify({
              type: "ai_chat_response",
              conversationId,
              userId,
              provider,
              model,
              title,
              imgGenEnabled: true,
              usage,
              systemPrompt,
              temperature,
              imgGenFields: {
                duration,
                revisedPrompt:
                  "revised_prompt" in finalImgObj &&
                  typeof finalImgObj.revised_prompt === "string"
                    ? finalImgObj.revised_prompt
                    : undefined,
                outputQuality: finalImgObj.quality,
                actualCount: partialImgArr.length,
                outputAspectRatio,
                outputFormat: finalImgObj.output_format,
                outputBackground: finalImgObj.background,
                outputCompression: imgGenFields?.output_compression,
                seed: imgGenFields?.seed ?? undefined,
                partialImagesRequested: partialImgsRequested
                  ? (imgGenFields?.output_partial_images ?? undefined)
                  : 0,
                requestedCount: imgGenFields?.n ?? 1,
                outputSize: finalImgObj.size,
                outputMime:
                  getIt.contentType ??
                  this.getGenMime(finalImgObj.output_format),
                outputWidth: width,
                outputHeight: height,
                size: getIt.byteSize ?? 0,
                partialImagesActual: partialImgArr.length,
                partialImages: remapPartials,
                images: [imgFinal],
                activeImage: imgFinal
              },
              topP,
              chunk: openaiAgg,
              thinkingText: undefined,
              thinkingDuration: undefined,
              done: true
            } satisfies EventTypeMap["ai_chat_response"])
          );

          void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
            type: "ai_chat_response",
            conversationId,
            userId,
            systemPrompt,
            temperature,
            usage,
            imgGenEnabled,
            imgGenFields: {
              duration,
              revisedPrompt:
                "revised_prompt" in finalImgObj &&
                typeof finalImgObj.revised_prompt === "string"
                  ? finalImgObj.revised_prompt
                  : undefined,
              outputQuality: finalImgObj.quality,
              actualCount: partialImgArr.length,
              outputAspectRatio,
              outputFormat: finalImgObj.output_format,
              outputBackground: finalImgObj.background,
              outputCompression: imgGenFields?.output_compression,
              seed: imgGenFields?.seed ?? undefined,
              partialImagesRequested: partialImgsRequested
                ? (imgGenFields?.output_partial_images ?? undefined)
                : 0,
              requestedCount: imgGenFields?.n ?? 1,
              outputSize: finalImgObj.size,
              outputMime:
                getIt.contentType ?? this.getGenMime(finalImgObj.output_format),
              outputWidth: width,
              outputHeight: height,
              size: getIt.byteSize ?? 0,
              partialImagesActual: partialImgArr.length,
              partialImages: remapPartials,
              images: [imgFinal],
              activeImage: imgFinal
            },
            title,
            thinkingText: undefined,
            thinkingDuration: undefined,
            topP,
            provider,
            model,
            chunk: openaiAgg,
            done: true
          });
          void this.redis.del(`stream:state:${conversationId}`);
          break;
        }
      }
    }
  }

  public async handleOpenaiAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    apiKey,
    max_tokens,
    jobId,
    requestMessageId,
    keyId,
    model = "gpt-5-mini" satisfies OpenAiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    currentMsgBoundAssets,
    imgGenEnabled,
    imgGenFields,
    user_location
  }: ProviderOpenaiRequestEntity) {
    // use most recent message id for image gen requests to update Im

    const m = model as OpenAiModelIdUnion;

    const provider = "openai" as const;

    const partialImgArr = Array.of<ImageGenPartialArr>();

    let finalImgObj:
        | OpenAI.Responses.ResponseOutputItem.ImageGenerationCall
        | undefined,
      openaiThinkingStartTime: number | null = null,
      openaiThinkingDuration = 0,
      openaiIsCurrentlyThinking = false,
      openaiThinkingAgg = "",
      tInitial = 0,
      openaiResId: string | null = null,
      openaiAgg = "",
      partialImgsRequested = false,
      outputFormat: "png" | "jpeg" | "webp" = "png",
      partialImgAgg:
        | [number, string, string, number, number, string]
        | undefined = undefined,
      str: Stream<OpenAI.Responses.ResponseStreamEvent> & {
        _request_id?: string | null;
      },
      uploadtInitial = 0,
      uploadtDelta = 0,
      usage = 0;

    const client = this.getClient(apiKey ?? undefined);

    const formatted = await this.formatOpenAiWithUploads(
      isNewChat,
      msgs,
      client,
      userId,
      keyId ?? undefined
    );

    const loc = this.normalizeLocation(user_location);

    const _hasImages = this.hasImages(formatted);

    const hasFiles = this.hasFiles(formatted);

    const fileIds = this.fileIds(formatted);

    let vectorStoreId: string | undefined;
    if (fileIds.length > 0) {
      vectorStoreId = await this.ensureUserVectorStoreId(client, null, userId);
      await client.vectorStores.fileBatches.createAndPoll(vectorStoreId, {
        file_ids: fileIds
      });
    }

    const reasoning = this.openaiReasoning(m, "medium", "auto", imgGenEnabled);

    const resImg = this.responsesImgGen(
      imgGenEnabled ?? false,
      m,
      imgGenFields,
      currentMsgBoundAssets
    );

    if (
      (m === "o3" ||
        m === "gpt-4.1" ||
        m === "gpt-4.1-mini" ||
        m === "gpt-4.1-nano" ||
        m === "gpt-5" ||
        m === "gpt-5-mini" ||
        m === "gpt-5-nano" ||
        m === "gpt-5-chat-latest" ||
        m === "gpt-5-pro" ||
        m === "gpt-4o" ||
        m === "gpt-4o-mini") &&
      this.imageGenToolCompat(m) &&
      typeof resImg !== "undefined"
    ) {
      const r = resImg as GptImageAndFacilitatorsImgGenWorkupRT;
      partialImgsRequested = typeof r.partialImagesRequested !== "undefined";
      outputFormat = r.output_format;
      const tools = this.handleTooling(
        m,
        hasFiles,
        loc,
        vectorStoreId ? [vectorStoreId] : undefined,
        true,
        {
          type: "image_generation",
          background: r.output_background,
          input_fidelity: r.input_fidelity,
          model: "gpt-image-1",
          moderation: r.moderation,
          output_compression: r.output_compression,
          output_format: r.output_format,
          partial_images: r.partialImagesRequested,
          quality: r.output_quality,
          size: r.output_size
        }
      );

      str = await client.responses.create({
        stream: true,
        input: formatted,
        instructions: this.buildInstructions(systemPrompt),
        store: false,
        model: m,
        text: this.openAiVerbosity(m, "medium", imgGenEnabled),
        temperature,
        max_output_tokens: max_tokens,
        top_p: topP,
        safety_identifier: userId,
        include: ["message.input_image.image_url"],
        truncation: "auto",
        tool_choice: "required",
        tools
      });
    } else {
      const tools = this.handleTooling(
        m,
        hasFiles,
        loc,
        vectorStoreId ? [vectorStoreId] : undefined,
        imgGenEnabled,
        undefined
      );
      str = await client.responses.create({
        stream: true,
        input: formatted,
        instructions: this.buildInstructions(systemPrompt),
        store: false,
        model: m,
        text: this.openAiVerbosity(
          model as OpenAiModelIdUnion,
          "medium",
          imgGenEnabled
        ),
        temperature,
        include: [
          "web_search_call.action.sources",
          "web_search_call.results",
          "message.input_image.image_url",
          "file_search_call.results"
        ],
        max_output_tokens: max_tokens,
        top_p: topP,
        safety_identifier: userId,
        truncation: "auto",
        reasoning,
        parallel_tool_calls: true,
        tools
      });
    }
    for await (const s of str) {
      let text: string | undefined = undefined,
        thinkingText: string | undefined = undefined,
        partialIndex: number | undefined,
        done = false;
      let rtHelper;

      if (s.type === "response.created" && tInitial === 0) {
        text = "Image generation in progress...";
        tInitial = performance.now();
      }
      if (
        s.type === "response.reasoning_text.delta" ||
        s.type === "response.reasoning_summary_text.delta"
      ) {
        if (!openaiIsCurrentlyThinking && openaiThinkingStartTime === null) {
          openaiIsCurrentlyThinking = true;
          openaiThinkingStartTime = performance.now();
        }

        thinkingText = s.delta;
      }
      if (
        partialImgsRequested &&
        s.type === "response.image_generation_call.partial_image"
      ) {
        if (!partialIndex || partialIndex !== s.partial_image_index) {
          partialIndex = s.partial_image_index;
          const { width, height, format } =
            this.extractor.img.getImageSpecsWorkup(
              Buffer.from(s.partial_image_b64, "base64")
            );
          partialImgAgg = [
            s.partial_image_index,
            s.partial_image_b64,
            s.item_id,
            width,
            height,
            format as ExpandedImgSpecs["format"]
          ];
        }
      }

      if (s.type === "response.output_text.delta") {
        if (
          openaiIsCurrentlyThinking === true &&
          openaiThinkingStartTime !== null
        ) {
          const endTime = performance.now();
          openaiThinkingDuration = Math.round(
            endTime - openaiThinkingStartTime
          );
          // Mark thinking as finished once output text begins
          openaiIsCurrentlyThinking = false;
        }
        text = s.delta;
      }
      if (s.type === "response.output_text.done" && imgGenEnabled === false) {
        done = true;
      }
      if (s.type === "response.completed") {
        openaiResId = s.response.id;

        for (const r of s.response.output) {
          if (r.type === "image_generation_call" && r.result) {
            if (r.result !== null) {
              finalImgObj = r;
              const rrr = r as {
                /**
                 * The unique ID of the image generation call.
                 */
                id: string;

                /**
                 * The generated image encoded in base64.
                 */
                result: string | null;

                /**
                 * The status of the image generation call.
                 */
                status: "in_progress" | "completed" | "generating" | "failed";

                background: "opaque" | "transparent" | "auto";

                output_format: "png" | "jpeg" | "webp";
                quality: "high" | "medium" | "low" | "auto";

                revised_prompt: string | null;

                /**
                 * The type of the image generation call. Always `image_generation_call`.
                 */
                type: "image_generation_call";
              };
              done = true;
              console.log(
                `yes this item contains more fields than is reported! ` +
                  rrr.revised_prompt || rrr.id
              );
            }
          }
        }
        if (s.response.usage?.total_tokens) {
          usage = s.response.usage.total_tokens;
        }
      }
      if (imgGenEnabled) {
        if (partialImgAgg) {
          const itemId = partialImgAgg[2];
          const partialIndex = partialImgAgg[0];
          const ext = partialImgAgg[5] as ExpandedImgSpecs["format"] | "jpg";
          const mimeType =
            ext === "png"
              ? "image/png"
              : ext === "webp"
                ? "image/webp"
                : ext === "jpeg"
                  ? "image/jpeg"
                  : ext === "jpg"
                    ? "image/jpeg"
                    : "application/octet-stream";
          const filename = itemId
            .concat("-")
            .concat(partialIndex.toString(10))
            .concat(`.${ext}`);
          const b64 = partialImgAgg[1];

          const getIt = (await this.extractor.extractRemote(
            Buffer.from(b64, "base64"),
            4096 * 48
          )) as ExpandedImgSpecs;

          uploadtInitial = performance.now();
          rtHelper = await this.s3.uploadGenerated(
            Buffer.from(b64, "base64"),
            this.isProd,
            {
              contentType: mimeType ?? this.getGenMime(outputFormat),
              filename,
              origin: "GENERATED",
              userId,
              size: getIt.byteSize,
              conversationId
            }
          );
          uploadtDelta = performance.now() - uploadtInitial;

          partialImgArr.push([
            partialIndex,
            rtHelper.cdnUrl ?? "",
            itemId,
            getIt.width,
            getIt.height,
            getIt.contentType ??
              rtHelper.contentType ??
              mimeType ??
              this.getGenMime(outputFormat),
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
            uploadtDelta,
            requestMessageId,
            jobId,
            undefined,
            rtHelper,
            getIt
          ]);
          console.log(partialImgArr);
          uploadtInitial = 0;
          uploadtDelta = 0;
          partialImgAgg = undefined;
        }
        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            done: false,
            userId,
            model,
            provider,
            imgGenEnabled,
            imgGenFields: {
              partialImagesActual: partialImgArr.length,
              partialImages:
                partialImgArr.length > 0
                  ? this.mapPersistenceImgGenArr(userId, partialImgArr)
                  : undefined,
              activeImage:
                partialImgArr.length > 0
                  ? this.mapPersistenceImgGenArr(userId, partialImgArr).find(
                      t => t.index === partialImgArr.length - 1
                    )
                  : undefined
            },
            systemPrompt,
            temperature,
            title,
            topP,
            thinkingDuration: openaiThinkingStartTime
              ? performance.now() - openaiThinkingStartTime
              : undefined,
            isThinking: true
          } satisfies EventTypeMap["ai_chat_chunk"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          thinkingDuration: openaiThinkingStartTime
            ? performance.now() - openaiThinkingStartTime
            : undefined,
          title,
          systemPrompt,
          imgGenFields: {
            partialImagesActual: partialImgArr.length,
            partialImages:
              partialImgArr.length > 0
                ? this.mapPersistenceImgGenArr(userId, partialImgArr)
                : undefined,
            activeImage:
              partialImgArr.length > 0
                ? this.mapPersistenceImgGenArr(userId, partialImgArr).find(
                    t => t.index === partialImgArr.length - 1
                  )
                : undefined
          },
          temperature,
          topP,
          provider,
          thinkingText: thinkingText,
          isThinking: true,
          done: false
        });
      }
      if (thinkingText) {
        openaiThinkingAgg += thinkingText;
        thinkingChunks.push(thinkingText);

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            done: false,
            userId,
            model,
            provider,
            imgGenEnabled,
            imgGenFields: {
              partialImagesActual: partialImgArr.length,
              partialImages:
                partialImgArr.length > 0
                  ? this.mapPersistenceImgGenArr(userId, partialImgArr)
                  : undefined,
              activeImage:
                partialImgArr.length > 0
                  ? this.mapPersistenceImgGenArr(userId, partialImgArr).find(
                      t => t.index === partialImgArr.length - 1
                    )
                  : undefined
            },
            systemPrompt,
            temperature,
            title,
            topP,
            thinkingText: thinkingText,
            thinkingDuration: openaiThinkingStartTime
              ? performance.now() - openaiThinkingStartTime
              : undefined,
            isThinking: true
          } satisfies EventTypeMap["ai_chat_chunk"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          thinkingDuration: openaiThinkingStartTime
            ? performance.now() - openaiThinkingStartTime
            : undefined,
          title,
          systemPrompt,
          imgGenFields: {
            partialImagesActual: partialImgArr.length,
            partialImages:
              partialImgArr.length > 0
                ? this.mapPersistenceImgGenArr(userId, partialImgArr)
                : undefined,
            activeImage:
              partialImgArr.length > 0
                ? this.mapPersistenceImgGenArr(userId, partialImgArr).find(
                    t => t.index === partialImgArr.length - 1
                  )
                : undefined
          },
          temperature,
          topP,
          provider,
          thinkingText: thinkingText,
          isThinking: true,
          done: false
        });
      }

      if (text) {
        openaiAgg += text;
        chunks.push(text);
        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            provider,
            title,
            imgGenEnabled,
            model,
            systemPrompt,
            imgGenFields: {
              partialImagesActual: partialImgArr.length,
              partialImages:
                partialImgArr.length > 0
                  ? this.mapPersistenceImgGenArr(userId, partialImgArr)
                  : undefined,
              activeImage:
                partialImgArr.length > 0
                  ? this.mapPersistenceImgGenArr(userId, partialImgArr).find(
                      t => t.index === partialImgArr.length - 1
                    )
                  : undefined
            },
            temperature,
            topP,
            chunk: text,
            isThinking: false,
            thinkingDuration:
              openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,
            done: false
          } satisfies EventTypeMap["ai_chat_chunk"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          title,
          imgGenEnabled,
          systemPrompt,
          temperature,
          topP,
          imgGenFields: {
            partialImagesActual: partialImgArr.length,
            partialImages:
              partialImgArr.length > 0
                ? this.mapPersistenceImgGenArr(userId, partialImgArr)
                : undefined,
            activeImage:
              partialImgArr.length > 0
                ? this.mapPersistenceImgGenArr(userId, partialImgArr).find(
                    t => t.index === partialImgArr.length - 1
                  )
                : undefined
          },
          provider,
          thinkingText:
            openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
          thinkingDuration:
            openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,

          chunk: text,
          done: false
        });
        if (chunks.length % 10 === 0) {
          void this.redis.saveStreamState(
            conversationId,
            chunks,
            {
              model,
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
        if (openaiResId && finalImgObj?.result) {
          console.log(openaiResId);

          const duration = performance.now() - tInitial;

          const b64 = Buffer.from(finalImgObj.result, "base64");
          const getIt = (await this.extractor.extractRemote(
            b64,
            4096 * 48
          )) as ExpandedImgSpecs;
          const format = getIt.format;

          const filename = finalImgObj.id
            .concat("-")
            .concat(partialImgArr.length.toString(10))
            .concat(`.${format}`);

          uploadtInitial = performance.now();

          const rt = await this.s3.uploadGenerated(b64, this.isProd, {
            contentType: this.getGenMime(outputFormat),
            filename: filename,
            userId,
            size: getIt.byteSize,
            conversationId,
            origin: "GENERATED"
          });

          uploadtDelta = performance.now() - uploadtInitial;

          const generationGroupId = openaiResId;

          const imgMeta = this.handleAssetMetadata(getIt).img;

          const imgFinal = {
            cdnUrl: rt.cdnUrl,
            index: partialImgArr.length,
            itemId: finalImgObj.id,
            width: getIt.width,
            height: getIt.height,
            mime:
              getIt.contentType ??
              rt.contentType ??
              this.getGenMime(outputFormat),
            bucket: rt.bucket,
            key: rt.key,
            versionId: rt.versionId,
            s3ObjectId: rt.s3ObjectId,
            filename,
            ext: getIt.format,
            etag: rt.etag ?? null,
            size: getIt.byteSize ?? rt.size ?? null,
            s3LastModified: rt?.lastModified ? new Date(rt.lastModified) : null,
            contentDisposition: rt.contentDisposition ?? null,
            cacheControl: rt.cacheControl ?? null,
            checksumAlgo: rt.checksum?.algo ?? "CRC32",
            checksumSha256: rt.checksum?.value ?? null,
            storageClass: rt.storageClass ?? null,
            generationGroupId,
            image: {
              ...imgMeta,
              width: getIt.width,
              height: getIt.height,
              animated: getIt.animated,
              colorModel:
                getIt.colorModel === "grayscale-alpha"
                  ? "grayscale_alpha"
                  : getIt.colorModel,
              aspectRatio: getIt.width / getIt.height,
              cameraMake: null,
              cameraModel: null,
              colorSpace: getIt.colorSpace,
              dominantColorHex: null,
              exifDateTimeOriginal: getIt.exifDateTimeOriginal
                ? new Date(getIt.exifDateTimeOriginal)
                : null,
              frames: getIt.frames,
              gpsLat: null,
              gpsLon: null,
              hasAlpha: getIt.hasAlpha,
              iccProfile: getIt.iccProfile,
              lensModel: null,
              orientation: getIt.orientation,
              format: imgMeta?.format ?? "jpeg"
            },
            document: null,
            uploadDuration: uploadtDelta,
            requestMessageId,
            jobId: jobId ?? "",
            jobIndex: 0,
            seriesId: finalImgObj.id,
            seriesIndex: partialImgArr.length,
            kind: "FINAL",
            revisedPrompt:
              "revised_prompt" in finalImgObj &&
              typeof finalImgObj.revised_prompt === "string"
                ? finalImgObj.revised_prompt
                : undefined,
            region: "us-east-1",
            batchId: null,
            compatCdnUrl: rt.cdnUrl,
            compatExt: rt.extension ?? getIt.format,
            compatKey: rt.key,
            compatMime: rt.contentType ?? this.getGenMime(getIt.format),
            compatReadyAt: null,
            compatStatus: "ALIASED",
            compatS3ObjectId: rt.s3ObjectId,
            compatVersionId: rt.versionId,
            contentEncoding: null,
            createdAt: new Date(Date.now()),
            updatedAt: new Date(Date.now()),
            deletedAt: null,
            origin: "GENERATED",
            publicUrl: rt.publicUrl,
            sourceUrl: "buffer",
            sseAlgorithm: null,
            sseKmsKeyId: null,
            status: "READY",
            thumbnailKey: null,
            userId,
            draftId: null,
            expiresAt: rt.expires,
            imageGenOutput: {
              ext: getIt.format,
              height: getIt.height,
              width: getIt.width,
              isPartial: false,
              jobId: jobId ?? "",
              jobIndex: 0,
              kind: "FINAL",
              mime: rt.contentType ?? this.getGenMime(getIt.format),
              revisedPrompt:
                "revised_prompt" in finalImgObj &&
                typeof finalImgObj.revised_prompt === "string"
                  ? finalImgObj.revised_prompt
                  : null,
              seriesId: finalImgObj.id,
              seriesIndex: partialImgArr.length
            }
          } as const satisfies AIChatResponseImgGenSubFields;

          const remapPartials = this.mapPersistenceImgGenArr(
            userId,
            partialImgArr
          ).map(v => {
            const {
              generationGroupId: _placeholder,
              revisedPrompt: _r,
              ...rest
            } = v;
            return {
              ...rest,
              revisedPrompt:
                finalImgObj &&
                "revised_prompt" in finalImgObj &&
                typeof finalImgObj.revised_prompt === "string"
                  ? finalImgObj.revised_prompt
                  : undefined,
              generationGroupId
            };
          });

          const height = getIt?.height ?? 0,
            width = getIt?.width ?? 0;

          await this.prisma.handleAiChatResponse({
            chunk: openaiAgg,
            conversationId,
            done: true,
            title,
            temperature,
            topP,
            provider,
            userId,
            systemPrompt,
            usage,
            jobId,
            requestMessageId,
            model,
            imgGenEnabled: true,
            imgGenFields: {
              duration,
              revisedPrompt:
                "revised_prompt" in finalImgObj &&
                typeof finalImgObj.revised_prompt === "string"
                  ? finalImgObj.revised_prompt
                  : undefined,
              outputQuality:
                "quality" in finalImgObj &&
                typeof finalImgObj.quality === "string"
                  ? finalImgObj.quality
                  : undefined,
              actualCount: partialImgArr.length,
              outputAspectRatio: width / height,
              outputFormat:
                "output_format" in finalImgObj &&
                typeof finalImgObj.output_format === "string"
                  ? finalImgObj.output_format
                  : outputFormat,
              outputBackground:
                "background" in finalImgObj &&
                typeof finalImgObj.background === "string"
                  ? finalImgObj.background
                  : undefined,
              outputCompression: imgGenFields?.output_compression ?? undefined,
              seed: imgGenFields?.seed ?? undefined,
              partialImagesRequested:
                imgGenFields?.output_partial_images ?? undefined,
              requestedCount: imgGenFields?.n ?? 1,
              outputSize: getIt.byteSize?.toString(10) ?? "0",
              outputMime: getIt.contentType ?? this.getGenMime(outputFormat),
              outputWidth: width,
              outputHeight: height,
              size: getIt.byteSize ?? 0,
              partialImagesActual: partialImgArr.length,
              activeImage: imgFinal,
              partialImages: remapPartials,
              images: [{ ...imgFinal }]
            },
            thinkingText:
              openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
            thinkingDuration:
              openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined
          });
          ws.send(
            JSON.stringify({
              type: "ai_chat_response",
              conversationId,
              userId,
              provider,
              model,
              title,
              imgGenEnabled: true,
              usage,
              systemPrompt,
              temperature,
              imgGenFields: {
                duration,
                actualCount: partialImgArr.length,
                outputAspectRatio: width / height,
                outputSize: getIt.byteSize?.toString(10) ?? "0",
                outputMime: this.getGenMime(outputFormat),
                revisedPrompt:
                  "revised_prompt" in finalImgObj &&
                  typeof finalImgObj.revised_prompt === "string"
                    ? finalImgObj.revised_prompt
                    : undefined,
                outputFormat:
                  "output_format" in finalImgObj &&
                  typeof finalImgObj.output_format === "string"
                    ? finalImgObj.output_format
                    : outputFormat,
                requestedCount: imgGenFields?.n,

                partialImagesRequested: partialImgArr.length,
                outputBackground:
                  "background" in finalImgObj &&
                  typeof finalImgObj.background === "string"
                    ? finalImgObj.background
                    : undefined,
                outputCompression: imgGenFields?.output_compression,
                seed: imgGenFields?.seed,
                outputWidth: width,
                outputQuality:
                  "quality" in finalImgObj &&
                  typeof finalImgObj.quality === "string"
                    ? finalImgObj.quality
                    : undefined,
                outputHeight: height,
                size: getIt.byteSize ?? 0,
                partialImagesActual: partialImgArr.length,
                partialImages: remapPartials,
                activeImage: imgFinal,
                images: [imgFinal]
              },
              topP,
              chunk: openaiAgg,
              thinkingText:
                openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
              thinkingDuration:
                openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,
              done: true
            } satisfies EventTypeMap["ai_chat_response"])
          );
          void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
            type: "ai_chat_response",
            conversationId,
            userId,
            systemPrompt,
            temperature,
            usage,
            imgGenEnabled,
            imgGenFields: {
              actualCount: partialImgArr.length,
              outputAspectRatio: width / height,
              outputFormat: outputFormat,
              outputSize: getIt.byteSize?.toString(10) ?? "0",
              outputMime: this.getGenMime(outputFormat),
              outputWidth: width,
              outputHeight: height,
              size: getIt.byteSize ?? 0,
              partialImagesActual: partialImgArr.length,
              partialImages: remapPartials,
              activeImage: imgFinal,
              images: [imgFinal]
            },
            title,
            thinkingText:
              openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
            thinkingDuration:
              openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,
            topP,
            provider,
            model,
            chunk: openaiAgg,
            done: true
          });
          void this.redis.del(`stream:state:${conversationId}`);
          break;
        } else {
          await this.prisma.handleAiChatResponse({
            chunk: openaiAgg,
            conversationId,
            done: true,
            title,
            temperature,
            topP,
            provider,
            userId,
            systemPrompt,
            model,
            imgGenEnabled: false,
            thinkingText:
              openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
            thinkingDuration:
              openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined
          });
          ws.send(
            JSON.stringify({
              type: "ai_chat_response",
              conversationId,
              userId,
              provider,
              model,
              title,
              imgGenEnabled: false,
              imgGenFields: {},
              systemPrompt,
              temperature,
              topP,
              chunk: openaiAgg,
              thinkingText:
                openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
              thinkingDuration:
                openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,
              done: true
            } satisfies EventTypeMap["ai_chat_response"])
          );
          void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
            type: "ai_chat_response",
            conversationId,
            userId,
            systemPrompt,
            temperature,
            title,
            thinkingText:
              openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
            thinkingDuration:
              openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,
            topP,
            provider,
            model,
            chunk: openaiAgg,
            done: true
          });
          void this.redis.del(`stream:state:${conversationId}`);
          break;
        }
      }
    }
  }

  public async routeOpenAI({ model, ...rest }: ProviderOpenaiRequestEntity) {
    const m = model as OpenAiModelIdUnion;

    switch (m) {
      case "dall-e-2":
      case "dall-e-3":
      case "gpt-image-1":
      case "gpt-image-1-mini": {
        return this.handleOpenaiAiNativeImageRequestGptImage1({
          model: m,
          ...rest
        });
      }
      case "o3-deep-research":
      case "o4-mini-deep-research":
      case "chatgpt-4o-latest":
      case "o3":
      case "o3-mini":
      case "o3-pro":
      case "o4-mini":
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4-turbo":
      case "gpt-4.1":
      case "gpt-5-pro":
      case "o1":
      case "o1-pro":
      case "sora-2-pro":
      case "sora-2":
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-chat-latest":
      case "gpt-5-codex":
      case "gpt-5-nano":
      case "gpt-4.1-mini":
      case "gpt-4.1-nano":
      case "gpt-4o":
      case "gpt-4o-mini":
      default: {
        return this.handleOpenaiAiChatRequest({ model: m, ...rest });
      }
    }
  }
}
// public async handleOpenaiAiNativeImageRequestDalle2({
//   conversationId,
//   isNewChat,
//   msgs,
//   streamChannel,
//   userId,
//   ws,
//   apiKey,
//   max_tokens,
//   jobId,
//   requestMessageId,
//   keyId,
//   model = "gpt-5-mini" satisfies OpenAiModelIdUnion,
//   systemPrompt,
//   temperature,
//   title,
//   topP,
//   currentMsgBoundAssets,
//   imgGenEnabled,
//   imgGenFields,
//   user_location
// }: ProviderOpenaiRequestEntity) {
//   // use most recent message id for image gen requests to update Im

//   const m = model as OpenAiModelIdUnion;

//   const provider = "openai" as const;

//   let finalImgObj:
//       | OpenAI.Responses.ResponseOutputItem.ImageGenerationCall
//       | undefined,
//     tInitial = 0,
//     openaiResId: string | null = null,
//     uploadtInitial = 0,
//     uploadtDelta = 0,
//     usage = 0;

//   const client = this.getClient(apiKey ?? undefined);

//   const formatted = await this.formatOpenAiWithUploads(
//     isNewChat,
//     msgs,
//     client,
//     userId,
//     keyId ?? undefined
//   );

//   const loc = this.normalizeLocation(user_location);

//   const _hasImages = this.hasImages(formatted);

//   const hasFiles = this.hasFiles(formatted);

//   const fileIds = this.fileIds(formatted);

//   let vectorStoreId: string | undefined;
//   if (fileIds.length > 0) {
//     vectorStoreId = await this.ensureUserVectorStoreId(client, null, userId);
//     await client.vectorStores.fileBatches.createAndPoll(vectorStoreId, {
//       file_ids: fileIds
//     });
//   }

//   const resImg = this.responsesImgGen(
//     imgGenEnabled ?? false,
//     m,
//     imgGenFields,
//     currentMsgBoundAssets
//   );

//   if (typeof resImg === "undefined")
//     throw new Error(
//       "image options must be defined for the image endpoint api!"
//     );

//   if (
//     m === "dall-e-2" &&
//     this.isPureImgGenModel("openai", m) &&
//     resImg.model === "dall-e-2"
//   ) {
//     const r = resImg satisfies Dalle2ImgGenWorkupRT;

//     const o = await client.images.generate({
//       prompt: msgs?.[0]?.content ?? "",
//       user: userId,
//       model: m,
//       n: r.n,
//       stream: false,
//       response_format: "b64_json",
//       quality: r.output_quality,
//       size: r.output_size
//     });

//     o.created;
//     if (o.data) {

//       let i = 0;
//       i < r.n;
//       for (const stream of o.data) {

//         o?._request_id;

//         let partialIndex: number | undefined,
//           done = false;
//         let rtHelper;

//       }
//     }
//   }
// }
