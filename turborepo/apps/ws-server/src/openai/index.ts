import type {
  MessageSingleton,
  ProviderChatRequestEntity
} from "@/types/index.ts";
import type { EventTypeMap, OpenAiModelIdUnion } from "@slipstream/types";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import type { Reasoning } from "openai/resources/shared.mjs";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

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
        { msgPrefix: "[openai] " }
      );
    this.defaultClient = new OpenAI({
      logLevel: "info",
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
    }) satisfies ResponseInput;
  }

  private buildInstructions(systemPrompt?: string) {
    return systemPrompt
      ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.`
      : "Previous responses in this conversation may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";
  }

  private buildAttachmentContent(
    attachments?: MessageSingleton<true>["attachments"]
  ) {
    const content = Array.of<
      | {
          type: "input_image";
          image_url: string;
          detail: "auto" | "low" | "high";
        }
      | {
          type: "input_file";
          file_url?: string;
          filename?: string;
          file_id?: string | null;
          file_data?: string;
        }
    >();
    if (!attachments || attachments.length === 0) return content;

    for (const att of attachments) {
      const url = att.cdnUrl ?? att.sourceUrl;
      const mime = att.mime ?? "";
      if (!url || url.length === 0) continue;

      if (mime.startsWith("image/")) {
        content.push({ type: "input_image", image_url: url, detail: "auto" });
      } else {
        content.push({
          type: "input_file",
          file_url: url,
          filename: att.filename ?? undefined
        });
      }
    }
    return content;
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

  public formatOpenAi(isNewChat: boolean, msgs: MessageSingleton<true>[]) {
    if (isNewChat) {
      const first = msgs[0];
      if (!first) {
        return [{ role: "user", content: "" }] as const satisfies ResponseInput;
      }
      const attContent = this.buildAttachmentContent(first.attachments);
      if (attContent.length > 0) {
        return [
          {
            role: "user",
            content: [
              ...attContent,
              { type: "input_text", text: first.content }
            ]
          }
        ] as const satisfies ResponseInput;
      }
      return [
        { role: "user", content: first.content }
      ] as const satisfies ResponseInput;
    } else {
      const history = this.prependProviderModelTag(msgs.slice(0, -1));
      const last = msgs.at(-1);
      if (last && last.senderType === "USER") {
        const attContent = this.buildAttachmentContent(last.attachments);
        if (attContent.length > 0) {
          return [
            ...history,
            {
              role: "user",
              content: [
                ...attContent,
                { type: "input_text", text: last.content }
              ]
            }
          ] as const satisfies ResponseInput;
        } else {
          return [
            ...history,
            { role: "user", content: last.content }
          ] as const satisfies ResponseInput;
        }
      }
      return this.formatMsgs(this.prependProviderModelTag(msgs));
    }
  }

  private openaiReasoning(
    model: OpenAiModelIdUnion,
    effort: Reasoning["effort"] = "low",
    summary: Reasoning["summary"] = "auto"
  ) {
    switch (model) {
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-nano":
      case "o3":
      case "o3-mini":
      case "o3-pro":
      case "o4-mini": {
        return { effort, summary } satisfies Reasoning;
      }
      case "gpt-3.5-turbo":
      case "gpt-3.5-turbo-16k":
      case "gpt-4":
      case "gpt-4-turbo":
      case "gpt-4.1":
      case "gpt-4.1-mini":
      case "gpt-4.1-nano":
      case "gpt-4o":
      case "gpt-4o-mini":
      default: {
        return undefined;
      }
    }
  }

  public async handleOpenaiAiChatRequest({
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
    model = "gpt-5-mini" satisfies OpenAiModelIdUnion,
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
    const reasoning = this.openaiReasoning(model as OpenAiModelIdUnion);
    const responsesStream = await client.responses.create({
      stream: true,
      input: this.formatOpenAi(isNewChat, msgs),
      instructions: this.buildInstructions(systemPrompt),
      store: false,
      model,
      temperature,
      max_output_tokens: max_tokens,
      top_p: topP,
      truncation: "auto",
      ...(reasoning ? { reasoning } : {}),
      parallel_tool_calls: true,
      tools: [
        {
          type: "web_search_preview",
          user_location
        }
      ]
    });

    for await (const s of responsesStream) {
      let text: string | undefined = undefined,
        thinkingText: string | undefined = undefined,
        done = false;
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
