import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import type { OpenAI } from "openai";
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
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    redis: EnhancedRedisPubSub,
    apiKey: string
  ) {
    super(logger, prisma, userStoreVector, s3, redis, apiKey);
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
    const hasUserStoreDocs = await this.prisma.hasUserStoreDocs(userId);

    const tools = this.handleTooling(
      m,
      false,
      loc,
      undefined,
      false,
      undefined,
      hasUserStoreDocs
    );
    const instructions = this.buildInstructions(systemPrompt);
    const maxFileSearchCalls = 10;
    const MAX_TOOL_ROUNDS = 10;
    let roundInput = Array.of<OpenAI.Responses.ResponseInputItem>(...formatted);
    const toolCallSignatureRegistry = new Map<string, number>();
    let fileSearchCallsTotal = 0;
    let forcedLoopStopReason:
      | "MAX_ROUNDS"
      | "MAX_FILE_SEARCH_CALLS"
      | "REPEATED_TOOL_CALLS"
      | null = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      let streamRes: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;
      try {
        streamRes = await client.responses.create(
          {
            stream: true,
            input: roundInput,
            instructions,
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
              "message.input_image.image_url"
            ],
            max_output_tokens: max_tokens,
            safety_identifier: userId,
            truncation: "auto",
            reasoning: this.openaiReasoning(
              m,
              m === "gpt-5.2"
                ? "xhigh"
                : m === "gpt-5.4"
                  ? "xhigh"
                  : m === "gpt-5.2-codex"
                    ? "xhigh"
                    : m === "gpt-5.3-codex"
                      ? "xhigh"
                      : m === "gpt-5.4-pro"
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
            // Local file_search tool outputs can be large; keep calls sequential.
            parallel_tool_calls: false,
            tools
          },
          { stream: true }
        );
      } catch (error) {
        this.logger.error(
          {
            round,
            roundInputCount: roundInput.length,
            err: this.prisma.safeErrMsg(error)
          },
          "OpenAI stream request failed"
        );
        throw error;
      }

      const functionCalls =
        Array.of<OpenAI.Responses.ResponseFunctionToolCall>();
      let roundCompleted = false;

      for await (const s of streamRes) {
        let text: string | undefined = undefined;
        let thinkingText: string | undefined = undefined;

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
            openaiIsCurrentlyThinking = false;
          }
          text = s.delta;
        }

        if (s.type === "response.completed") {
          openaiResId = s.response.id;
          if (s.response.usage?.total_tokens) {
            usage = s.response.usage.total_tokens;
          }
          for (const output of s.response.output) {
            if (output.type === "function_call") {
              functionCalls.push(output);
            }
          }
          roundCompleted = true;
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
      }

      if (!roundCompleted || !openaiResId) {
        throw new Error("OpenAI response stream ended without completion");
      }

      if (functionCalls.length === 0) {
        break;
      }

      let repeatedSignatures = 0;
      for (const call of functionCalls) {
        if (call.name === "file_search") {
          fileSearchCallsTotal += 1;
        }
        const signature = `${call.name}:${call.arguments.trim()}`;
        const seenCount = toolCallSignatureRegistry.get(signature) ?? 0;
        if (seenCount > 0) {
          repeatedSignatures += 1;
        }
        toolCallSignatureRegistry.set(signature, seenCount + 1);
      }

      if (fileSearchCallsTotal > maxFileSearchCalls) {
        forcedLoopStopReason = "MAX_FILE_SEARCH_CALLS";
        this.logger.warn(
          {
            round,
            responseId: openaiResId,
            fileSearchCallsTotal,
            maxFileSearchCalls
          },
          "OpenAI tool loop stopped after file_search call cap"
        );
        break;
      }

      if (repeatedSignatures === functionCalls.length) {
        forcedLoopStopReason = "REPEATED_TOOL_CALLS";
        this.logger.warn(
          {
            round,
            responseId: openaiResId,
            repeatedSignatures,
            functionCallCount: functionCalls.length
          },
          "OpenAI tool loop stopped due to repeated tool calls"
        );
        break;
      }

      if (round === MAX_TOOL_ROUNDS) {
        forcedLoopStopReason = "MAX_ROUNDS";
        this.logger.warn(
          {
            round,
            functionCallCount: functionCalls.length,
            responseId: openaiResId
          },
          "OpenAI tool loop reached max rounds"
        );
        break;
      }

      const toolOutputs =
        Array.of<OpenAI.Responses.ResponseInputItem.FunctionCallOutput>();
      for (const call of functionCalls) {
        const output = await this.executeFunctionToolCall(userId, call);
        toolOutputs.push(output);
      }

      roundInput = [...roundInput, ...functionCalls, ...toolOutputs];
      this.logger.info(
        {
          round,
          responseId: openaiResId,
          functionCallCount: functionCalls.length,
          toolOutputCount: toolOutputs.length
        },
        "OpenAI tool round complete, sending continuation"
      );
    }

    if (!openaiResId) {
      throw new Error("OpenAI response id missing after tool rounds");
    }

    if (forcedLoopStopReason && openaiAgg.trim().length === 0) {
      openaiAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query (for example, exact filename or chapter title) and I will retry.";
    }

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
  }
}
