import type { Message } from "@/generated/client/client.ts";
import type { ProviderChatRequestEntity, UserData } from "@/types/index.ts";
import type {
  Blob,
  Content,
  ContentUnion,
  FinishReason,
  GenerateContentResponse
} from "@google/genai";
import { PrismaService } from "@/prisma/index.ts";
import { GoogleGenAI } from "@google/genai";
import type { EventTypeMap, GeminiModelIdUnion } from "@t3-chat-clone/types";
import { EnhancedRedisPubSub } from "@t3-chat-clone/redis-service";

interface ProviderGeminiChatRequestEntity extends ProviderChatRequestEntity {
  userData?: UserData;
}
export class GeminiService {
  private defaultClient: GoogleGenAI;
  constructor(
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private apiKey: string
  ) {
    this.defaultClient = new GoogleGenAI({
      apiKey: this.apiKey,
      apiVersion: "v1alpha"
    });
  }

  public getClient(overrideKey?: string) {
    if (overrideKey) {
      return new GoogleGenAI({ apiKey: overrideKey, apiVersion: "v1alpha" });
    }
    return this.defaultClient;
  }

  private formatHistoryForSession(msgs: Message[]) {
    return msgs.map((msg): Content => {
      if (msg.senderType === "USER") {
        return { role: "user", parts: [{ text: msg.content }] };
      } else {
        // This is an assistant/model message. Prepend context.
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "unknown";
        const modelIdentifier = `[${provider}/${model}]`;
        return {
          role: "model",
          parts: [{ text: `${modelIdentifier}\n${msg.content}` }]
        };
      }
    }) satisfies Content[];
  }

  /**
   * Formats the system prompt with a contextual note for continued conversations.
   */
  private formatSystemInstruction(isNewChat: boolean, systemPrompt?: string) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses in this conversation may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return (
      systemPrompt ? `${systemPrompt}\n\n${note}` : note
    ) satisfies ContentUnion;
  }

  public getHistoryAndInstruction(
    isNewChat: boolean,
    msgs: Message[],
    systemPrompt?: string
  ) {
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );
    if (isNewChat) {
      return {
        history: undefined,
        systemInstruction
      };
    } else {
      const historyMsgs = msgs.slice(0, -1);
      return {
        history: this.formatHistoryForSession(historyMsgs),
        systemInstruction
      };
    }
  }

  private handleLatLng(latlng?: string) {
    const [lat, lng] = latlng
      ? (latlng?.split(",")?.map(p => {
          return Number.parseFloat(p);
        }) as [number, number])
      : [47.7749, -122.4194];
    return [lat, lng] as const;
  }

  public async handleGeminiAiChatRequest({
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
    model = "gemini-2.5-pro" satisfies GeminiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    userData
  }: ProviderGeminiChatRequestEntity) {
    const provider = "gemini" as const;
    const [lat, lng] = this.handleLatLng(userData?.latlng);
    let geminiThinkingStartTime: number | null = null,
      geminiThinkingDuration = 0,
      geminiIsCurrentlyThinking = false,
      geminiThinkingAgg = "",
      geminiAgg = "";

    const { history, systemInstruction } = this.getHistoryAndInstruction(
      isNewChat,
      msgs,
      systemPrompt
    );

    const gemini = this.getClient(apiKey);

    const chat = gemini.chats.create({
      model: model,
      history
    });
    const longitude = lng ?? -122.4194,
      latitude = lat ?? 47.7749;

    const stream = (await chat.sendMessageStream({
      message: prompt,
      config: {
        temperature,
        maxOutputTokens: max_tokens,
        tools: [{ googleSearch: {} }, { urlContext: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude,
              longitude
            }
          }
        },
        topP,
        thinkingConfig: { includeThoughts: true, thinkingBudget: -1 },
        systemInstruction
      }
    })) satisfies AsyncGenerator<GenerateContentResponse>;

    for await (const chunk of stream) {
      let dataPart: Blob | undefined = undefined;
      let textPart: string | undefined = undefined;
      let thinkingPart: string | undefined = undefined;
      let done: keyof typeof FinishReason | undefined = undefined;

      if (chunk.candidates) {
        for (const candidate of chunk.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                if (part.thought) {
                  geminiIsCurrentlyThinking = part.thought;
                  thinkingPart = part.text;
                } else {
                  geminiIsCurrentlyThinking = part.thought ?? false;
                  textPart = part.text;
                }
              }
              if (part.inlineData) {
                dataPart = part.inlineData;
              }
            }
          }

          if (candidate.finishReason) {
            done = candidate.finishReason;
          }
        }
      }
      if (geminiIsCurrentlyThinking && thinkingPart) {
        // Track thinking start time
        if (!geminiIsCurrentlyThinking && geminiThinkingStartTime === null) {
          geminiThinkingStartTime = performance.now();
          geminiIsCurrentlyThinking = true;
        }

        thinkingChunks.push(thinkingPart);
        geminiThinkingAgg += thinkingPart;

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model,
            title,
            systemPrompt,
            isThinking: geminiIsCurrentlyThinking,
            temperature,
            topP,
            provider,
            thinkingDuration: geminiThinkingStartTime
              ? performance.now() - geminiThinkingStartTime
              : undefined,
            thinkingText: thinkingPart,
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
          isThinking: geminiIsCurrentlyThinking,
          thinkingDuration: geminiThinkingStartTime
            ? performance.now() - geminiThinkingStartTime
            : undefined,
          thinkingText: thinkingPart,
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
      if (textPart) {
        // Track thinking end time when transitioning from thinking to regular text
        if (geminiIsCurrentlyThinking && geminiThinkingStartTime !== null) {
          const thinkingEndTime = performance.now();
          geminiThinkingDuration = Math.round(
            thinkingEndTime - geminiThinkingStartTime
          );
          geminiIsCurrentlyThinking = false;
        }

        chunks.push(textPart);
        geminiAgg += textPart;

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model,
            title,
            systemPrompt,
            isThinking: geminiIsCurrentlyThinking,
            temperature,
            topP,
            provider,
            thinkingText: geminiThinkingAgg,
            chunk: textPart,
            thinkingDuration:
              geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
            done: false
          } satisfies EventTypeMap["ai_chat_chunk"])
        );

        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          title,
          isThinking: geminiIsCurrentlyThinking,
          systemPrompt,
          temperature,
          topP,
          thinkingText: geminiThinkingAgg,
          provider,
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
          chunk: textPart,
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
      if (dataPart?.data && dataPart?.mimeType) {
        const _dataUrl =
          `data:${dataPart.mimeType};base64,${dataPart.data}` as const;
        ws.send(
          JSON.stringify({
            type: "ai_chat_inline_data",
            conversationId,
            data: _dataUrl,
            userId,
            done: false,
            model,
            chunk: geminiAgg,
            systemPrompt,
            temperature,
            title,
            topP,
            provider
          } satisfies EventTypeMap["ai_chat_inline_data"])
        );
      }
      if (done) {
        void this.prisma.handleAiChatResponse({
          chunk: geminiAgg,
          conversationId,
          done: true,
          title,
          provider,
          userId,
          systemPrompt,
          temperature,
          topP,
          model,
          thinkingText: geminiThinkingAgg,
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined
        });
        ws.send(
          JSON.stringify({
            type: "ai_chat_response",
            conversationId,
            userId,
            model,
            systemPrompt,
            temperature,
            title,
            topP,
            provider,
            chunk: geminiAgg,
            thinkingText: geminiThinkingAgg,
            thinkingDuration:
              geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
            done: true
          } satisfies EventTypeMap["ai_chat_response"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
          type: "ai_chat_response",
          conversationId,
          userId,
          systemPrompt,
          temperature,
          thinkingDuration: geminiThinkingDuration,
          title,
          topP,
          thinkingText: geminiThinkingAgg,
          provider,
          model,
          chunk: geminiAgg,
          done: true
        });
        // Clear saved state on successful completion
        void this.redis.del(`stream:state:${conversationId}`);
        break;
      }
    }
  }
}
