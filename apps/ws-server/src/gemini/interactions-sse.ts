import type { ProviderGeminiChatRequestEntity } from "@/gemini/types.ts";
import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { FileSearchToolInput } from "@/store/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type { Interactions } from "@google/genai";
import { GeminiInteractionsService } from "@/gemini/interactions.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AIChatResponseAudioGenFields,
  AIChatResponseAudioGenSubFields,
  AIChatResponseImgGenSubFields,
  EventTypeMap,
  GeminiModelIdUnion
} from "@slipstream/types";
import { isLocalToolName } from "@slipstream/types";

interface InteractionsActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface InteractionsFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

/**
 * inline image payload lifted off an ImageDelta — the interactions twin of
 * generateContent's inlineData Blob
 */
interface InteractionsInlineImage {
  data: string;
  mimeType: string;
}

/**
 * per-step accumulator keyed by the SSE step index — thought steps collect
 * their summary text + signature, model_output steps collect text,
 * function_call steps collect their streamed arguments; the round replay
 * (client-managed history, store:false) is rebuilt from these
 */
interface InteractionsStepTrack {
  type: Interactions.Step["type"];
  text: string;
  thoughtSummary: string;
  signature?: string;
  functionCallId?: string;
  functionCallName?: string;
  functionCallArgsText: string;
  functionCallArgs?: Record<string, unknown>;
}

export class GeminiInteractionsSseService extends GeminiInteractionsService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    store: UserStoreVectorService,
    protected redis: EnhancedRedisPubSub,
    protected s3: S3Storage,
    memoryService: ConversationMemoryVectorService,
    apiKey: string,
    // local tool bridge ownership STARTS here — the interactions/fss
    // ancestors never see it, mirroring chat.ts over workup.ts
    protected localToolBroker: LocalToolBroker
  ) {
    super(logger, prisma, store, memoryService, apiKey);
  }

  private parseUserStoreSearchInput(args?: Record<string, unknown>) {
    const parsed = args ?? ({} satisfies Record<string, unknown>);

    if ("query" in parsed && typeof parsed.query === "string") {
      const query = parsed.query.trim();
      if (query.length > 0) {
        const maxResults =
          "max_results" in parsed &&
          typeof parsed.max_results === "number" &&
          Number.isFinite(parsed.max_results)
            ? parsed.max_results
            : undefined;

        const filename =
          "filename" in parsed && typeof parsed.filename === "string"
            ? parsed.filename.trim() || undefined
            : undefined;

        const searchTerms =
          "search_terms" in parsed && typeof parsed.search_terms === "string"
            ? parsed.search_terms.trim() || undefined
            : undefined;

        return {
          query,
          max_results: maxResults,
          filename,
          search_terms: searchTerms
        } satisfies FileSearchToolInput;
      }
    }

    throw new Error(
      `user_store_search input missing required "query": ${JSON.stringify(parsed)}`
    );
  }

  /**
   * server-side function tools (user store + memory) executed into the
   * interactions function_result step shape; local bridge tools never reach
   * here — the round loop relays those to the CLI via the broker first
   */
  protected async executeInteractionFunctionCall(
    userId: string,
    conversationId: string,
    functionCall: Interactions.FunctionCallStep
  ) {
    const toolName = functionCall.name;

    try {
      if (toolName === "user_store_search") {
        const input = this.parseUserStoreSearchInput(functionCall.arguments);
        this.logger.info(
          {
            toolName,
            toolCallId: functionCall.id,
            query: input.query,
            max_results: input.max_results,
            filename: input.filename
          },
          "Gemini interactions user_store_search query"
        );

        const output = await this.store.executeFileSearch(userId, input);

        return {
          type: "function_result",
          call_id: functionCall.id,
          name: toolName,
          result: output
        } satisfies Interactions.FunctionResultStep;
      }

      if (toolName === "conversation_memory_search") {
        const output = await this.memoryService.searchMemoryFromToolInput(
          userId,
          conversationId,
          functionCall.arguments
        );
        return {
          type: "function_result",
          call_id: functionCall.id,
          name: toolName,
          result: output
        } satisfies Interactions.FunctionResultStep;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const output = await this.memoryService.getMemoryChunkFromToolInput(
          userId,
          functionCall.arguments
        );
        return {
          type: "function_result",
          call_id: functionCall.id,
          name: toolName,
          result: output
        } satisfies Interactions.FunctionResultStep;
      }

      return {
        type: "function_result",
        call_id: functionCall.id,
        name: toolName,
        is_error: true,
        result: `Unknown tool: ${toolName}`
      } satisfies Interactions.FunctionResultStep;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          toolCallId: functionCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "Gemini interactions function tool execution failed"
      );

      return {
        type: "function_result",
        call_id: functionCall.id,
        name: toolName,
        is_error: true,
        result: this.prisma.safeErrMsg(error)
      } satisfies Interactions.FunctionResultStep;
    }
  }

  /**
   * Interactions-API twin of chat.ts's handleGeminiAiChatRequest — same wire
   * events, same block tracking, same tool-round safety rails, same image
   * persistence, consuming the interactions SSE stream instead of
   * generateContentStream. Conversation state is client-managed: every
   * round resends the full Step[] history (store:false), so a tool round
   * replays the model's thought (signature), any model_output text, and the
   * function_call steps ahead of our function_result steps.
   */
  protected async handleGeminiInteractionsRequest({
    chunks,
    conversationId,
    msgs,
    userMsgId,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    keyId,
    apiKey,
    max_tokens,
    model: m = "gemini-3.1-pro-preview" satisfies GeminiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    audioGenEnabled,
    imgGenFields,
    imgGenEnabled,
    jobId,
    requestMessageId,
    topP,
    userData,
    localTools,
    via
  }: ProviderGeminiChatRequestEntity) {
    const provider = "gemini" as const;
    const model = m as GeminiModelIdUnion;

    // Local read-only tool bridge — capability advertised by the CLI on
    // this exact turn; absent means zero local declarations attached.
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

    const params = await this.interactionCreate({
      msgs,
      apiKey,
      keyId,
      latlng: userData?.latlng,
      model,
      max_tokens,
      imgGenFields,
      via,
      systemPrompt
    });
    if (localToolTurn) {
      this.logger.info(
        {
          turnId: localToolTurn.turnId,
          advertised: [...localToolTurn.advertised],
          conversationId
        },
        "local tool bridge armed for gemini interactions turn"
      );
    }

    // backstop only, not a working budget — memory tools dual-wield across
    // rounds; the MAX_ROUNDS forced-stop fallback stays as the safety net
    const MAX_ROUNDS = 10_000_000;
    const maxUserStoreSearchCalls = 10;

    let geminiThinkingDuration = 0,
      geminiThinkingAgg = "",
      usage = 0,
      interactionId: string | undefined = undefined,
      uploadtInitial = 0,
      tInitial = 0,
      uploadtDelta = 0,
      geminiAgg = "";
    const trackedBlocks = Array.of<InteractionsFinalizedMessageBlock>();
    let activeBlock: InteractionsActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;

    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();

    let roundInput = Array.of<Interactions.Step>(...params.input);
    let forcedLoopStopReason:
      | "MAX_ROUNDS"
      | "MAX_USER_STORE_SEARCH_CALLS"
      | "REPEATED_TOOL_CALLS"
      | null = null;

    const geminiDataArr = Array.of<InteractionsInlineImage>();
    // lyria audio fragments — decoded then Buffer.concat'd AFTER the stream
    // (never concatenate base64 strings; padded fragments corrupt)
    const audioFragments = Array.of<string>();
    let audioMime: string | undefined = undefined;
    const toolCallSignatureRegistry = new Map<string, number>();
    let userStoreSearchCallsTotal = 0;

    const gemini = this.getClient(apiKey);

    const finalizeActiveBlock = () => {
      if (!activeBlock || activeBlock.content.length === 0) {
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
        geminiThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (
      type: InteractionsActiveMessageBlock["type"]
    ) => {
      if (activeBlock?.type !== type) {
        finalizeActiveBlock();
        activeBlock = {
          content: "",
          startedAt: performance.now(),
          type
        };
      }

      return activeBlock;
    };

    const getThinkingDuration = () => {
      const activeThinkingDuration =
        activeBlock?.type === "THINKING"
          ? Math.round(performance.now() - activeBlock.startedAt)
          : 0;

      const totalThinkingDuration =
        geminiThinkingDuration + activeThinkingDuration;

      return totalThinkingDuration > 0 ? totalThinkingDuration : undefined;
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

    const emitThinkingChunk = (thinkingText: string) => {
      geminiThinkingAgg += thinkingText;
      thinkingChunks.push(thinkingText);
      const thinkingDuration = getThinkingDuration();

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
          thinkingDuration,
          thinkingText,
          messageBlocks: currentChunkMessageBlock(),
          done: false,
          imgGenEnabled
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
        thinkingDuration,
        thinkingText,
        messageBlocks: currentChunkMessageBlock(),
        done: false,
        imgGenEnabled
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
    };

    const emitTextChunk = (textPart: string) => {
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
          messageBlocks: currentChunkMessageBlock(),
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
          done: false,
          imgGenEnabled
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
        messageBlocks: currentChunkMessageBlock(),
        thinkingDuration:
          geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
        chunk: textPart,
        done: false,
        imgGenEnabled
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
    };

    // nano banana images can and will arrive INSIDE the thought step — as a
    // thought_summary whose content is an ImageContent — not only as an
    // ImageDelta on model_output (probe-verified 2026-08-22); both paths
    // collect here so the final-image persistence below sees them alike
    const collectInlineImage = (data: string, mimeType: string) => {
      finalizeActiveBlock();
      const inline = { data, mimeType } satisfies InteractionsInlineImage;
      geminiDataArr.push(inline);
      const _dataUrl =
        `data:${inline.mimeType};base64,${inline.data.length}` as const;
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
          imgGenEnabled
        } satisfies EventTypeMap["ai_chat_inline_data"])
      );
    };

    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const stepTracks = new Map<number, InteractionsStepTrack>();
      const roundFunctionCalls = Array.of<Interactions.FunctionCallStep>();

      const stream = await gemini.interactions.create({
        ...params,
        input: roundInput
      });

      for await (const event of stream) {
        if (tInitial === 0) {
          tInitial = performance.now();
        }
        switch (event.event_type) {
          case "interaction.created": {
            if (event.interaction.id) {
              interactionId = event.interaction.id;
            }
            break;
          }
          case "interaction.status_update": {
            this.logger.debug(
              { status: event.status, round },
              "gemini interaction status update"
            );
            break;
          }
          case "step.start": {
            const step = event.step;
            const track: InteractionsStepTrack = {
              type: step.type,
              text: "",
              thoughtSummary: "",
              functionCallArgsText: ""
            };
            if (step.type === "function_call") {
              finalizeActiveBlock();
              track.functionCallId = step.id;
              track.functionCallName = step.name;
              track.functionCallArgs = step.arguments;
            } else if (step.type === "thought") {
              track.signature = step.signature;
            } else if (step.type === "model_output" && step.error) {
              this.logger.warn(
                { index: event.index, error: step.error, round },
                "gemini interaction model_output step opened with an error"
              );
            }
            stepTracks.set(event.index, track);
            break;
          }
          case "step.delta": {
            const delta = event.delta;
            if (event.metadata?.total_usage?.total_tokens) {
              usage = event.metadata.total_usage.total_tokens;
            }
            let track = stepTracks.get(event.index);
            if (!track) {
              track = {
                type:
                  delta.type === "thought_summary" ||
                  delta.type === "thought_signature"
                    ? "thought"
                    : delta.type === "arguments_delta"
                      ? "function_call"
                      : "model_output",
                text: "",
                thoughtSummary: "",
                functionCallArgsText: ""
              };
              stepTracks.set(event.index, track);
            }
            switch (delta.type) {
              case "thought_summary": {
                const content = delta.content;
                if (content?.type === "text" && content.text) {
                  track.thoughtSummary += content.text;
                  const block = ensureActiveBlock("THINKING");
                  block.content += content.text;
                  emitThinkingChunk(content.text);
                } else if (
                  content?.type === "image" &&
                  content.data &&
                  content.mime_type
                ) {
                  collectInlineImage(content.data, content.mime_type);
                } else if (content?.type === "image" && content.uri) {
                  this.logger.debug(
                    { uri: content.uri, mime: content.mime_type, round },
                    "gemini interaction thought_summary image delivered by uri"
                  );
                }
                break;
              }
              case "thought_signature": {
                if (delta.signature) {
                  track.signature = delta.signature;
                }
                break;
              }
              case "text": {
                if (track.type === "thought") {
                  track.thoughtSummary += delta.text;
                  const block = ensureActiveBlock("THINKING");
                  block.content += delta.text;
                  emitThinkingChunk(delta.text);
                } else {
                  track.text += delta.text;
                  const block = ensureActiveBlock("TEXT");
                  block.content += delta.text;
                  emitTextChunk(delta.text);
                }
                break;
              }
              case "arguments_delta": {
                if (delta.arguments) {
                  track.functionCallArgsText += delta.arguments;
                }
                break;
              }
              case "image": {
                if (delta.data && delta.mime_type) {
                  collectInlineImage(delta.data, delta.mime_type);
                } else if (delta.uri) {
                  this.logger.debug(
                    { uri: delta.uri, mime: delta.mime_type, round },
                    "gemini interaction image delta delivered by uri"
                  );
                }
                break;
              }
              case "audio": {
                if (delta.data) {
                  finalizeActiveBlock();
                  audioFragments.push(delta.data);
                  if (delta.mime_type) {
                    audioMime = delta.mime_type;
                  }
                } else if (delta.uri) {
                  this.logger.debug(
                    { uri: delta.uri, mime: delta.mime_type, round },
                    "gemini interaction audio delta delivered by uri"
                  );
                }
                break;
              }
              case "video":
              case "document": {
                finalizeActiveBlock();
                this.logger.debug(
                  { index: event.index, type: delta.type, round },
                  "gemini interaction media delta — lane not wired yet"
                );
                break;
              }
              default: {
                this.logger.debug(
                  { index: event.index, type: delta.type, round },
                  "gemini interaction server-side tool delta"
                );
                break;
              }
            }
            break;
          }
          case "step.stop": {
            if (event.usage?.total_tokens) {
              usage = event.usage.total_tokens;
            }
            const track = stepTracks.get(event.index);
            if (
              track?.type === "function_call" &&
              track.functionCallId &&
              track.functionCallName
            ) {
              let args = track.functionCallArgs ?? {};
              if (track.functionCallArgsText.length > 0) {
                try {
                  args = JSON.parse<Record<string, unknown>>(
                    track.functionCallArgsText
                  );
                } catch (err) {
                  this.logger.warn(
                    {
                      index: event.index,
                      name: track.functionCallName,
                      err: this.prisma.safeErrMsg(err)
                    },
                    "gemini interaction arguments_delta did not parse as JSON; falling back to step.start arguments"
                  );
                }
              }
              track.functionCallArgs = args;
              roundFunctionCalls.push({
                type: "function_call",
                id: track.functionCallId,
                name: track.functionCallName,
                arguments: args
              });
            }
            break;
          }
          case "interaction.completed": {
            if (event.interaction.id) {
              interactionId = event.interaction.id;
            }
            if (event.interaction.usage?.total_tokens) {
              usage = event.interaction.usage.total_tokens;
            }
            if (event.interaction.status !== "completed") {
              this.logger.warn(
                { status: event.interaction.status, round },
                "gemini interaction finished in a non-completed status"
              );
            }
            break;
          }
          case "error": {
            throw new Error(
              event.error?.message ??
                `gemini interactions stream error${event.error?.code ? ` (${event.error.code})` : ""}`
            );
          }
        }
      }

      finalizeActiveBlock();

      if (roundFunctionCalls.length === 0) {
        break;
      }

      let repeatedSignatures = 0;
      for (const functionCall of roundFunctionCalls) {
        if (functionCall.name === "user_store_search") {
          userStoreSearchCallsTotal += 1;
        }

        const signature = `${functionCall.name}:${JSON.stringify(functionCall.arguments)}`;
        const seenCount = toolCallSignatureRegistry.get(signature) ?? 0;

        if (seenCount > 0) {
          repeatedSignatures += 1;
        }

        toolCallSignatureRegistry.set(signature, seenCount + 1);
      }

      if (userStoreSearchCallsTotal > maxUserStoreSearchCalls) {
        forcedLoopStopReason = "MAX_USER_STORE_SEARCH_CALLS";
        this.logger.warn(
          {
            round,
            userStoreSearchCallsTotal,
            maxUserStoreSearchCalls
          },
          "Gemini interactions tool loop stopped after user_store_search call cap"
        );
        break;
      }

      if (
        roundFunctionCalls.length > 0 &&
        repeatedSignatures === roundFunctionCalls.length
      ) {
        forcedLoopStopReason = "REPEATED_TOOL_CALLS";
        this.logger.warn(
          {
            round,
            repeatedSignatures,
            toolCallCount: roundFunctionCalls.length
          },
          "Gemini interactions tool loop stopped due to repeated tool calls"
        );
        break;
      }

      if (round === MAX_ROUNDS) {
        forcedLoopStopReason = "MAX_ROUNDS";
        this.logger.warn(
          {
            round,
            functionCallCount: roundFunctionCalls.length,
            interactionId
          },
          "Gemini interactions tool loop reached max rounds"
        );
        break;
      }

      const functionResultSteps = Array.of<Interactions.FunctionResultStep>();

      for (const functionCall of roundFunctionCalls) {
        // Local read-only bridge: relay to the CLI via the socket-scoped
        // broker (which ALWAYS resolves — deadline/disconnect/cancel become
        // typed is_error results, so the await can never wedge the loop);
        // every other tool takes the server-side path untouched.
        const toolName = functionCall.name;
        if (
          isLocalToolName(toolName) &&
          localToolTurn?.advertised.has(toolName)
        ) {
          const localResult = await this.localToolBroker.request(
            ws,
            {
              type: "local_tool_request",
              conversationId,
              turnId: localToolTurn.turnId,
              round: round + 1,
              toolCallId: functionCall.id,
              name: toolName,
              input: functionCall.arguments,
              timeoutMs: this.localToolBroker.timeoutMsFor(toolName)
            },
            localToolTurn.controller.signal
          );
          const r = localResult.result;
          this.logger.info(
            {
              turnId: localToolTurn.turnId,
              toolCallId: functionCall.id,
              name: toolName,
              round: round + 1,
              ok: r.ok,
              durationMs: r.durationMs,
              ...(r.ok ? {} : { errorCode: r.error.code })
            },
            "local tool round trip (gemini interactions)"
          );
          if (r.ok) {
            functionResultSteps.push({
              type: "function_result",
              call_id: functionCall.id,
              name: toolName,
              result: r.value
            });
          } else {
            functionResultSteps.push({
              type: "function_result",
              call_id: functionCall.id,
              name: toolName,
              is_error: true,
              result: r.error
            });
          }
          continue;
        }
        functionResultSteps.push(
          await this.executeInteractionFunctionCall(
            userId,
            conversationId,
            functionCall
          )
        );
      }

      // replay the model's side of this round in step order ahead of our
      // results — thought (signature is what Gemini 3 needs echoed back),
      // any model_output text, the function_call steps; server-side
      // grounding steps are not replayed, mirroring chat.ts which only
      // echoes function-call + signature parts
      const modelRoundSteps = Array.of<Interactions.Step>();
      for (const [, track] of [...stepTracks.entries()].sort(
        ([a], [b]) => a - b
      )) {
        if (track.type === "thought") {
          if (track.signature || track.thoughtSummary.length > 0) {
            modelRoundSteps.push({
              type: "thought",
              ...(track.signature ? { signature: track.signature } : {}),
              ...(track.thoughtSummary.length > 0
                ? { summary: [{ type: "text", text: track.thoughtSummary }] }
                : {})
            });
          }
        } else if (track.type === "model_output") {
          if (track.text.length > 0) {
            modelRoundSteps.push({
              type: "model_output",
              content: [{ type: "text", text: track.text }]
            });
          }
        } else if (
          track.type === "function_call" &&
          track.functionCallId &&
          track.functionCallName
        ) {
          modelRoundSteps.push({
            type: "function_call",
            id: track.functionCallId,
            name: track.functionCallName,
            arguments: track.functionCallArgs ?? {}
          });
        }
      }

      roundInput = Array.of<Interactions.Step>(
        ...roundInput,
        ...modelRoundSteps,
        ...functionResultSteps
      );

      this.logger.info(
        {
          round,
          interactionId,
          functionCallCount: roundFunctionCalls.length,
          toolResponseCount: functionResultSteps.length
        },
        "Gemini interactions tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && geminiAgg.trim().length === 0) {
      geminiAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        content: geminiAgg,
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

    // lyria audio — persisted (S3 → attachment envelope) BEFORE the final
    // payload so the cdnUrl rides both an audioGenFields-bearing chunk frame
    // and the ai_chat_response; the attachment row itself is created inside
    // handleAiChatResponse's transaction from the envelope, imgGen-parity
    if (audioGenEnabled && audioFragments.length > 0) {
      const audioBuffer = Buffer.concat(
        audioFragments.map(f => Buffer.from(f, "base64"))
      );
      const specs = this.prisma.extractor.mp3Specs(audioBuffer);
      // store:false interactions report an empty id, so || (not ??) is the
      // fallback that actually mints a series id
      const seriesId =
        interactionId ?? (await this.generateId("generationGroupId"));
      const duration = performance.now() - tInitial;
      const mime = specs?.mime ?? audioMime ?? "audio/mpeg";
      const ext = specs?.ext ?? "mp3";
      const filename = `${jobId ?? seriesId}.${ext}`;

      uploadtInitial = performance.now();
      const rt = await this.s3.uploadGenerated(
        audioBuffer,
        this.prisma.isProd,
        {
          contentType: mime,
          filename,
          userId,
          size: audioBuffer.byteLength,
          conversationId,
          origin: "GENERATED"
        }
      );
      uploadtDelta = performance.now() - uploadtInitial;

      const audioFinal = {
        itemId: seriesId,
        draftId: null,
        batchId: null,
        s3ObjectId: rt.s3ObjectId,
        userId,
        origin: "GENERATED",
        status: "COMPLETED",
        size: audioBuffer.byteLength,
        compatKey: rt.key,
        compatStatus: "ALIASED",
        compatCdnUrl: rt.cdnUrl,
        compatReadyAt: new Date(Date.now()),
        compatVersionId: rt.versionId,
        compatS3ObjectId: rt.s3ObjectId,
        compatMime: mime,
        compatExt: ext,
        uploadDuration: uploadtDelta,
        cdnUrl: rt.cdnUrl,
        publicUrl: rt.publicUrl,
        sourceUrl: "buffer",
        thumbnailKey: null,
        bucket: rt.bucket,
        key: rt.key,
        versionId: rt.versionId,
        region: "us-east-1",
        cacheControl: rt.cacheControl ?? null,
        contentDisposition: rt.contentDisposition ?? null,
        contentEncoding: null,
        expiresAt: rt.expires,
        filename,
        ext,
        mime,
        etag: rt.etag ?? null,
        checksumAlgo: rt.checksum?.algo ?? "CRC32",
        checksumSha256: rt.checksum?.value ?? null,
        storageClass: rt.storageClass ?? null,
        sseAlgorithm: null,
        sseKmsKeyId: null,
        s3LastModified: rt?.lastModified ? new Date(rt.lastModified) : null,
        deletedAt: null,
        audio: specs
          ? {
              format: mime,
              duration: specs.durationMs,
              bitrate: specs.bitrate,
              sampleRate: specs.sampleRate,
              channels: specs.channels,
              codec: specs.codec,
              title: null,
              artist: null,
              album: null,
              year: null,
              genre: null,
              waveformPeaks: []
            }
          : null,
        audioGenOutput: jobId ? { jobId, mime, ext } : null,
        generationGroupId: seriesId,
        requestMessageId,
        createdAt: new Date(Date.now()),
        updatedAt: new Date(Date.now()),
        jobId: jobId ?? ""
      } as const satisfies AIChatResponseAudioGenSubFields;

      const audioGenFields = {
        outputMime: mime,
        duration,
        size: audioBuffer.byteLength,
        audio: audioFinal
      } as const satisfies AIChatResponseAudioGenFields;

      ws.send(
        JSON.stringify({
          type: "ai_chat_chunk",
          conversationId,
          userId,
          userMsgId,
          model,
          title,
          systemPrompt,
          isThinking: false,
          temperature,
          topP,
          provider,
          messageBlocks: currentChunkMessageBlock(),
          done: false,
          imgGenEnabled: false,
          audioGenEnabled: true,
          audioGenFields
        } satisfies EventTypeMap["ai_chat_chunk"])
      );
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
        type: "ai_chat_chunk",
        conversationId,
        userId,
        userMsgId,
        model,
        title,
        systemPrompt,
        isThinking: false,
        temperature,
        topP,
        provider,
        messageBlocks: currentChunkMessageBlock(),
        done: false,
        imgGenEnabled: false,
        audioGenEnabled: true,
        audioGenFields
      });

      const d = await this.prisma.handleAiChatResponse({
        chunk: geminiAgg,
        conversationId,
        done: true,
        mime,
        jobId,
        uploadDuration: duration,
        usage,
        requestMessageId,
        audioGenFields,
        audioGenEnabled: true,
        title,
        provider,
        userId,
        systemPrompt,
        temperature,
        userMsgId,
        topP,
        model,
        thinkingText: geminiThinkingAgg,
        thinkingDuration:
          geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
        imgGenEnabled: false,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
      });
      ws.send(
        JSON.stringify({
          type: "ai_chat_response",
          chunk: geminiAgg,
          conversationId,
          done: true,
          aiMsgId: d.aiMsgId,
          convo: d.convo,
          usage,
          audioGenEnabled: true,
          audioGenFields,
          title,
          provider,
          userId,
          systemPrompt,
          temperature,
          userMsgId,
          topP,
          model,
          thinkingText: geminiThinkingAgg,
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
          imgGenEnabled: false,
          messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
        } satisfies EventTypeMap["ai_chat_response"])
      );
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
        type: "ai_chat_response",
        chunk: geminiAgg,
        conversationId,
        done: true,
        aiMsgId: d.aiMsgId,
        convo: d.convo,
        usage,
        audioGenEnabled: true,
        audioGenFields,
        title,
        provider,
        userId,
        systemPrompt,
        temperature,
        userMsgId,
        topP,
        model,
        thinkingText: geminiThinkingAgg,
        thinkingDuration:
          geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
        imgGenEnabled: false,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
      });
      void this.redis.del(`stream:state:${conversationId}`);
      return;
    }

    // last inline image wins — derived after the loop rather than mutated
    // from inside collectInlineImage, so control-flow narrowing keeps the
    // union at the use sites below
    const geminiDataPart = geminiDataArr.at(-1);
    const finalImg = geminiDataPart;
    if (
      imgGenEnabled &&
      geminiDataArr.length > 0 &&
      finalImg?.data &&
      finalImg?.mimeType
    ) {
      // store:false interactions report an empty id, so || (not ??) is the
      // fallback that actually mints a series id
      const seriesId =
        interactionId ?? (await this.generateId("generationGroupId"));
      const duration = performance.now() - tInitial;

      const b64 = Buffer.from(finalImg.data, "base64");
      const getIt = (await this.prisma.extractor.extractRemote(
        b64,
        4096 * 48
      )) as ExpandedImgSpecs;
      const format = getIt.format;
      const filename = seriesId
        .concat("-")
        .concat((geminiDataArr?.length - 1).toString())
        .concat(`.${format}`);

      uploadtInitial = performance.now();

      const rt = await this.s3.uploadGenerated(b64, this.prisma.isProd, {
        contentType: finalImg.mimeType,
        filename: filename,
        userId,
        size: getIt.byteSize,
        conversationId,
        origin: "GENERATED"
      });

      uploadtDelta = performance.now() - uploadtInitial;

      const generationGroupId = seriesId;

      const imgMeta = this.prisma.handleAssetMetadata(getIt).img;
      const height = getIt?.height ?? 0,
        width = getIt?.width ?? 0;
      const imgFinal = {
        cdnUrl: rt.cdnUrl,
        index: geminiDataArr.length - 1,
        itemId: seriesId.concat(`-${geminiDataArr.length - 1}`),
        width: getIt.width,
        height: getIt.height,
        mime: finalImg.mimeType,
        bucket: rt.bucket,
        key: rt.key,
        versionId: rt.versionId,
        s3ObjectId: rt.s3ObjectId,
        filename,
        ext: getIt.format,
        etag: rt.etag ?? null,
        size: getIt.byteSize ?? rt.size ?? null,
        s3LastModified: rt?.lastModified ? new Date(rt.lastModified) : null,
        contentDisposition: rt.contentDisposition ?? null,
        cacheControl: rt.cacheControl ?? null,
        checksumAlgo: rt.checksum?.algo ?? "CRC32",
        checksumSha256: rt.checksum?.value ?? null,
        storageClass: rt.storageClass ?? null,
        generationGroupId,
        image: {
          ...imgMeta,
          width: getIt.width,
          height: getIt.height,
          animated: getIt.animated,
          colorModel:
            getIt.colorModel === "grayscale-alpha"
              ? "grayscale_alpha"
              : getIt.colorModel,
          aspectRatio: getIt.width / getIt.height,
          cameraMake: null,
          cameraModel: null,
          colorSpace: getIt.colorSpace,
          dominantColorHex: null,
          exifDateTimeOriginal: getIt.exifDateTimeOriginal
            ? new Date(getIt.exifDateTimeOriginal)
            : null,
          frames: getIt.frames,
          gpsLat: null,
          gpsLon: null,
          hasAlpha: getIt.hasAlpha,
          iccProfile: getIt.iccProfile,
          lensModel: null,
          orientation: getIt.orientation,
          format: imgMeta?.format ?? "jpeg"
        },
        document: null,
        uploadDuration: uploadtDelta,
        requestMessageId,
        jobId: jobId ?? "",
        jobIndex: 0,
        seriesId: seriesId + `-${geminiDataArr.length - 1}`,
        seriesIndex: geminiDataArr.length - 1,
        kind: "FINAL",
        revisedPrompt: undefined,
        region: "us-east-1",
        batchId: null,
        compatCdnUrl: rt.cdnUrl,
        compatExt: rt.extension ?? getIt.format,
        compatKey: rt.key,
        compatMime: finalImg.mimeType,
        compatReadyAt: null,
        compatStatus: "ALIASED",
        compatS3ObjectId: rt.s3ObjectId,
        compatVersionId: rt.versionId,
        contentEncoding: null,
        createdAt: new Date(Date.now()),
        updatedAt: new Date(Date.now()),
        deletedAt: null,
        origin: "GENERATED",
        publicUrl: rt.publicUrl,
        sourceUrl: "buffer",
        sseAlgorithm: null,
        sseKmsKeyId: null,
        status: "READY",
        thumbnailKey: null,
        userId,
        draftId: null,
        expiresAt: rt.expires,
        imageGenOutput: {
          ext: getIt.format,
          height: getIt.height,
          width: getIt.width,
          isPartial: false,
          jobId: jobId ?? "",
          jobIndex: 0,
          kind: "FINAL",
          mime: finalImg.mimeType,
          revisedPrompt: null,
          seriesId: seriesId.concat(`-${geminiDataArr.length - 1}`),
          seriesIndex: geminiDataArr.length - 1
        }
      } as const satisfies AIChatResponseImgGenSubFields;

      const d = await this.prisma.handleAiChatResponse({
        chunk: geminiAgg,
        conversationId,
        done: true,
        mime: finalImg.mimeType,
        jobId,
        uploadDuration: duration,
        usage,
        requestMessageId,
        imgGenFields: {
          activeImage: imgFinal,
          actualCount: geminiDataArr.length,
          duration,
          images: [imgFinal],
          outputAspectRatio: width / height,
          outputBackground: undefined,
          outputCompression: undefined,
          outputFormat: "png",
          outputMime: finalImg.mimeType,
          outputHeight: height,
          outputQuality: undefined,
          outputSize: getIt.byteSize?.toString(),
          outputWidth: width,
          partialImages: undefined,
          partialImagesActual: 0,
          partialImagesRequested: undefined,
          requestedCount: imgGenFields?.n,
          revisedPrompt: undefined,
          seed: imgGenFields?.seed,
          size: getIt.byteSize
        },
        title,
        provider,
        userId,
        systemPrompt,
        temperature,
        userMsgId,
        data: geminiDataPart
          ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data?.length}`
          : undefined,
        topP,
        model,
        thinkingText: geminiThinkingAgg,
        thinkingDuration:
          geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
        imgGenEnabled: true,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
      });
      ws.send(
        JSON.stringify({
          type: "ai_chat_response",
          chunk: geminiAgg,
          conversationId,
          done: true,
          aiMsgId: d.aiMsgId,
          convo: d.convo,
          imgGenAttachmentId: d.imgGenAttachmentId,
          usage,
          imgGenFields: {
            activeImage: imgFinal,
            actualCount: geminiDataArr.length,
            duration,
            images: [imgFinal],
            outputAspectRatio: width / height,
            outputBackground: undefined,
            outputCompression: undefined,
            outputFormat: "png",
            outputMime: finalImg.mimeType,
            outputHeight: height,
            outputQuality: undefined,
            outputSize: getIt.byteSize?.toString(),
            outputWidth: width,
            partialImages: undefined,
            partialImagesActual: 0,
            partialImagesRequested: undefined,
            requestedCount: imgGenFields?.n,
            revisedPrompt: undefined,
            seed: imgGenFields?.seed,
            size: getIt.byteSize
          },
          title,
          provider,
          userId,
          systemPrompt,
          temperature,
          userMsgId,
          data: geminiDataPart
            ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data?.length}`
            : undefined,
          topP,
          model,
          thinkingText: geminiThinkingAgg,
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
          imgGenEnabled: true,
          messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
        } satisfies EventTypeMap["ai_chat_response"])
      );
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
        type: "ai_chat_response",
        chunk: geminiAgg,
        conversationId,
        convo: d.convo,
        done: true,
        aiMsgId: d.aiMsgId,
        imgGenAttachmentId: d.imgGenAttachmentId,
        usage,
        imgGenFields: {
          activeImage: imgFinal,
          actualCount: geminiDataArr.length,
          duration,
          images: [imgFinal],
          outputAspectRatio: width / height,
          outputBackground: undefined,
          outputCompression: undefined,
          outputFormat: "png",
          outputMime: finalImg.mimeType,
          outputHeight: height,
          outputQuality: undefined,
          outputSize: getIt.byteSize?.toString(),
          outputWidth: width,
          partialImages: undefined,
          partialImagesActual: 0,
          partialImagesRequested: undefined,
          requestedCount: imgGenFields?.n,
          revisedPrompt: undefined,
          seed: imgGenFields?.seed,
          size: getIt.byteSize
        },
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
        imgGenEnabled: true,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
      });
      void this.redis.del(`stream:state:${conversationId}`);
      return;
    }

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
      usage,
      data: geminiDataPart
        ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
        : undefined,
      topP,
      model,
      thinkingText: geminiThinkingAgg,
      thinkingDuration:
        geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
      imgGenEnabled,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
    });
    ws.send(
      JSON.stringify({
        type: "ai_chat_response",
        conversationId,
        userId,
        model,
        userMsgId,
        aiMsgId: d.aiMsgId,
        usage,
        convo: d.convo,
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
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
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
      usage,
      convo: d.convo,
      data: geminiDataPart
        ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
        : undefined,
      thinkingDuration:
        geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
      title,
      topP,
      thinkingText: geminiThinkingAgg,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      provider,
      model,
      chunk: geminiAgg,
      done: true
    });
    void this.redis.del(`stream:state:${conversationId}`);
  }
}
