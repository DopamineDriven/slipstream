import type { ProviderGeminiChatRequestEntity } from "@/gemini/types.ts";
import type {
  Blob,
  FinishReason,
  GenerateContentResponse
} from "@google/genai";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import type { EventTypeMap, GeminiModelIdUnion } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { GeminiWorkupService } from "./workup.ts";

export class GeminiService extends GeminiWorkupService {
  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    protected extractor: ExtractService,
    protected apiKey: string
  ) {
    super(logger, prisma, extractor, apiKey);
  }
  public async handleGeminiAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    userMsgId,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    keyId,
    apiKey,
    max_tokens,
    model = "gemini-2.5-pro" satisfies GeminiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    imgGenFields,
    // imgGenEnabled,
    // jobId,
    // partialImgArr,
    // requestMessageId,
    topP,
    userData
  }: ProviderGeminiChatRequestEntity) {
    const provider = "gemini" as const;

    const params = await this.contentGen({
      isNewChat,
      keyId,
      model,
      msgs,
      apiKey,
      imgGenFields,
      latlng: userData?.latlng,
      max_tokens,
      systemPrompt,
      temperature,
      topP
    });

    let geminiThinkingStartTime: number | null = null,
      geminiThinkingDuration = 0,
      geminiIsCurrentlyThinking = false,
      geminiThinkingAgg = "",
      geminiAgg = "",
      geminiDataPart: Blob | undefined = undefined;

    const gemini = this.getClient(apiKey);

    // const imagen = await gemini.models.generateImages({model: "imagen-4.0-generate-001" satisfies GeminiModelIdUnion,prompt: "",config: {includeRaiReason: true,}})
    // const s = await gemini.models.generateContentStream({contents: fullContent,model: "gemini-2.5-flash-image",config: {responseModalities: ["TEXT", "IMAGE"],imageConfig: {aspectRatio:"21:9"},thinkingConfig: {includeThoughts: true, thinkingBudget: -1},systemInstruction,mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH}})

    const stream = (await gemini.models.generateContentStream(
      params
    )) satisfies AsyncGenerator<GenerateContentResponse>;

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
              if (part.fileData) {
                this.logger.debug(part.fileData, "part.fileData");
              }
              if (part.inlineData) {
                this.logger.debug(part.inlineData, "part.inlineData");
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
            userMsgId,
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
            done: false,
            imgGenEnabled: false
          } satisfies EventTypeMap["ai_chat_chunk"])
        );

        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          title,
          systemPrompt,
          userMsgId,
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
          done: false,
          imgGenEnabled: false
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
            userMsgId,
            systemPrompt,
            isThinking: false,
            temperature,
            topP,
            provider,
            thinkingText: geminiThinkingAgg,
            chunk: textPart,
            thinkingDuration:
              geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
            done: false,
            imgGenEnabled: false
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
          userMsgId,
          temperature,
          topP,
          thinkingText: geminiThinkingAgg,
          provider,
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
          chunk: textPart,
          done: false,
          imgGenEnabled: false
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
            userMsgId,
            data: _dataUrl,
            userId,
            done: false,
            model,
            chunk: geminiAgg,
            systemPrompt,
            temperature,
            title,
            topP,
            provider,
            imgGenEnabled: false
          } satisfies EventTypeMap["ai_chat_inline_data"])
        );
      }
      if (done) {
        const d = await this.prisma.handleAiChatResponse({
          chunk: geminiAgg,
          conversationId,
          done: true,
          title,
          provider,
          userId,
          systemPrompt,
          temperature,
          userMsgId,
          data: geminiDataPart
            ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
            : undefined,
          topP,
          model,
          thinkingText: geminiThinkingAgg,
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
          imgGenEnabled: false
        });
        ws.send(
          JSON.stringify({
            type: "ai_chat_response",
            conversationId,
            userId,
            model,
            userMsgId,
            aiMsgId: d.aiMsgId,
            systemPrompt,
            data: geminiDataPart
              ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
              : undefined,
            temperature,
            title,
            topP,
            imgGenEnabled: false,
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
          imgGenEnabled: false,
          userMsgId,
          aiMsgId: d.aiMsgId,
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
        void this.redis.del(`stream:state:${conversationId}`);
        break;
      }
    }
  }
}
