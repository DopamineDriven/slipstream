import type {
  BlockBuilder,
  CreateMessageStreamRT,
  FileSearchToolInput,
  ProviderAnthropicChatRequestEntity,
  RoundRecord,
  ToolUseAccumulator
} from "@/anthropic/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ToolCatalogService } from "@/tool-catalog/index.ts";
import type { Anthropic } from "@anthropic-ai/sdk";
import { AnthropicVectorStoreWorkup } from "@/anthropic/vector-store.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { AnthropicModelIdUnion, EventTypeMap } from "@slipstream/types";

interface AnthropicActiveMessageBlock {
  blockIndex: number;
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface AnthropicFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export class AnthropicService extends AnthropicVectorStoreWorkup {
  /**
   * PTC container ID registry: conversationId → containerId
   * Preserves container ID across tool rounds, cleared on final ai_chat_response
   */
  private readonly ptcContainerRegistry = new Map<string, string>();

  /**
   * Per-request round history: userMsgId → RoundRecord[]
   * Tracks all tool invocations and assistant responses per round.
   * Ephemeral during streaming, serialized to responseOutput on completion.
   */
  private readonly roundRegistry = new Map<string, RoundRecord[]>();

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    memoryService: ConversationMemoryVectorService,
    toolCatalog: ToolCatalogService,
    private redis: EnhancedRedisPubSub,
    apiKey: string
  ) {
    super(logger, prisma, userStoreVector, memoryService, toolCatalog, apiKey);
  }

  /**
   * Finalize streamed server_tool_use blocks: parse accumulated inputJson into input.
   * The code_execution server_tool_use input (containing Claude's Python code) is
   * streamed via input_json_delta — it's NOT available at content_block_start.
   */
  private finalizeBlockBuilders(blockBuilders: Map<number, BlockBuilder>) {
    for (const [, bb] of blockBuilders) {
      if (bb.type === "server_tool_use" && bb.inputJson) {
        try {
          bb.input = JSON.parse<Record<string, any>>(bb.inputJson);
        } catch (e) {
          this.logger.warn(
            { inputJsonLen: bb.inputJson.length, error: String(e) },
            "Failed to parse server_tool_use input_json_delta"
          );
          bb.input = { _raw: bb.inputJson };
        }
      }
    }
  }

  /**
   * Convert block builders into BetaContentBlockParam[] for the assistant message
   * in a continuation request.
   */
  private buildAssistantContentBlocks(
    blockBuilders: Map<number, BlockBuilder>
  ) {
    const blocks = Array.of<Anthropic.Beta.BetaContentBlockParam>();

    for (const [, bb] of blockBuilders) {
      if (bb.type === "text") {
        blocks.push({
          type: "text",
          text: bb.text ?? ""
        } satisfies Anthropic.Beta.BetaTextBlockParam);
      }
      if (bb.type === "thinking" && bb.signature) {
        blocks.push({
          type: "thinking",
          thinking: bb.thinking ?? "",
          signature: bb.signature
        } satisfies Anthropic.Beta.BetaThinkingBlockParam);
      }
      if (bb.type === "server_tool_use" && bb.id && bb.name) {
        const name =
          bb.name as Anthropic.Beta.BetaServerToolUseBlockParam["name"];
        blocks.push({
          type: "server_tool_use",
          id: bb.id,
          name,
          input: bb.input
        } satisfies Anthropic.Beta.BetaServerToolUseBlockParam);

        // Sanity check: code_execution must have input.code
        if (bb.name === "code_execution" && bb.input && "code" in bb.input) {
          const code = bb.inputJson;
          this.logger.info(
            {
              hasCode: typeof code === "string",
              codeLen: typeof code === "string" ? code.length : 0
            },
            "PTC server_tool_use replay check"
          );
        }
      }
      if (bb.type === "tool_use" && bb.id && bb.name) {
        // PTC: input arrives fully formed at content_block_start (bb.input)
        // Model-generated: input streamed via input_json_delta (bb.inputJson)
        const input: Record<string, any> =
          bb.input ??
          (bb.inputJson ? JSON.parse<Record<string, any>>(bb.inputJson) : {});

        // Per Anthropic PTC docs (Step 3): include `caller` in the
        // continuation assistant message so the API can associate the
        // tool_use with its parent server_tool_use (code_execution).
        const toolUseBlock: Anthropic.Beta.BetaToolUseBlockParam & {
          caller?: Anthropic.Beta.BetaServerToolCaller;
        } = {
          type: "tool_use",
          id: bb.id,
          name: bb.name,
          input
        };

        if (bb.caller) {
          toolUseBlock.caller = bb.caller;
          this.logger.debug(
            { callerType: bb.caller.type, toolId: bb.caller.tool_id },
            "PTC tool_use caller included in continuation"
          );
        }

        blocks.push(toolUseBlock as Anthropic.Beta.BetaContentBlockParam);
      }
      if (
        bb.type === "code_execution_tool_result" &&
        bb.tool_use_id &&
        bb.codeExecutionContent
      ) {
        blocks.push({
          type: "code_execution_tool_result",
          tool_use_id: bb.tool_use_id,
          content: bb.codeExecutionContent
        } satisfies Anthropic.Beta.BetaCodeExecutionToolResultBlockParam);
      }
    }

    return blocks;
  }

  public async handleAnthropicAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    userMsgId,
    thinkingChunks,
    userId,
    ws,
    apiKey,
    keyId,
    max_tokens,
    model: m,
    systemPrompt,
    temperature,
    title,
    topP,
    user_location
  }: ProviderAnthropicChatRequestEntity) {
    // it's conditional but it's actually always defined
    // incomning user msg request
    const reqMsgId = userMsgId ?? "";
    const model = m as AnthropicModelIdUnion;
    const provider = "anthropic" as const;
    let anthropicThinkingDuration = 0,
      anthropicThinkingAgg = "",
      anthropicAgg = "",
      anthropicWebsearchToolUse = false,
      anthropicCi = 0;
    const trackedBlocks = Array.of<AnthropicFinalizedMessageBlock>();
    let activeBlock: AnthropicActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;
    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();
    const anthropic = this.getClient(apiKey ?? undefined);

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
        anthropicThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (
      type: AnthropicActiveMessageBlock["type"],
      blockIndex: number
    ) => {
      if (activeBlock?.type !== type || activeBlock.blockIndex !== blockIndex) {
        finalizeActiveBlock();
        activeBlock = {
          blockIndex,
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
          ? performance.now() - activeBlock.startedAt
          : 0;

      const totalThinkingDuration =
        anthropicThinkingDuration + activeThinkingDuration;

      return totalThinkingDuration > 0 ? totalThinkingDuration : undefined;
    };

    const currentChunkMessageBlock = () => {
      if (!activeBlock) {
        return;
      }

      return {
        type: activeBlock.type,
        content: activeBlock.content,
        ordinal: nextOrdinal,
        conversationId,
        durationMs: performance.now() - activeBlock.startedAt
      } as const;
    };

    const activeBlockMatchesIndex = (blockIndex: number) => {
      if (!activeBlock) {
        return false;
      }

      return activeBlock.blockIndex === blockIndex;
    };

    let { params } = await this.createStreamWorkup({
      isNewChat,
      messages: msgs,
      userId,
      apiKey,
      keyId,
      max_tokens,
      model: m,
      systemPrompt,
      temperature,
      topP,
      user_location
    });

    // PTC state
    const toolAccumulators = new Map<number, ToolUseAccumulator>();
    const blockBuilders = new Map<number, BlockBuilder>();

    // Container ID: check registry for existing container (30-day lifetime)
    // Using conversationId to persist container across turns in same conversation
    let containerId = this.ptcContainerRegistry.get(conversationId);
    if (containerId) {
      this.logger.info(
        { conversationId, containerId },
        "PTC reusing existing container from registry"
      );
    }

    // backstop only, not a working budget — memory tools dual-wield
    // (search → get_chunk → search) so real turns burn many rounds, and
    // pause_turn continuations consume ticks too; wall-clock deadlines
    // are the sanctioned bound on runaway loops, never round rationing
    const MAX_TOOL_ROUNDS = 100;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      if (round > 0) {
        this.logger.info(
          { round, containerId, messageCount: params.messages.length },
          "PTC sending continuation request"
        );
      }
      const s = msgs.findLastIndex(t => t.senderType === "USER");
      let userMsgId: string | null = null;
      if (s !== -1 && msgs?.[s]?.id) {
        userMsgId = msgs[s]?.id;
      } else {
        userMsgId = reqMsgId;
      }
      userMsgId;
      let stream: CreateMessageStreamRT;

      try {
        stream = (await anthropic.beta.messages.create(
          params
        )) satisfies CreateMessageStreamRT;
      } catch (e) {
        this.logger.error(
          e instanceof Error
            ? {
                round,
                status: e?.cause,
                name: e.name,
                errorMessage: e?.message,
                errorBody: e?.stack
                  ? JSON.stringify(e.stack).slice(0, 2000)
                  : undefined
              }
            : this.prisma.safeErrMsg(e),
          "PTC stream creation failed"
        );
        this.roundRegistry.delete(reqMsgId);
        throw e;
      }

      // — Diagnostic: log when stream is created (especially for Round 1+)
      // Track request ID (changes each round) vs container ID (should persist)
      const requestId = stream._request_id;
      this.logger.info(
        {
          round,
          streamCreated: true,
          requestId,
          containerIdBefore: containerId ?? "(not yet set)"
        },
        "PTC round stream created"
      );

      let done: Anthropic.Beta.BetaStopReason | null = null;
      let usage: number | undefined = undefined;

      for await (const chunk of stream) {
        console.info(
          {
            event:
              chunk.type === "content_block_delta"
                ? chunk.delta.type === "input_json_delta"
                  ? chunk.delta.partial_json
                  : chunk.delta.type === "thinking_delta"
                    ? chunk.delta.thinking
                    : chunk.delta.type === "signature_delta"
                      ? chunk.delta.signature
                      : chunk.delta.type === "text_delta"
                        ? chunk.delta.text
                        : chunk.delta.type === "compaction_delta"
                          ? chunk.delta.content
                          : chunk.delta.type === "citations_delta"
                            ? chunk.delta.citation
                            : ""
                : ""
          },
          `event tracje [${Date.now()}]`
        );
        let text: string | undefined = undefined,
          thinkingText: string | undefined = undefined,
          webSearchRes: Anthropic.Beta.BetaWebSearchResultBlock | null = null;

        if (chunk.type === "content_block_start") {
          // — Block builder: open a builder for every content block
          const bb: BlockBuilder = { type: chunk.content_block.type };

          if (chunk.content_block.type === "server_tool_use") {
            if (anthropicWebsearchToolUse === false) {
              anthropicWebsearchToolUse = true;
            }
            bb.id = chunk.content_block.id;
            bb.name = chunk.content_block.name;
            // server_tool_use input may be partial at start — full input streamed via input_json_delta
            bb.input = chunk.content_block.input as Record<string, any>;
            bb.inputJson = "";
          }

          if (chunk.content_block.type === "tool_use") {
            bb.id = chunk.content_block.id;
            bb.name = chunk.content_block.name;
            // PTC tool_use blocks have input fully formed at start (not streamed via deltas)
            // Model-generated tool_use blocks have input: {} at start, streamed via input_json_delta
            const startInput = chunk.content_block.input as Record<
              string,
              any
            > | null;
            const hasStartInput =
              startInput != null && Object.keys(startInput).length > 0;
            bb.inputJson = hasStartInput ? JSON.stringify(startInput) : "";
            bb.input = hasStartInput ? startInput : undefined;

            const caller = chunk.content_block.caller;
            if (caller?.type === "code_execution_20250825") {
              bb.caller = caller;
            }

            this.logger.info(
              {
                toolUseId: chunk.content_block.id,
                toolName: chunk.content_block.name,
                index: chunk.index,
                hasCaller: !!caller,
                callerType: caller?.type,
                callerToolId:
                  caller?.type === "code_execution_20250825"
                    ? caller.tool_id
                    : undefined,
                hasStartInput
              },
              "PTC content_block_start: tool_use detected"
            );

            toolAccumulators.set(chunk.index, {
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              inputJson: hasStartInput ? JSON.stringify(startInput) : "",
              callerType: "code_execution_20250825",
              callerToolId:
                caller?.type === "code_execution_20250825" ? caller.tool_id : ""
            });
          }

          if (chunk.content_block.type === "text") {
            bb.text = "";
          }

          if (chunk.content_block.type === "thinking") {
            bb.thinking = "";
          }

          if (
            chunk.content_block.type !== "text" &&
            chunk.content_block.type !== "thinking"
          ) {
            finalizeActiveBlock();
          }

          if (chunk.content_block.type === "web_search_tool_result") {
            if ("error" in chunk.content_block.content) {
              this.logger.info(chunk.content_block.content.error);
            }
            if (Array.isArray(chunk.content_block.content)) {
              for (const subblock of chunk.content_block.content) {
                webSearchRes = subblock;
                this.logger.debug(webSearchRes, "web_search_res");
                anthropicWebsearchToolUse = false;
              }
            }
          }

          if (chunk.content_block.type === "code_execution_tool_result") {
            bb.tool_use_id = chunk.content_block.tool_use_id;
            bb.codeExecutionContent = chunk.content_block.content;
            this.logger.info(
              {
                toolUseId: chunk.content_block.tool_use_id,
                index: chunk.index
              },
              "PTC content_block_start: code_execution_tool_result captured"
            );
          }

          blockBuilders.set(chunk.index, bb);
        }

        if (chunk.type === "content_block_delta") {
          const bb = blockBuilders.get(chunk.index);

          if (chunk.delta.type === "thinking_delta") {
            thinkingText = chunk.delta.thinking;
            if (bb) bb.thinking = (bb.thinking ?? "") + chunk.delta.thinking;
            const block = ensureActiveBlock("THINKING", chunk.index);
            block.content += chunk.delta.thinking;
          }
          if (chunk.delta.type === "text_delta") {
            text = chunk.delta.text;
            if (bb) bb.text = (bb.text ?? "") + chunk.delta.text;
            const block = ensureActiveBlock("TEXT", chunk.index);
            block.content += chunk.delta.text;
          }
          if (chunk.delta.type === "citations_delta") {
            this.logger.info(chunk.delta.citation);
          }
          if (chunk.delta.type === "input_json_delta") {
            const acc = toolAccumulators.get(chunk.index);
            if (acc) {
              acc.inputJson += chunk.delta.partial_json;
            }
            if (bb)
              bb.inputJson = (bb.inputJson ?? "") + chunk.delta.partial_json;
            if (anthropicWebsearchToolUse === true && !acc) {
              this.logger.info(
                { chunk_delta_type: "input_json_delta" },
                chunk.delta.partial_json
              );
            }
          }
          if (chunk.delta.type === "signature_delta") {
            if (bb) bb.signature = (bb.signature ?? "") + chunk.delta.signature;
          }
        }

        if (chunk.type === "message_start") {
          // — Diagnostic: log full message_start to detect immediate stop/error
          const prevContainerId = containerId;
          let newContainerId: string | undefined;

          if (
            "container" in chunk.message &&
            chunk.message.container &&
            typeof chunk.message.container === "object" &&
            "id" in chunk.message.container
          ) {
            newContainerId = chunk.message.container.id as string;
            containerId = newContainerId;

            // Store in registry for 30-day container lifetime across turns
            this.ptcContainerRegistry.set(conversationId, newContainerId);
          }

          this.logger.info(
            {
              round,
              messageId: chunk.message.id,
              stopReason: chunk.message.stop_reason,
              contentLength: chunk.message.content?.length ?? 0,
              usage: chunk.message.usage,
              prevContainerId: prevContainerId ?? "(none)",
              newContainerId: newContainerId ?? "(not in response)",
              containerIdChanged:
                prevContainerId !== newContainerId &&
                newContainerId !== undefined,
              registrySize: this.ptcContainerRegistry.size
            },
            "PTC message_start details"
          );

          const prePopulated = chunk.message.content;
          if (prePopulated && prePopulated.length > 0) {
            this.logger.info(
              {
                round,
                prePopulatedCount: prePopulated.length,
                types: prePopulated.map(b => b.type)
              },
              "PTC message_start: pre-populated content blocks detected"
            );

            for (let i = 0; i < prePopulated.length; i++) {
              const block = prePopulated[i];
              if (!block) continue;
              const bb: BlockBuilder = { type: block.type };

              if (block.type === "tool_use") {
                bb.id = block.id;
                bb.name = block.name;
                const startInput = block.input as Record<
                  string,
                  unknown
                > | null;
                const hasStartInput =
                  startInput != null && Object.keys(startInput).length > 0;
                bb.inputJson = hasStartInput ? JSON.stringify(startInput) : "";
                bb.input = hasStartInput ? startInput : undefined;

                const caller =
                  "caller" in block
                    ? (block.caller as
                        Anthropic.Beta.BetaServerToolCaller | undefined)
                    : undefined;
                if (caller?.type === "code_execution_20250825") {
                  bb.caller = caller;
                }

                toolAccumulators.set(i, {
                  id: block.id,
                  name: block.name,
                  inputJson: hasStartInput ? JSON.stringify(startInput) : "",
                  callerType: "code_execution_20250825",
                  callerToolId:
                    caller?.type === "code_execution_20250825"
                      ? caller.tool_id
                      : ""
                });
              }

              if (block.type === "text" && "text" in block) {
                bb.text = block.text;
              }

              if (block.type === "thinking" && "thinking" in block) {
                bb.thinking = block.thinking;
                if ("signature" in block) bb.signature = block.signature;
              }

              if (block.type === "server_tool_use" && "id" in block) {
                bb.id = block.id;
                bb.name = block.name;
                bb.input = block.input as Record<string, unknown>;
              }

              if (block.type === "code_execution_tool_result") {
                bb.tool_use_id = block.tool_use_id;
                bb.codeExecutionContent = block.content;
              }

              blockBuilders.set(i, bb);
            }
          }

          if (chunk.message.stop_reason) {
            done = chunk.message.stop_reason;
          }
        }

        if (chunk.type === "message_delta") {
          if (
            "container" in chunk.delta &&
            chunk.delta.container &&
            typeof chunk.delta.container === "object" &&
            "id" in chunk.delta.container
          ) {
            containerId = chunk.delta.container.id as string;
          }
          if (chunk.delta.stop_reason) {
            done = chunk.delta.stop_reason;
          }
          if (chunk.usage.input_tokens) usage = chunk.usage.input_tokens;
          if (usage && chunk.usage.output_tokens)
            usage += chunk.usage.output_tokens;
        }

        if (
          chunk.type === "content_block_stop" &&
          activeBlockMatchesIndex(chunk.index)
        ) {
          finalizeActiveBlock();
        }

        // — Stream thinking text to client (unchanged logic)
        if (thinkingText) {
          if (webSearchRes) {
            anthropicCi += 1;

            const { url } = webSearchRes;

            this.logger.info(
              { ...webSearchRes },
              `web-search-result ${anthropicCi}`
            );

            const formatIt = ` [\\(^{${anthropicCi}}\\)](${url})` as const;

            anthropicThinkingAgg += thinkingText.concat(formatIt);

            thinkingChunks.push(thinkingText.concat(formatIt));

            webSearchRes = null;
          } else {
            anthropicThinkingAgg += thinkingText;
            thinkingChunks.push(thinkingText);
          }
          if (text) {
            anthropicAgg += text;
            chunks.push(text);
          }
          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              userId,
              provider,
              title,
              model,
              userMsgId,
              chunk: text,
              systemPrompt,
              temperature,
              topP,
              thinkingText: thinkingText,
              thinkingDuration: getThinkingDuration(),
              isThinking: true,
              messageBlocks: currentChunkMessageBlock(),
              done: false
            } satisfies EventTypeMap["ai_chat_chunk"])
          );

          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            userMsgId,
            model,
            thinkingDuration: getThinkingDuration(),
            title,
            systemPrompt,
            temperature,
            chunk: text,
            topP,
            provider,
            thinkingText: thinkingText,
            isThinking: true,
            messageBlocks: currentChunkMessageBlock(),
            done: false
          });
        }

        // — Stream text to client (unchanged logic)
        if (text) {
          if (webSearchRes) {
            anthropicCi += 1;

            const { url } = webSearchRes;

            this.logger.info(
              { ...webSearchRes },
              `web-search-result ${anthropicCi}`
            );

            const formatIt = ` [\\(^{${anthropicCi}}\\)](${url})` as const;

            anthropicAgg += text.concat(formatIt);

            chunks.push(text);

            webSearchRes = null;
          } else {
            anthropicAgg += text;
            chunks.push(text);
          }
          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              userId,
              userMsgId,
              provider,
              title,
              model,
              systemPrompt,
              temperature,
              topP,
              chunk: text,
              isThinking: false,
              messageBlocks: currentChunkMessageBlock(),
              thinkingDuration:
                anthropicThinkingDuration > 0
                  ? anthropicThinkingDuration
                  : undefined,
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
            userMsgId,
            temperature,
            topP,
            provider,
            thinkingText:
              anthropicThinkingAgg.length > 0
                ? anthropicThinkingAgg
                : undefined,
            thinkingDuration:
              anthropicThinkingDuration > 0
                ? anthropicThinkingDuration
                : undefined,
            chunk: text,
            isThinking: false,
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

        // — Break inner loop on tool_use to handle PTC continuation
        if (done === "tool_use" && toolAccumulators.size > 0) {
          finalizeActiveBlock();
          break;
        }

        // — Break inner loop on pause_turn (no tool results needed, just continue)
        if (done === "pause_turn") {
          finalizeActiveBlock();
          break;
        }

        // — Finalize on end_turn / max_tokens / stop_sequence / refusal
        // (tool_use and pause_turn already broke out above)
        if (done) {
          finalizeActiveBlock();
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
            chunk: anthropicAgg,
            conversationId,
            done: true,
            title,
            temperature,
            topP,
            provider,
            usage,
            userMsgId,
            userId,

            systemPrompt,
            model,
            responseOutput: JSON.stringify({
              containerId,
              rounds: this.roundRegistry.get(reqMsgId) ?? []
            }),
            messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
            thinkingText:
              anthropicThinkingAgg.length > 0
                ? anthropicThinkingAgg
                : undefined,
            thinkingDuration:
              anthropicThinkingDuration > 0
                ? anthropicThinkingDuration
                : undefined
          });
          ws.send(
            JSON.stringify({
              type: "ai_chat_response",
              conversationId,
              userId,
              usage,
              provider,
              convo: d.convo,
              model,
              userMsgId,
              aiMsgId: d.aiMsgId,
              title,
              systemPrompt,
              temperature,
              topP,
              chunk: anthropicAgg,
              messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
              thinkingText: anthropicThinkingAgg || undefined,
              thinkingDuration:
                anthropicThinkingDuration > 0
                  ? anthropicThinkingDuration
                  : undefined,
              done: true
            } satisfies EventTypeMap["ai_chat_response"])
          );
          void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
            type: "ai_chat_response",
            conversationId,
            userId,
            usage,
            systemPrompt,
            temperature,
            title,
            convo: d.convo,
            userMsgId,
            aiMsgId: d.aiMsgId,
            topP,
            provider,
            messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
            thinkingText: anthropicThinkingAgg || undefined,
            thinkingDuration:
              anthropicThinkingDuration > 0
                ? anthropicThinkingDuration
                : undefined,
            model,
            chunk: anthropicAgg,
            done: true
          });
          void this.redis.del(`stream:state:${conversationId}`);
          this.roundRegistry.delete(reqMsgId);
          return;
        }
      }

      // — Abort the underlying fetch connection so it doesn't linger
      if ("controller" in stream && stream.controller) {
        stream.controller.abort();
      }

      // — Detect empty response (message_start → message_stop with no content)
      // This happens when the API returns HTTP 200 but produces no content blocks
      const isEmptyResponse = done === null && blockBuilders.size === 0;

      if (isEmptyResponse) {
        this.logger.warn(
          {
            round,
            containerId,
            toolAccumulatorsSize: toolAccumulators.size,
            requestId
          },
          "PTC received empty response (no content blocks, no stop_reason)"
        );

        // For continuation rounds (round > 0), an empty response likely means
        // the container state issue or continuation format problem.
        // Break out and let caller handle incomplete response.
        if (round > 0) {
          this.logger.error(
            { round, containerId },
            "PTC continuation returned empty - possible container/format issue"
          );
          this.roundRegistry.delete(reqMsgId);
          break;
        }
      }

      // — Finalize block builders: parse streamed server_tool_use input
      this.finalizeBlockBuilders(blockBuilders);

      // — Build assistant content blocks from finalized builders
      const assistantContentBlocks =
        this.buildAssistantContentBlocks(blockBuilders);

      // — Handle pause_turn: append assistant blocks, continue (no tool_result)
      if (done === "pause_turn") {
        this.logger.info(
          {
            round,
            containerId,
            blockTypes: assistantContentBlocks.map(b => b.type)
          },
          "PTC pause_turn — continuing without tool results"
        );

        // Append to round registry (no tool results for pause_turn)
        const pauseRounds = this.roundRegistry.get(reqMsgId) ?? [];
        pauseRounds.push({
          round,
          requestId: requestId ?? null,
          containerId,
          assistantBlocks: assistantContentBlocks,
          toolResults: []
        });
        this.roundRegistry.set(reqMsgId, pauseRounds);

        params = {
          ...params,
          container: containerId,
          messages: [
            ...params.messages,
            { role: "assistant" as const, content: assistantContentBlocks }
          ]
        } satisfies Anthropic.Beta.Messages.MessageCreateParamsStreaming;

        blockBuilders.clear();
        done = null;
        continue;
      }

      // — Inner stream ended with tool_use. If not, exit outer loop.
      if (done !== "tool_use" || toolAccumulators.size === 0) {
        break;
      }

      // — Execute file_search tools
      const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const acc of toolAccumulators.values()) {
        if (acc.name === "file_search") {
          try {
            const parsed = acc.inputJson
              ? JSON.parse<Record<string, unknown>>(acc.inputJson)
              : {};

            if (!("query" in parsed) || typeof parsed.query !== "string") {
              throw new Error(
                `file_search input missing "query": ${acc.inputJson}`
              );
            }

            const input = {
              query: parsed.query,
              max_results:
                typeof parsed.max_results === "number"
                  ? parsed.max_results
                  : undefined,
              filename:
                typeof parsed.filename === "string"
                  ? parsed.filename.trim() || undefined
                  : undefined,
              search_terms:
                typeof parsed.search_terms === "string"
                  ? parsed.search_terms.trim() || undefined
                  : undefined
            } satisfies FileSearchToolInput;

            const json = await this.executeFileSearch(userId, input);
            this.logger.info(
              { resultLength: json.length },
              "PTC file_search result"
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: acc.id,
              content: json
            });
          } catch (e) {
            this.logger.error(
              { inputJson: acc.inputJson, error: String(e) },
              "PTC file_search execution failed"
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: acc.id,
              content: `file_search error: ${String(e)}`,
              is_error: true
            });
          }
        } else if (acc.name === "conversation_memory_search") {
          try {
            const parsed = acc.inputJson
              ? JSON.parse<Record<string, unknown>>(acc.inputJson)
              : {};
            const json = await this.executeConversationMemorySearch(
              userId,
              conversationId,
              parsed
            );
            this.logger.info(
              { resultLength: json.length },
              "PTC conversation_memory_search result"
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: acc.id,
              content: json
            });
          } catch (e) {
            this.logger.error(
              { inputJson: acc.inputJson, error: String(e) },
              "PTC conversation_memory_search execution failed"
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: acc.id,
              content: `conversation_memory_search error: ${String(e)}`,
              is_error: true
            });
          }
        } else if (acc.name === "tool_catalog") {
          // catalog ships only alongside the full in-house kit (tooling()),
          // so the active list is accurate by construction
          toolResults.push({
            type: "tool_result",
            tool_use_id: acc.id,
            content: this.toolCatalog.buildCatalog("anthropic", [
              "file_search",
              "conversation_memory_search",
              "conversation_memory_get_chunk",
              "tool_catalog"
            ])
          });
        } else if (acc.name === "conversation_memory_get_chunk") {
          try {
            const parsed = acc.inputJson
              ? JSON.parse<Record<string, unknown>>(acc.inputJson)
              : {};
            const json = await this.executeConversationMemoryGetChunk(
              userId,
              parsed
            );
            this.logger.info(
              { resultLength: json.length },
              "PTC conversation_memory_get_chunk result"
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: acc.id,
              content: json
            });
          } catch (e) {
            this.logger.error(
              { inputJson: acc.inputJson, error: String(e) },
              "PTC conversation_memory_get_chunk execution failed"
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: acc.id,
              content: `conversation_memory_get_chunk error: ${String(e)}`,
              is_error: true
            });
          }
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: acc.id,
            content: `Unknown tool: ${acc.name}`,
            is_error: true
          });
        }
      }

      // Append to round registry
      const rounds = this.roundRegistry.get(reqMsgId) ?? [];
      rounds.push({
        round,
        requestId: requestId ?? null,
        containerId,
        assistantBlocks: assistantContentBlocks,
        toolResults
      });
      this.roundRegistry.set(reqMsgId, rounds);

      this.logger.info(
        {
          round,
          toolCount: toolResults.length,
          containerId,
          assistantBlockTypes: assistantContentBlocks.map(b => b.type),
          toolResultIds: toolResults.map(r => r.tool_use_id)
        },
        "PTC tool round complete, sending continuation"
      );

      // — Build continuation params
      params = {
        ...params,
        container: containerId,
        messages: [
          ...params.messages,
          { role: "assistant" as const, content: assistantContentBlocks },
          { role: "user" as const, content: toolResults }
        ]
      } satisfies Anthropic.Beta.Messages.MessageCreateParamsStreaming;

      // — Diagnostic: log exact continuation payload before sending
      this.logger.info(
        {
          round,
          containerId,
          assistantBlocks: JSON.stringify(assistantContentBlocks, null, 2),
          toolResults: JSON.stringify(toolResults, null, 2)
        },
        "PTC continuation payload debug"
      );

      // — Reset per-round state
      toolAccumulators.clear();
      blockBuilders.clear();
      done = null;
    }
  }
}
