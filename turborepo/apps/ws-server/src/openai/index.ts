import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import { Stream } from "openai/core/streaming.mjs";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import type {
  AIChatResponseImgGenFields,
  EventTypeMap,
  GptImageAndFacilitatorsImgGenWorkupRT,
  OpenAiModelIdUnion,
  Unenumerate
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
    keyId,
    model = "gpt-5-mini" satisfies OpenAiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    currentMsgBoundAssets,
    imgGenEnabled = false,
    imgGenFields,
    user_location
  }: ProviderOpenaiRequestEntity) {
    const m = model as OpenAiModelIdUnion;
    const provider = "openai" as const;
    const partialImgArr = Array.of<[string, number]>();
    const _finalImgArr =
      Array.of<Unenumerate<AIChatResponseImgGenFields>["images"]>();
    let openaiThinkingStartTime: number | null = null,
      openaiThinkingDuration = 0,
      openaiIsCurrentlyThinking = false,
      openaiThinkingAgg = "",
      openaiAgg = "",
      partialImgsRequested = false,
      outputFormat: "png" | "jpeg" | "webp" = "png",
      partialImgAgg: [string, number] | undefined = undefined,
      finalImgAgg: string | undefined = undefined,
      str: Stream<OpenAI.Responses.ResponseStreamEvent> & {
        _request_id?: string | null;
      };

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

    const tools = this.handleTooling(
      m,
      hasFiles,
      loc,
      vectorStoreId ? [vectorStoreId] : undefined
    );

    const reasoning = this.openaiReasoning(m, "medium", "auto");

    const resImg = this.responsesImgGen(
      imgGenEnabled,
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
        text: this.openAiVerbosity(m, "medium"),
        temperature,
        max_output_tokens: max_tokens,
        top_p: topP,
        safety_identifier: userId,
        include: [
          "web_search_call.action.sources",
          "web_search_call.results",
          "message.input_image.image_url"
        ],
        truncation: "auto",
        reasoning,
        parallel_tool_calls: true,
        tools
      });
    }
    str = await client.responses.create({
      stream: true,
      input: formatted,
      instructions: this.buildInstructions(systemPrompt),
      store: false,
      model: m,
      text: this.openAiVerbosity(model as OpenAiModelIdUnion, "medium"),
      temperature,
      include: [
        "web_search_call.action.sources",
        "web_search_call.results",
        "message.input_image.image_url"
      ],
      max_output_tokens: max_tokens,
      top_p: topP,
      safety_identifier: userId,
      truncation: "auto",
      reasoning,
      parallel_tool_calls: true,
      tools
    });

    for await (const s of str) {
      let text: string | undefined = undefined,
        thinkingText: string | undefined = undefined,
        done = false;

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
        // push to s3, get cdnUrl to pass to streamed res
        partialImgAgg = [s.partial_image_b64, s.partial_image_index];
        s.item_id;
      }
      if (s.type === "response.output_item.added") {
        if (s.item.type === "image_generation_call") {
          s.item.result;
          if (s.item.result) {
            const contentType =
              outputFormat === "jpeg"
                ? "image/jpeg"
                : outputFormat === "png"
                  ? "image/png"
                  : "image/webp";

            const _uploadingDirect = await this.s3.uploadDirect(s.item.result, {
              contentType,
              filename: s.item.id.concat(s.output_index.toString(10)),
              origin: "GENERATED",
              userId,
              conversationId
            });
          }
          s.item.id;
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
      if (s.type === "response.output_text.done") {
        done = true;
      }
      if (s.type === "response.completed") {
        s.response.usage;
        s.response.output;
        for (const r of s.response.output) {
          if (r.type === "image_generation_call" && r.result) {
            finalImgAgg = r.result;
          }
        }
      }
      if (partialImgAgg) {
        partialImgArr.push(partialImgAgg);
        // b64url to upload to s3 -> get cdnUrl -> forward to client
        const _partial = partialImgAgg[0];
      }
      if (finalImgAgg) {
        // TODO UPLOAD WITH S3 TO GET CDN URL AND GET INFO ON width, height, etc via extractor service
        const _toUpload = finalImgAgg;
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
            imgGenFields: {},
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
            model,
            systemPrompt,
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
          systemPrompt,
          temperature,
          topP,
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

