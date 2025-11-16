import type { ProviderAnthropicChatRequestEntity } from "@/anthropic/types.ts";
import type { Anthropic } from "@anthropic-ai/sdk";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Stream } from "@anthropic-ai/sdk/core/streaming.mjs";
import type { AnthropicModelIdUnion, EventTypeMap } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { AnthropicWorkup } from "./workup.ts";

export class AnthropicService extends AnthropicWorkup {
  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    protected apiKey: string
  ) {
    super(logger, prisma, apiKey);
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
    const keyFingerprint = keyId ?? "server";

    // Use Files API for PDFs
    const { messages, system } = await this.formatAnthropicHistoryWithFiles(
      isNewChat,
      msgs,
      model,
      systemPrompt,
      keyFingerprint,
      keyId ?? undefined,
      apiKey
    );

    const { max_tokens: maxTokens, thinking } = this.handleMaxTokensAndThinking(
      model,
      max_tokens
    );
    this.logger.debug(messages, "[anthropic]: debugging full content");
    /**
     * tools failing on anthropic following bash_tool_20251022 release...
     * Keeping this commented out for now
     */
    const _tools = this.webSearchTool(user_location);

    const betas = this.handleBetaHeaders(model);

    const stream = (await anthropic.beta.messages.create(
      {
        max_tokens: maxTokens,
        stream: true,
        thinking,
        top_p: topP,
        temperature,
        system,
        model,
        metadata: { user_id: userId },
        messages,
        service_tier: "auto",
        betas
      },
      { stream: true }
    )) satisfies Stream<Anthropic.Beta.BetaRawMessageStreamEvent> & {
      _request_id?: string | null;
    };

    for await (const chunk of stream) {
      let text: string | undefined = undefined,
        thinkingText: string | undefined = undefined,
        webSearchRes: Anthropic.Beta.BetaWebSearchResultBlock | null = null,
        done: Anthropic.Beta.BetaStopReason | null = null,
        usage: number | undefined = undefined;

      if (chunk.type === "content_block_start") {
        if (chunk.content_block.type === "server_tool_use") {
          if (anthropicWebsearchToolUse === false) {
            anthropicWebsearchToolUse = true;
          }
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
      }
      if (chunk.type === "content_block_delta") {
        if (chunk.delta.type === "thinking_delta") {
          thinkingText = chunk.delta.thinking;
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
          if (anthropicWebsearchToolUse === true) {
            this.logger.info(
              { chunk_delta_type: "input_json_delta" },
              chunk.delta.partial_json
            );
          }
        }
      } else if (chunk.type === "message_delta") {
        done = chunk.delta.stop_reason;
        if (chunk.usage.input_tokens) usage = chunk.usage.input_tokens;
        if (usage && chunk.usage.output_tokens)
          usage += chunk.usage.output_tokens;
      }
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
        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            provider,
            title,
            model,
            userMsgId,
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
          topP,
          provider,
          thinkingText: thinkingText,
          isThinking: true,
          done: false
        });
      }
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
            anthropicThinkingAgg.length > 0 ? anthropicThinkingAgg : undefined,
          thinkingDuration:
            anthropicThinkingDuration > 0
              ? anthropicThinkingDuration
              : undefined,

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
            anthropicThinkingAgg.length > 0 ? anthropicThinkingAgg : undefined,
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
        break;
      }
    }
  }
}
