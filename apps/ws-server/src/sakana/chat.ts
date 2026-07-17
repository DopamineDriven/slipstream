import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { SakanaUserLocation } from "@/sakana/workup.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type { OpenAI } from "openai";
import { SakanaWorkupService } from "@/sakana/workup.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap, SakanaModelIdUnion } from "@slipstream/types";

export interface SakanaProviderChatRequestEntity extends ProviderChatRequestEntity {
  model: SakanaModelIdUnion;
  user_location?: SakanaUserLocation;
}

interface SakanaActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface SakanaFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export class SakanaChatService extends SakanaWorkupService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    memoryService: ConversationMemoryVectorService,
    protected redis: EnhancedRedisPubSub,
    apiKey: string
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3, memoryService);
  }
  protected async handleSakanaAiChatRequest({
    chunks,
    conversationId,
    msgs,
    streamChannel,
    thinkingChunks,
    userId,
    hasUserStoreDocs,
    ws,
    userMsgId,
    apiKey,
    jobId,
    requestMessageId,
    model = "fugu" satisfies SakanaModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    user_location
  }: SakanaProviderChatRequestEntity) {
    const provider = "sakana" as const;

    let sakanaThinkingDuration = 0,
      sakanaThinkingAgg = "",
      tInitial = 0,
      sakanaResId: string | undefined = undefined,
      sakanaAgg = "",
      usage = 0;
    const trackedBlocks = Array.of<SakanaFinalizedMessageBlock>();
    let activeBlock: SakanaActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;

    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();

    const finalizeActiveBlock = () => {
      if (!activeBlock) {
        return;
      }

      if (activeBlock.content.length === 0) {
        activeBlock = undefined;
        return;
      }

      const durationMs = Math.max(
        0,
        Math.round(performance.now() - activeBlock.startedAt)
      );

      trackedBlocks.push({
        content: activeBlock.content,
        durationMs,
        ordinal: nextOrdinal,
        type: activeBlock.type
      });

      if (activeBlock.type === "THINKING") {
        sakanaThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (type: SakanaActiveMessageBlock["type"]) => {
      if (!activeBlock || activeBlock?.type !== type) {
        finalizeActiveBlock();
        activeBlock = {
          content: "",
          startedAt: performance.now(),
          type
        };
        return activeBlock;
      }

      return activeBlock;
    };

    const currentThinkingDuration = () => {
      const activeThinkingDuration =
        activeBlock?.type === "THINKING"
          ? Math.round(performance.now() - activeBlock.startedAt)
          : 0;

      return sakanaThinkingDuration + activeThinkingDuration;
    };

    const currentChunkMessageBlock = () => {
      if (!activeBlock) {
        return undefined;
      }

      return {
        type: activeBlock.type,
        content: activeBlock.content,
        ordinal: nextOrdinal,
        conversationId,
        durationMs: Math.max(
          0,
          Math.round(performance.now() - activeBlock.startedAt)
        )
      } as const;
    };

    const client = this.getClient(apiKey ?? undefined);
    const formatted = await this.formatSakanaInput(msgs);
    const instructions = this.prisma.formatSysNote(systemPrompt);
    const loc = this.normalizeLocation(user_location);
    const tools = this.sakanaTools(hasUserStoreDocs, loc);
    // backstop only, not a working budget — memory tools dual-wield across rounds
    const MAX_TOOL_ROUNDS = 10_000_000;
    let roundInput = Array.of<OpenAI.Responses.ResponseInputItem>(...formatted);
    let forcedLoopStopReason: "MAX_ROUNDS" | undefined = undefined;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      let streamRes: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;
      try {
        streamRes = await client.responses.create(
          {
            stream: true,
            input: roundInput,
            store: false,
            instructions,
            model,
            // max_output_tokens deliberately OMITTED: the Responses dialect
            // pools reasoning + visible output under one cap, so honoring the
            // per-chat max_tokens slider starves fugu-ultra's (encrypted)
            // reasoning and 200s into response.incomplete with zero text
            reasoning: this.handleReasoning(model),
            parallel_tool_calls: true,
            tools
          },
          { stream: true }
        );
      } catch (error) {
        this.logger.error(
          {
            round,
            roundInputCount: roundInput.length,
            err: this.prisma.safeErrMsg(error)
          },
          "Sakana stream request failed"
        );
        throw new Error(this.prisma.safeErrMsg(error));
      }

      const functionCalls =
        Array.of<OpenAI.Responses.ResponseFunctionToolCall>();
      let roundCompleted = false;

      for await (const s of streamRes) {
        let text: string | undefined = undefined;
        let thinkingText: string | undefined = undefined;

        if (s.type === "response.created" && tInitial === 0) {
          tInitial = performance.now();
        }

        if (s.type === "response.output_item.added") {
          if (s.item.type === "reasoning") {
            ensureActiveBlock("THINKING");
          } else {
            finalizeActiveBlock();
          }
        }

        if (
          s.type === "response.reasoning_text.delta" ||
          s.type === "response.reasoning_summary_text.delta"
        ) {
          const block = ensureActiveBlock("THINKING");
          block.content += s.delta;
          thinkingText = s.delta;
        }

        if (s.type === "response.output_text.delta") {
          const block = ensureActiveBlock("TEXT");
          block.content += s.delta;
          text = s.delta;
        }

        if (s.type === "response.completed") {
          finalizeActiveBlock();
          sakanaResId = s.response.id;
          if (s.response.usage?.total_tokens) {
            usage = s.response.usage.total_tokens;
          }
          for (const output of s.response.output) {
            if (output.type === "function_call") {
              functionCalls.push(output);
            }
          }
          roundCompleted = true;
        }

        // terminal non-completion events — previously fell through every
        // branch and surfaced as the opaque "ended without completion"
        if (s.type === "response.incomplete") {
          finalizeActiveBlock();
          throw new Error(
            `Sakana response ended incomplete (${s.response.incomplete_details?.reason ?? "unknown reason"})`
          );
        }

        if (s.type === "response.failed") {
          finalizeActiveBlock();
          throw new Error(
            `Sakana response failed: ${s.response.error?.message ?? "unknown failure"}`
          );
        }

        if (thinkingText) {
          sakanaThinkingAgg += thinkingText;
          thinkingChunks.push(thinkingText);

          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              done: false,
              userId,
              userMsgId,
              model,
              provider,
              imgGenEnabled: false,
              imgGenFields: undefined,
              systemPrompt,
              temperature,
              title,
              topP,
              thinkingText,
              messageBlocks: currentChunkMessageBlock(),
              thinkingDuration:
                currentThinkingDuration() > 0
                  ? currentThinkingDuration()
                  : undefined,
              isThinking: true
            } satisfies EventTypeMap["ai_chat_chunk"])
          );
          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model,
            thinkingDuration:
              currentThinkingDuration() > 0
                ? currentThinkingDuration()
                : undefined,
            userMsgId,
            title,
            systemPrompt,
            imgGenEnabled: false,
            imgGenFields: undefined,
            temperature,
            topP,
            provider,
            thinkingText,
            messageBlocks: currentChunkMessageBlock(),
            isThinking: true,
            done: false
          });
        }

        if (text) {
          sakanaAgg += text;
          chunks.push(text);
          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              userId,
              provider,
              title,
              userMsgId,
              model,
              systemPrompt,
              imgGenEnabled: false,
              imgGenFields: undefined,
              temperature,
              topP,
              chunk: text,
              isThinking: false,
              messageBlocks: currentChunkMessageBlock(),
              thinkingDuration:
                sakanaThinkingDuration > 0 ? sakanaThinkingDuration : undefined,
              done: false
            } satisfies EventTypeMap["ai_chat_chunk"])
          );
          void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model,
            userMsgId,
            isThinking: false,
            title,
            systemPrompt,
            temperature,
            topP,
            imgGenEnabled: false,
            imgGenFields: undefined,
            provider,
            thinkingText:
              sakanaThinkingAgg.length > 0 ? sakanaThinkingAgg : undefined,
            messageBlocks: currentChunkMessageBlock(),
            thinkingDuration:
              sakanaThinkingDuration > 0 ? sakanaThinkingDuration : undefined,
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
      }

      if (!roundCompleted || !sakanaResId) {
        throw new Error("Sakana response stream ended without completion");
      }

      if (functionCalls.length === 0) {
        break;
      }

      if (round === MAX_TOOL_ROUNDS) {
        forcedLoopStopReason = "MAX_ROUNDS";
        this.logger.warn(
          {
            round,
            functionCallCount: functionCalls.length,
            responseId: sakanaResId
          },
          "Sakana tool loop reached max rounds"
        );
        break;
      }

      const toolOutputs =
        Array.of<OpenAI.Responses.ResponseInputItem.FunctionCallOutput>();
      for (const call of functionCalls) {
        const output = await this.executeFunctionToolCall(
          userId,
          conversationId,
          call
        );
        toolOutputs.push(output);
      }

      roundInput = [...roundInput, ...functionCalls, ...toolOutputs];
      this.logger.info(
        {
          round,
          responseId: sakanaResId,
          functionCallCount: functionCalls.length,
          toolOutputCount: toolOutputs.length
        },
        "Sakana tool round complete, sending continuation"
      );
    }

    if (!sakanaResId) {
      throw new Error("Sakana response id missing after tool rounds");
    }

    if (forcedLoopStopReason && sakanaAgg.trim().length === 0) {
      sakanaAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        content: sakanaAgg,
        durationMs: 0,
        ordinal: nextOrdinal,
        type: "TEXT"
      });
      nextOrdinal += 1;
    }

    for (const block of trackedBlocks) {
      roundTrack.push({
        type: block.type,
        content: block.content,
        durationMs: block.durationMs,
        ordinal: block.ordinal,
        conversationId
      });
    }

    const d = await this.prisma.handleAiChatResponse({
      chunk: sakanaAgg,
      conversationId,
      done: true,
      title,
      temperature,
      responseOutput: sakanaResId,
      userMsgId,
      jobId,
      requestMessageId,
      topP,
      provider,
      userId,
      systemPrompt,
      model,
      mime: undefined,
      usage,
      imgGenFields: undefined,
      imgGenEnabled: false,
      thinkingText:
        sakanaThinkingAgg.length > 0 ? sakanaThinkingAgg : undefined,
      thinkingDuration:
        sakanaThinkingDuration > 0 ? sakanaThinkingDuration : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
    });
    ws.send(
      JSON.stringify({
        type: "ai_chat_response",
        conversationId,
        userId,
        provider,
        model,
        title,
        convo: d.convo,
        usage,
        aiMsgId: d.aiMsgId,
        imgGenEnabled: false,
        imgGenAttachmentId: undefined,
        imgGenFields: undefined,
        systemPrompt,
        userMsgId,
        temperature,
        topP,
        chunk: sakanaAgg,
        thinkingText:
          sakanaThinkingAgg.length > 0 ? sakanaThinkingAgg : undefined,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
        thinkingDuration:
          sakanaThinkingDuration > 0 ? sakanaThinkingDuration : undefined,
        done: true
      } satisfies EventTypeMap["ai_chat_response"])
    );
    void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
      type: "ai_chat_response",
      conversationId,
      userId,
      systemPrompt,
      convo: d.convo,
      temperature,
      userMsgId,
      title,
      usage,
      imgGenEnabled: false,
      aiMsgId: d.aiMsgId,
      imgGenAttachmentId: undefined,
      imgGenFields: undefined,
      thinkingText:
        sakanaThinkingAgg.length > 0 ? sakanaThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      thinkingDuration:
        sakanaThinkingDuration > 0 ? sakanaThinkingDuration : undefined,
      topP,
      provider,
      model,
      chunk: sakanaAgg,
      done: true
    });
    void this.redis.del(`stream:state:${conversationId}`);
  }
}
