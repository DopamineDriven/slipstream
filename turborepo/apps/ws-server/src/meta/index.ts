import type { MessageSingleton } from "@/types/index.ts";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { PrismaService } from "@/prisma/index.ts";
import { ProviderChatRequestEntity } from "@/types/index.ts";
import { LlamaAPIClient } from "llama-api-client";
import type { EventTypeMap, MetaModelIdUnion } from "@t3-chat-clone/types";
import { EnhancedRedisPubSub } from "@t3-chat-clone/redis-service";

export class LlamaService {
  private defaultClient: LlamaAPIClient;

  constructor(
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private apiKey: string
  ) {
    this.defaultClient = new LlamaAPIClient({
      apiKey: this.apiKey
    });
  }

  public llamaClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }

    return client;
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
    const enhancedSystemPrompt = systemPrompt
      ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.`
      : "Previous responses in this conversation may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";
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

  public llamaFormat(
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

  public async handleMetaAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    thinkingChunks,
    streamChannel,
    userId,
    ws,
    apiKey,
    max_tokens,
    model = "Llama-4-Maverick-17B-128E-Instruct-FP8" satisfies MetaModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "meta" as const;
    let metaAgg = "";
    const client = this.llamaClient(apiKey ?? undefined);
    const stream = await client.chat.completions.create(
      {
        user: userId,
        top_p: topP,
        temperature,
        model,
        max_completion_tokens: max_tokens,
        messages: this.llamaFormat(isNewChat, msgs, systemPrompt),
        stream: true
      },
      { stream: true }
    );

    for await (const chunk of stream) {
      let text: string | undefined = undefined;
      let finish_reason:
        | null
        | "length"
        | "stop"
        | "tool_calls"
        | "content_filter"
        | "function_call" = null;

      if (chunk.event.delta.type === "text") {
        text = chunk.event.delta.text;
      }
      if (chunk.event.event_type === "complete") {
        finish_reason = "stop";
      }

      if (text) {
        chunks.push(text);
        metaAgg += text;
        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            title,
            provider,
            systemPrompt,
            temperature,
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

      if (finish_reason != null) {
        void this.prisma.handleAiChatResponse({
          chunk: metaAgg,
          systemPrompt,
          temperature,
          topP,
          conversationId,
          done: true,
          provider,
          title,
          userId,
          model
        });
        ws.send(
          JSON.stringify({
            type: "ai_chat_response",
            conversationId,
            userId,
            provider,
            systemPrompt,
            title,
            temperature,
            topP,
            model,
            chunk: metaAgg,
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
          model,
          chunk: metaAgg,
          done: true
        });
        // Clear saved state on successful completion
        void this.redis.del(`stream:state:${conversationId}`);
        break;
      }
    }
  }
}
