import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { ImageGenPartialArr, ImgGenResProps } from "@/openai/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type { OpenAI } from "openai";
import { OpenAIGPTImageService } from "@/openai/gpt-image.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AIChatResponseImgGenSubFields,
  EventTypeMap,
  GptImageAndFacilitatorsImgGenWorkupRT,
  OpenAiModelIdUnion
} from "@slipstream/types";

interface OpenAIImgGenActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface OpenAIImgGenFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export class OpenAIResponsesImgGenService extends OpenAIGPTImageService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    redis: EnhancedRedisPubSub,
    apiKey: string,
    memoryStore: ConversationMemoryVectorService
  ) {
    super(logger, prisma, userStoreVector, s3, redis, apiKey, memoryStore);
  }
  protected async handleOpenaiResponsesImgGen({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    thinkingChunks,
    userId,
    imgCounts,
    ws,
    userMsgId,
    apiKey,
    max_tokens,
    jobId,
    requestMessageId,
    model = "gpt-5.5" satisfies OpenAiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    currentMsgBoundAssets,
    imgGenEnabled,
    imgGenFields,
    user_location
  }: ProviderOpenaiRequestEntity) {
    const mod = model as OpenAiModelIdUnion;
    if (!this.isImgGenFacilitating(mod))
      throw new Error(
        `${mod} does not support openai's responses api image-gen tooling.`
      );

    const provider = "openai" as const;

    const partialImgArr = Array.of<ImageGenPartialArr>();

    let finalImgObj:
        OpenAI.Responses.ResponseOutputItem.ImageGenerationCall | undefined,
      openaiThinkingDuration = 0,
      openaiThinkingAgg = "",
      tInitial = 0,
      openaiResId: string | undefined = undefined,
      openaiAgg = "",
      partialImgsRequested = false,
      outputFormat: "png" | "jpeg" | "webp" = "png",
      partialImgAgg:
        [number, string, string, number, number, string] | undefined =
        undefined,
      uploadtInitial = 0,
      uploadtDelta = 0,
      usage = 0;
    const trackedBlocks = Array.of<OpenAIImgGenFinalizedMessageBlock>();
    const trackedEncryptedReasoningItemIds = new Set<string>();
    let activeBlock: OpenAIImgGenActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;

    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();

    const finalizeActiveBlock = () => {
      if (!activeBlock) {
        return;
      }

      if (activeBlock.content.length === 0) {
        activeBlock = undefined;
        return;
      }

      const durationMs = Math.max(
        0,
        Math.round(performance.now() - activeBlock.startedAt)
      );

      trackedBlocks.push({
        content: activeBlock.content,
        durationMs,
        ordinal: nextOrdinal,
        type: activeBlock.type
      });

      if (activeBlock.type === "THINKING") {
        openaiThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const appendEncryptedReasoningBlock = (itemId: string) => {
      if (trackedEncryptedReasoningItemIds.has(itemId)) {
        return;
      }

      finalizeActiveBlock();
      trackedBlocks.push({
        content: "",
        durationMs: 0,
        ordinal: nextOrdinal,
        type: "ENCRYPTED_THINKING"
      });
      trackedEncryptedReasoningItemIds.add(itemId);
      nextOrdinal += 1;
    };

    const ensureActiveBlock = (
      type: OpenAIImgGenActiveMessageBlock["type"]
    ) => {
      if (activeBlock?.type !== type) {
        finalizeActiveBlock();
        activeBlock = {
          content: "",
          startedAt: performance.now(),
          type
        };
        return activeBlock;
      }

      return activeBlock;
    };

    const currentThinkingDuration = () => {
      const activeThinkingDuration =
        activeBlock?.type === "THINKING"
          ? Math.round(performance.now() - activeBlock.startedAt)
          : 0;

      return openaiThinkingDuration + activeThinkingDuration;
    };

    const currentChunkMessageBlock = () => {
      if (!activeBlock) {
        return undefined;
      }

      return {
        type: activeBlock.type,
        content: activeBlock.content,
        ordinal: nextOrdinal,
        conversationId,
        durationMs: Math.max(
          0,
          Math.round(performance.now() - activeBlock.startedAt)
        )
      } as const;
    };

    const client = this.getClient(apiKey ?? undefined);

    const formatted = await this.formatOpenAiWithUploads(
      isNewChat,
      msgs,
      client,
      userId,
      { onlyMostRecentUser: true }
    );

    const loc = this.normalizeLocation(user_location);

    const hasFiles = this.hasFiles(formatted);
    const hasExistingOpenAIAssets =
      hasFiles || (await this.prisma.hasProviderMessages(userId, "OPENAI"));

    const fileIds = this.fileIds(formatted);

    let vectorStoreId: string | undefined;
    if (hasExistingOpenAIAssets) {
      vectorStoreId = await this.ensureUserVectorStoreId(client, null, userId);
      if (fileIds.length > 0) {
        await client.vectorStores.fileBatches.createAndPoll(vectorStoreId, {
          file_ids: fileIds
        });
      }
    }

    const resImg =
      this.responsesImgGen(
        imgGenEnabled ?? false,
        mod,
        imgGenFields,
        currentMsgBoundAssets
      ) ?? {};

    const r = resImg as GptImageAndFacilitatorsImgGenWorkupRT;

    partialImgsRequested = typeof r.partialImagesRequested !== "undefined";
    outputFormat = r.output_format;
    const tools = this.handleTooling(
      mod,
      hasExistingOpenAIAssets,
      loc,
      vectorStoreId ? [vectorStoreId] : undefined,
      true,
      {
        action: "auto",
        type: "image_generation",
        background: r.output_background,
        input_fidelity: imgCounts > 0 ? "high" : r.input_fidelity,
        model: "gpt-image-2",
        moderation: "low",
        output_compression: r.output_compression,
        output_format: r.output_format,
        partial_images: r.partialImagesRequested ?? 3,
        quality: "high",
        size: (r.output_size ?? "auto") as "auto"
      } satisfies OpenAI.Responses.Tool.ImageGeneration
    );

    const streamRes = await client.responses.create(
      {
        stream: true,
        stream_options: { include_obfuscation: false },
        input: formatted,
        instructions: this.buildInstructions(systemPrompt),
        store: false,
        reasoning: this.openaiReasoning(mod, "high", "auto", true),
        model: mod,
        text: this.openAiVerbosity(mod, "medium", imgGenEnabled),
        max_output_tokens: max_tokens,
        safety_identifier: userId,
        include: [
          "message.input_image.image_url",
          "web_search_call.action.sources",
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

      if (s.type === "response.output_item.added") {
        if (s.item.type === "reasoning") {
          ensureActiveBlock("THINKING");
        } else {
          finalizeActiveBlock();
        }
      }

      if (
        s.type === "response.reasoning_text.delta" ||
        s.type === "response.reasoning_summary_text.delta"
      ) {
        const block = ensureActiveBlock("THINKING");
        block.content += s.delta;
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
        const block = ensureActiveBlock("TEXT");
        block.content += s.delta;
        text = s.delta;
      }

      if (
        s.type === "response.output_item.done" &&
        s.item.type === "reasoning" &&
        typeof s.item.encrypted_content === "string" &&
        s.item.encrypted_content.length > 0
      ) {
        appendEncryptedReasoningBlock(s.item.id);
      }

      if (s.type === "response.completed") {
        openaiResId = s.response.id;
        finalizeActiveBlock();
        for (const output of s.response.output) {
          if (
            output.type === "reasoning" &&
            typeof output.encrypted_content === "string" &&
            output.encrypted_content.length > 0
          ) {
            appendEncryptedReasoningBlock(output.id);
          }
        }
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
            messageBlocks: currentChunkMessageBlock(),
            thinkingDuration:
              currentThinkingDuration() > 0
                ? currentThinkingDuration()
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
          thinkingDuration:
            currentThinkingDuration() > 0
              ? currentThinkingDuration()
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
          messageBlocks: currentChunkMessageBlock(),
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
            messageBlocks: currentChunkMessageBlock(),
            thinkingDuration:
              currentThinkingDuration() > 0
                ? currentThinkingDuration()
                : undefined,
            isThinking: true
          } satisfies EventTypeMap["ai_chat_chunk"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          thinkingDuration:
            currentThinkingDuration() > 0
              ? currentThinkingDuration()
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
          messageBlocks: currentChunkMessageBlock(),
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
            messageBlocks: currentChunkMessageBlock(),
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
          messageBlocks: currentChunkMessageBlock(),
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

        for (const block of trackedBlocks) {
          roundTrack.push({
            type: block.type,
            content: block.content,
            durationMs: block.durationMs,
            ordinal: block.ordinal,
            conversationId
          });
        }

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
            openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,
          messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
        });
        ws.send(
          JSON.stringify({
            type: "ai_chat_response",
            conversationId,
            userId,
            provider,
            model,
            userMsgId,
            convo: d.convo,
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
            messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
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
          convo: d.convo,
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
          messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
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
