import type {
  MessageSingleton,
  ProviderChatRequestEntity
} from "@/types/index.ts";
import type { xAIChatCompletionsRes, xAIChoiceActive } from "@/xai/sse.ts";
import { PrismaService } from "@/prisma/index.ts";
import {
  createXAISSEParser,
  isContentDelta,
  isFinishChoice,
  isReasoningDelta,
  isStartDelta
} from "@/xai/sse.ts";
import type { EventTypeMap, GrokModelIdUnion } from "@t3-chat-clone/types";
import { EnhancedRedisPubSub } from "@t3-chat-clone/redis-service";

export class xAIFeatureService {
  private readonly baseUrl = "https://api.x.ai/v1/chat/completions";

  constructor(
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private apiKey?: string
  ) {}

  public async *stream(
    model = "grok-4-0709" satisfies GrokModelIdUnion,
    messages: readonly (
      | {
          role: "user";
          content:
            | string
            | readonly (
                | { type: "text"; text: string }
                | {
                    type: "image_url";
                    image_url: {
                      url: string;
                      detail?: "low" | "medium" | "high";
                    };
                  }
              )[];
        }
      | { role: "system" | "assistant"; content: string }
    )[],
    apiKey?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
    }
  ): AsyncGenerator<xAIChatCompletionsRes, void, unknown> {
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
        `xAI API error (${response.status}, ${response.statusText}): ${errorText}`
      );
    }

    const parser = createXAISSEParser(response);
    for await (const event of parser) {
      yield event.data;
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
    });
  }

  private formatMsgs(
    msgs: readonly (
      | { readonly role: "user"; readonly content: string }
      | { readonly role: "assistant"; readonly content: string }
    )[],
    systemPrompt?: string
  ): readonly (
    | { readonly role: "system"; readonly content: string }
    | { readonly role: "user"; readonly content: string }
    | { readonly role: "assistant"; readonly content: string }
  )[] {
    const basePrompt =
      "Note: previous responses in this conversation may be tagged with their source model in [PROVIDER/MODEL] notation for context.";
    const enhancedSystemPrompt = systemPrompt
      ? `${systemPrompt}\n\n${basePrompt}`
      : basePrompt;
    return [
      { role: "system", content: enhancedSystemPrompt } as const,
      ...msgs
    ] as const;
  }

  public xAiFormat(
    isNewChat: boolean,
    msgs: ProviderChatRequestEntity["msgs"],
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"],
    detail: "low" | "medium" | "high" = "medium"
  ): readonly (
    | { role: "system"; content: string }
    | {
        role: "user";
        content:
          | string
          | readonly (
              | { type: "text"; text: string }
              | {
                  type: "image_url";
                  image_url: {
                    url: string;
                    detail?: "low" | "medium" | "high";
                  };
                }
            )[];
      }
    | { role: "assistant"; content: string }
  )[] {
    // Helper to build content parts from a message's attachments + text
    const buildUserContent = (m: MessageSingleton<true>) => {
      const parts: (
        | { type: "text"; text: string }
        | {
            type: "image_url";
            image_url: { url: string; detail?: "low" | "medium" | "high" };
          }
      )[] = [];
      if (m.attachments && m.attachments.length > 0) {
        for (const att of m.attachments) {
          const url = att.cdnUrl ?? att.sourceUrl;
          if (url && att.mime?.startsWith("image/")) {
            parts.push({ type: "image_url", image_url: { url, detail } });
          }
        }
      }
      parts.push({ type: "text", text: m.content });
      return parts;
    };

    if (isNewChat) {
      const first = msgs[0];
      if (!first) {
        // Fallback: include system prompt if present and an empty user turn
        return systemPrompt
          ? ([
              { role: "system", content: systemPrompt },
              { role: "user", content: "" }
            ] as const)
          : ([{ role: "user", content: "" }] as const);
      }
      const parts = buildUserContent(first);
      const userMsg =
        parts.length === 1 && parts?.[0] && parts?.[0].type === "text"
          ? ({ role: "user", content: parts?.[0]?.text } as const)
          : ({ role: "user", content: parts } as const);
      if (systemPrompt) {
        return [{ role: "system", content: systemPrompt }, userMsg] as const;
      }
      return [userMsg] as const;
    }

    // Existing chat: include history (assistant tags), and for the last
    // user turn, include its attachments inline, if any.
    const last = msgs.at(-1);
    if (last && last.senderType === "USER") {
      const history = this.prependProviderModelTag(msgs.slice(0, -1));
      const base = this.formatMsgs(history, systemPrompt);
      const parts = buildUserContent(last);
      const userMsg =
        parts.length === 1 && parts?.[0] && parts[0].type === "text"
          ? ({ role: "user", content: parts?.[0].text } as const)
          : ({ role: "user", content: parts } as const);
      return [...base, userMsg] as const;
    }

    // If last is assistant or not present, just map entire history
    const formatted = this.formatMsgs(
      this.prependProviderModelTag(msgs),
      systemPrompt
    );
    return formatted;
  }

  public async handleXAIAiChatRequest({
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
    model = "grok-4-0709" satisfies GrokModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "grok" as const;
    let grokThinkingStartTime: number | null = null,
      grokThinkingDuration = 0,
      grokIsCurrentlyThinking = false,
      grokThinkingAgg = "",
      grokAgg = "",
      iThink = 0,
      hasAggregateFinal = false;

    try {
      const streamer = this.stream(
        model as GrokModelIdUnion,
        this.xAiFormat(
          isNewChat,
          msgs,
          systemPrompt,"medium"
        ),
        apiKey ?? undefined,
        { max_tokens, top_p: topP, temperature }
      );

      for await (const chunk of streamer) {
        let text: string | undefined = undefined,
          thinkingText: string | undefined = undefined,
          done: boolean | undefined = undefined,
          finalThinkingChunk = "";

        // Final usage-only chunk
        if ("usage" in chunk && chunk.usage !== undefined) {
          done = true;
        }

        if (chunk.choices) {
          for (const choice of chunk.choices) {
            // Check for finish reason
            if (isFinishChoice(choice)) {
              done = true;
              continue;
            }

            const delta = (choice as xAIChoiceActive).delta;

            // Handle grok-4 initial role-only delta
            if (
              isStartDelta(delta) &&
              !isContentDelta(delta) &&
              !isReasoningDelta(delta)
            ) {
              // grok-4 behavior: initial role only; ignore for content/think
              continue;
            }

            if (isReasoningDelta(delta)) {
              if (typeof grokThinkingStartTime !== "number") {
                grokThinkingStartTime = performance.now();
              }
              if (grokIsCurrentlyThinking === false) {
                grokIsCurrentlyThinking = true;
              }
              thinkingText = delta.reasoning_content;
            }
            if (isContentDelta(delta)) {
              if (grokIsCurrentlyThinking === true && grokThinkingStartTime) {
                grokIsCurrentlyThinking = false;
                const endThinkingTime = performance.now();
                grokThinkingDuration = Math.round(
                  endThinkingTime - grokThinkingStartTime
                );
              }
              text = delta.content;
            }
          }
        }

        // Special handling for grok-code-fast-1 aggregate reasoning behavior (similar to v0)
        if (
          thinkingText &&
          grokIsCurrentlyThinking &&
          (model === "grok-code-fast-1" ||
            model === "grok-3-mini-fast" ||
            model === "grok-3-mini")
        ) {
          iThink++;
          if (
            model === "grok-code-fast-1" &&
            iThink > 3 &&
            Math.abs(grokThinkingAgg.length - thinkingText.length) <= 4 * iThink
          ) {
            hasAggregateFinal = true;
            const prependNew = `\n` + thinkingText;
            finalThinkingChunk =
              grokThinkingAgg.length < prependNew.length
                ? prependNew.substring(grokThinkingAgg.length)
                : "";
          }

          if (hasAggregateFinal) {
            grokThinkingAgg += finalThinkingChunk;
            if (finalThinkingChunk) thinkingChunks.push(finalThinkingChunk);
          } else {
            grokThinkingAgg += thinkingText;
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
              thinkingText: hasAggregateFinal
                ? finalThinkingChunk
                : thinkingText,
              isThinking: grokIsCurrentlyThinking,
              thinkingDuration: grokThinkingStartTime
                ? performance.now() - grokThinkingStartTime
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
            isThinking: grokIsCurrentlyThinking,
            thinkingDuration: grokThinkingStartTime
              ? performance.now() - grokThinkingStartTime
              : undefined,
            thinkingText: hasAggregateFinal ? finalThinkingChunk : thinkingText,
            systemPrompt,
            temperature,
            topP,
            provider,
            chunk: text,
            done: false
          });
        }

        if (text) {
          chunks.push(text);
          grokAgg += text;

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
                grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
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
              grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
            isThinking: false,
            thinkingText: grokThinkingAgg,
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

        if (done) {
          void this.prisma.handleAiChatResponse({
            chunk: grokAgg,
            conversationId,
            done,
            provider,
            title,
            userId,
            model,
            systemPrompt,
            thinkingDuration:
              grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
            thinkingText: grokThinkingAgg,
            temperature,
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
                grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
              thinkingText: grokThinkingAgg,
              title,
              temperature,
              topP,
              model,
              chunk: grokAgg,
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
              grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
            thinkingText: grokThinkingAgg,
            topP,
            provider,
            model,
            chunk: grokAgg,
            done
          });

          // Clear saved state on successful completion
          void this.redis.del(`stream:state:${conversationId}`);
          break;
        }
      }
    } catch (err) {
      // Surface error as stream error
      ws.send(
        JSON.stringify({
          type: "ai_chat_error",
          provider: provider,
          conversationId,
          model,
          systemPrompt,
          temperature,
          topP,
          title,
          userId,
          done: true,
          message: err instanceof Error ? err.message : String(err)
        } satisfies EventTypeMap["ai_chat_error"])
      );
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_error", {
        type: "ai_chat_error",
        provider,
        conversationId,
        model,
        title,
        systemPrompt,
        temperature,
        topP,
        userId,
        done: true,
        message: err instanceof Error ? err.message : String(err)
      });
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
