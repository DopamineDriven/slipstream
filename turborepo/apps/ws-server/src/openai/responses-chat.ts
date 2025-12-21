import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { OpenAIResponsesImgGenService } from "@/openai/responses-img-gen.ts";
import { PrismaService } from "@/prisma/index.ts";
import type { EventTypeMap, OpenAiModelIdUnion } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class OpenAIResponsesChatService extends OpenAIResponsesImgGenService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    s3: S3Storage,
    redis: EnhancedRedisPubSub,
    apiKey: string
  ) {
    super(logger, prisma, s3, redis, apiKey);
  }

  protected async handleOpenaiChatRequest({
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
    model = "gpt-5-mini" satisfies OpenAiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    user_location
  }: ProviderOpenaiRequestEntity) {
    const m = model as OpenAiModelIdUnion;

    const provider = "openai" as const;

    let openaiThinkingStartTime: number | null = null,
      openaiThinkingDuration = 0,
      openaiIsCurrentlyThinking = false,
      openaiThinkingAgg = "",
      tInitial = 0,
      openaiResId: string | null = null,
      openaiAgg = "",
      usage = 0;

    const client = this.getClient(apiKey ?? undefined);

    const formatted = await this.formatOpenAiWithUploads(
      isNewChat,
      msgs,
      client,
      userId,
      { onlyMostRecentUser: false }
    );

    const loc = this.normalizeLocation(user_location);

    const _hasImages = this.hasImages(formatted);

    const hasFiles = this.hasFiles(formatted);
    const hasExistingOpenAIAssets =
      hasFiles ||
      (await this.prisma.hasProviderMessages(userId, "OPENAI"));

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

    const tools = this.handleTooling(
      m,
      hasExistingOpenAIAssets,
      loc,
      vectorStoreId ? [vectorStoreId] : undefined,
      false,
      undefined
    );
    const streamRes = await client.responses.create(
      {
        stream: true,
        input: formatted,
        instructions: this.buildInstructions(systemPrompt),
        store: false,
        model: m,
        text: this.openAiVerbosity(
          model as OpenAiModelIdUnion,
          "medium",
          false
        ),
        include: [
          "web_search_call.action.sources",
          "reasoning.encrypted_content",
          "code_interpreter_call.outputs",
          "message.input_image.image_url",
          "web_search_call.results",
          "message.input_image.image_url",
          "file_search_call.results"
        ],
        max_output_tokens: max_tokens,
        safety_identifier: userId,
        truncation: "auto",
        reasoning: this.openaiReasoning(
          m,
          m === "gpt-5.2"
            ? "xhigh"
            : m === "gpt-5-pro"
              ? "high"
              : m === "gpt-5.2-pro"
                ? "xhigh"
                : m === "gpt-5.1"
                  ? "high"
                  : m === "gpt-5"
                    ? "high"
                    : m === "gpt-5.1-codex-max"
                      ? "xhigh"
                      : "medium",
          "auto",
          false
        ),
        parallel_tool_calls: true,
        tools
      },
      { stream: true }
    );
    for await (const s of streamRes) {
      let text: string | undefined = undefined,
        thinkingText: string | undefined = undefined,
        done = false;

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
        if (s.response.usage?.total_tokens) {
          usage = s.response.usage.total_tokens;
          done = true;
        }
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
            imgGenEnabled: false,
            imgGenFields: undefined,
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
          imgGenEnabled: false,
          imgGenFields: undefined,
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
            userMsgId,
            model,
            systemPrompt,
            imgGenEnabled: false,
            imgGenFields: undefined,
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
          systemPrompt,
          temperature,
          topP,
          imgGenEnabled: false,
          imgGenFields: undefined,
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
        const d = await this.prisma.handleAiChatResponse({
          chunk: openaiAgg,
          conversationId,
          done: true,
          title,
          temperature,
          responseOutput: openaiResId,
          userMsgId,
          jobId,
          requestMessageId,
          topP,
          provider,
          userId,
          systemPrompt,
          model,
          mime: undefined,
          usage,
          imgGenFields: undefined,
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
            usage,
            aiMsgId: d.aiMsgId,
            imgGenEnabled: false,
            imgGenAttachmentId: undefined,
            imgGenFields: undefined,
            systemPrompt,
            userMsgId,
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
          userMsgId,
          title,
          usage,
          imgGenEnabled: false,
          aiMsgId: d.aiMsgId,
          imgGenAttachmentId: undefined,
          imgGenFields: undefined,
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
// To continue this session, run codex resume 019b20b8-d978-7dc2-9737-7c247c192df5
