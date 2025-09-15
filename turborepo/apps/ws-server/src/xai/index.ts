import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type {
  MessageParam,
  RawMessageStreamEvent,
  StopReason,
  TextBlockParam,
  WebSearchResultBlock
} from "@anthropic-ai/sdk/resources/messages";
import type {
  AllModelsUnion,
  EventTypeMap,
  GrokModelIdUnion
} from "@slipstream/types";
import { PrismaService } from "@/prisma/index.ts";
import { Anthropic } from "@anthropic-ai/sdk";
import { Stream } from "@anthropic-ai/sdk/core/streaming.mjs";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

export class xAIService {
  private defaultClient: Anthropic;

  constructor(
    private apiKey: string,
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub
  ) {
    this.defaultClient = new Anthropic({
      apiKey: this.apiKey,
      baseURL: "https://api.x.ai",
      defaultHeaders: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });
  }

  public xAIClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({
        apiKey: overrideKey,
        defaultHeaders: {
          Authorization: `Bearer ${overrideKey}`
        }
      });
    }
    return client;
  }

  private get outputTokensByModel() {
    return {
      "grok-4-0709": 256000,
      "grok-2-image-1212": 32768,
      "grok-2-vision-1212": 32768,
      "grok-3-mini": 131072,
      "grok-3": 131072,
      "grok-3-fast": 131072,
      "grok-code-fast-1": 256000,
      "grok-3-mini-fast": 131072
    } as const satisfies Record<GrokModelIdUnion, 256000 | 131072 | 32768>;
  }

  private getMaxTokens = <const T extends GrokModelIdUnion>(model: T) => {
    return this.outputTokensByModel[model];
  };

  public xAiFormatHistory(
    isNewChat: boolean,
    msgs: ProviderChatRequestEntity["msgs"],
    systemPrompt?: string
  ) {
    if (!isNewChat) {
      const messages = msgs.map(msg => {
        if (msg.senderType === "USER") {
          return { role: "user", content: msg.content } as const;
        } else {
          const provider = msg.provider.toLowerCase();
          const model = msg.model ?? "";
          const tag = `[${provider}/${model}]`;
          return {
            role: "assistant",
            content: `${tag}\n\n${msg.content}`
          } as const;
        }
      }) satisfies MessageParam[];

      const enhancedSystemPrompt = systemPrompt
        ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model in [PROVIDER/MODEL] notation for context.`
        : "Previous responses in this conversation may be tagged with their source model in [PROVIDER/MODEL] notation for context.";

      return {
        messages,
        system: [
          { type: "text", text: enhancedSystemPrompt }
        ] as const satisfies TextBlockParam[]
      };
    } else {
      const first = msgs[0];
      const messages = [
        { role: "user", content: first ? first.content : "" }
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

  private handleMaxTokens(mod: AllModelsUnion, max_tokens?: number) {
    const model = mod as GrokModelIdUnion;
    if (max_tokens && max_tokens <= this.getMaxTokens(model)) {
      return max_tokens;
    } else {
      return this.getMaxTokens(model);
    }
  }

  private handleThinking(mod: AllModelsUnion, max_tokens?: number) {
    const model = mod as GrokModelIdUnion;
    if (
      this.handleMaxTokens(mod, max_tokens) >= 1024 &&
      model !== "grok-2-image-1212" &&
      model !== "grok-3" &&
      model !== "grok-3-fast" &&
      model !== "grok-2-vision-1212"
    ) {
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

  public async handleGrokAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    apiKey,
    max_tokens,
    model = "grok-4-0709",
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "grok" as const;
    let xAiThinkingStartTime: number | null = null,
      xAiThinkingDuration = 0,
      xAiIsCurrentlyThinking = false,
      xAiThinkingAgg = "",
      xaiAgg = "";

    const xAi = this.xAIClient(apiKey ?? undefined);

    const { messages, system } = this.xAiFormatHistory(
      isNewChat,
      msgs,
      systemPrompt
    );

    const { max_tokens: max_tokes, thinking } = this.handleMaxTokensAndThinking(
      (model ?? "grok-4-0709") as AllModelsUnion,
      max_tokens
    );

    const stream = (await xAi.messages.create(
      {
        max_tokens: max_tokes,
        stream: true,
        thinking,
        top_p: topP,
        temperature,
        system,
        model,
        messages
      },
      { stream: true }
    )) satisfies Stream<RawMessageStreamEvent> & {
      _request_id?: string | null;
    };

    for await (const chunk of stream) {
      let text: string | undefined = undefined;
      let thinkingText: string | undefined = undefined;
      let done: StopReason | null = null;
      if (chunk.type === "content_block_start") {
        if (chunk.content_block.type === "web_search_tool_result") {
          if ("error" in chunk.content_block.content) {
            console.log(chunk.content_block.content);
          }
          (chunk.content_block.content as WebSearchResultBlock[]).map(v => {
            text = `[${v.title}](${v.url})`;
          });
        }
      }
      if (chunk.type === "content_block_delta") {
        if (chunk.delta.type === "thinking_delta") {
          thinkingText = chunk.delta.thinking;

          // Track thinking start
          if (!xAiIsCurrentlyThinking && xAiThinkingStartTime === null) {
            xAiThinkingStartTime = performance.now();
            xAiIsCurrentlyThinking = true;
          }
        }
        if (chunk.delta.type === "text_delta") {
          text = chunk.delta.text;

          // Track thinking end when switching to regular text
          if (xAiIsCurrentlyThinking && xAiThinkingStartTime !== null) {
            const endTime = performance.now();
            xAiThinkingDuration = Math.round(endTime - xAiThinkingStartTime);
            xAiIsCurrentlyThinking = false;
          }
        }
        if (chunk.delta.type === "citations_delta") {
          console.log(chunk.delta.citation);
        }
      } else if (chunk.type === "message_delta") {
        done = chunk.delta.stop_reason;
      }

      // Handle thinking chunks
      if (thinkingText) {
        xAiThinkingAgg += thinkingText;
        thinkingChunks.push(thinkingText);

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
            thinkingDuration: xAiThinkingStartTime
              ? performance.now() - xAiThinkingStartTime
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
          thinkingDuration: xAiThinkingStartTime
            ? performance.now() - xAiThinkingStartTime
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
        xaiAgg += text;
        chunks.push(text);
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
            isThinking: xAiIsCurrentlyThinking,
            thinkingDuration:
              xAiThinkingDuration > 0 ? xAiThinkingDuration : undefined,
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
          isThinking: xAiIsCurrentlyThinking,
          topP,
          provider,
          thinkingText: xAiThinkingAgg.length > 0 ? xAiThinkingAgg : undefined,
          thinkingDuration:
            xAiThinkingDuration > 0 ? xAiThinkingDuration : undefined,

          chunk: text,
          done: false
        });
        if (thinkingChunks.length % 10 === 0) {
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
          chunk: xaiAgg,
          conversationId,
          done: true,
          title,
          temperature,
          topP,
          provider,
          userId,
          systemPrompt,
          model,
          thinkingText: xAiThinkingAgg.length > 0 ? xAiThinkingAgg : undefined,
          thinkingDuration:
            xAiThinkingDuration > 0 ? xAiThinkingDuration : undefined
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
            chunk: xaiAgg,
            thinkingText: xAiThinkingAgg || undefined,
            thinkingDuration:
              xAiThinkingDuration > 0 ? xAiThinkingDuration : undefined,
            done: true
          } satisfies EventTypeMap["ai_chat_response"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
          type: "ai_chat_response",
          conversationId,
          userId,
          systemPrompt,
          temperature,
          thinkingText: xAiThinkingAgg,
          thinkingDuration: xAiThinkingDuration,
          title,
          topP,
          provider,
          model,
          chunk: xaiAgg,
          done: true
        });
        // Clear saved state on successful completion
        void this.redis.del(`stream:state:${conversationId}`);
        break;
      }
    }
  }
}
