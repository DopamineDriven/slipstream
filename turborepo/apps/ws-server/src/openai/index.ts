import type {
  ImageGenPartialArr,
  ProviderOpenaiRequestEntity
} from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/metadata";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import { Stream } from "openai/core/streaming.mjs";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import type {
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
    private extractor: ExtractService,
    private s3: S3Storage,
    private isProd: boolean,
    private redis: EnhancedRedisPubSub,
    private apiKey: string
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

  public getGenMime(target: "png" | "webp" | "jpeg") {
    return target === "jpeg"
      ? "image/jpeg"
      : target === "png"
        ? "image/png"
        : "image/webp";
  }

  // public async handleOpenaiAiNativeImageRequest({
  //   chunks,
  //   conversationId,
  //   isNewChat,
  //   msgs,
  //   streamChannel,
  //   thinkingChunks,
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

  //   const partialImgArr = Array.of<ImageGenPartialArr>();

  //   let finalImgObj:
  //       | OpenAI.Responses.ResponseOutputItem.ImageGenerationCall
  //       | undefined,
  //     tInitial = 0,
  //     openaiResId: string | null = null,
  //     openaiAgg = "",
  //     partialImgsRequested = false,
  //     outputFormat: "png" | "jpeg" | "webp" = "png",
  //     partialImgAgg:
  //       | [number, string, string, number, number, string]
  //       | undefined = undefined,
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

  //   const reasoning = this.openaiReasoning(m, "medium", "auto", imgGenEnabled);

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
  //     ((m === "gpt-image-1" || m === "gpt-image-1-mini") &&
  //       this.isImgGenModel("openai", m) &&
  //       resImg.model === "gpt-image-1") ||
  //     resImg.model === "gpt-image-1-mini"
  //   ) {
  //     const r = resImg satisfies GptImageAndFacilitatorsImgGenWorkupRT;
  //     partialImgsRequested = typeof r.partialImagesRequested !== "undefined";
  //     outputFormat = r.output_format;

  //     const o = await client.images.generate(
  //       {
  //         prompt: msgs?.[0]?.content ?? "",
  //         background: r.output_background,
  //         output_compression: r.output_compression,
  //         user: userId,
  //         output_format: r.output_format,
  //         model: m,
  //         moderation: r.moderation,
  //         n: r.n,
  //         partial_images: r.partialImagesRequested,
  //         quality: r.output_quality,
  //         size: r.output_size,
  //         stream: true
  //       },
  //       { stream: true }
  //     );

  //     for await (const stream of o) {
  //       o?._request_id;

  //               let partialIndex: number | undefined,
  //       done = false;
  //     let rtHelper;

  //     if (stream.type ==="image_generation.partial_image") {
  //        partialIndex = stream.partial_image_index;
  //         const { width, height, format } =
  //           this.extractor.img.getImageSpecsWorkup(
  //             Buffer.from(stream.b64_json, "base64")
  //           );
  //         partialImgAgg = [
  //           stream.partial_image_index,
  //           stream.b64_json,
  //           stream.created_at.toString(),
  //           width,
  //           height,
  //           format as
  //             | "apng"
  //             | "png"
  //             | "jpeg"
  //             | "gif"
  //             | "bmp"
  //             | "webp"
  //             | "avif"
  //             | "heic"
  //             | "svg"
  //             | "ico"
  //             | "tiff"
  //             | "jpg"
  //         ];
  //     }

  //     if (stream.type ==="image_generation.completed") {
  //       stream
  //     }
  //     }

  //   } else if (m === "dall-e-2" && resImg.model === "dall-e-2") {
  //     const x = await client.images.generate({
  //       quality: "standard",
  //       stream: false,
  //       prompt: msgs?.[0]?.content ?? "",
  //       model: m,
  //       user: userId,
  //       response_format: "b64_json",
  //       n: resImg.n,
  //       size: resImg.output_size
  //     });
  //   }
  // }

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
            format as
              | "apng"
              | "png"
              | "jpeg"
              | "gif"
              | "bmp"
              | "webp"
              | "avif"
              | "heic"
              | "svg"
              | "ico"
              | "tiff"
              | "jpg"
          ];
        }
      }
      // if (s.type === "response.output_item.added") {
      //   if (s.item.type === "image_generation_call" && s.item.result) {
      //     if (s.item.status === "generating") {
      //       console.log("generating in the response.output_item.added for loop!")
      //       finalImgObj = s.item;
      //     }
      //   }
      // }

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
      if (s.type === "response.output_text.done") {
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

              console.log(
                `yes this item contains more fields than is reported! ` +
                  rrr.revised_prompt || rrr.id
              );
              done = true;
            }
          }
        }
        if (s.response.usage?.total_tokens)
          usage = s.response.usage.total_tokens;
      }
      if (imgGenEnabled) {
        if (partialImgAgg) {
          const itemId = partialImgAgg[2];
          const partialIndex = partialImgAgg[0];
          const ext = partialImgAgg[5] as
            | "apng"
            | "png"
            | "jpeg"
            | "gif"
            | "bmp"
            | "webp"
            | "avif"
            | "heic"
            | "svg"
            | "ico"
            | "tiff"
            | "jpg";
          const mimeType =
            ext === "png"
              ? "image/png"
              : ext === "webp"
                ? "image/webp"
                : ext === "jpeg"
                  ? "jpg"
                  : ext === "jpg"
                    ? "jpg"
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

          const d = this.handleAssetMetadata(getIt).img;
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
            d,
            uploadtDelta,
            requestMessageId,
            jobId
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
              partialImages: this.mapPartialImgGenArr(partialImgArr)
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
            partialImages: this.mapPartialImgGenArr(partialImgArr)
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
              partialImages: this.mapPartialImgGenArr(partialImgArr)
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
            partialImages: this.mapPartialImgGenArr(partialImgArr)
          },
          temperature,
          topP,
          provider,
          thinkingText: thinkingText,
          isThinking: true,
          done: false
        });
      } // Handle regular text chunks
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
              partialImages: this.mapPartialImgGenArr(partialImgArr)
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
            partialImages: this.mapPartialImgGenArr(partialImgArr)
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

      if (done && openaiResId) {
        console.log(openaiResId);

        const duration = (performance.now() - tInitial) / 1000;
        if (imgGenEnabled && finalImgObj?.result) {
          const b64 = Buffer.from(finalImgObj.result, "base64");
          const finalSpecs = (await this.extractor.extractRemote(
            b64,
            4096 * 48
          )) as ExpandedImgSpecs;
          const format = finalSpecs.format;

          const filename = finalImgObj.id
            .concat("-")
            .concat(partialImgArr.length.toString(10))
            .concat(`.${format}`);

          uploadtInitial = performance.now();

          const rt = await this.s3.uploadGenerated(b64, this.isProd, {
            contentType: this.getGenMime(outputFormat),
            filename: filename,
            userId,
            size: finalSpecs.byteSize,
            conversationId,
            origin: "GENERATED"
          });

          uploadtDelta = performance.now() - uploadtInitial;

          const generationGroupId = openaiResId;

          const imgMeta = this.handleAssetMetadata(finalSpecs).img;

          const imgFinal = {
            cdnUrl: rt.cdnUrl,
            index: partialImgArr.length,
            itemId: finalImgObj.id,
            width: finalSpecs.width,
            height: finalSpecs.height,
            mime:
              finalSpecs.contentType ??
              rt.contentType ??
              this.getGenMime(outputFormat),
            bucket: rt.bucket,
            key: rt.key,
            versionId: rt.versionId,
            s3ObjectId: rt.s3ObjectId,
            filename,
            ext: finalSpecs.format,
            etag: rt.etag,
            size: finalSpecs.byteSize ?? rt.size ?? undefined,
            s3LastModified: rt.lastModified,
            ContentDisposition: rt.contentDisposition,
            CacheControl: rt.cacheControl,
            Checksum: rt.checksum,
            StorageClass: rt.storageClass,
            generationGroupId,
            image: imgMeta,
            uploadDuration: uploadtDelta,
            requestMessageId,
            jobId,
            jobIndex: 0,
            seriesId: finalImgObj.id,
            seriesIndex: partialImgArr.length,
            kind: "FINAL"
          } as const;

          const image = [
            {
              index: imgFinal.index,
              cdnUrl: rt?.cdnUrl ?? "",
              height: finalSpecs?.height ?? 0,
              width: finalSpecs?.width ?? 0,
              mime: finalSpecs?.contentType ?? this.getGenMime(outputFormat)
            }
          ];

          const remapPartials = this.mapPersistenceImgGenArr(partialImgArr).map(
            v => {
              const { generationGroupId: _placeholder, ...rest } = v;
              return {
                ...rest,
                generationGroupId
              };
            }
          );

          const height = finalSpecs?.height ?? 0,
            width = finalSpecs?.width ?? 0;

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
            s3ObjectId: rt.s3ObjectId,
            bucket: rt.bucket,
            key: rt.key,
            usage,
            cdnUrl: rt.cdnUrl,
            height: finalSpecs.height,
            jobId,
            requestMessageId,
            mime: rt.contentType,
            size: rt.size ?? finalSpecs.byteSize,
            versionId: rt.versionId,
            width: finalSpecs.width,
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
              partialImagesRequested:
                imgGenFields?.output_partial_images ?? undefined,
              requestedCount: imgGenFields?.n ?? 1,
              outputSize: finalSpecs.byteSize?.toString(10) ?? "0",
              outputMime:
                finalSpecs.contentType ?? this.getGenMime(outputFormat),
              outputWidth: width,
              outputHeight: height,
              size: finalSpecs.byteSize ?? 0,
              partialImagesActual: partialImgArr.length,
              partialImages: remapPartials,
              images: [imgFinal]
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
                outputSize: finalSpecs.byteSize?.toString(10) ?? "0",
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
                outputWidth: width,
                outputQuality:
                  "quality" in finalImgObj &&
                  typeof finalImgObj.quality === "string"
                    ? finalImgObj.quality
                    : undefined,
                outputHeight: height,
                size: finalSpecs.byteSize ?? 0,
                partialImagesActual: partialImgArr.length,
                partialImages: this.mapPartialImgGenArr(partialImgArr),
                images: image
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
              outputSize: finalSpecs.byteSize?.toString(10) ?? "0",
              outputMime: this.getGenMime(outputFormat),
              outputWidth: width,
              outputHeight: height,
              size: finalSpecs.byteSize ?? 0,
              partialImagesActual: partialImgArr.length,
              partialImages: this.mapPartialImgGenArr(partialImgArr),
              images: image
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
          // Clear saved state on successful completion
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
          // Clear saved state on successful completion
          void this.redis.del(`stream:state:${conversationId}`);
          break;
        }
      }
    }
  }
}
