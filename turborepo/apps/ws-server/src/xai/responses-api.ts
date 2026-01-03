import type { GrokProviderChatRequestEntity } from "@/xai/types.ts";
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
    topP,
    management_api_key
  }: GrokProviderChatRequestEntity) {
    const provider = "grok" as const;
    const mgmtKey = management_api_key ?? this.xaiManagementKey;
    let grokThinkingStartTime = 0,
      grokThinkingEndTime = 0,
      grokThinkingDuration = 0,
      grokIsCurrentlyThinking = false,
      grokThinkingAgg = "",
      grokAgg = "",
      usage = 0;

    const m = model as GrokModelIdUnion;

    const xaiApiKey = apiKey ?? this.xaiKey;
    console.log("[XAI] 1. About to create stream...", Date.now());
    const collectionId = await this.getUserCollectionIdWithFallback(
      userId,
      mgmtKey
    );
    try {
      const parser = await this.createResponsesStream({
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
        imgGenFields,
        management_api_key,
        payload: {
          collectionId,
          enableCodeInterpreter: true,
          enableFileSearch: true,
          enableWebSearch: true,
          enableXSearch: true,
          fileSearchMaxResults: 10,
          imgDetail: "auto",
          store: false,
          stream: true,
          user: userId,
          parallel_tool_calls: true,
          logprobs: true,
          tool_choice_input: "auto",
          web_enable_image_understanding: true,
          x_enable_image_understanding: true,
          x_enable_video_understanding: true
        }
      });

      for await (const chunk of parser) {
        let text: string | undefined = undefined,
          thinkingText: string | undefined = undefined,
          responseOutput: string | undefined = undefined;

        // Final usage-only chunk
        if (chunk.event === "response.created") {
          console.log(chunk.data.response.id);
        }
        if (chunk.event === "response.output_item.added") {
          if (chunk.data.item.type === "reasoning") {
            if (
              grokIsCurrentlyThinking === false &&
              grokThinkingStartTime === 0
            ) {
              grokThinkingStartTime = performance.now();
              grokIsCurrentlyThinking = true;
            }
          }
          if (chunk.data.item.type === "message") {
            if (
              grokThinkingStartTime !== 0 &&
              grokIsCurrentlyThinking === true
            ) {
              grokThinkingEndTime = performance.now();
              grokIsCurrentlyThinking = false;
              grokThinkingDuration =
                grokThinkingEndTime - grokThinkingStartTime;
            }
          }
        }
        if (chunk.event === "response.output_item.done") {
          if (chunk.data.item.type === "reasoning") {
            if ("encrypted_content" in chunk.data.item) {
              thinkingText = chunk.data.item.encrypted_content;
            }
          }
          if (chunk.data.item.type === "file_search_call") {
            const { results, ...rest } = chunk.data.item;
            if (results) {
              this.parseFileSearchResults({ ...rest, results });
            }
          }
        }

        if (chunk.event === "response.reasoning_summary_text.delta") {
          thinkingText = chunk.data.delta;
        }
        if (chunk.event === "response.output_text.delta") {
          text = chunk.data.delta;
        }
        if (chunk.event === "response.output_text.annotation.added") {
          chunk.data.annotation;
        }
        // NOTE: GROK TENDS TO INCLUDE THIS DIRECTLY AT THE END OF THE MESSAGE STREAM
        // if (chunk.event === "response.output_text.annotation.added") {
        //   if (
        //     "start_index" in chunk.data.annotation &&
        //     "title" in chunk.data.annotation &&
        //     "end_index" in chunk.data.annotation
        //   ) {
        //     text = `\n[[${chunk.data.annotation_index}] ${chunk.data.annotation.title} (${chunk.data.annotation.start_index}-${chunk.data.annotation.end_index})](${chunk.data.annotation.url})\n`;
        //     this.logger.info(chunk.data);
        //   } else {
        //     this.logger.info(chunk.data);
        //     text = `\n[[${chunk.data.annotation_index}]](${chunk.data.annotation.url})\n`;
        //   }
        // }
        if (
          chunk.event === "response.completed" &&
          chunk.data.response.status === "completed"
        ) {
          if (chunk.data.response.usage) {
            usage = chunk.data.response.usage.total_tokens;
          }

          if (chunk.data.response.output) {
            responseOutput = JSON.stringify(chunk.data.response.output);
            // for (const output of chunk.data.response.output)
            //   if (output.type === "file_search_call") {
            //     if (output.results && output.results.length > 0) {
            //       for (const results of output.results) {
            //         this.logger.debug(results);
            //       }
            //     }
            //   }
          }
        }
        if (
          grokThinkingStartTime !== 0 &&
          grokThinkingEndTime !== 0 &&
          grokThinkingDuration === 0
        ) {
          grokThinkingDuration = grokThinkingEndTime - grokThinkingStartTime;
        }
        if (thinkingText && grokIsCurrentlyThinking) {
          grokThinkingAgg += thinkingText;
          thinkingChunks.push(thinkingText);

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
              thinkingText,
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
            thinkingText,
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
                grokThinkingDuration !== 0 ? grokThinkingDuration : undefined,
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
              grokThinkingDuration !== 0 ? grokThinkingDuration : undefined,
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

        if (responseOutput) {
          const d = await this.prisma.handleAiChatResponse({
            jobId,
            requestMessageId,
            usage,
            chunk: grokAgg,
            conversationId,
            responseOutput,
            done: true,
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
              systemPrompt,
              usage,
              thinkingDuration:
                grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
              thinkingText: grokThinkingAgg,
              title,
              temperature,
              topP,
              model: m,
              chunk: grokAgg,
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
            userMsgId,
            usage,
            aiMsgId: d.aiMsgId,
            imgGenEnabled: false,
            thinkingDuration:
              grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
            thinkingText: grokThinkingAgg,
            topP,
            provider,
            model: m,
            chunk: grokAgg,
            done: true
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
