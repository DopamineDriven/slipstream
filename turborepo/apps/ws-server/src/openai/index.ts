import type { Message } from "@/generated/client/client.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import { OpenAI } from "openai";
import { PrismaService } from "@/prisma/index.ts";
import type { EventTypeMap } from "@t3-chat-clone/types";
import { EnhancedRedisPubSub } from "@t3-chat-clone/redis-service";

export interface ProviderOpenaiRequestEntity extends ProviderChatRequestEntity {
  user_location?: {
    type: "approximate";
    city?: string;
    region?: string;
    country?: string;
    tz?: string;
  };
}

export class OpenAIService {
  private defaultClient: OpenAI;

  constructor(
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private apiKey: string
  ) {
    this.defaultClient = new OpenAI({ apiKey: this.apiKey });
  }

  public getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }

    return client;
  }

  private prependProviderModelTag(msgs: Message[]) {
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
    }) satisfies ResponseInput;
  }

  public buildInstructions(systemPrompt?: string) {
    return systemPrompt
      ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.`
      : "Previous responses in this conversation may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";
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
    )[]
  ) {
    return [...msgs] as const satisfies ResponseInput;
  }

  public formatOpenAi(isNewChat: boolean, msgs: Message[], userPrompt: string) {
    if (isNewChat) {
      return [
        { role: "user", content: userPrompt }
      ] as const satisfies ResponseInput;
    } else {
      return this.formatMsgs(
        this.prependProviderModelTag(msgs)
      ) satisfies ResponseInput;
    }
  }

  public async handleOpenaiAiChatRequest({
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
    model = "gpt-5-mini",
    systemPrompt,
    temperature,
    title,
    topP,
    user_location
  }: ProviderOpenaiRequestEntity) {
    const provider = "openai" as const;
    let openaiThinkingStartTime: number | null = null,
      openaiThinkingDuration = 0,
      openaiIsCurrentlyThinking = false,
      openaiThinkingAgg = "",
      openaiAgg = "";

    const client = this.getClient(apiKey ?? undefined);

    const responsesStream = await client.responses.create({
      stream: true,
      input: this.formatOpenAi(isNewChat, msgs, prompt),
      instructions: this.buildInstructions(systemPrompt),
      store: false,
      model,
      temperature,
      max_output_tokens: max_tokens,
      top_p: topP,
      truncation: "auto",
      parallel_tool_calls: true,
      tools: [
        {
          type: "web_search_preview",
          user_location
        }
      ]
    });

    for await (const s of responsesStream) {
      let text: string | undefined = undefined;
      let thinkingText: string | undefined = undefined;
      let done = false;
      // s.type as ResponseStreamEvent['type'];
      if (
        s.type === "response.reasoning_text.delta" ||
        s.type === "response.reasoning_summary_text.delta"
      ) {
        if (!openaiIsCurrentlyThinking && openaiThinkingStartTime === null) {
          openaiIsCurrentlyThinking = true;
          openaiThinkingStartTime = performance.now();
        }

        thinkingText = s.delta;
      }
      if (
        (s.type === "response.reasoning_summary_text.done" ||
          s.type === "response.reasoning_text.done") &&
        openaiIsCurrentlyThinking &&
        openaiThinkingStartTime !== null
      ) {
        openaiIsCurrentlyThinking = false;
        openaiThinkingDuration = Math.round(
          performance.now() - openaiThinkingStartTime
        );
      }
      if (s.type === "response.output_text.delta") {
        text = s.delta;
      }
      if (s.type === "response.output_text.done") {
        done = true;
      }

      if (thinkingText) {
        openaiThinkingAgg += thinkingText;
        thinkingChunks.push(thinkingText);

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            done: false,
            userId,
            model,
            provider,
            systemPrompt,
            temperature,
            title,
            topP,
            thinkingText: thinkingText,
            thinkingDuration: openaiThinkingStartTime
              ? performance.now() - openaiThinkingStartTime
              : undefined,
            isThinking: true
          } satisfies EventTypeMap["ai_chat_chunk"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          thinkingDuration: openaiThinkingStartTime
            ? performance.now() - openaiThinkingStartTime
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
      } // Handle regular text chunks
      if (text) {
        openaiAgg += text;
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
            isThinking: openaiIsCurrentlyThinking,
            thinkingText:
              openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
            thinkingDuration:
              openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,
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
          isThinking: openaiIsCurrentlyThinking,
          provider,
          thinkingText:
            openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
          thinkingDuration:
            openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,

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
          chunk: openaiAgg,
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
            openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
          thinkingDuration:
            openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined
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
            chunk: openaiAgg,
            thinkingText:
              openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
            thinkingDuration:
              openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,
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
          thinkingText:
            openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
          thinkingDuration:
            openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined,
          topP,
          provider,
          model,
          chunk: openaiAgg,
          done: true
        });
        // Clear saved state on successful completion
        void this.redis.del(`stream:state:${conversationId}`);
        break;
      }
    }
  }
}
