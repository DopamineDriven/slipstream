import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type {
  SakanaActiveMessageBlock,
  SakanaFinalizedMessageBlock,
  SakanaProviderChatRequestEntity,
  StreamEvents
} from "@/sakana/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { OpenAI } from "openai";
import { SakanaWorkupService } from "@/sakana/workup.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap, SakanaModelIdUnion } from "@slipstream/types";
import { isLocalToolName } from "@slipstream/types";

export class SakanaChatService extends SakanaWorkupService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    memoryService: ConversationMemoryVectorService,
    protected redis: EnhancedRedisPubSub,
    apiKey: string,
    // local tool bridge ownership STARTS here — the workup/store ancestors
    // never see it, mirroring the openai responses-chat pattern
    protected localToolBroker: LocalToolBroker
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3, memoryService);
  }

  protected encryptedTag = "*encrypted thinking...*" as const;

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
    user_location,
    localTools
  }: SakanaProviderChatRequestEntity) {
    const provider = "sakana" as const;

    // Local read-only tool bridge — capability advertised by the CLI on
    // this exact turn; absent means zero local definitions attached.
    // turnId mints once per ATTEMPT; the controller is the future
    // cancellation hook (calls await sequentially, so nothing is pending
    // when this throws).
    const localToolTurn =
      localTools?.protocolVersion === 1
        ? {
            turnId: await this.localToolBroker.generateTurnId(),
            advertised: new Set<string>(localTools.names),
            controller: new AbortController()
          }
        : undefined;
    const localToolNames = localToolTurn
      ? [...localToolTurn.advertised].filter(isLocalToolName)
      : [];
    if (localToolTurn) {
      this.logger.info(
        {
          turnId: localToolTurn.turnId,
          advertised: [...localToolTurn.advertised],
          conversationId
        },
        "local tool bridge armed for sakana turn"
      );
    }

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

      let emitEncryptedPlaceholder = false;
      if (activeBlock.content.length === 0) {
        if (activeBlock.type !== "ENCRYPTED_THINKING") {
          activeBlock = undefined;
          return;
        }
        // encrypted reasoning emits no deltas — the placeholder slots in AS
        // the delta, carrying the measured wall-clock. Duration doesn't care
        // that the content is opaque.
        activeBlock.content = this.encryptedTag;
        emitEncryptedPlaceholder = true;
      }

      const durationMs = Math.max(
        0,
        Math.round(performance.now() - activeBlock.startedAt)
      );

      const finalized = {
        content: activeBlock.content,
        durationMs,
        ordinal: nextOrdinal,
        type: activeBlock.type
      } satisfies SakanaFinalizedMessageBlock;
      trackedBlocks.push(finalized);

      if (
        activeBlock.type === "THINKING" ||
        activeBlock.type === "ENCRYPTED_THINKING"
      ) {
        sakanaThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;

      if (emitEncryptedPlaceholder) {
        sakanaThinkingAgg += this.encryptedTag;
        thinkingChunks.push(this.encryptedTag);
        const placeholderBlock = {
          type: finalized.type,
          content: finalized.content,
          ordinal: finalized.ordinal,
          conversationId,
          durationMs: finalized.durationMs
        } as const;
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
            thinkingText: this.encryptedTag,
            messageBlocks: placeholderBlock,
            thinkingDuration:
              sakanaThinkingDuration > 0 ? sakanaThinkingDuration : undefined,
            isThinking: true
          } satisfies EventTypeMap["ai_chat_chunk"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          thinkingDuration:
            sakanaThinkingDuration > 0 ? sakanaThinkingDuration : undefined,
          userMsgId,
          title,
          systemPrompt,
          imgGenEnabled: false,
          imgGenFields: undefined,
          temperature,
          topP,
          provider,
          thinkingText: this.encryptedTag,
          messageBlocks: placeholderBlock,
          isThinking: true,
          done: false
        });
      }
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

    // a visible delta arriving on an assumed-encrypted block converts it in
    // place, clock intact (closure-scoped: the handler body's narrowing of
    // activeBlock can't see closure mutations and collapses to never)
    const morphEncryptedToVisible = () => {
      if (
        activeBlock?.type === "ENCRYPTED_THINKING" &&
        activeBlock.content.length === 0
      ) {
        activeBlock.type = "THINKING";
      }
    };

    // the clock closes only against the done event carrying the SAME
    // rs_ item id the added event opened with (closure-scoped for the
    // same narrowing reason as morphEncryptedToVisible)
    const finalizeReasoningItem = (itemId: string) => {
      if (activeBlock?.itemId === itemId) {
        finalizeActiveBlock();
      }
    };

    const currentThinkingDuration = () => {
      const activeThinkingDuration =
        activeBlock?.type === "THINKING" ||
        activeBlock?.type === "ENCRYPTED_THINKING"
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
    const tools = this.sakanaTools(hasUserStoreDocs, loc, localToolNames);
    // backstop only, not a working budget — memory tools dual-wield across rounds
    const MAX_TOOL_ROUNDS = 10_000_000;
    let roundInput = Array.of<OpenAI.Responses.ResponseInputItem>(...formatted);
    let forcedLoopStopReason: "MAX_ROUNDS" | undefined = undefined;
    // the "model is not reasoning as of here" watermark — reset at each
    // round's dispatch, advanced by every completed output item. Reasoning
    // items flush fully-formed (added→done adjacent on the wire), so the
    // think time is the silent gap between this anchor and the item's done.
    let reasoningAnchor = performance.now();

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      let streamRes: AsyncIterable<StreamEvents[keyof StreamEvents]>;
      reasoningAnchor = performance.now();
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
            // assume encrypted (fugu-ultra's default) — the first visible
            // delta morphs the block to THINKING with the clock intact.
            // The clock backdates to the anchor: the item arrives
            // fully-formed, so the think time already elapsed in the
            // silent gap before this event landed
            const block = ensureActiveBlock("ENCRYPTED_THINKING");
            block.startedAt = reasoningAnchor;
            block.itemId = s.item.id;
          } else {
            finalizeActiveBlock();
          }
        }

        if (s.type === "response.output_item.done") {
          if (s.item.type === "reasoning") {
            finalizeReasoningItem(s.item.id);
          }
          // any completed item proves the model was not reasoning until at
          // least here — the next reasoning item's clock starts from it
          reasoningAnchor = performance.now();
        }

        if (
          s.type === "response.reasoning_text.delta" ||
          s.type === "response.reasoning_summary_text.delta"
        ) {
          morphEncryptedToVisible();
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
        // Local read-only bridge: relay to the CLI via the socket-scoped
        // broker (which ALWAYS resolves — deadline/disconnect/cancel become
        // typed is_error results, so the await can never wedge the loop);
        // every other tool takes the existing server-side path untouched.
        // const-local (not property) so the narrowing survives the async IIFE
        const toolName = call.name;
        if (
          isLocalToolName(toolName) &&
          localToolTurn?.advertised.has(toolName)
        ) {
          let input: unknown = {};
          let inputParseFailed = false;
          try {
            input = call.arguments ? JSON.parse<unknown>(call.arguments) : {};
          } catch {
            inputParseFailed = true;
          }
          const output = inputParseFailed
            ? `Malformed ${call.name} input JSON`
            : await (async () => {
                const localResult = await this.localToolBroker.request(
                  ws,
                  {
                    type: "local_tool_request",
                    conversationId,
                    turnId: localToolTurn.turnId,
                    round: round + 1,
                    toolCallId: call.call_id,
                    name: toolName,
                    input,
                    timeoutMs: this.localToolBroker.timeoutMsFor(toolName)
                  },
                  localToolTurn.controller.signal
                );
                const r = localResult.result;
                this.logger.info(
                  {
                    turnId: localToolTurn.turnId,
                    toolCallId: call.call_id,
                    name: call.name,
                    round: round + 1,
                    ok: r.ok,
                    durationMs: r.durationMs,
                    ...(r.ok ? {} : { errorCode: r.error.code })
                  },
                  "local tool round trip (sakana)"
                );
                return JSON.stringify(r.ok ? r.value : { error: r.error });
              })();
          toolOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output
          } satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput);
          continue;
        }
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
