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
import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
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
import { isLocalToolName } from "@slipstream/types";

export class DeepSeekService extends DeepSeekMemoryService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    userStoreVector: UserStoreVectorService,
    memory: ConversationMemoryVectorService,
    // local tool bridge ownership STARTS here — the memory/workup
    // ancestors never see it; placed BEFORE apiKey because a required
    // param cannot follow the optional one
    protected localToolBroker: LocalToolBroker,
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
    topP,
    localTools
  }: ProviderChatRequestEntity) {
    const provider = "deepseek" as const;

    // Local read-only tool bridge — capability advertised by the CLI on
    // this exact turn; absent means zero local definitions attached.
    // turnId mints once per ATTEMPT; the controller is the future
    // cancellation hook (calls await sequentially, so nothing is pending
    // when this throws).
    const localToolTurn =
      localTools?.protocolVersion === 1
        ? {
            turnId: await this.localToolBroker.generateTurnId(),
            advertised: new Set<string>(localTools.names),
            controller: new AbortController()
          }
        : undefined;
    const localToolNames = localToolTurn
      ? [...localToolTurn.advertised].filter(isLocalToolName)
      : [];
    if (localToolTurn) {
      this.logger.info(
        {
          turnId: localToolTurn.turnId,
          advertised: [...localToolTurn.advertised],
          conversationId
        },
        "local tool bridge armed for deepseek turn"
      );
    }
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
    // independently of uploaded documents; local bridge tools append to
    // whichever set the branch selects
    const tools = hasUserStoreDocs
      ? [
          this.fileSearchFunctionTool(),
          this.memorySearchFunctionTool(),
          this.memoryGetChunkFunctionTool(),
          ...this.localToolFunctionTools(localToolNames)
        ]
      : [
          this.memorySearchFunctionTool(),
          this.memoryGetChunkFunctionTool(),
          ...this.localToolFunctionTools(localToolNames)
        ];
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
        // Local read-only bridge: relay to the CLI via the socket-scoped
        // broker (which ALWAYS resolves — deadline/disconnect/cancel become
        // typed is_error results, so the await can never wedge the loop);
        // every other tool takes the existing server-side path untouched.
        // const-local (not property) so the narrowing survives the async IIFE
        const toolName = toolCall.function.name;
        if (
          isLocalToolName(toolName) &&
          localToolTurn?.advertised.has(toolName)
        ) {
          let input: unknown = {};
          let inputParseFailed = false;
          try {
            input = toolCall.function.arguments
              ? JSON.parse<unknown>(toolCall.function.arguments)
              : {};
          } catch {
            inputParseFailed = true;
          }
          const content = inputParseFailed
            ? `Malformed ${toolCall.function.name} input JSON`
            : await (async () => {
                const localResult = await this.localToolBroker.request(
                  ws,
                  {
                    type: "local_tool_request",
                    conversationId,
                    turnId: localToolTurn.turnId,
                    round: round + 1,
                    toolCallId: toolCall.id,
                    name: toolName,
                    input,
                    timeoutMs: this.localToolBroker.timeoutMsFor(toolName)
                  },
                  localToolTurn.controller.signal
                );
                const r = localResult.result;
                this.logger.info(
                  {
                    turnId: localToolTurn.turnId,
                    toolCallId: toolCall.id,
                    name: toolCall.function.name,
                    round: round + 1,
                    ok: r.ok,
                    durationMs: r.durationMs,
                    ...(r.ok ? {} : { errorCode: r.error.code })
                  },
                  "local tool round trip (deepseek)"
                );
                return JSON.stringify(r.ok ? r.value : { error: r.error });
              })();
          toolMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content
          } satisfies DeepSeekToolMessage);
          continue;
        }
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
