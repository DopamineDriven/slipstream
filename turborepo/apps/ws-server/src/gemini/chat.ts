import type { ProviderGeminiChatRequestEntity } from "@/gemini/types.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type {
  Blob,
  FinishReason,
  GenerateContentResponse
} from "@google/genai";
import { GeminiWorkupService } from "@/gemini/workup.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import type {
  AIChatResponseImgGenSubFields,
  EventTypeMap,
  GeminiModelIdUnion
} from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class GeminiChatService extends GeminiWorkupService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    protected redis: EnhancedRedisPubSub,
    protected s3: S3Storage,
    apiKey: string
  ) {
    super(logger, prisma, apiKey);
  }
  public async handleGeminiAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    userMsgId,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    keyId,
    apiKey,
    max_tokens,
    model: m = "gemini-2.5-pro" satisfies GeminiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    imgGenFields,
    imgGenEnabled,
    jobId,
    requestMessageId,
    topP,
    userData
  }: ProviderGeminiChatRequestEntity) {
    const provider = "gemini" as const;
    const model = m as GeminiModelIdUnion;
    const params = await this.contentGen({
      isNewChat,
      keyId,
      model,
      msgs,
      apiKey,
      imgGenFields,
      latlng: userData?.latlng,
      max_tokens,
      systemPrompt,
      temperature,
      topP
    });

    let geminiThinkingStartTime: number | null = null,
      geminiThinkingDuration = 0,
      geminiIsCurrentlyThinking = false,
      geminiThinkingAgg = "",
      usage = 0,
      resId: string | undefined = undefined,
      uploadtInitial = 0,
      tInitial = 0,
      uploadtDelta = 0,
      geminiAgg = "",
      geminiDataPart: Blob | undefined = undefined;

    const geminiDataArr = Array.of<Blob>();

    const gemini = this.getClient(apiKey);

    // const imagen = await gemini.models.generateImages({model: "imagen-4.0-generate-001" satisfies GeminiModelIdUnion,prompt: "",config: {includeRaiReason: true,}})

    const stream = (await gemini.models.generateContentStream(
      params
    )) satisfies AsyncGenerator<GenerateContentResponse>;

    for await (const chunk of stream) {
      let dataPart: Blob | undefined = undefined,
        textPart: string | undefined = undefined,
        thinkingPart: string | undefined = undefined,
        done: keyof typeof FinishReason | undefined = undefined;
      if (tInitial === 0) {
        tInitial = performance.now();
      }
      if (chunk.responseId && typeof resId === "undefined") {
        resId = chunk.responseId;
      }
      if (chunk.candidates) {
        for (const candidate of chunk.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                if (part.thought) {
                  if (
                    geminiIsCurrentlyThinking === false &&
                    typeof geminiThinkingStartTime !== "number"
                  ) {
                    geminiIsCurrentlyThinking = part.thought;
                    geminiThinkingStartTime = performance.now();
                  }
                  thinkingPart = part.text;
                } else {
                  if (
                    geminiThinkingDuration === 0 &&
                    typeof geminiThinkingStartTime === "number"
                  ) {
                    geminiThinkingDuration = Math.round(
                      performance.now() - geminiThinkingStartTime
                    );
                    geminiIsCurrentlyThinking = part.thought ?? false;
                  }
                  textPart = part.text;
                }
              }
              if (part.fileData) {
                this.logger.debug(part.fileData, "part.fileData");
              }
              if (part.inlineData) {
                part.inlineData;
                this.logger.debug(
                  part.inlineData.displayName,
                  "part.inlineData"
                );
                dataPart = part.inlineData;
              }
            }
          }

          if (candidate.finishReason) {
            if (candidate.tokenCount) {
              usage = candidate.tokenCount;
            }
            console.log(
              "gemini candidate index " + candidate.index?.toString()
            );
            candidate.tokenCount;
            done = candidate.finishReason;
          }
        }
      }
      if (thinkingPart) {
        thinkingChunks.push(thinkingPart);
        geminiThinkingAgg += thinkingPart;

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            userMsgId,
            model,
            title,
            systemPrompt,
            isThinking: true,
            temperature,
            topP,
            provider,
            thinkingDuration: geminiThinkingStartTime
              ? ((start: number) => performance.now() - start)(
                  geminiThinkingStartTime
                )
              : undefined,
            thinkingText: thinkingPart,
            done: false,
            imgGenEnabled
          } satisfies EventTypeMap["ai_chat_chunk"])
        );

        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          title,
          systemPrompt,
          userMsgId,
          temperature,
          topP,
          provider,
          isThinking: true,
          thinkingDuration: geminiThinkingStartTime
            ? ((start: number) => performance.now() - start)(
                geminiThinkingStartTime
              )
            : undefined,
          thinkingText: thinkingPart,
          done: false,
          imgGenEnabled
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
      if (textPart) {
        chunks.push(textPart);
        geminiAgg += textPart;

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model,
            title,
            userMsgId,
            systemPrompt,
            isThinking: geminiIsCurrentlyThinking,
            temperature,
            topP,
            provider,
            thinkingText: geminiThinkingAgg,
            chunk: textPart,
            thinkingDuration:
              geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
            done: false,
            imgGenEnabled
          } satisfies EventTypeMap["ai_chat_chunk"])
        );

        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          title,
          isThinking: geminiIsCurrentlyThinking,
          systemPrompt,
          userMsgId,
          temperature,
          topP,
          thinkingText: geminiThinkingAgg,
          provider,
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
          chunk: textPart,
          done: false,
          imgGenEnabled
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
      let iData = 0;
      if (dataPart) {
        iData++;
        geminiDataArr.push(dataPart);
        geminiDataPart = dataPart;
        const _dataUrl =
          `data:${dataPart.mimeType};base64,${dataPart.data?.length}` as const;
        ws.send(
          JSON.stringify({
            type: "ai_chat_inline_data",
            conversationId,
            userMsgId,
            data: _dataUrl,
            userId,
            done: false,
            model,
            chunk: geminiAgg,
            systemPrompt,
            temperature,
            title,
            topP,
            provider,
            imgGenEnabled
          } satisfies EventTypeMap["ai_chat_inline_data"])
        );
      }
      if (done && resId) {
        const finalImg = geminiDataArr.at(-1);
        if (
          imgGenEnabled &&
          iData > 0 &&
          geminiDataArr.length > 0 &&
          finalImg?.data &&
          finalImg?.mimeType
        ) {
          const seriesId = resId;
          const duration = performance.now() - tInitial;

          const b64 = Buffer.from(finalImg.data, "base64");
          const getIt = (await this.prisma.extractor.extractRemote(
            b64,
            4096 * 48
          )) as ExpandedImgSpecs;
          const format = getIt.format;
          const filename = seriesId
            .concat("-")
            .concat((geminiDataArr?.length - 1).toString())
            .concat(`.${format}`);

          uploadtInitial = performance.now();

          const rt = await this.s3.uploadGenerated(b64, this.prisma.isProd, {
            contentType: finalImg.mimeType,
            filename: filename,
            userId,
            size: getIt.byteSize,
            conversationId,
            origin: "GENERATED"
          });

          uploadtDelta = performance.now() - uploadtInitial;

          const generationGroupId = resId;

          const imgMeta = this.prisma.handleAssetMetadata(getIt).img;
          const height = getIt?.height ?? 0,
            width = getIt?.width ?? 0;
          const imgFinal = {
            cdnUrl: rt.cdnUrl,
            index: geminiDataArr.length - 1,
            itemId: seriesId.concat(`-${geminiDataArr.length - 1}`),
            width: getIt.width,
            height: getIt.height,
            mime: finalImg.mimeType,
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
            seriesId: seriesId + `-${geminiDataArr.length - 1}`,
            seriesIndex: geminiDataArr.length - 1,
            kind: "FINAL",
            revisedPrompt: undefined,
            region: "us-east-1",
            batchId: null,
            compatCdnUrl: rt.cdnUrl,
            compatExt: rt.extension ?? getIt.format,
            compatKey: rt.key,
            compatMime: finalImg.mimeType,
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
              mime: finalImg.mimeType,
              revisedPrompt: null,
              seriesId: seriesId.concat(`-${geminiDataArr.length - 1}`),
              seriesIndex: geminiDataArr.length - 1
            }
          } as const satisfies AIChatResponseImgGenSubFields;

          const d = await this.prisma.handleAiChatResponse({
            chunk: geminiAgg,
            conversationId,
            done: true,
            mime: finalImg.mimeType,
            jobId,
            uploadDuration: duration,
            usage,
            requestMessageId,
            imgGenFields: {
              activeImage: imgFinal,
              actualCount: geminiDataArr.length,
              duration,
              images: [imgFinal],
              outputAspectRatio: width / height,
              outputBackground: undefined,
              outputCompression: undefined,
              outputFormat: "png",
              outputMime: finalImg.mimeType,
              outputHeight: height,
              outputQuality: undefined,
              outputSize: getIt.byteSize?.toString(),
              outputWidth: width,
              partialImages: undefined,
              partialImagesActual: 0,
              partialImagesRequested: undefined,
              requestedCount: imgGenFields?.n,
              revisedPrompt: undefined,
              seed: imgGenFields?.seed,
              size: getIt.byteSize
            },
            title,
            provider,
            userId,
            systemPrompt,
            temperature,
            userMsgId,
            data: geminiDataPart
              ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data?.length}`
              : undefined,
            topP,
            model,
            thinkingText: geminiThinkingAgg,
            thinkingDuration:
              geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
            imgGenEnabled: true
          });
          ws.send(
            JSON.stringify({
              type: "ai_chat_response",
              chunk: geminiAgg,
              conversationId,
              done: true,
              aiMsgId: d.aiMsgId,
              imgGenAttachmentId: d.imgGenAttachmentId,
              usage,
              imgGenFields: {
                activeImage: imgFinal,
                actualCount: geminiDataArr.length,
                duration,
                images: [imgFinal],
                outputAspectRatio: width / height,
                outputBackground: undefined,
                outputCompression: undefined,
                outputFormat: "png",
                outputMime: finalImg.mimeType,
                outputHeight: height,
                outputQuality: undefined,
                outputSize: getIt.byteSize?.toString(),
                outputWidth: width,
                partialImages: undefined,
                partialImagesActual: 0,
                partialImagesRequested: undefined,
                requestedCount: imgGenFields?.n,
                revisedPrompt: undefined,
                seed: imgGenFields?.seed,
                size: getIt.byteSize
              },
              title,
              provider,
              userId,
              systemPrompt,
              temperature,
              userMsgId,
              data: geminiDataPart
                ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data?.length}`
                : undefined,
              topP,
              model,
              thinkingText: geminiThinkingAgg,
              thinkingDuration:
                geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
              imgGenEnabled: true
            } satisfies EventTypeMap["ai_chat_response"])
          );
          void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
            type: "ai_chat_response",
            chunk: geminiAgg,
            conversationId,
            done: true,
            aiMsgId: d.aiMsgId,
            imgGenAttachmentId: d.imgGenAttachmentId,
            usage,
            imgGenFields: {
              activeImage: imgFinal,
              actualCount: geminiDataArr.length,
              duration,
              images: [imgFinal],
              outputAspectRatio: width / height,
              outputBackground: undefined,
              outputCompression: undefined,
              outputFormat: "png",
              outputMime: finalImg.mimeType,
              outputHeight: height,
              outputQuality: undefined,
              outputSize: getIt.byteSize?.toString(),
              outputWidth: width,
              partialImages: undefined,
              partialImagesActual: 0,
              partialImagesRequested: undefined,
              requestedCount: imgGenFields?.n,
              revisedPrompt: undefined,
              seed: imgGenFields?.seed,
              size: getIt.byteSize
            },
            title,
            provider,
            userId,
            systemPrompt,
            temperature,
            userMsgId,
            data: geminiDataPart
              ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
              : undefined,
            topP,
            model,
            thinkingText: geminiThinkingAgg,
            thinkingDuration:
              geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
            imgGenEnabled: true
          });
          void this.redis.del(`stream:state:${conversationId}`);
          break;
        } else {
          const d = await this.prisma.handleAiChatResponse({
            chunk: geminiAgg,
            conversationId,
            done: true,
            title,
            provider,
            userId,
            systemPrompt,
            temperature,
            userMsgId,
            data: geminiDataPart
              ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
              : undefined,
            topP,
            model,
            thinkingText: geminiThinkingAgg,
            thinkingDuration:
              geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
            imgGenEnabled
          });
          ws.send(
            JSON.stringify({
              type: "ai_chat_response",
              conversationId,
              userId,
              model,
              userMsgId,
              aiMsgId: d.aiMsgId,
              systemPrompt,
              data: geminiDataPart
                ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
                : undefined,
              temperature,
              title,
              topP,
              imgGenEnabled: false,
              provider,
              chunk: geminiAgg,
              thinkingText: geminiThinkingAgg,
              thinkingDuration:
                geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
              done: true
            } satisfies EventTypeMap["ai_chat_response"])
          );
          void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
            type: "ai_chat_response",
            conversationId,
            userId,
            systemPrompt,
            temperature,
            imgGenEnabled: false,
            userMsgId,
            aiMsgId: d.aiMsgId,
            data: geminiDataPart
              ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
              : undefined,
            thinkingDuration: geminiThinkingDuration,
            title,
            topP,
            thinkingText: geminiThinkingAgg,
            provider,
            model,
            chunk: geminiAgg,
            done: true
          });
          void this.redis.del(`stream:state:${conversationId}`);
          break;
        }
      }
    }
  }
}
