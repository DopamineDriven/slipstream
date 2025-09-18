import type {
  MessageSingleton,
  ProviderChatRequestEntity
} from "@/types/index.ts";
import type { v0ChatCompletionsRes, v0Usage } from "@/vercel/sse.ts";
import type { EventTypeMap, VercelModelIdUnion } from "@slipstream/types";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { PrismaService } from "@/prisma/index.ts";
import { createV0SSEParser, isReasoningDelta } from "@/vercel/sse.ts";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

export class v0Service {
  private readonly baseUrl = "https://api.v0.dev/v1/chat/completions";
  constructor(
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private apiKey?: string
  ) {}

  public async *stream(
    model = "v0-1.5-md" satisfies VercelModelIdUnion,
    messages: readonly ChatCompletionMessageParam[],
    apiKey?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
    }
  ): AsyncGenerator<v0ChatCompletionsRes, void, unknown> {
    const key = apiKey ?? this.apiKey;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...(options && {
          temperature: options.temperature,
          top_p: options.top_p,
          max_tokens: options.max_tokens
        })
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Vercel v0 API error (${response.status}, ${response.statusText}): ${errorText}`
      );
    }

    const parser = createV0SSEParser(response);

    // Track if we've started outputting content (vs reasoning)

    for await (const event of parser) {
      const chunk = event.data;

      // Check if stream is complete (empty choices array with usage stats)
      if (chunk.choices?.length === 0 && chunk.usage) {
        // Yield final chunk with usage stats
        yield {
          created: event.data.created,
          id: event.data.id,
          model: event.data.model,
          object: event.data.object,
          service_tier: event.data.service_tier,
          system_fingerprint: event.data.system_fingerprint,
          choices: [],
          usage: chunk.usage
        };
        return; // Stream finished
      }

      // Process active chunks with content
      if (chunk.choices && chunk.choices.length > 0) {
        const transformedChunk = {
          choices: chunk.choices.map(choice => {
            if (isReasoningDelta(choice.delta)) {
              return {
                delta: { reasoning_content: choice.delta.reasoning_content },
                index: choice.index,
                logprobs: choice.logprobs,
                finish_reason: null
              };
            } else {
              return {
                delta: { content: choice.delta.content },
                index: choice.index,
                logprobs: choice.logprobs,
                finish_reason: null
              };
            }
          }),
          created: event.data.created,
          id: event.data.id,
          model: event.data.model,
          object: event.data.object,
          service_tier: event.data.service_tier,
          system_fingerprint: event.data.system_fingerprint,
          usage: undefined
        };

        yield transformedChunk;
      }
    }
  }

  private prependProviderModelTag(
    msgs: Pick<
      MessageSingleton<true>,
      "senderType" | "provider" | "model" | "content"
    >[]
  ) {
    return msgs.map(msg => {
      if (msg.senderType === "USER") {
        return { role: "user", content: msg.content } as const;
      } else {
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "";
        const modelIdentifier = `[${provider}/${model}]`;
        return {
          role: "assistant",
          content: `${modelIdentifier} \n` + msg.content
        } as const;
      }
    }) satisfies ChatCompletionMessageParam[];
  }

  private formatMsgs(
    msgs: (
      | {
          readonly role: "user";
          readonly content: string;
        }
      | {
          readonly role: "assistant";
          readonly content: string;
        }
    )[],
    systemPrompt?: string
  ) {
    const basePrompt = `You are a knowledgeable full-stack expert; **without using any tools** provide assistance by outputting formatted code blocks into chat; tools such as QuickEdit are not to be used and are unnecessary for this.\n\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.`;
    const enhancedSystemPrompt = systemPrompt
      ? `${systemPrompt}\n\n${basePrompt}`
      : basePrompt;
    if (systemPrompt) {
      return [
        { role: "system", content: enhancedSystemPrompt } as const,
        ...msgs
      ] as const satisfies ChatCompletionMessageParam[];
    } else {
      return [
        {
          role: "system",
          content: enhancedSystemPrompt
        },
        ...msgs
      ] as const satisfies ChatCompletionMessageParam[];
    }
  }

  public v0Format(
    isNewChat: boolean,
    msgs: ProviderChatRequestEntity["msgs"],
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"]
  ) {
    if (isNewChat) {
      const first = msgs[0];
      const userContent = first ? first.content : "";
      if (systemPrompt) {
        return [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ] as const satisfies ChatCompletionMessageParam[];
      } else {
        return [
          { role: "user", content: userContent }
        ] as const satisfies ChatCompletionMessageParam[];
      }
    } else {
      return this.formatMsgs(
        this.prependProviderModelTag(msgs),
        systemPrompt
      ) satisfies ChatCompletionMessageParam[];
    }
  }

  public async handleV0AiChatRequest({
    chunks,
    conversationId,
    streamChannel,
    msgs,
    thinkingChunks,
    apiKey,
    ws,
    userId,
    isNewChat,
    max_tokens,
    model,
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "vercel" as const;
    let v0ThinkingStartTime: number | null = null,
      v0ThinkingDuration = 0,
      v0IsCurrentlyThinking = false,
      v0ThinkingAgg = "",
      v0Agg = "",
      iThink = 0,
      v0HasThinkingAggregateFinal = false;

    const streamer = this.stream(
      model,
      this.v0Format(isNewChat, msgs, systemPrompt),
      apiKey ?? undefined,
      { max_tokens, top_p: topP, temperature }
    );

    for await (const chunk of streamer) {
      // Process each choice in the chunk
      let text: string | undefined = undefined,
        thinkingText: string | undefined = undefined,
        done: boolean | undefined = undefined,
        usage: v0Usage | undefined = undefined,
        finalThinkingChunk = "";
      // usage only appears in the very last chunk streamed in
      if ("usage" in chunk && typeof chunk.usage !== "undefined") {
        done = true;
        usage = chunk.usage;
      }

      if (chunk?.choices) {
        for (const choice of chunk.choices) {
          if (
            "reasoning_content" in choice.delta &&
            typeof choice.delta.reasoning_content !== "undefined"
          ) {
            if (typeof v0ThinkingStartTime !== "number") {
              v0ThinkingStartTime = performance.now();
            }
            if (v0IsCurrentlyThinking === false) {
              v0IsCurrentlyThinking = true;
            }
            thinkingText = choice.delta.reasoning_content;
          }
          if (
            "content" in choice.delta &&
            typeof choice.delta.content !== "undefined"
          ) {
            if (v0IsCurrentlyThinking === true && v0ThinkingStartTime) {
              v0IsCurrentlyThinking = false;
              const endThinkingTime = performance.now();
              v0ThinkingDuration = Math.round(
                endThinkingTime - v0ThinkingStartTime
              );
            }
            text = choice.delta.content;
          }
        }
      }
      if (thinkingText && v0IsCurrentlyThinking) {
        iThink++;
        if (
          iThink > 3 &&
          Math.abs(v0ThinkingAgg.length - thinkingText.length) <= 4 * iThink
        ) {
          v0HasThinkingAggregateFinal = true;
          const prependNew = `\n` + thinkingText;
          finalThinkingChunk =
            v0ThinkingAgg.length < prependNew.length
              ? prependNew.substring(v0ThinkingAgg.length)
              : "";
        }
        if (v0HasThinkingAggregateFinal) {
          v0ThinkingAgg += finalThinkingChunk;
          thinkingChunks.push(finalThinkingChunk);
        } else {
          v0ThinkingAgg += thinkingText;
          thinkingChunks.push(thinkingText);
        }
        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            title,
            provider,
            systemPrompt,
            temperature,
            thinkingText: v0HasThinkingAggregateFinal
              ? finalThinkingChunk
              : thinkingText,
            isThinking: v0IsCurrentlyThinking,
            thinkingDuration: v0ThinkingStartTime
              ? performance.now() - v0ThinkingStartTime
              : undefined,
            topP,
            model,
            done: false
          } satisfies EventTypeMap["ai_chat_chunk"])
        );

        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          title,
          isThinking: v0IsCurrentlyThinking,
          thinkingDuration: v0ThinkingStartTime
            ? performance.now() - v0ThinkingStartTime
            : undefined,
          thinkingText: v0HasThinkingAggregateFinal
            ? finalThinkingChunk
            : thinkingText,
          systemPrompt,
          temperature,
          topP,
          provider,
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
      if (text) {
        chunks.push(text);
        v0Agg += text;

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            title,
            provider,
            systemPrompt,
            temperature,
            thinkingDuration:
              v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
            isThinking: false,
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
          model,
          title,
          thinkingDuration:
            v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
          isThinking: false,
          thinkingText: v0ThinkingAgg,
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

      // Check if stream is finished
      if (done) {
        await this.prisma.handleAiChatResponse({
          chunk: v0Agg,
          conversationId,
          done,
          provider,
          title,
          userId,
          model,
          systemPrompt,
          thinkingDuration:
            v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
          thinkingText: v0ThinkingAgg,
          temperature,
          usage: usage?.total_tokens,
          topP
        });

        ws.send(
          JSON.stringify({
            type: "ai_chat_response",
            conversationId,
            userId,
            provider,
            systemPrompt,
            thinkingDuration:
              v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
            thinkingText: v0ThinkingAgg,
            title,
            temperature,
            topP,
            model,
            usage: usage?.total_tokens,
            chunk: v0Agg,
            done
          } satisfies EventTypeMap["ai_chat_response"])
        );

        void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
          type: "ai_chat_response",
          conversationId,
          userId,
          systemPrompt,
          temperature,
          title,
          thinkingDuration:
            v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
          thinkingText: v0ThinkingAgg,
          topP,
          usage: usage?.total_tokens,
          provider,
          model,
          chunk: v0Agg,
          done
        });

        // Clear saved state on successful completion
        void this.redis.del(`stream:state:${conversationId}`);
        break;
      }
    }
  }
}
