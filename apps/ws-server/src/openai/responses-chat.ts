import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import type { OpenAI } from "openai";
import { OpenAIResponsesImgGenService } from "@/openai/responses-img-gen.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap, OpenAiModelIdUnion } from "@slipstream/types";

interface OpenAIActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface OpenAIFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export class OpenAIResponsesChatService extends OpenAIResponsesImgGenService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    redis: EnhancedRedisPubSub,
    apiKey: string,
    memoryService: ConversationMemoryVectorService
  ) {
    super(logger, prisma, userStoreVector, s3, redis, apiKey, memoryService);
  }

  private reasoningByModel(m: OpenAiModelIdUnion) {
    if (
      m === "gpt-5.5" ||
      m === "gpt-5.5-pro" ||
      m === "gpt-5.2" ||
      m === "gpt-5.4" ||
      m === "gpt-5.2-codex" ||
      m === "gpt-5.4-pro" ||
      m === "gpt-5.3-codex" ||
      m === "gpt-5.1-codex-max" ||
      m === "gpt-5.2-pro"
    ) {
      return "xhigh";
    } else if (
      m === "gpt-5" ||
      m === "gpt-5-codex" ||
      m === "gpt-5-chat-latest" ||
      m === "gpt-5-mini" ||
      m === "gpt-5-nano" ||
      m === "gpt-5-pro" ||
      m === "gpt-5.1" ||
      m === "gpt-5.1-chat-latest" ||
      m === "gpt-5.1-codex" ||
      m === "gpt-5.1-codex-mini" ||
      m === "gpt-5.2-chat-latest" ||
      m === "gpt-5.4-mini" ||
      m === "gpt-5.4-nano" ||
      m === "o3-pro" ||
      m === "o1-pro"
    ) {
      return "high";
    } else return "medium";
  }

  protected async handleOpenaiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    thinkingChunks,
    userId,
    hasUserStoreDocs,
    ws,
    userMsgId,
    apiKey,
    max_tokens,
    jobId,
    requestMessageId,
    model = "gpt-5.4" satisfies OpenAiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    user_location
  }: ProviderOpenaiRequestEntity) {
    const m = model as OpenAiModelIdUnion;

    const provider = "openai" as const;

    let openaiThinkingDuration = 0,
      openaiThinkingAgg = "",
      tInitial = 0,
      openaiResId: string | undefined = undefined,
      openaiAgg = "",
      usage = 0;
    const trackedBlocks = Array.of<OpenAIFinalizedMessageBlock>();
    let activeBlock: OpenAIActiveMessageBlock | undefined = undefined;
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

    const ensureActiveBlock = (type: OpenAIActiveMessageBlock["type"]) => {
      if (!activeBlock || activeBlock?.type !== type) {
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
      { onlyMostRecentUser: false }
    );

    const loc = this.normalizeLocation(user_location);
    const tools = this.handleTooling(
      m,
      false,
      loc,
      undefined,
      false,
      undefined,
      hasUserStoreDocs
    );
    const instructions = this.prisma.formatSysNote(systemPrompt);
    const MAX_TOOL_ROUNDS = 10;
    let roundInput = Array.of<OpenAI.Responses.ResponseInputItem>(...formatted);
    let forcedLoopStopReason: "MAX_ROUNDS" | undefined = undefined;

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
              "reasoning.encrypted_content",
              "code_interpreter_call.outputs",
              "message.input_image.image_url",
              "web_search_call.action.sources",
              "message.input_image.image_url"
            ],
            max_output_tokens: max_tokens,
            safety_identifier: userId,
            truncation: "auto",
            reasoning: this.openaiReasoning(
              m,
              this.reasoningByModel(m),
              "auto",
              false
            ),
            // Local user_store_search tool outputs can be large; keep calls sequential.
            parallel_tool_calls: true,
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
        throw new Error(this.prisma.safeErrMsg(error));
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

        if (s.type === "response.output_text.delta") {
          const block = ensureActiveBlock("TEXT");
          block.content += s.delta;
          text = s.delta;
        }

        if (s.type === "response.completed") {
          finalizeActiveBlock();
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
            imgGenEnabled: false,
            imgGenFields: undefined,
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
              userMsgId,
              model,
              systemPrompt,
              imgGenEnabled: false,
              imgGenFields: undefined,
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
            systemPrompt,
            temperature,
            topP,
            imgGenEnabled: false,
            imgGenFields: undefined,
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
      }

      if (!roundCompleted || !openaiResId) {
        throw new Error("OpenAI response stream ended without completion");
      }

      if (functionCalls.length === 0) {
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
        const output = await this.executeFunctionToolCall(
          userId,
          conversationId,
          call
        );
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
      trackedBlocks.push({
        content: openaiAgg,
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
        title,
        convo: d.convo,
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
      convo: d.convo,
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
  }
}
