import type {
  ImageGenPartialArr,
  OpenAIImgApiStreamFinal,
  OpenAIImgApiStreamPartial
} from "@/openai/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  ProviderOpenaiRequestEntity,
  S3FinalizePayload
} from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type { OpenAI } from "openai";
import { Stream } from "openai/core/streaming.mjs";
import { LoggerService } from "@/logger/index.ts";
import { OpenAIServiceWorkup } from "@/openai/workup.ts";
import { PrismaService } from "@/prisma/index.ts";
import type {
  AIChatResponseImgGenSubFields,
  EventTypeMap,
  GptImageAndFacilitatorsImgGenWorkupRT,
  OpenAIImgGenModels,
  OpenAiModelIdUnion
} from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class OpenAIGPTImageService extends OpenAIServiceWorkup {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    protected redis: EnhancedRedisPubSub,
    apiKey: string
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3);
  }

  protected async handleOpenaiNativeImageRequestGptImage1({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    userId,
    thinkingChunks,
    userMsgId,
    ws,
    apiKey,
    jobId,
    requestMessageId,
    systemPrompt,
    temperature,
    topP,
    model = "gpt-image-1.5" satisfies OpenAiModelIdUnion,
    title,
    currentMsgBoundAssets,
    imgGenEnabled,
    imgGenFields
  }: ProviderOpenaiRequestEntity) {
    const m = model as OpenAIImgGenModels;

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
      { onlyMostRecentUser: true }
    );
    const imgOnly = Array.of<{
      type: "input_image";
      image_url?: string | undefined;
      file_id?: string | undefined;
      detail: "auto" | "low" | "high";
    }>();

    const promptOnly = {
      text: ""
    };
    for (const f of formatted) {
      if (f.role === "user") {
        for (const c of f.content) {
          if (typeof c !== "string") {
            if (c.type === "input_image") {
              imgOnly.push(c);
            }
            if (c.type === "input_text") {
              promptOnly.text = c.text;
            }
          }
        }
      }
    }

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
      this.prisma.isImgGenModel("openai", m) &&
      (resImg.model === "gpt-image-1" || resImg.model === "gpt-image-1-mini") &&
      resImg.n === 1
    ) {
      const r = resImg satisfies GptImageAndFacilitatorsImgGenWorkupRT;
      partialImgsRequested = typeof r.partialImagesRequested !== "undefined";
      outputFormat = r.output_format;
      uploadtInitial = performance.now();

      const _safeN = this.prisma.handleImgGenCount("openai", m, { n: r.n });
      const partial_images = this.prisma.handlePartialImgGen("openai", m, {
        partialImagesRequested: r.partialImagesRequested
      });
      const o = (await client.images.generate(
        {
          prompt: promptOnly.text,
          background: r.output_background,
          output_compression: r.output_compression,
          user: userId,
          output_format: r.output_format,
          model: m,
          moderation: r.moderation,
          // n=1 for streaming, no higher; n = 10 max for non-streaming, coming soon
          n: 1,
          partial_images,
          quality: r.output_quality ?? "high",
          size: r.output_size ?? "auto",
          stream: true
        },
        { stream: true }
      )) satisfies Stream<OpenAI.Images.ImageGenStreamEvent> & {
        _request_id?: string | null;
      };

      for await (const stream of o) {
        let text: string | undefined = undefined,
          started = false,
          done = false,
          rtHelper: S3FinalizePayload | undefined;

        if (started === false) {
          started = true;
          text = "Image generation in progress...";
        }

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
          const imgSpecs = (await this.prisma.extractor.extractRemote(
            b64,
            4096 * 32
          )) as ExpandedImgSpecs;
          const format = streamPartial.output_format;
          const filename = itemId
            .concat("-")
            .concat(streamPartial.partial_image_index.toString(10))
            .concat(`.${format}`);

          tInitial = performance.now();
          rtHelper = await this.s3.uploadGenerated(b64, this.prisma.isProd, {
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
              colorModel:
                imgSpecs.colorModel === "grayscale-alpha"
                  ? "grayscale_alpha"
                  : imgSpecs.colorModel,
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
              userMsgId,
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
            userMsgId,
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
              userMsgId,
              imgGenEnabled: true,
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
            userMsgId,
            isThinking: false,
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
          text = undefined;
        }
        if (done === true && finalImgObj) {
          const b64 = Buffer.from(finalImgObj.b64_json, "base64");

          const filename = itemId
            .concat("-")
            .concat(partialImgArr.length.toString(10))
            .concat(`.${finalImgObj.output_format}`);

          const getIt = (await this.prisma.extractor.extractRemote(
            b64,
            4096 * 32
          )) as ExpandedImgSpecs;

          tInitial = performance.now();
          const rt = await this.s3.uploadGenerated(b64, this.prisma.isProd, {
            contentType: this.getGenMime(finalImgObj.output_format),
            filename,
            origin: "GENERATED",
            userId,
            conversationId,
            size: getIt?.byteSize
          });

          tDelta = performance.now() - tInitial;

          const duration = performance.now() - uploadtInitial;

          const imgMeta = this.prisma.handleAssetMetadata(getIt).img;

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

          const d = await this.prisma.handleAiChatResponse({
            chunk: openaiAgg,
            conversationId,
            done: true,
            title,
            temperature,
            topP,
            provider,
            uploadDuration: duration,
            userId,
            systemPrompt,
            userMsgId,
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
              images: [{ ...imgFinal }],
              activeImage: imgFinal
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
              userMsgId,
              aiMsgId: d.aiMsgId,
              title,
              imgGenAttachmentId: d.imgGenAttachmentId,
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
            userMsgId,
            aiMsgId: d.aiMsgId,
            imgGenAttachmentId: d.imgGenAttachmentId,
            systemPrompt,
            temperature,
            usage,
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
