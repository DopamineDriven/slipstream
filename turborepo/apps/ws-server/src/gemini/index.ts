import { resolve } from "node:path";
import type { Message } from "@/generated/client/client.ts";
import type { ProviderChatRequestEntity, UserData } from "@/types/index.ts";
import type {
  Blob,
  Content,
  ContentUnion,
  FinishReason,
  GenerateContentResponse,
  Part
} from "@google/genai";
import type { Logger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { GoogleGenAI } from "@google/genai";
import type { EventTypeMap, GeminiModelIdUnion } from "@t3-chat-clone/types";
import { EnhancedRedisPubSub } from "@t3-chat-clone/redis-service";

interface ProviderGeminiChatRequestEntity extends ProviderChatRequestEntity {
  userData?: UserData;
}
export class GeminiService {
  private defaultClient: GoogleGenAI;
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
        { msgPrefix: "[gemini] " }
      );
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

  private handleNumBigIntUnion(size: number | bigint) {
    return typeof size === "bigint" ? 10n * 1024n * 1024n : 10 * 1024 * 1024;
  }

  public async fetchAssetForGenAI(
    url: string,
    knownSizeBytes: number | bigint,
    mime: string | null
  ) {
    const TEN_MB = this.handleNumBigIntUnion(knownSizeBytes);

    const mimeType = mime ?? "application/octet-stream";

    const response = await fetch(url, { method: "GET" });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch asset: ${response.statusText}`);
    }

    let buffer: Buffer;

    if (knownSizeBytes < TEN_MB) {
      // For smaller files, buffer them into memory directly.
      buffer = await this.streamToBuffer(response.body);
    } else {
      // For larger files, this approach is still memory-efficient.
      // The logic is the same, but you could add progress indicators here if needed.
      buffer = await this.streamToBuffer(response.body);
    }

    return { buffer, mimeType };
  }

  public async uploadRemoteAssetToGoogle(
    url: string,
    mimeType: string | null,
    filename: string | null,
    apiKey?: string
  ) {
    try {
      // 1. Fetch the remote file and get its buffer
      const response = await fetch(url, { method: "GET" });
      if (!response.ok || !response.body) {
        throw new Error(
          `Failed to fetch asset from ${url}: ${response.statusText}`
        );
      }
      const buffer = await this.streamToBuffer(response.body);

      // 2. Upload the buffer to Google's File API
      // The SDK handles streaming the buffer efficiently.
      const ai = this.getClient(apiKey);
      const uploadedFile = await ai.files.upload({
        file: new Blob([buffer]), // The SDK works with Blob objects
        config: {
          mimeType: mimeType ?? "application/octet-stream",
          name: filename ? `${filename.split(".")[0]}-${Date.now()}` : undefined
        }
      });

      return uploadedFile;
    } catch (error) {
      this.logger.error(
        error,
        `Error in uploadRemoteAssetToGoogle for URL: ${url}`
      );
      throw new Error(
        error instanceof Error
          ? error.message
          : "something went wrong in upload remote asset to google..."
      ); // Re-throw the error to be handled by the caller
    }
  }

  private async streamToBuffer(stream: ReadableStream<Uint8Array>) {
    // The logic from your `assetToBufferView` is already quite efficient
    // for converting a stream to a single buffer in memory.
    const reader = stream.getReader();
    const chunks = Array.of<Uint8Array>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks);
  }

  private async formatHistoryForSession(
    msgs: Message[],
    attachments?: ProviderGeminiChatRequestEntity["attachments"]
  ) {
    const formatted = Array.of<Content>();
    for (const msg of msgs) {
      if (msg.senderType === "USER") {
        const partArr = Array.of<Part>();
        try {
          if (attachments && attachments.length > 0) {
            for (const attachment of attachments) {
              if (attachment?.cdnUrl && attachment?.mime) {
                const { cdnUrl, mime, filename } = attachment;
                const uploadedFile = await this.uploadRemoteAssetToGoogle(
                  cdnUrl,
                  mime,
                  filename
                );
                partArr.push({
                  fileData: { fileUri: uploadedFile.uri, mimeType: mime }
                });
              }
            }
          }
        } catch (err) {
          this.logger.warn({ err }, "error in gemini history workup");
        } finally {
          partArr.push({ text: msg.content });
        }
        formatted.push({ role: "user", parts: partArr } as const);
      } else {
        // This is an assistant/model message. Prepend context.
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "unknown";
        const modelIdentifier = `[${provider}/${model}]`;
        formatted.push({
          role: "model",
          parts: [
            {
              text: `${modelIdentifier}\n${msg.content}`
            } as const satisfies Part
          ]
        } as const satisfies Content);
      }
    }
    return formatted;
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

  public async getHistoryAndInstruction(
    isNewChat: boolean,
    msgs: Message[],
    systemPrompt?: string,
    attachments?: ProviderGeminiChatRequestEntity["attachments"]
  ) {
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );
    if (isNewChat) {
      this.logger.debug(
        msgs,
        `new chat msgs object in getHistoryAndInstruction has length ${msgs.length}`
      );
      return {
        history: undefined,
        systemInstruction
      };
    } else {
      const historyMsgs = msgs.slice(0, -1);
      return {
        history: await this.formatHistoryForSession(historyMsgs, attachments),
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
  private getFileName = (p: string) =>
    p.split("?")[0]?.split("/").reverse()[0] ?? "";

  private async writeTmp(filename: string, sourceUrl: string) {
    const absPath = resolve(this.prisma.fs.tmpDir, filename);
    return await this.prisma.fs
      .fetchRemoteWriteLocalLargeFiles(sourceUrl, absPath, false)
      .then(() => {
        return absPath;
      });
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
    attachments,
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

    const gemini = this.getClient(apiKey);
    const { history, systemInstruction } = await this.getHistoryAndInstruction(
      isNewChat,
      msgs,
      systemPrompt,
      attachments
    );
    const currentPartArr = Array.of<Part>();

    try {
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          if (attachment?.cdnUrl && attachment?.mime) {
            const { cdnUrl, mime, filename } = attachment;
            const uploadedFile = await this.uploadRemoteAssetToGoogle(
              cdnUrl,
              mime,
              filename
            );
            currentPartArr.push({
              fileData: { fileUri: uploadedFile.uri, mimeType: mime }
            });
          }
        }
      }
    } catch (err) {
      this.logger.warn({ err }, "error in gemini history workup");
    } finally {
      currentPartArr.push({ text: prompt });
    }
    const fullContent = [
      ...(history ?? []),
      { role: "user", parts: currentPartArr }
    ] as const satisfies Content[];
    this.logger.debug(
      fullContent,
      "debugging full content on first message to gemini"
    );
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
