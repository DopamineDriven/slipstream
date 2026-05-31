import type { ProviderGeminiChatRequestEntity } from "@/gemini/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { FileSearchToolInput } from "@/store/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type {
  Blob,
  Content,
  FunctionCall,
  GenerateContentResponse,
  Part
} from "@google/genai";
import { GeminiWorkupService } from "@/gemini/workup.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AIChatResponseImgGenSubFields,
  EventTypeMap,
  GeminiModelIdUnion
} from "@slipstream/types";

interface GeminiActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface GeminiFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export class GeminiChatService extends GeminiWorkupService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    store: UserStoreVectorService,
    protected redis: EnhancedRedisPubSub,
    protected s3: S3Storage,
    apiKey: string
  ) {
    super(logger, prisma, store, apiKey);
  }

  private parseUserStoreSearchInput(args?: Record<string, unknown>) {
    const parsed = args ?? ({} satisfies Record<string, unknown>);

    if ("query" in parsed && typeof parsed.query === "string") {
      const query = parsed.query.trim();
      if (query.length > 0) {
        const maxResults =
          "max_results" in parsed &&
          typeof parsed.max_results === "number" &&
          Number.isFinite(parsed.max_results)
            ? parsed.max_results
            : undefined;

        const filename =
          "filename" in parsed && typeof parsed.filename === "string"
            ? parsed.filename.trim() || undefined
            : undefined;

        const searchTerms =
          "search_terms" in parsed && typeof parsed.search_terms === "string"
            ? parsed.search_terms.trim() || undefined
            : undefined;

        return {
          query,
          max_results: maxResults,
          filename,
          search_terms: searchTerms
        } satisfies FileSearchToolInput;
      }
    }

    throw new Error(
      `user_store_search input missing required "query": ${JSON.stringify(parsed)}`
    );
  }

  private normalizeFunctionResponseOutput(rawOutput: string) {
    const trimmed = rawOutput.trim();
    if (trimmed.length === 0) {
      return "";
    }

    try {
      return JSON.parse<unknown>(trimmed);
    } catch {
      return rawOutput;
    }
  }

  protected async executeGeminiFunctionCall(
    userId: string,
    functionCall: FunctionCall
  ) {
    const toolName = functionCall.name ?? "unknown_tool";

    if (toolName !== "user_store_search") {
      return {
        functionResponse: {
          ...(functionCall.id ? { id: functionCall.id } : {}),
          name: toolName,
          response: {
            error: `Unknown tool: ${toolName}`
          }
        }
      } satisfies Part;
    }

    try {
      const input = this.parseUserStoreSearchInput(functionCall.args);
      this.logger.info(
        {
          toolName,
          toolCallId: functionCall.id ?? null,
          query: input.query,
          max_results: input.max_results,
          filename: input.filename
        },
        "Gemini user_store_search query"
      );

      const output = await this.executeUserStoreSearch(userId, input);

      return {
        functionResponse: {
          ...(functionCall.id ? { id: functionCall.id } : {}),
          name: toolName,
          response: {
            output: this.normalizeFunctionResponseOutput(output)
          }
        }
      } satisfies Part;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          toolCallId: functionCall.id ?? null,
          error: this.prisma.safeErrMsg(error)
        },
        "Gemini function tool execution failed"
      );

      return {
        functionResponse: {
          ...(functionCall.id ? { id: functionCall.id } : {}),
          name: toolName,
          response: {
            error: this.prisma.safeErrMsg(error)
          }
        }
      } satisfies Part;
    }
  }

  protected async handleGeminiAiChatRequest({
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
    model: m = "gemini-3.1-pro-preview" satisfies GeminiModelIdUnion,
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
      userId,
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
      topP,
      requestMessageId
    });

    const MAX_ROUNDS = 10;
    const maxUserStoreSearchCalls = 10;

    let geminiThinkingDuration = 0,
      geminiThinkingAgg = "",
      usage = 0,
      resId: string | undefined = undefined,
      uploadtInitial = 0,
      tInitial = 0,
      uploadtDelta = 0,
      geminiAgg = "",
      geminiDataPart: Blob | undefined = undefined;
    const trackedBlocks = Array.of<GeminiFinalizedMessageBlock>();
    let activeBlock: GeminiActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;

    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();

    let roundContents = Array.of<Content>(...params.contents);
    let forcedLoopStopReason:
      | "MAX_ROUNDS"
      | "MAX_USER_STORE_SEARCH_CALLS"
      | "REPEATED_TOOL_CALLS"
      | null = null;

    const geminiDataArr = Array.of<Blob>();
    const toolCallSignatureRegistry = new Map<string, number>();
    let userStoreSearchCallsTotal = 0;

    const gemini = this.getClient(apiKey);

    const finalizeActiveBlock = () => {
      if (!activeBlock || activeBlock.content.length === 0) {
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
        geminiThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (type: GeminiActiveMessageBlock["type"]) => {
      if (activeBlock?.type !== type) {
        finalizeActiveBlock();
        activeBlock = {
          content: "",
          startedAt: performance.now(),
          type
        };
      }

      return activeBlock;
    };

    const getThinkingDuration = () => {
      const activeThinkingDuration =
        activeBlock?.type === "THINKING"
          ? Math.round(performance.now() - activeBlock.startedAt)
          : 0;

      const totalThinkingDuration =
        geminiThinkingDuration + activeThinkingDuration;

      return totalThinkingDuration > 0 ? totalThinkingDuration : undefined;
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

    const emitThinkingChunk = (thinkingText: string) => {
      geminiThinkingAgg += thinkingText;
      thinkingChunks.push(thinkingText);
      const thinkingDuration = getThinkingDuration();

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
          thinkingDuration,
          thinkingText,
          messageBlocks: currentChunkMessageBlock(),
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
        thinkingDuration,
        thinkingText,
        messageBlocks: currentChunkMessageBlock(),
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
    };

    const emitTextChunk = (textPart: string) => {
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
          isThinking: false,
          temperature,
          topP,
          provider,
          thinkingText: geminiThinkingAgg,
          chunk: textPart,
          messageBlocks: currentChunkMessageBlock(),
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
        isThinking: false,
        systemPrompt,
        userMsgId,
        temperature,
        topP,
        thinkingText: geminiThinkingAgg,
        provider,
        messageBlocks: currentChunkMessageBlock(),
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
    };

    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const roundFunctionCalls = Array.of<FunctionCall>();
      const roundFunctionCallKeys = new Set<string>();
      const roundModelToolParts = Array.of<Part>();
      const roundFunctionCallPartIndexes = new Map<string, number>();
      const roundSignatureOnlyPartKeys = new Set<string>();
      const stream = (await gemini.models.generateContentStream({
        ...params,
        contents: roundContents
      })) satisfies AsyncGenerator<GenerateContentResponse>;

      for await (const chunk of stream) {
        if (tInitial === 0) {
          tInitial = performance.now();
        }
        if (chunk.responseId) {
          resId = chunk.responseId;
        }
        if (chunk.usageMetadata?.totalTokenCount) {
          usage = chunk.usageMetadata.totalTokenCount;
        }

        if (chunk.candidates) {
          for (const candidate of chunk.candidates) {
            if (candidate.tokenCount) {
              usage = candidate.tokenCount;
            }

            if (candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.functionCall) {
                  finalizeActiveBlock();
                  const functionCallKey = JSON.stringify({
                    id: part.functionCall.id ?? null,
                    name: part.functionCall.name ?? null,
                    args: part.functionCall.args ?? {}
                  });
                  const partIndex =
                    roundFunctionCallPartIndexes.get(functionCallKey);

                  if (typeof partIndex === "number") {
                    const currentPart = roundModelToolParts[partIndex];

                    if (
                      currentPart &&
                      !currentPart.thoughtSignature &&
                      part.thoughtSignature
                    ) {
                      roundModelToolParts[partIndex] = part;
                    }
                  } else {
                    roundFunctionCallPartIndexes.set(
                      functionCallKey,
                      roundModelToolParts.length
                    );
                    roundModelToolParts.push(part);
                  }

                  if (!roundFunctionCallKeys.has(functionCallKey)) {
                    roundFunctionCallKeys.add(functionCallKey);
                    roundFunctionCalls.push(part.functionCall);
                  }
                } else if (part.thoughtSignature) {
                  const signatureOnlyKey = JSON.stringify({
                    thought: part.thought ?? false,
                    text: part.text ?? null,
                    thoughtSignature: part.thoughtSignature
                  });

                  if (!roundSignatureOnlyPartKeys.has(signatureOnlyKey)) {
                    roundSignatureOnlyPartKeys.add(signatureOnlyKey);
                    roundModelToolParts.push(part);
                  }
                }

                if (part.text) {
                  if (part.thought) {
                    const block = ensureActiveBlock("THINKING");
                    block.content += part.text;
                    emitThinkingChunk(part.text);
                  } else {
                    const block = ensureActiveBlock("TEXT");
                    block.content += part.text;
                    emitTextChunk(part.text);
                  }
                }
                if (part.fileData) {
                  finalizeActiveBlock();
                  this.logger.debug(part.fileData, "part.fileData");
                }
                if (part.inlineData) {
                  finalizeActiveBlock();
                  this.logger.debug(
                    part.inlineData.displayName,
                    "part.inlineData"
                  );
                  geminiDataArr.push(part.inlineData);
                  geminiDataPart = part.inlineData;
                  const _dataUrl =
                    `data:${part.inlineData.mimeType};base64,${part.inlineData.data?.length}` as const;
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
              }
            }
          }
        }
      }

      finalizeActiveBlock();

      if (roundFunctionCalls.length === 0) {
        break;
      }

      let repeatedSignatures = 0;
      for (const functionCall of roundFunctionCalls) {
        if (functionCall.name === "user_store_search") {
          userStoreSearchCallsTotal += 1;
        }

        const signature = `${functionCall.name ?? "unknown"}:${JSON.stringify(functionCall.args ?? {})}`;
        const seenCount = toolCallSignatureRegistry.get(signature) ?? 0;

        if (seenCount > 0) {
          repeatedSignatures += 1;
        }

        toolCallSignatureRegistry.set(signature, seenCount + 1);
      }

      if (userStoreSearchCallsTotal > maxUserStoreSearchCalls) {
        forcedLoopStopReason = "MAX_USER_STORE_SEARCH_CALLS";
        this.logger.warn(
          {
            round,
            userStoreSearchCallsTotal,
            maxUserStoreSearchCalls
          },
          "Gemini tool loop stopped after user_store_search call cap"
        );
        break;
      }

      if (
        roundFunctionCalls.length > 0 &&
        repeatedSignatures === roundFunctionCalls.length
      ) {
        forcedLoopStopReason = "REPEATED_TOOL_CALLS";
        this.logger.warn(
          {
            round,
            repeatedSignatures,
            toolCallCount: roundFunctionCalls.length
          },
          "Gemini tool loop stopped due to repeated tool calls"
        );
        break;
      }

      if (round === MAX_ROUNDS) {
        forcedLoopStopReason = "MAX_ROUNDS";
        this.logger.warn(
          {
            round,
            functionCallCount: roundFunctionCalls.length,
            responseId: resId
          },
          "Gemini tool loop reached max rounds"
        );
        break;
      }

      const toolResponseParts = Array.of<Part>();

      for (const functionCall of roundFunctionCalls) {
        toolResponseParts.push(
          await this.executeGeminiFunctionCall(userId, functionCall)
        );
      }

      roundContents = Array.of<Content>(
        ...roundContents,
        {
          role: "model",
          parts: roundModelToolParts
        },
        {
          role: "user",
          parts: toolResponseParts
        }
      );

      this.logger.info(
        {
          round,
          responseId: resId,
          functionCallCount: roundFunctionCalls.length,
          toolResponseCount: toolResponseParts.length
        },
        "Gemini tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && geminiAgg.trim().length === 0) {
      geminiAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        content: geminiAgg,
        durationMs: 0,
        ordinal: nextOrdinal,
        type: "TEXT"
      });
      nextOrdinal += 1;
    }

    for (const block of trackedBlocks) {
      roundTrack.push({
        type: block.type,
        content: block.content,
        durationMs: block.durationMs,
        ordinal: block.ordinal,
        conversationId
      });
    }

    const finalImg = geminiDataArr.at(-1);
    if (
      imgGenEnabled &&
      geminiDataArr.length > 0 &&
      finalImg?.data &&
      finalImg?.mimeType
    ) {
      const seriesId = resId ?? (await this.generateId("generationGroupId"));
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

      const generationGroupId = seriesId;

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
        imgGenEnabled: true,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
      });
      ws.send(
        JSON.stringify({
          type: "ai_chat_response",
          chunk: geminiAgg,
          conversationId,
          done: true,
          aiMsgId: d.aiMsgId,
          convo: d.convo,
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
          imgGenEnabled: true,
          messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
        } satisfies EventTypeMap["ai_chat_response"])
      );
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
        type: "ai_chat_response",
        chunk: geminiAgg,
        conversationId,
        convo: d.convo,
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
        imgGenEnabled: true,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
      });
      void this.redis.del(`stream:state:${conversationId}`);
      return;
    }

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
      usage,
      data: geminiDataPart
        ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
        : undefined,
      topP,
      model,
      thinkingText: geminiThinkingAgg,
      thinkingDuration:
        geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
      imgGenEnabled,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
    });
    ws.send(
      JSON.stringify({
        type: "ai_chat_response",
        conversationId,
        userId,
        model,
        userMsgId,
        aiMsgId: d.aiMsgId,
        usage,
        convo: d.convo,
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
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
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
      usage,
      convo: d.convo,
      data: geminiDataPart
        ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
        : undefined,
      thinkingDuration:
        geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
      title,
      topP,
      thinkingText: geminiThinkingAgg,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      provider,
      model,
      chunk: geminiAgg,
      done: true
    });
    void this.redis.del(`stream:state:${conversationId}`);
  }
}
