import type {
  BlockBuilder,
  CreateMessageStreamRT,
  FileSearchToolInput,
  ProviderAnthropicChatRequestEntity,
  ToolUseAccumulator
} from "@/anthropic/types.ts";
import type { Anthropic } from "@anthropic-ai/sdk";
import { AnthropicVectorStoreWorkup } from "@/anthropic/vector-store.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { VoyageEmbeddingService } from "@/voyage/index.ts";
import type { AnthropicModelIdUnion, EventTypeMap,UnionToRecord } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
type BetaRawMessageStreamRecord = UnionToRecord<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
export class AnthropicService extends AnthropicVectorStoreWorkup {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    voyage: VoyageEmbeddingService,
    private redis: EnhancedRedisPubSub,
    apiKey: string
  ) {
    super(logger, voyage, prisma, apiKey);
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
    const model = m as AnthropicModelIdUnion;
    const provider = "anthropic" as const;
    let anthropicThinkingStartTime: number | null = null,
      anthropicThinkingDuration = 0,
      anthropicIsCurrentlyThinking = false,
      anthropicThinkingAgg = "",
      anthropicAgg = "",
      anthropicWebsearchToolUse = false,
      anthropicCi = 0;

    const anthropic = this.getClient(apiKey ?? undefined);

    let { params } = await this.createStreamWorkup({
      isNewChat,
      msgs,
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

    const options = { stream: true } as const;

    // PTC state
    const toolAccumulators = new Map<number, ToolUseAccumulator>();
    let containerId: string | undefined;
    const assistantContentBlocks =
      Array.of<Anthropic.Beta.BetaContentBlockParam>();
    const blockBuilders = new Map<number, BlockBuilder>();

    const MAX_TOOL_ROUNDS = 8;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = (await anthropic.beta.messages.create(
        params,
        options
      )) satisfies CreateMessageStreamRT;

      let done: Anthropic.Beta.BetaStopReason | null = null;
      let usage: number | undefined = undefined;

      for await (const chunk of stream) {
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
            bb.input = chunk.content_block.input;
          }

          if (chunk.content_block.type === "tool_use") {
            bb.id = chunk.content_block.id;
            bb.name = chunk.content_block.name;
            bb.inputJson = "";
            if (
              "caller" in chunk.content_block &&
              chunk.content_block.caller?.type === "code_execution_20250825"
            ) {
              bb.caller = chunk.content_block.caller;
              toolAccumulators.set(chunk.index, {
                id: chunk.content_block.id,
                name: chunk.content_block.name,
                inputJson: "",
                callerType: "code_execution_20250825",
                callerToolId: chunk.content_block.caller.tool_id
              });
            }
          }

          if (chunk.content_block.type === "text") {
            bb.text = "";
          }

          if (chunk.content_block.type === "thinking") {
            bb.thinking = "";
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

          blockBuilders.set(chunk.index, bb);
        }

        if (chunk.type === "content_block_delta") {
          const bb = blockBuilders.get(chunk.index);

          if (chunk.delta.type === "thinking_delta") {
            thinkingText = chunk.delta.thinking;
            if (bb) bb.thinking = (bb.thinking ?? "") + chunk.delta.thinking;
            if (
              !anthropicIsCurrentlyThinking &&
              anthropicThinkingStartTime === null
            ) {
              anthropicThinkingStartTime = performance.now();
              anthropicIsCurrentlyThinking = true;
            }
          }
          if (chunk.delta.type === "text_delta") {
            text = chunk.delta.text;
            if (bb) bb.text = (bb.text ?? "") + chunk.delta.text;
            if (
              anthropicIsCurrentlyThinking &&
              anthropicThinkingStartTime !== null
            ) {
              const endTime = performance.now();
              anthropicThinkingDuration = Math.round(
                endTime - anthropicThinkingStartTime
              );
              anthropicIsCurrentlyThinking = false;
            }
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
          if (
            "container" in chunk.message &&
            chunk.message.container &&
            typeof chunk.message.container === "object" &&
            "id" in chunk.message.container
          ) {
            containerId = chunk.message.container.id as string;
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
              thinkingDuration: anthropicThinkingStartTime
                ? performance.now() - anthropicThinkingStartTime
                : undefined,
              isThinking: true,
              done: false
            } satisfies EventTypeMap["ai_chat_chunk"])
          );

          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            userMsgId,
            model,
            thinkingDuration: anthropicThinkingStartTime
              ? performance.now() - anthropicThinkingStartTime
              : undefined,
            title,
            systemPrompt,
            temperature,
            chunk: text,
            topP,
            provider,
            thinkingText: thinkingText,
            isThinking: true,
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
              isThinking: anthropicIsCurrentlyThinking,
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
            isThinking: anthropicIsCurrentlyThinking,
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
          break;
        }

        // — Finalize on end_turn / max_tokens / stop_sequence (non-tool stop reasons)
        if (done && done !== "tool_use" && done !== "pause_turn") {
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
              model,
              userMsgId,
              aiMsgId: d.aiMsgId,
              title,
              systemPrompt,
              temperature,
              topP,
              chunk: anthropicAgg,
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
            userMsgId,
            aiMsgId: d.aiMsgId,
            topP,
            provider,
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
          return;
        }
      }
      // — Inner stream ended. If not tool_use, exit outer loop.
      if (done !== "tool_use" || toolAccumulators.size === 0) {
        break;
      }

      // — Convert block builders to assistant content blocks for continuation
      for (const [, bb] of blockBuilders) {
        if (bb.type === "text") {
          assistantContentBlocks.push({
            type: "text",
            text: bb.text ?? ""
          } satisfies Anthropic.Beta.BetaTextBlockParam);
        }
        if (bb.type === "thinking" && bb.signature) {
          assistantContentBlocks.push({
            type: "thinking",
            thinking: bb.thinking ?? "",
            signature: bb.signature
          } satisfies Anthropic.Beta.BetaThinkingBlockParam);
        }
        if (bb.type === "server_tool_use" && bb.id && bb.name) {
          const name =
            bb.name as Anthropic.Beta.BetaServerToolUseBlockParam["name"];
          assistantContentBlocks.push({
            type: "server_tool_use",
            id: bb.id,
            name,
            input: bb.input
          } satisfies Anthropic.Beta.BetaServerToolUseBlockParam);
        }
        if (bb.type === "tool_use" && bb.id && bb.name) {
          const toolBlock: Anthropic.Beta.BetaToolUseBlockParam = {
            type: "tool_use",
            id: bb.id,
            name: bb.name,
            input: JSON.parse<unknown>(bb.inputJson ?? "{}"),
            caller: bb.caller
          };
          assistantContentBlocks.push(toolBlock);
        }
      }

      // — Execute file_search tools
      const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const acc of toolAccumulators.values()) {
        if (acc.name === "file_search") {
          const input = JSON.parse<FileSearchToolInput>(acc.inputJson ?? "{}");
          const json = await this.executeFileSearch(userId, input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: acc.id,
            content: json
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: acc.id,
            content: `Unknown tool: ${acc.name}`,
            is_error: true
          });
        }
      }

      this.logger.info(
        { round, toolCount: toolResults.length, containerId },
        "PTC tool round complete, sending continuation"
      );

      // — Build continuation params
      params = {
        ...params,
        container: containerId,
        messages: [
          ...params.messages,
          { role: "assistant", content: assistantContentBlocks },
          { role: "user", content: toolResults }
        ]
      } as typeof params;

      // — Reset per-round state
      toolAccumulators.clear();
      blockBuilders.clear();
      assistantContentBlocks.length = 0;
    }
  }
}
