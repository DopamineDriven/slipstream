import type { ProviderChatRequestEntity } from "@/types/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { GrokImgGenService } from "@/xai/img-gen.ts";
import type { EventTypeMap, GrokModelIdUnion } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class GrokResponsesApiService extends GrokImgGenService {
  constructor(
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    logger: LoggerService,
    prisma: PrismaService,
    apiKey: string,
    managementKey: string
  ) {
    super(redis, s3, logger, prisma, apiKey, managementKey);
  }

  protected async handleXAIAiResponsesApiRequest({
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
    model = "grok-4-0709" as GrokModelIdUnion,
    systemPrompt,
    temperature,
    keyId,
    imgGenEnabled,
    imgGenFields,
    userMsgId,
    requestMessageId,
    jobId,
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
      hasAggregateFinal = false,
      usage = 0;

    const m = model as GrokModelIdUnion;

    const xaiApiKey = apiKey ?? this.xaiKey;
    console.log("[XAI] 1. About to create stream...", Date.now());
    try {
      const parser = await this.createResponsesStream(
        {
          msgs,
          userId,
          jobId,
          max_tokens,
          model,
          requestMessageId,
          temperature,
          title,
          topP,
          systemPrompt,
          isNewChat,
          keyId: keyId ?? "",
          apiKey: xaiApiKey,
          conversationId,
          userMsgId,
          ws,
          streamChannel,
          chunks,
          thinkingChunks,
          imgGenEnabled,
          imgGenFields
        },
        this.xaiManagementKey,
        "auto",
        true,
        "auto",
        true,
        10,
        true,
        true,
        true,
        true,
        true,
        true
      );

      for await (const chunk of parser) {
        let text: string | undefined = undefined,
          thinkingText: string | undefined = undefined,
          done: boolean | undefined = undefined,
          finalThinkingChunk = "";

        // Final usage-only chunk
        if (chunk.event === "response.created") {
          console.log(chunk.data.response.id);
        }
        if (chunk.event === "response.output_item.added") {
          if (chunk.data.item.type === "reasoning") {
            if (
              grokIsCurrentlyThinking === false &&
              grokThinkingStartTime === null
            ) {
              grokThinkingStartTime = performance.now();
              grokIsCurrentlyThinking = true;
            }
          }
        }
        if (chunk.event === "response.output_item.done") {
          if (chunk.data.item.type === "reasoning") {
            /**
             * `grok-code-fast-1` and `grok-3-mini` should never hit this block, they don't obfuscate CoT
             *
             * `grok-4-1-fast-reasoning`, `grok-4-fast-reasoning`, and `grok-4-0709` should always hit this block
             */
            if ("encrypted_content" in chunk.data.item) {
              thinkingText = chunk.data.item.encrypted_content;
            }
          }
        }
        /**
         * `grok-code-fast-1` and `grok-3-mini` should always hit this block if reasoning enabled; they don't obfuscate CoT
         *
         * `grok-4-1-fast-reasoning`, `grok-4-fast-reasoning`, and `grok-4-0709` should never hit this block
         */
        if (chunk.event === "response.reasoning_summary_text.delta") {
          if (
            grokIsCurrentlyThinking === false &&
            grokThinkingStartTime === null
          ) {
            grokThinkingStartTime = performance.now();
            grokIsCurrentlyThinking = true;
          }
          thinkingText = chunk.data.delta;
        }
        if (chunk.event === "response.output_text.delta") {
          if (
            grokIsCurrentlyThinking === true &&
            grokThinkingStartTime !== null
          ) {
            grokIsCurrentlyThinking = false;
            grokThinkingDuration = performance.now() - grokThinkingStartTime;
          }
          text = chunk.data.delta;
        }
        if (chunk.event === "response.output_text.annotation.added") {
          if (
            "start_index" in chunk.data.annotation &&
            "title" in chunk.data.annotation &&
            "end_index" in chunk.data.annotation
          ) {
            text = `[[${chunk.data.annotation_index}] ${chunk.data.annotation.title} (${chunk.data.annotation.start_index}-${chunk.data.annotation.end_index})](${chunk.data.annotation.url})\n`;
          } else if (
            !("title" in chunk.data.annotation) &&
            "start_index" in chunk.data.annotation &&
            "end_index" in chunk.data.annotation
          ) {
            text = `[[${chunk.data.annotation_index}] (${chunk.data.annotation.start_index}-${chunk.data.annotation.end_index})](${chunk.data.annotation.url})\n`;
          } else if (
            !("start_index" in chunk.data.annotation) &&
            !("end_index" in chunk.data.annotation) &&
            "title" in chunk.data.annotation
          ) {
            text = `[[${chunk.data.annotation_index}] ${chunk.data.annotation.title}](${chunk.data.annotation.url})\n`;
          } else {
            text = `[[${chunk.data.annotation_index}]](${chunk.data.annotation.url})\n`;
          }
        }
        if (
          chunk.event === "response.completed" &&
          chunk.data.response.status === "completed"
        ) {
          if (chunk.data.response.usage) {
            usage = chunk.data.response.usage.total_tokens;
          }
          if (chunk.data.response.output) {
            for (const output of chunk.data.response.output)
              if (output.type === "file_search_call") {
                if (output.results && output.results.length > 0) {
                  for (const results of output.results) {
                    this.logger.debug(results);
                  }
                }
              }
          }
          done = true;
        }
        if (
          thinkingText &&
          grokIsCurrentlyThinking &&
          (m === "grok-4-1-fast-reasoning" ||
            m === "grok-code-fast-1" ||
            m === "grok-3-mini" ||
            m === "grok-4-0709" ||
            m === "grok-4-fast-reasoning")
        ) {
          iThink++;
          console.info(`[${iThink}]: ${thinkingText}`);
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
              userMsgId,
              imgGenEnabled: false,
              provider,
              systemPrompt,
              temperature,
              thinkingText:
                m === "grok-3-mini" || m === "grok-code-fast-1"
                  ? hasAggregateFinal
                    ? finalThinkingChunk
                    : thinkingText
                  : thinkingText,
              isThinking: true,
              thinkingDuration: grokThinkingStartTime
                ? performance.now() - grokThinkingStartTime
                : undefined,
              topP,
              model: m,
              done: false
            } satisfies EventTypeMap["ai_chat_chunk"])
          );

          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model: m,
            userMsgId,
            imgGenEnabled: false,
            title,
            isThinking: true,
            thinkingDuration: grokThinkingStartTime
              ? performance.now() - grokThinkingStartTime
              : undefined,
            thinkingText:
              m === "grok-3-mini" || m === "grok-code-fast-1"
                ? hasAggregateFinal
                  ? finalThinkingChunk
                  : thinkingText
                : thinkingText,
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
              userMsgId,
              imgGenEnabled: false,
              temperature,
              thinkingDuration:
                grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
              isThinking: grokIsCurrentlyThinking,
              topP,
              model: m,
              chunk: text,
              done: false
            } satisfies EventTypeMap["ai_chat_chunk"])
          );

          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model: m,
            userMsgId,
            imgGenEnabled: false,
            title,
            thinkingDuration:
              grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
            isThinking: grokIsCurrentlyThinking,
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
                model: m,
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
          const d = await this.prisma.handleAiChatResponse({
            jobId,
            requestMessageId,
            usage,
            chunk: grokAgg,
            conversationId,
            done,
            imgGenEnabled: false,
            provider,
            userMsgId,
            title,
            userId,
            model: m,
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
              userMsgId,
              imgGenEnabled: false,
              aiMsgId: d.aiMsgId,
              systemPrompt,usage,
              thinkingDuration:
                grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
              thinkingText: grokThinkingAgg,
              title,
              temperature,
              topP,
              model: m,
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
            userMsgId,usage,
            aiMsgId: d.aiMsgId,
            imgGenEnabled: false,
            thinkingDuration:
              grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
            thinkingText: grokThinkingAgg,
            topP,
            provider,
            model: m,
            chunk: grokAgg,
            done
          });

          // Clear saved state on successful completion
          void this.redis.del(`stream:state:${conversationId}`);
          return;
        }
      }
    } catch (err) {
      // Surface error as stream error
      ws.send(
        JSON.stringify({
          type: "ai_chat_error",
          provider: provider,
          conversationId,
          model: m,
          systemPrompt,
          temperature,
          userMsgId,
          topP,
          title,
          userId,
          aiMsgId: undefined,
          imgGenEnabled,
          done: true,
          message: this.prisma.safeErrMsg(err)
        } satisfies EventTypeMap["ai_chat_error"])
      );
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_error", {
        type: "ai_chat_error",
        provider,
        conversationId,
        userMsgId,
        model: m,
        title,
        systemPrompt,
        aiMsgId: undefined,
        imgGenEnabled,
        temperature,
        topP,
        userId,
        done: true,
        message: this.prisma.safeErrMsg(err)
      });
      void this.redis.saveStreamState(
        conversationId,
        chunks,
        {
          model: m,
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
