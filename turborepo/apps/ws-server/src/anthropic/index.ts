import type { Message } from "@/generated/client/client.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type {
  ContentBlockParam,
  DocumentBlockParam,
  ImageBlockParam,
  MessageParam,
  RawMessageStreamEvent,
  StopReason,
  TextBlockParam
} from "@anthropic-ai/sdk/resources/messages";
import type { Logger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Anthropic } from "@anthropic-ai/sdk";
import { Stream } from "@anthropic-ai/sdk/core/streaming.mjs";
import type {
  AllModelsUnion,
  AnthropicModelIdUnion,
  EventTypeMap
} from "@t3-chat-clone/types";
import { EnhancedRedisPubSub } from "@t3-chat-clone/redis-service";

interface ProviderAnthropicChatRequestEntity extends ProviderChatRequestEntity {
  user_location?: {
    type: "approximate";
    city?: string;
    region?: string;
    country?: string;
    tz?: string;
  };
}
export class AnthropicService {
  private defaultClient: Anthropic;
  private logger: Logger;
  constructor(
    logger: LoggerService,
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private apiKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[anthropic] " }
      );
    this.defaultClient = new Anthropic({
      apiKey: this.apiKey,
      logger: this.logger
    });
  }

  public getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }
    return client;
  }

  private get outputTokensByModel() {
    return {
      "claude-3-haiku-20240307": 4096,
      "claude-3-5-haiku-20241022": 8192,
      "claude-3-5-sonnet-20240620": 8192,
      "claude-3-5-sonnet-20241022": 8192,
      "claude-opus-4-20250514": 32000,
      "claude-opus-4-1-20250805": 32000,
      "claude-sonnet-4-20250514": 64000,
      "claude-3-7-sonnet-20250219": 64000
    } as const satisfies Record<
      AnthropicModelIdUnion,
      4096 | 8192 | 32000 | 64000
    >;
  }

  private getMaxTokens = <const T extends AnthropicModelIdUnion>(model: T) => {
    return this.outputTokensByModel[model];
  };

  public formatAnthropicHistory(
    isNewChat: boolean,
    msgs: Message[],
    userPrompt: string,
    systemPrompt?: string,
    attachments?: ProviderChatRequestEntity["attachments"]
  ) {
    if (!isNewChat) {
      const messages = msgs.map(msg => {
        if (msg.senderType === "USER") {
          // Handle user messages with potential attachments
          const content = Array.of<ContentBlockParam>();
          try {
            // Add image attachments if present
            if (attachments && attachments.length > 0) {
              for (const attachment of attachments) {
                const url = attachment.cdnUrl ?? attachment.sourceUrl;
                if (url && attachment.mime) {
                  if (attachment.mime.includes("application/pdf")) {
                    // Fetch and send as base64-encoded PDF document block
                    // const data = await this.fetchAsBase64(attachment.sourceUrl);
                    const docBlock = {
                      type: "document",
                      source: {
                        type: "url",
                        url
                      }
                    } as const satisfies DocumentBlockParam;
                    content.push(docBlock);
                  } else if (attachment.mime.startsWith("image/")) {
                    // Use URL source for images (works fine with S3 presigned URLs)
                    const imageBlock = {
                      type: "image",
                      source: {
                        type: "url",
                        url
                      }
                    } as const satisfies ImageBlockParam;
                    content.push(imageBlock);
                  }
                }
              }
            }
          } catch (err) {
            this.logger.warn({ err }, "error in anthropic history workup");
          } finally {
            content.push({ type: "text", text: msg.content } as const);
          }

          return {
            role: "user",
            content: content.length > 0 ? content : msg.content
          } as const satisfies MessageParam;
        } else {
          const provider = msg.provider.toLowerCase();
          const model = msg.model ?? "";
          return {
            role: "assistant",
            content: `<model provider="${provider}" name="${model}">\n${msg.content}\n</model>`
          } as const;
        }
      }) satisfies MessageParam[];

      const enhancedSystemPrompt = systemPrompt
        ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context.`
        : "Previous responses in this conversation may be tagged with their source model for context.";

      return {
        messages,
        system: [
          { type: "text", text: enhancedSystemPrompt }
        ] as const satisfies TextBlockParam[]
      };
    } else {
      // Handle new chat with potential attachments
      const content = Array.of<ContentBlockParam>();

      // Add text prompt

      try {
        // Add image attachments if present
        if (attachments && attachments.length > 0) {
          for (const attachment of attachments) {
            const url = attachment.cdnUrl ?? attachment.sourceUrl;
            if (url && attachment.mime) {
              if (attachment.mime.includes("application/pdf")) {
                // Fetch and send as base64-encoded PDF document block
                // const data = await this.fetchAsBase64(attachment.sourceUrl);
                const docBlock = {
                  type: "document",
                  source: {
                    type: "url",
                    url
                  }
                } as const satisfies DocumentBlockParam;
                content.push(docBlock);
              } else if (attachment.mime.startsWith("image/")) {
                const imageBlock = {
                  type: "image",
                  source: {
                    type: "url",
                    url
                  }
                } as const satisfies ImageBlockParam;
                content.push(imageBlock);
              }
            }
          }
        }
      } catch (err) {
        this.logger.warn({ err }, "error in new chat anthropic history workup");
      } finally {
        content.push({ type: "text", text: userPrompt } as const);
      }

      const messages = [
        { role: "user", content: content.length > 1 ? content : userPrompt }
      ] as const satisfies MessageParam[];

      if (systemPrompt) {
        return {
          messages,
          system: [
            { type: "text", text: systemPrompt }
          ] as const satisfies TextBlockParam[]
        };
      } else {
        return {
          messages,
          system: undefined
        };
      }
    }
  }

  private async fetchAsBase64(url: string) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch attachment: ${res.status} ${res.statusText}`
      );
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab).toString("base64");
  }

  private handleMaxTokens(mod: AllModelsUnion, max_tokens?: number) {
    const model = mod as AnthropicModelIdUnion;
    if (max_tokens && max_tokens <= this.getMaxTokens(model)) {
      return max_tokens;
    } else {
      return this.getMaxTokens(model);
    }
  }

  private handleThinking(mod: AllModelsUnion, max_tokens?: number) {
    const model = mod as AnthropicModelIdUnion;
    if (this.handleMaxTokens(mod, max_tokens) >= 1024) {
      return {
        type: "enabled",
        budget_tokens: this.getMaxTokens(model) - 1024
      } as const;
    } else {
      return { type: "disabled" } as const;
    }
  }

  public handleMaxTokensAndThinking(mod: AllModelsUnion, max_tokens?: number) {
    return {
      thinking: this.handleThinking(mod, max_tokens),
      max_tokens: this.handleMaxTokens(mod, max_tokens)
    };
  }

  private webSearchTool(
    user_location: ProviderAnthropicChatRequestEntity["user_location"]
  ) {
    return [
      { type: "web_search_20250305", name: "web_search", user_location }
    ] satisfies Anthropic.Messages.ToolUnion[] | undefined;
  }

  public async handleAnthropicAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    prompt,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    apiKey,
    max_tokens,
    model = "claude-sonnet-4-20250514" satisfies AnthropicModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    user_location,
    attachments
  }: ProviderAnthropicChatRequestEntity) {
    const provider = "anthropic" as const;
    let anthropicThinkingStartTime: number | null = null;
    let anthropicThinkingDuration = 0;
    let anthropicIsCurrentlyThinking = false;
    let anthropicThinkingAgg = "";
    let anthropicAgg = "";
    let anthropicWebsearchToolUse = false;
    let anthropicCi = 0;

    const anthropic = this.getClient(apiKey ?? undefined);

    const { messages, system } = this.formatAnthropicHistory(
      isNewChat,
      msgs,
      prompt,
      systemPrompt,
      attachments
    );

    const { max_tokens: maxTokens, thinking } = this.handleMaxTokensAndThinking(
      model as AllModelsUnion,
      max_tokens
    );

    const tools = this.webSearchTool(user_location);

    const stream = (await anthropic.messages.create(
      {
        max_tokens: maxTokens,
        stream: true,
        thinking,
        top_p: topP,
        temperature,
        system,
        model,
        messages,
        tools
      },
      { stream: true }
    )) satisfies Stream<RawMessageStreamEvent> & {
      _request_id?: string | null;
    };

    for await (const chunk of stream) {
      let text: string | undefined = undefined,
        thinkingText: string | undefined = undefined,
        webSearchRes: Anthropic.WebSearchResultBlock | null = null,
        done: StopReason | null = null;

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
              anthropicWebsearchToolUse = false;
            }
          }
        }
      }
      if (chunk.type === "content_block_delta") {
        if (chunk.delta.type === "thinking_delta") {
          thinkingText = chunk.delta.thinking;

          // Track thinking start
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

          // Track thinking end when switching to regular text
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
      }

      // Handle thinking chunks
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

      // Handle regular text chunks
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
        void this.prisma.handleAiChatResponse({
          chunk: anthropicAgg,
          conversationId,
          done: true,
          title,
          temperature,
          topP,
          provider,
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
            provider,
            model,
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
          systemPrompt,
          temperature,
          title,
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
        // Clear saved state on successful completion
        void this.redis.del(`stream:state:${conversationId}`);
        break;
      }
    }
  }
}
