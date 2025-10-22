import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import type { EventTypeMap, OpenAiModelIdUnion } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { OpenAIServiceWorkup } from "./workup.ts";

export class OpenAIService extends OpenAIServiceWorkup {
  private defaultClient: OpenAI;
  private logger: PinoLogger;
  /** key: storename; val: storeId; */
  constructor(
    logger: LoggerService,
    protected override prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private apiKey: string
  ) {
    super(prisma);
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[openai] " }
      );
    this.defaultClient = new OpenAI({
      logLevel: "debug",
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
    keyId,
    model = "gpt-5-mini" satisfies OpenAiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    user_location
  }: ProviderOpenaiRequestEntity) {
    const m = model as OpenAiModelIdUnion;
    const provider = "openai" as const;
    let openaiThinkingStartTime: number | null = null,
      openaiThinkingDuration = 0,
      openaiIsCurrentlyThinking = false,
      openaiThinkingAgg = "",
      openaiAgg = "";

    const client = this.getClient(apiKey ?? undefined);

    const formatted = await this.formatOpenAiWithUploads(
      isNewChat,
      msgs,
      client,
      userId,
      keyId ?? undefined
    );

    const loc = this.normalizeLocation(user_location);

    const hasFiles = this.hasFiles(formatted);

    const fileIds = this.fileIds(formatted);

    let vectorStoreId: string | undefined;
    if (fileIds.length > 0) {
      vectorStoreId = await this.ensureUserVectorStoreId(client, null, userId);
      await client.vectorStores.fileBatches.createAndPoll(vectorStoreId, {
        file_ids: fileIds
      });
    }

    const tools = this.handleTooling(
      m,
      hasFiles,
      loc,
      vectorStoreId ? [vectorStoreId] : undefined
    );

    const reasoning = this.openaiReasoning(m, "medium", "auto");

    const responsesStream = await client.responses.create({
      stream: true,
      input: formatted,
      instructions: this.buildInstructions(systemPrompt),
      store: false,
      model: m,
      text: this.openAiVerbosity(model as OpenAiModelIdUnion, "medium"),
      temperature,
      max_output_tokens: max_tokens,
      top_p: topP,
      safety_identifier: userId,
      truncation: "auto",
      reasoning,
      parallel_tool_calls: true,
      tools
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
      if (s.type === "response.output_text.delta") {
        if (
          openaiIsCurrentlyThinking === true &&
          openaiThinkingStartTime !== null
        ) {
          const endTime = performance.now();
          openaiThinkingDuration = Math.round(
            endTime - openaiThinkingStartTime
          );
          // Mark thinking as finished once output text begins
          openaiIsCurrentlyThinking = false;
        }
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
            isThinking: false,
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
        await this.prisma.handleAiChatResponse({
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
