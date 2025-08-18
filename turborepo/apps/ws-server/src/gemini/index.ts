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
      geminiAgg = "",
      geminiDataPart: Blob | undefined = undefined;

    const { history, systemInstruction } = this.getHistoryAndInstruction(
      isNewChat,
      msgs,
      systemPrompt
    );

    const gemini = this.getClient(apiKey);

    const fullContent = [
      ...(history ?? []),
      { role: "user", parts: [{ text: prompt }] }
    ] as const satisfies Content[];

    const stream = (await gemini.models.generateContentStream({
      contents: fullContent,
      model,
      config: {
        maxOutputTokens: max_tokens,
        toolConfig: {
          retrievalConfig: { latLng: { latitude: lat, longitude: lng } }
        },
        tools: [{ googleSearch: {} }, { urlContext: {} }],
        topP,
        temperature,
        systemInstruction,
        thinkingConfig: { includeThoughts: true, thinkingBudget: -1 }
      }
    })) satisfies AsyncGenerator<GenerateContentResponse>;

    for await (const chunk of stream) {
      let dataPart: Blob | undefined = undefined,
        textPart: string | undefined = undefined,
        thinkingPart: string | undefined = undefined,
        done: keyof typeof FinishReason | undefined = undefined;

      if (chunk.candidates) {
        for (const candidate of chunk.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                if (part.thought) {
                  if (
                    geminiIsCurrentlyThinking === false &&
                    typeof geminiThinkingStartTime !== "number"
                  ) {
                    geminiIsCurrentlyThinking = part.thought;
                    geminiThinkingStartTime = performance.now();
                  }
                  thinkingPart = part.text;
                } else {
                  if (
                    geminiThinkingDuration === 0 &&
                    typeof geminiThinkingStartTime === "number"
                  ) {
                    geminiThinkingDuration = Math.round(
                      performance.now() - geminiThinkingStartTime
                    );
                    geminiIsCurrentlyThinking = part.thought ?? false;
                  }
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
      if (thinkingPart) {
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
            isThinking: true,
            temperature,
            topP,
            provider,
            thinkingDuration: geminiThinkingStartTime
              ? ((start: number) => performance.now() - start)(
                  geminiThinkingStartTime
                )
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
          isThinking: true,
          thinkingDuration: geminiThinkingStartTime
            ? ((start: number) => performance.now() - start)(
                geminiThinkingStartTime
              )
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
            isThinking: false,
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
          isThinking: false,
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
        geminiDataPart = dataPart;
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
          data: geminiDataPart
            ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
            : undefined,
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
            data: geminiDataPart
              ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
              : undefined,
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
          data: geminiDataPart
            ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
            : undefined,
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
