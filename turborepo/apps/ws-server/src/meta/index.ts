import type {
  MessageSingleton,
  ProviderChatRequestEntity
} from "@/types/index.ts";
import type {
  CompletionMessage,
  MessageImageContentItem,
  MessageTextContentItem,
  SystemMessage,
  UserMessage
} from "llama-api-client/resources/index.mjs";
import type { Logger as PinoLogger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { LlamaAPIClient } from "llama-api-client";
import type { EventTypeMap, MetaModelIdUnion } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

export class LlamaService {
  private defaultClient: LlamaAPIClient;
  private logger: PinoLogger;
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
        { msgPrefix: "[llama] " }
      );
    this.defaultClient = new LlamaAPIClient({
      apiKey: this.apiKey,
      logger: this.logger,
      logLevel: "debug"
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
    }) satisfies (UserMessage | CompletionMessage)[];
  }

  private formatMsgs(
    msgs: readonly (
      | {
          readonly role: "user";
          readonly content:
            | string
            | (MessageTextContentItem | MessageImageContentItem)[];
        }
      | { readonly role: "assistant"; readonly content: string }
    )[],
    systemPrompt?: string
  ) {
    const enhancedSystemPrompt = systemPrompt
      ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.`
      : "Note: Previous responses in this conversation may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";
    if (systemPrompt) {
      return [
        { role: "system", content: enhancedSystemPrompt } as const,
        ...msgs
      ] as const satisfies (SystemMessage | UserMessage | CompletionMessage)[];
    } else {
      return [
        {
          role: "system",
          content: enhancedSystemPrompt
        },
        ...msgs
      ] as const satisfies (SystemMessage | UserMessage | CompletionMessage)[];
    }
  }

  public llamaFormat(
    isNewChat: boolean,
    msgs: ProviderChatRequestEntity["msgs"],
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"]
  ) {
    // Helper to build mixed content parts (text + public image URLs)
    const buildUserContent = (m: MessageSingleton<true>) => {
      const parts: (MessageTextContentItem | MessageImageContentItem)[] = [];
      if (m.attachments?.length > 0) {
        for (const att of m.attachments) {
          const url = att.compatCdnUrl ?? att.cdnUrl ?? att.sourceUrl;
          const mime = att.compatMime ?? att.mime ?? "";
          if (url && mime.startsWith("image/")) {
            parts.push({ type: "image_url", image_url: { url } });
          }
        }
      }
      parts.push({ type: "text", text: m.content });
      return parts;
    };

    if (isNewChat) {
      const first = msgs[0];
      if (!first) {
        return systemPrompt
          ? ([
              { role: "system", content: systemPrompt },
              { role: "user", content: "" }
            ] as const satisfies (
              | SystemMessage
              | UserMessage
              | CompletionMessage
            )[])
          : ([{ role: "user", content: "" }] as const satisfies (
              | SystemMessage
              | UserMessage
              | CompletionMessage
            )[]);
      }
      const parts = buildUserContent(first);
      const userMsg =
        parts.length === 1 && parts[0]?.type === "text"
          ? ({ role: "user", content: parts[0].text } as const)
          : ({ role: "user", content: parts } as const);
      if (systemPrompt) {
        return [
          { role: "system", content: systemPrompt },
          userMsg
        ] as const satisfies (
          | SystemMessage
          | UserMessage
          | CompletionMessage
        )[];
      }
      return [userMsg] as const satisfies (
        | SystemMessage
        | UserMessage
        | CompletionMessage
      )[];
    }

    // Existing chat: include history w/ model tags, and inline images for last user turn
    const last = msgs.at(-1);
    if (last?.senderType === "USER") {
      const history = this.prependProviderModelTag(msgs.slice(0, -1));
      const base = this.formatMsgs(history, systemPrompt);
      const parts = buildUserContent(last);
      const userMsg =
        parts.length === 1 && parts[0]?.type === "text"
          ? ({ role: "user", content: parts[0].text } as const)
          : ({ role: "user", content: parts } as const);
      return [...base, userMsg] as const satisfies (
        | SystemMessage
        | UserMessage
        | CompletionMessage
      )[];
    }

    // If last is assistant or not present, map entire history
    return this.formatMsgs(
      this.prependProviderModelTag(msgs),
      systemPrompt
    ) satisfies (SystemMessage | UserMessage | CompletionMessage)[];
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
        top_p: topP ?? 1.0,
        temperature: temperature ?? 1.0,
        model,
        max_completion_tokens: max_tokens ?? 4096,
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
        await this.prisma.handleAiChatResponse({
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
// codex resume 0199e67c-6d99-72d2-8d2b-6740e7ff818b
