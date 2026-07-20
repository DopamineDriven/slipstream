import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type {
  LlamaAccumulatedToolCall,
  LlamaForcedLoopStopReason,
  MetaActiveMessageBlock,
  MetaFinalizedMessageBlock
} from "@/meta/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type {
  CompletionMessage,
  Message,
  SystemMessage,
  ToolResponseMessage
} from "llama-api-client/resources/index.mjs";
import { LlamaMemoryService } from "@/meta/memory.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { EventTypeMap, MetaModelIdUnion } from "@slipstream/types";
import { isLocalToolName } from "@slipstream/types";

export class LlamaService extends LlamaMemoryService {
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

  public async handleMetaAiChatRequest({
    chunks,
    conversationId,
    msgs,
    userMsgId,
    thinkingChunks,
    streamChannel,
    userId,
    hasUserStoreDocs,
    ws,
    apiKey,
    model = "Llama-4-Maverick-17B-128E-Instruct-FP8" satisfies MetaModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    localTools
  }: ProviderChatRequestEntity) {
    const provider = "meta" as const;

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
        "local tool bridge armed for meta turn"
      );
    }

    let metaAgg = "";
    const trackedBlocks = Array.of<MetaFinalizedMessageBlock>();
    let activeBlock: MetaActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;
    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();
    const client = this.llamaClient(apiKey ?? undefined);

    const finalizeActiveBlock = () => {
      if (!activeBlock || activeBlock.content.length === 0) {
        activeBlock = undefined;
        return;
      }

      trackedBlocks.push({
        content: activeBlock.content,
        durationMs: Math.max(
          0,
          Math.round(performance.now() - activeBlock.startedAt)
        ),
        ordinal: nextOrdinal,
        type: activeBlock.type
      });

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = () => {
      activeBlock ??= {
        content: "",
        startedAt: performance.now(),
        type: "TEXT"
      };

      return activeBlock;
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
    let roundMessages = Array.of<Message>(
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
    let forcedLoopStopReason: LlamaForcedLoopStopReason = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const roundToolCalls = new Map<string, LlamaAccumulatedToolCall>();
      let stopReason: CompletionMessage["stop_reason"] | null = null;

      const stream = await client.chat.completions.create(
        {
          user: userId,
          top_p: topP ?? 1.0,
          temperature: temperature ?? 1.0,
          model,
          messages: roundMessages,
          stream: true,
          ...(tools.length > 0 ? { tools, tool_choice: "auto" as const } : {})
        },
        { stream: true }
      );

      for await (const chunk of stream) {
        let text: string | undefined = undefined;

        if (chunk.event.delta.type === "text") {
          text = chunk.event.delta.text;
        }
        if (chunk.event.delta.type === "tool_call") {
          finalizeActiveBlock();
          this.accumulateToolCallDelta(roundToolCalls, chunk.event.delta);
        }
        if (chunk.event.event_type === "complete") {
          stopReason = chunk.event.stop_reason ?? "stop";
        }

        if (text) {
          const block = ensureActiveBlock();
          block.content += text;
          chunks.push(text);
          metaAgg += text;
          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              userId,
              userMsgId,
              title,
              provider,
              systemPrompt,
              temperature,
              topP,
              model,
              chunk: text,
              messageBlocks: currentChunkMessageBlock(),
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
            userMsgId,
            topP,
            provider,
            chunk: text,
            messageBlocks: currentChunkMessageBlock(),
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

      finalizeActiveBlock();

      const materializedToolCalls = this.materializeToolCalls(roundToolCalls);
      const shouldContinueWithTools =
        stopReason === "tool_calls" || materializedToolCalls.length > 0;

      if (!shouldContinueWithTools) {
        break;
      }

      if (round === MAX_TOOL_ROUNDS) {
        forcedLoopStopReason = "MAX_ROUNDS";
        this.logger.warn(
          {
            round,
            toolCallCount: materializedToolCalls.length
          },
          "llama tool loop reached max rounds"
        );
        break;
      }

      const assistantToolMessage = {
        role: "assistant",
        stop_reason: "tool_calls",
        tool_calls: materializedToolCalls
      } as const satisfies CompletionMessage;

      const toolMessages = Array.of<ToolResponseMessage>();
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
                  "local tool round trip (meta)"
                );
                return JSON.stringify(r.ok ? r.value : { error: r.error });
              })();
          toolMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content
          } satisfies ToolResponseMessage);
          continue;
        }
        toolMessages.push(
          await this.executeToolCall(userId, conversationId, toolCall)
        );
      }

      // the FULL running conversation rides into the continuation — the old
      // rebuild-to-system-plus-last-user base gave the model amnesia on
      // every tool round and was the root of the post-search face-plants
      roundMessages = Array.of<Message>(
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
        "llama tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && metaAgg.trim().length === 0) {
      metaAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        type: "TEXT",
        content: metaAgg,
        durationMs: 0,
        ordinal: nextOrdinal
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
      chunk: metaAgg,
      systemPrompt,
      temperature,
      topP,
      userMsgId,
      conversationId,
      done: true,
      provider,
      title,
      userId,
      model,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
    });
    ws.send(
      JSON.stringify({
        type: "ai_chat_response",
        conversationId,
        userId,
        userMsgId,
        aiMsgId: d.aiMsgId,
        convo: d.convo,
        provider,
        systemPrompt,
        title,
        temperature,
        topP,
        model,
        chunk: metaAgg,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
        done: true
      } satisfies EventTypeMap["ai_chat_response"])
    );
    void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
      type: "ai_chat_response",
      conversationId,
      userId,
      userMsgId,
      aiMsgId: d.aiMsgId,
      systemPrompt,
      convo: d.convo,
      temperature,
      title,
      topP,
      provider,
      model,
      chunk: metaAgg,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      done: true
    });
    void this.redis.del(`stream:state:${conversationId}`);
  }
}
