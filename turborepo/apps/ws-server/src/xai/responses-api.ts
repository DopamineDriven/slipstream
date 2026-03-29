import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  FunctionCallContext,
  FunctionCallOutput,
  ResponsesComprehensive
} from "@/xai/responses-types.ts";
import type { GrokProviderChatRequestEntity } from "@/xai/types.ts";
import { GrokImgGenService } from "@/xai/img-gen.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap, GrokModelIdUnion } from "@slipstream/types";

export class GrokResponsesApiService extends GrokImgGenService {
  constructor(
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    logger: LoggerService,
    prisma: PrismaService,
    userStore: UserStoreVectorService,
    apiKey: string,
    managementKey: string
  ) {
    super(redis, s3, logger, prisma, userStore, apiKey, managementKey);
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
    model = "grok-4.20-0309-reasoning" as GrokModelIdUnion,
    systemPrompt,
    temperature,
    keyId,
    imgGenEnabled,
    docCounts,
    imgCounts,
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
    let activeThinkingStartTime: number | null = null,
      grokThinkingDuration = 0,
      grokIsCurrentlyThinking = false,
      grokThinkingAgg = "",
      grokAgg = "",
      usage = 0;

    const m = model as GrokModelIdUnion;
    const supportsFunctionTools = this.canUseFunctionTools(m);
    const xaiApiKey = apiKey ?? this.xaiKey;
    const collectionId = await this.getUserCollectionIdWithFallback(
      userId,
      mgmtKey
    );

    try {
      const initialRequest = await this.getResponsesApiInputWorkup({
        isNewChat,
        model: m,
        userId,
        msgs,
        keyFingerprint: keyId ?? "server",
        systemPrompt,
        max_output_tokens: max_tokens,
        tool_choice: "auto",
        detail: "auto",
        enableUserStoreSearch: m !== "grok-4.20-multi-agent-0309",
        keyId: keyId ?? "",
        apiKey: xaiApiKey,
        managementKey: mgmtKey,
        collectionId,
        enableCodeInterpreter: true,
        enableFileSearch: true,
        enableWebSearch: true,
        enableXSearch: true,
        fileSearchMaxResults: 10,
        parallel_tool_calls: true,
        web_enable_image_understanding: true,
        x_enable_image_understanding: true,
        x_enable_video_understanding: true,
        include: ["reasoning.encrypted_content"]
      });

      const MAX_TOOL_ROUNDS = 10;
      let roundInput = Array.of<ResponsesComprehensive>(
        ...initialRequest.input
      );
      let responseOutput: string | undefined = undefined;
      let forcedLoopStopReason: "MAX_ROUNDS" | null = null;
      let unexpectedFunctionCallSeen = false;

      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const parser = await this.createResponsesStream({
          msgs,
          userId,
          jobId,
          docCounts,
          imgCounts,
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
            round_input: roundInput,
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

        const pendingFunctionCalls = new Map<string, FunctionCallContext>();
        const functionCalls = Array.of<FunctionCallContext>();
        const functionCallIds = new Set<string>();
        let roundCompleted = false;

        for await (const chunk of parser) {
          let text: string | undefined = undefined;
          let thinkingText: string | undefined = undefined;

          if (chunk.event === "response.created") {
            this.logger.info(
              { round, responseId: chunk.data.response.id },
              "xAI response round started"
            );
          }

          if (chunk.event === "response.output_item.added") {
            if (chunk.data.item.type === "reasoning") {
              if (!grokIsCurrentlyThinking) {
                grokIsCurrentlyThinking = true;
                activeThinkingStartTime = performance.now();
              }
            }

            if (chunk.data.item.type === "message") {
              if (grokIsCurrentlyThinking && activeThinkingStartTime !== null) {
                grokThinkingDuration += Math.round(
                  performance.now() - activeThinkingStartTime
                );
                activeThinkingStartTime = null;
                grokIsCurrentlyThinking = false;
              }
            }

            if (chunk.data.item.type === "function_call") {
              if (!supportsFunctionTools) {
                if (!unexpectedFunctionCallSeen) {
                  unexpectedFunctionCallSeen = true;
                  this.logger.warn(
                    {
                      model: m,
                      toolName: chunk.data.item.name
                    },
                    "xAI emitted a function call for a model that should not support function tools"
                  );
                }
                continue;
              }

              pendingFunctionCalls.set(chunk.data.item.id, {
                type: "function_call",
                id: chunk.data.item.id,
                call_id: chunk.data.item.call_id,
                name: chunk.data.item.name,
                arguments: chunk.data.item.arguments
              });
            }
          }

          if (
            supportsFunctionTools &&
            chunk.event === "response.function_call_arguments.delta"
          ) {
            const pending = pendingFunctionCalls.get(chunk.data.item_id);
            if (pending) {
              pending.arguments += chunk.data.delta;
            }
          }

          if (
            supportsFunctionTools &&
            chunk.event === "response.function_call_arguments.done"
          ) {
            const pending = pendingFunctionCalls.get(chunk.data.item_id);
            if (pending) {
              pending.arguments = chunk.data.arguments;
            }
          }

          if (chunk.event === "response.output_item.done") {
            if (chunk.data.item.type === "reasoning") {
              thinkingText = chunk.data.item.encrypted_content;
            }

            if (chunk.data.item.type === "file_search_call") {
              const { results, ...rest } = chunk.data.item;
              if (results) {
                this.parseFileSearchResults({ ...rest, results });
              }
            }

            if (
              supportsFunctionTools &&
              chunk.data.item.type === "function_call"
            ) {
              const pending = pendingFunctionCalls.get(chunk.data.item.id);
              const completedCall = {
                type: "function_call",
                id: chunk.data.item.id,
                call_id: chunk.data.item.call_id,
                name: chunk.data.item.name,
                arguments:
                  pending && pending.arguments.length > 0
                    ? pending.arguments
                    : chunk.data.item.arguments
              } as const satisfies FunctionCallContext;

              if (!functionCallIds.has(completedCall.id)) {
                functionCalls.push(completedCall);
                functionCallIds.add(completedCall.id);
              }

              pendingFunctionCalls.delete(chunk.data.item.id);
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

          if (
            chunk.event === "response.completed" &&
            chunk.data.response.status === "completed"
          ) {
            roundCompleted = true;

            if (chunk.data.response.usage) {
              usage += chunk.data.response.usage.total_tokens;
            }

            responseOutput = JSON.stringify(chunk.data.response.output);

            if (grokIsCurrentlyThinking && activeThinkingStartTime !== null) {
              grokThinkingDuration += Math.round(
                performance.now() - activeThinkingStartTime
              );
              activeThinkingStartTime = null;
              grokIsCurrentlyThinking = false;
            }

            for (const output of chunk.data.response.output) {
              if (
                supportsFunctionTools &&
                output.type === "function_call" &&
                !functionCallIds.has(output.id)
              ) {
                functionCalls.push({
                  type: "function_call",
                  id: output.id,
                  call_id: output.call_id,
                  name: output.name,
                  arguments: output.arguments
                } satisfies FunctionCallContext);
                functionCallIds.add(output.id);
              }
            }
          }

          if (thinkingText && grokIsCurrentlyThinking) {
            grokThinkingAgg += thinkingText;
            thinkingChunks.push(thinkingText);

            const currentThinkingDuration =
              grokThinkingDuration +
              (activeThinkingStartTime !== null
                ? performance.now() - activeThinkingStartTime
                : 0);

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
                thinkingDuration: currentThinkingDuration,
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
              thinkingDuration: currentThinkingDuration,
              thinkingText,
              systemPrompt,
              temperature,
              topP,
              provider,
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
        }

        if (!roundCompleted) {
          throw new Error("xAI response stream ended without completion");
        }

        if (functionCalls.length === 0) {
          break;
        }

        if (round === MAX_TOOL_ROUNDS) {
          forcedLoopStopReason = "MAX_ROUNDS";
          this.logger.warn(
            {
              round,
              functionCallCount: functionCalls.length
            },
            "xAI tool loop reached max rounds"
          );
          break;
        }

        const toolOutputs = Array.of<FunctionCallOutput<string>>();
        for (const call of functionCalls) {
          toolOutputs.push(await this.executeFunctionToolCall(userId, call));
        }

        roundInput = [...roundInput, ...functionCalls, ...toolOutputs];

        this.logger.info(
          {
            round,
            functionCallCount: functionCalls.length,
            toolOutputCount: toolOutputs.length
          },
          "xAI tool round complete, sending continuation"
        );
      }

      if (!responseOutput) {
        throw new Error("xAI response output missing after tool rounds");
      }

      if (forcedLoopStopReason && grokAgg.trim().length === 0) {
        grokAgg =
          "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
          "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      }

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

      void this.redis.del(`stream:state:${conversationId}`);
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "ai_chat_error",
          provider,
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
