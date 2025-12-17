import type { ImageGenPartialArr, ImgGenResProps } from "@/openai/types.ts";
import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import { OpenAI } from "openai";
import { LoggerService } from "@/logger/index.ts";
import { OpenAIGPTImageService } from "@/openai/gpt-image.ts";
import { PrismaService } from "@/prisma/index.ts";
import type {
  AIChatResponseImgGenSubFields,
  EventTypeMap,
  GptImageAndFacilitatorsImgGenWorkupRT,
  OpenAiModelIdUnion
} from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class OpenAIResponsesImgGenService extends OpenAIGPTImageService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    s3: S3Storage,
    redis: EnhancedRedisPubSub,
    apiKey: string
  ) {
    super(logger, prisma, s3, redis, apiKey);
  }
  protected async handleOpenaiResponsesImgGen({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    userMsgId,
    apiKey,
    max_tokens,
    jobId,
    requestMessageId,
    model = "gpt-5" satisfies OpenAiModelIdUnion,
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
      uploadtInitial = 0,
      uploadtDelta = 0,
      usage = 0;

    const client = this.getClient(apiKey ?? undefined);

    const formatted = await this.formatOpenAiWithUploads(
      isNewChat,
      msgs,
      client,
      userId,
      { onlyMostRecentUser: true }
    );

    const loc = this.normalizeLocation(user_location);

    const hasImages = this.hasImages(formatted);

    const hasFiles = this.hasFiles(formatted);

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
        input_fidelity: hasImages ? (r.input_fidelity ?? "high") : undefined,
        model: "gpt-image-1",
        moderation: "low",
        output_compression: r.output_compression,
        output_format: r.output_format,
        partial_images: r.partialImagesRequested ?? 3,
        quality: "high",
        size: r.output_size
      } satisfies OpenAI.Responses.Tool.ImageGeneration
    );

    const streamRes = await client.responses.create(
      {
        stream: true,
        input: formatted,
        instructions: this.buildInstructions(systemPrompt),
        store: false,
        reasoning: this.openaiReasoning(m, "high", "auto", true),
        model: m,
        text: this.openAiVerbosity(m, "medium", imgGenEnabled),
        max_output_tokens: max_tokens,
        safety_identifier: userId,
        include: [
          "message.input_image.image_url",
          "web_search_call.action.sources",
          "web_search_call.results",
          "reasoning.encrypted_content"
        ],
        truncation: "auto",
        tool_choice: "required",
        tools
      },
      { stream: true }
    );
    for await (const s of streamRes) {
      let text: string | undefined = undefined,
        thinkingText: string | undefined = undefined,
        partialIndex: number | undefined,
        done = false;
      let rtHelper;

      if (s.type === "response.created" && tInitial === 0) {
        if (imgGenEnabled) text = "Image generation in progress...";
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
            this.prisma.extractor.img.getImageSpecsWorkup(
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
      if (s.type === "response.completed") {
        openaiResId = s.response.id;
        for (const r of s.response.output) {
          if (r.type === "image_generation_call" && r.result) {
            if (r.result !== null) {
              finalImgObj = r;
              const rrr = r as ImgGenResProps;
              done = true;
              console.log(
                `yes this item contains more fields than is reported in docs ` +
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

          const mimeType = this.handleImgExtension(ext);

          const filename = itemId
            .concat("-")
            .concat(partialIndex.toString(10))
            .concat(`.${ext}`);

          const b64 = partialImgAgg[1];

          const getIt = (await this.prisma.extractor.extractRemote(
            Buffer.from(b64, "base64"),
            4096 * 48
          )) as ExpandedImgSpecs;

          uploadtInitial = performance.now();

          rtHelper = await this.s3.uploadGenerated(
            Buffer.from(b64, "base64"),
            this.prisma.isProd,
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
            userMsgId,
            provider,
            imgGenEnabled: true,
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
          userMsgId,
          model,
          thinkingDuration: openaiThinkingStartTime
            ? performance.now() - openaiThinkingStartTime
            : undefined,
          title,
          imgGenEnabled: true,
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
            userMsgId,
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
          userMsgId,
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
            userMsgId,
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
          userMsgId,
          isThinking: false,
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

      if (done && openaiResId && finalImgObj?.result) {
        console.log(openaiResId);

        const duration = performance.now() - tInitial;

        const b64 = Buffer.from(finalImgObj.result, "base64");
        const getIt = (await this.prisma.extractor.extractRemote(
          b64,
          4096 * 48
        )) as ExpandedImgSpecs;
        const format = getIt.format;

        const filename = finalImgObj.id
          .concat("-")
          .concat(partialImgArr.length.toString(10))
          .concat(`.${format}`);

        uploadtInitial = performance.now();

        const rt = await this.s3.uploadGenerated(b64, this.prisma.isProd, {
          contentType: this.getGenMime(outputFormat),
          filename: filename,
          userId,
          size: getIt.byteSize,
          conversationId,
          origin: "GENERATED"
        });

        uploadtDelta = performance.now() - uploadtInitial;

        const generationGroupId = openaiResId;

        const imgMeta = this.prisma.handleAssetMetadata(getIt).img;

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

        const d = await this.prisma.handleAiChatResponse({
          chunk: openaiAgg,
          conversationId,
          done: true,
          title,
          temperature,
          responseOutput: imgFinal.generationGroupId,
          userMsgId,
          topP,
          uploadDuration: imgFinal.uploadDuration,
          provider,
          mime: `image/${getIt.format}`,
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
            userMsgId,
            aiMsgId: d.aiMsgId,
            imgGenAttachmentId: d.imgGenAttachmentId,
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
          userMsgId,
          aiMsgId: d.aiMsgId,
          imgGenAttachmentId: d.imgGenAttachmentId,
          temperature,
          usage,
          imgGenEnabled: true,
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
