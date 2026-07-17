import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type {
  MistralAccumulatedToolCall,
  MistralActiveMessageBlock,
  MistralAssistantToolCallMessage,
  MistralFinalizedMessageBlock,
  MistralForcedLoopStopReason,
  MistralMessageReq,
  MistralToolMessage,
  ToolTypes
} from "@/mistral/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type {
  ContentChunk,
  SystemMessage
} from "@mistralai/mistralai/models/components";
import { MistralMemoryService } from "@/mistral/memory.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { EventTypeMap } from "@slipstream/types";
import { isLocalToolName } from "@slipstream/types";

export class MistralService extends MistralMemoryService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    userStoreVector: UserStoreVectorService,
    memoryService: ConversationMemoryVectorService,
    apiKey: string,
    // local tool bridge ownership STARTS here — the memory/workup
    // ancestors never see it, mirroring the other providers' pattern
    protected localToolBroker: LocalToolBroker
  ) {
    super(logger, prisma, redis, userStoreVector, memoryService, apiKey);
  }
  public async handleMistralAiChatRequest({
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
    const provider = "mistral" as const;
    const resolvedModel = this.resolveModel(model);

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
        "local tool bridge armed for mistral turn"
      );
    }
    let mistralThinkingDuration = 0,
      mistralThinkingAgg = "",
      mistralAgg = "",
      totalUsage = 0;
    const trackedBlocks = Array.of<MistralFinalizedMessageBlock>();
    let activeBlock: MistralActiveMessageBlock | undefined = undefined;
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
        mistralThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (type: MistralActiveMessageBlock["type"]) => {
      if (activeBlock?.type !== type) {
        finalizeActiveBlock();
        activeBlock = {
          content: "",
          reasoningChunkCount: 0,
          sawAggregateTail: false,
          startedAt: performance.now(),
          type
        };
      }

      return activeBlock;
    };

    const currentThinkingDuration = () => {
      const activeThinkingDuration =
        activeBlock?.type === "THINKING"
          ? Math.round(performance.now() - activeBlock.startedAt)
          : 0;

      return mistralThinkingDuration + activeThinkingDuration;
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

    const appendReasoningDelta = (reasoningText: string) => {
      const block = ensureActiveBlock("THINKING");
      block.reasoningChunkCount += 1;

      let emittedThinkingText = reasoningText;
      if (
        block.reasoningChunkCount > 3 &&
        Math.abs(block.content.length - reasoningText.length) <=
          4 * block.reasoningChunkCount
      ) {
        block.sawAggregateTail = true;
        const prependNew = `\n${reasoningText}`;
        emittedThinkingText =
          block.content.length < prependNew.length
            ? prependNew.substring(block.content.length)
            : "";
      }

      if (emittedThinkingText.length === 0) {
        return undefined;
      }

      const appendedText = block.sawAggregateTail
        ? emittedThinkingText
        : reasoningText;

      block.content += appendedText;
      mistralThinkingAgg += appendedText;
      thinkingChunks.push(appendedText);

      return emittedThinkingText;
    };

    const emitThinkingChunk = (thinkingText: string) => {
      const emittedThinkingText = appendReasoningDelta(thinkingText);

      if (!emittedThinkingText || emittedThinkingText.length === 0) {
        return;
      }

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
          model: resolvedModel,
          done: false
        } satisfies EventTypeMap["ai_chat_chunk"])
      );

      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
        type: "ai_chat_chunk",
        conversationId,
        userId,
        model: resolvedModel,
        userMsgId,
        imgGenEnabled: false,
        title,
        isThinking: true,
        thinkingDuration:
          currentThinkingDuration() > 0 ? currentThinkingDuration() : undefined,
        thinkingText: emittedThinkingText,
        messageBlocks: currentChunkMessageBlock(),
        systemPrompt,
        temperature,
        topP,
        provider,
        done: false
      });

      if (thinkingChunks.length % 10 === 0) {
        void this.redis.saveStreamState(
          conversationId,
          chunks,
          {
            model: resolvedModel,
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
    };

    const emitTextChunk = (text: string) => {
      if (text.length === 0) {
        return;
      }

      const block = ensureActiveBlock("TEXT");
      block.content += text;

      chunks.push(text);
      mistralAgg += text;

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
            mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
          isThinking: false,
          messageBlocks: currentChunkMessageBlock(),
          topP,
          model: resolvedModel,
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
        model: resolvedModel,
        title,
        thinkingDuration:
          mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
        isThinking: false,
        thinkingText:
          mistralThinkingAgg.length > 0 ? mistralThinkingAgg : undefined,
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
            model: resolvedModel,
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

    const processDeltaContent = (
      content: string | readonly ContentChunk[] | null | undefined
    ) => {
      this.processDeltaContent(content, {
        emitTextChunk,
        emitThinkingChunk
      });
    };

    // memory tools attach unconditionally — conversation memory exists
    // independently of uploaded documents; local bridge tools append to
    // whichever set the branch selects
    const tools = (
      hasUserStoreDocs
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
          ]
    ) satisfies ToolTypes;
    const systemInstruction = this.prisma.formatSysNote(systemPrompt);
    let roundMessages = Array.of<MistralMessageReq>(
      ...(systemInstruction
        ? [
            {
              role: "system",
              content: systemInstruction
            } satisfies SystemMessage
          ]
        : []),
      ...(await this.formatHistory(msgs))
    );

    // backstop only, not a working budget — memory tools dual-wield across rounds
    const MAX_TOOL_ROUNDS = 10_000_000;
    let forcedLoopStopReason: MistralForcedLoopStopReason = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const roundToolCalls = new Map<number, MistralAccumulatedToolCall>();
      let roundUsageTotalTokens: number | undefined = undefined;
      let sawToolCallFinish = false;

      const streamer = await this.stream(
        resolvedModel,
        roundMessages,
        apiKey ?? undefined,
        {
          topP,
          temperature,
          tools
        }
      );

      for await (const event of streamer) {
        const chunk = event.data;

        if (typeof chunk.usage?.totalTokens === "number") {
          roundUsageTotalTokens = chunk.usage.totalTokens;
        }

        for (const choice of chunk.choices) {
          if (choice.finishReason === "tool_calls") {
            sawToolCallFinish = true;
            finalizeActiveBlock();
          }

          processDeltaContent(choice.delta.content);

          if (choice.delta.toolCalls && choice.delta.toolCalls.length > 0) {
            this.accumulateToolCallDelta(
              roundToolCalls,
              choice?.delta?.toolCalls
            );
            finalizeActiveBlock();
          }
        }
      }

      finalizeActiveBlock();

      if (typeof roundUsageTotalTokens === "number") {
        totalUsage += roundUsageTotalTokens;
      }

      const materializedToolCalls = this.materializeToolCalls(roundToolCalls);
      const hasActionableToolCalls =
        materializedToolCalls.length > 0 &&
        (sawToolCallFinish || typeof roundUsageTotalTokens === "number");

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
          "mistral tool loop reached max rounds"
        );
        break;
      }

      const assistantToolMessage = {
        role: "assistant",
        content: "",
        toolCalls: materializedToolCalls
      } as const satisfies MistralAssistantToolCallMessage;

      const toolMessages = Array.of<MistralToolMessage>();

      for (const toolCall of materializedToolCalls) {
        // Local read-only bridge: relay to the CLI via the socket-scoped
        // broker (which ALWAYS resolves — deadline/disconnect/cancel become
        // typed is_error results, so the await can never wedge the loop);
        // every other tool takes the existing server-side path untouched.
        // const-local (not property) so the narrowing survives the async IIFE
        const toolName = toolCall.function.name;
        if (
          isLocalToolName(toolName) &&
          localToolTurn &&
          localToolTurn.advertised.has(toolName)
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
                  "local tool round trip (mistral)"
                );
                return JSON.stringify(r.ok ? r.value : { error: r.error });
              })();
          toolMessages.push({
            role: "tool",
            toolCallId: toolCall.id,
            name: toolName,
            content
          } satisfies MistralToolMessage);
          continue;
        }
        toolMessages.push(
          await this.executeToolCall(userId, conversationId, toolCall)
        );
      }

      roundMessages = [
        ...roundMessages,
        assistantToolMessage,
        ...toolMessages
      ] satisfies MistralMessageReq[];

      this.logger.info(
        {
          round,
          toolCallCount: materializedToolCalls.length,
          toolOutputCount: toolMessages.length
        },
        "mistral tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && mistralAgg.trim().length === 0) {
      mistralAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        content: mistralAgg,
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
      chunk: mistralAgg,
      conversationId,
      done: true,
      provider,
      title,
      userId,
      userMsgId,
      imgGenEnabled: false,
      model: resolvedModel,
      systemPrompt,
      thinkingDuration:
        mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
      thinkingText:
        mistralThinkingAgg.length > 0 ? mistralThinkingAgg : undefined,
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
        userMsgId,
        aiMsgId: d.aiMsgId,
        convo: d.convo,
        imgGenEnabled: false,
        systemPrompt,
        thinkingDuration:
          mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
        thinkingText:
          mistralThinkingAgg.length > 0 ? mistralThinkingAgg : undefined,
        title,
        temperature,
        topP,
        model: resolvedModel,
        usage: finalUsage,
        chunk: mistralAgg,
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
        mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
      thinkingText:
        mistralThinkingAgg.length > 0 ? mistralThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      topP,
      usage: finalUsage,
      provider,
      model: resolvedModel,
      chunk: mistralAgg,
      done: true
    });

    void this.redis.del(`stream:state:${conversationId}`);
  }
}
