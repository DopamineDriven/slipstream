import type { DeepSeekUsage } from "@/deepseek/sse.ts";
import type {
  DeepSeekAccumulatedToolCall,
  DeepSeekActiveMessageBlock,
  DeepSeekAssistantToolCallMessage,
  DeepSeekBaseMessage,
  DeepSeekFinalizedMessageBlock,
  DeepSeekForcedLoopStopReason,
  DeepSeekRequestMessage,
  DeepSeekToolMessage
} from "@/deepseek/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import { DeepSeekMemoryService } from "@/deepseek/memory.ts";
import {
  hasToolCallDelta,
  isContentDelta,
  isReasoningDelta
} from "@/deepseek/sse.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { EventTypeMap } from "@slipstream/types";

export class DeepSeekService extends DeepSeekMemoryService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    userStoreVector: UserStoreVectorService,
    memory: ConversationMemoryVectorService,
    apiKey?: string
  ) {
    super(logger, prisma, redis, userStoreVector, memory, apiKey);
  }

  public async handleDeepSeekAiChatRequest({
    chunks,
    conversationId,
    streamChannel,
    msgs,
    thinkingChunks,
    apiKey,
    ws,
    userMsgId,
    userId,
    hasUserStoreDocs,
    model,
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "deepseek" as const;
    let DeepSeekThinkingDuration = 0,
      DeepSeekThinkingAgg = "",
      DeepSeekAgg = "",
      totalUsage = 0;
    const trackedBlocks = Array.of<DeepSeekFinalizedMessageBlock>();
    let activeBlock: DeepSeekActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;

    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();

    const finalizeActiveBlock = () => {
      if (!activeBlock || activeBlock.content.length === 0) {
        activeBlock = undefined;
        return;
      }

      const durationMs = performance.now() - activeBlock.startedAt;

      trackedBlocks.push({
        content: activeBlock.content,
        durationMs,
        ordinal: nextOrdinal,
        type: activeBlock.type
      });

      if (activeBlock.type === "THINKING") {
        DeepSeekThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (type: DeepSeekActiveMessageBlock["type"]) => {
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

    const currentThinkingDuration = () => {
      const activeThinkingDuration =
        activeBlock?.type === "THINKING"
          ? performance.now() - activeBlock.startedAt
          : 0;

      return DeepSeekThinkingDuration + activeThinkingDuration;
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
        durationMs: performance.now() - activeBlock.startedAt
      } as const;
    };

    const appendReasoningDelta = (reasoningText?: string) => {
      if (!reasoningText) return;
      const block = ensureActiveBlock("THINKING");

      block.content += reasoningText;
      DeepSeekThinkingAgg += reasoningText;
      thinkingChunks.push(reasoningText);

      return reasoningText;
    };

    // memory tools attach unconditionally — conversation memory exists
    // independently of uploaded documents
    const tools = hasUserStoreDocs
      ? [
          this.fileSearchFunctionTool(),
          this.memorySearchFunctionTool(),
          this.memoryGetChunkFunctionTool()
        ]
      : [this.memorySearchFunctionTool(), this.memoryGetChunkFunctionTool()];
    const systemInstruction = this.prisma.formatSysNote(systemPrompt);

    let roundMessages = Array.of<DeepSeekRequestMessage>(
      ...(systemInstruction
        ? [
            {
              role: "system",
              content: systemInstruction
            } satisfies DeepSeekBaseMessage
          ]
        : []),
      ...(await this.formatHistory(msgs))
    );

    const MAX_TOOL_ROUNDS = this.maxToolDefaults.maxToolRounds;
    let forcedLoopStopReason: DeepSeekForcedLoopStopReason = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const roundToolCalls = new Map<number, DeepSeekAccumulatedToolCall>();
      let roundUsage: DeepSeekUsage | undefined = undefined;
      let sawToolCallFinish = false;

      const streamer = this.stream(model, roundMessages, apiKey ?? undefined, {
        top_p: topP,
        temperature,
        tools
      });

      for await (const chunk of streamer) {
        if (chunk.usage) {
          roundUsage = chunk.usage;
        }

        for (const choice of chunk.choices ?? []) {
          if (choice.finish_reason === "tool_calls") {
            sawToolCallFinish = true;
            finalizeActiveBlock();
          }

          if (isReasoningDelta(choice.delta)) {
            const reasoningText =
              "reasoning" in choice.delta &&
              typeof choice.delta.reasoning === "string"
                ? choice.delta.reasoning
                : choice.delta.reasoning_content;
            const emittedThinkingText = appendReasoningDelta(reasoningText);

            if (emittedThinkingText && emittedThinkingText.length > 0) {
              ws.send(
                JSON.stringify({
                  type: "ai_chat_chunk",
                  conversationId,
                  userId,
                  title,
                  userMsgId,
                  imgGenEnabled: false,
                  provider,
                  systemPrompt,
                  temperature,
                  thinkingText: emittedThinkingText,
                  messageBlocks: currentChunkMessageBlock(),
                  isThinking: true,
                  thinkingDuration:
                    currentThinkingDuration() > 0
                      ? currentThinkingDuration()
                      : undefined,
                  topP,
                  model,
                  done: false
                } satisfies EventTypeMap["ai_chat_chunk"])
              );

              void this.redis.publishTypedEvent(
                streamChannel,
                "ai_chat_chunk",
                {
                  type: "ai_chat_chunk",
                  conversationId,
                  userId,
                  model,
                  userMsgId,
                  imgGenEnabled: false,
                  title,
                  isThinking: true,
                  thinkingDuration:
                    currentThinkingDuration() > 0
                      ? currentThinkingDuration()
                      : undefined,
                  thinkingText: emittedThinkingText,
                  messageBlocks: currentChunkMessageBlock(),
                  systemPrompt,
                  temperature,
                  topP,
                  provider,
                  done: false
                }
              );

              if (thinkingChunks.length % 10 === 0) {
                void this.redis.saveStreamState(
                  conversationId,
                  chunks,
                  {
                    model,
                    provider,
                    title,
                    totalChunks: thinkingChunks.length,
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

          if (isContentDelta(choice.delta)) {
            const text = choice.delta.content;
            const block = ensureActiveBlock("TEXT");
            block.content += text;

            chunks.push(text);
            DeepSeekAgg += text;

            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                title,
                provider,
                userMsgId,
                imgGenEnabled: false,
                systemPrompt,
                temperature,
                thinkingDuration:
                  DeepSeekThinkingDuration > 0
                    ? DeepSeekThinkingDuration
                    : undefined,
                isThinking: false,
                messageBlocks: currentChunkMessageBlock(),
                topP,
                model,
                chunk: text,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );

            void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
              type: "ai_chat_chunk",
              conversationId,
              userId,
              userMsgId,
              imgGenEnabled: false,
              model,
              title,
              thinkingDuration:
                DeepSeekThinkingDuration > 0
                  ? DeepSeekThinkingDuration
                  : undefined,
              isThinking: false,
              thinkingText:
                DeepSeekThinkingAgg.length > 0
                  ? DeepSeekThinkingAgg
                  : undefined,
              messageBlocks: currentChunkMessageBlock(),
              systemPrompt,
              temperature,
              topP,
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
          }

          if (hasToolCallDelta(choice.delta)) {
            this.accumulateToolCallDelta(
              roundToolCalls,
              choice.delta.tool_calls
            );
            finalizeActiveBlock();
          }
        }
      }

      finalizeActiveBlock();

      if (roundUsage) {
        totalUsage += roundUsage.total_tokens;
      }

      const materializedToolCalls = this.materializeToolCalls(roundToolCalls);
      const hasActionableToolCalls =
        materializedToolCalls.length > 0 && (sawToolCallFinish || !!roundUsage);

      if (!hasActionableToolCalls) {
        break;
      }

      if (round === MAX_TOOL_ROUNDS) {
        forcedLoopStopReason = "MAX_ROUNDS";
        this.logger.warn(
          {
            round,
            toolCallCount: materializedToolCalls.length
          },
          "DeepSeek tool loop reached max rounds"
        );
        break;
      }

      const assistantToolMessage = {
        role: "assistant",
        content: "",
        tool_calls: materializedToolCalls
      } as const satisfies DeepSeekAssistantToolCallMessage;

      const toolMessages = Array.of<DeepSeekToolMessage>();
      for (const toolCall of materializedToolCalls) {
        toolMessages.push(
          await this.executeToolCall(userId, conversationId, toolCall)
        );
      }

      roundMessages = Array.of<DeepSeekRequestMessage>(
        ...roundMessages,
        assistantToolMessage,
        ...toolMessages
      );

      this.logger.info(
        {
          round,
          toolCallCount: materializedToolCalls.length,
          toolOutputCount: toolMessages.length
        },
        "DeepSeek tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && DeepSeekAgg.trim().length === 0) {
      DeepSeekAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        content: DeepSeekAgg,
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

    const finalUsage = totalUsage > 0 ? totalUsage : undefined;
    const d = await this.prisma.handleAiChatResponse({
      chunk: DeepSeekAgg,
      conversationId,
      done: true,
      provider,
      title,
      userId,
      userMsgId,
      imgGenEnabled: false,
      model,
      systemPrompt,
      thinkingDuration:
        DeepSeekThinkingDuration > 0 ? DeepSeekThinkingDuration : undefined,
      thinkingText:
        DeepSeekThinkingAgg.length > 0 ? DeepSeekThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      temperature,
      usage: finalUsage,
      topP
    });

    ws.send(
      JSON.stringify({
        type: "ai_chat_response",
        conversationId,
        userId,
        provider,
        convo: d.convo,
        userMsgId,
        aiMsgId: d.aiMsgId,
        imgGenEnabled: false,
        systemPrompt,
        thinkingDuration:
          DeepSeekThinkingDuration > 0 ? DeepSeekThinkingDuration : undefined,
        thinkingText:
          DeepSeekThinkingAgg.length > 0 ? DeepSeekThinkingAgg : undefined,
        title,
        temperature,
        topP,
        model,
        usage: finalUsage,
        chunk: DeepSeekAgg,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
        done: true
      } satisfies EventTypeMap["ai_chat_response"])
    );

    void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
      type: "ai_chat_response",
      conversationId,
      userId,
      systemPrompt,
      convo: d.convo,
      userMsgId,
      aiMsgId: d.aiMsgId,
      imgGenEnabled: false,
      temperature,
      title,
      thinkingDuration:
        DeepSeekThinkingDuration > 0 ? DeepSeekThinkingDuration : undefined,
      thinkingText:
        DeepSeekThinkingAgg.length > 0 ? DeepSeekThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      topP,
      usage: finalUsage,
      provider,
      model,
      chunk: DeepSeekAgg,
      done: true
    });

    void this.redis.del(`stream:state:${conversationId}`);
  }
}
