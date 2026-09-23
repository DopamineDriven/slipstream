import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  FunctionCallContext,
  FunctionCallOutput,
  GrokActiveMessageBlock,
  GrokFinalizedMessageBlock,
  ResponsesComprehensive
} from "@/xai/responses-types.ts";
import type { GrokProviderChatRequestEntity } from "@/xai/types.ts";
import { GrokImgGenService } from "@/xai/img-gen.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";

export class GrokResponsesApiLinearService extends GrokImgGenService {
  constructor(
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    logger: LoggerService,
    prisma: PrismaService,
    userStore: UserStoreVectorService,
    memoryService: ConversationMemoryVectorService,
    apiKey: string,
    managementKey: string,
    // local tool bridge ownership STARTS here — the img-gen/workup
    // ancestors never see it, mirroring the openai responses-chat pattern
    protected localToolBroker: LocalToolBroker
  ) {
    super(
      redis,
      s3,
      logger,
      prisma,
      userStore,
      memoryService,
      apiKey,
      managementKey
    );
  }
  protected encryptedTag = "*encrypted output...*" as const;
  protected async handleXAIAiResponsesApiRequest({
    chunks,
    conversationId,
    streamChannel,
    msgs,
    thinkingChunks,
    via,
    apiKey = this.xaiKey,
    ws,
    userId,
    isNewChat,
    max_tokens,
    audioGenEnabled,
    model = "grok-4.7",
    systemPrompt,
    temperature,
    keyId,
    imgGenEnabled,
    docCounts,
    imgCounts,
    hasUserStoreDocs,
    imgGenFields,
    userMsgId,
    requestMessageId,
    jobId,
    title,
    topP,
    management_api_key = this.xaiManagementKey,
    localTools
  }: GrokProviderChatRequestEntity) {
    if (!this.prisma.isGrokModel(model)) {
      throw new Error(
        `non-grok model passed to handleXAIAiResponsesApiRequest ${model}`
      );
    }

    const m = model;

    const provider = "grok" as const;

    let grokThinkingDuration = 0,
      grokThinkingDisplayAgg = "",
      grokAgg = "",
      usage = 0;
    const trackedBlocks = Array.of<GrokFinalizedMessageBlock>();
    const encryptedReasoningByItemId = new Map<string, string>();
    const displayedReasoningItemIds = new Set<string>();
    const reasoningItemsWithSummaryText = new Set<string>();
    const reasoningPhaseStartedAtByKey = new Map<string, number>();
    const reasoningPhaseDurationByKey = new Map<string, number>();
    let activeBlock: GrokActiveMessageBlock | undefined = undefined;
    let activeReasoningPhaseKey: string | undefined = undefined;
    let nextOrdinal = 0;

    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();

    const supportsFunctionTools = this.canUseFunctionTools(m);
    const collectionId = await this.getUserCollectionIdWithFallback(
      userId,
      management_api_key
    );

    // Local read-only tool bridge — capability advertised by the CLI on
    // this exact turn; absent means zero local definitions attached.
    // turnId mints once per ATTEMPT; the controller is the future
    // cancellation hook (calls await sequentially, so nothing is pending
    // when this throws).
    const localToolTurn =
      localTools?.protocolVersion === 1 && supportsFunctionTools
        ? {
            turnId: await this.localToolBroker.generateTurnId(),
            advertised: new Set<string>(localTools.names),
            controller: new AbortController()
          }
        : undefined;

    const localToolNames = Array.of<
      "repo_search" | "read_file" | "list_directory"
    >();
    if (localToolTurn) {
      for (const name of localToolTurn.advertised) {
        if (this.isLocalToolName(name)) {
          localToolNames.push(name);
        }
      }
      this.logger.info(
        {
          turnId: localToolTurn.turnId,
          advertised: [...localToolTurn.advertised],
          conversationId
        },
        "local tool bridge armed for grok turn"
      );
    }

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
        apiKey,
        managementKey: management_api_key,
        reasoning: this.reasoningByModel(m),
        hasUserStoreDocs,
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
        include: ["reasoning.encrypted_content"],
        localToolNames
      });

      // backstop only, not a working budget — memory tools dual-wield across rounds
      const MAX_TOOL_ROUNDS = 10_000_000;
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
          audioGenEnabled,
          temperature,
          title,
          topP,
          hasUserStoreDocs,
          systemPrompt,
          isNewChat,
          keyId: keyId ?? "",
          apiKey,
          conversationId,
          via,
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
            localToolNames,
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
          let thinkingMessageBlock:
            | {
                type: GrokFinalizedMessageBlock["type"];
                content: string;
                ordinal: number;
                conversationId: string;
                durationMs: number;
              }
            | undefined = undefined;

          // Close the preceding block before consuming an event that changes
          // the active item, phase, or kind of content.
          let closeBeforeEvent = false;
          if (activeBlock) {
            if (
              (chunk.event === "response.output_item.added" &&
                chunk.data.item.type !== "reasoning") ||
              (chunk.event === "response.output_item.done" &&
                chunk.data.item.type === "reasoning") ||
              (chunk.event === "response.output_text.delta" &&
                activeBlock.type !== "TEXT")
            ) {
              closeBeforeEvent = true;
            } else if (
              chunk.event === "response.reasoning_summary_part.added" ||
              chunk.event === "response.reasoning_summary_text.delta"
            ) {
              const phaseKey = `${chunk.data.item_id}:${chunk.data.output_index}:${chunk.data.summary_index}`;
              closeBeforeEvent =
                activeBlock.type !== "THINKING" ||
                (activeReasoningPhaseKey !== undefined &&
                  activeReasoningPhaseKey !== phaseKey);
            }
          }

          if (closeBeforeEvent && activeBlock) {
            const block = activeBlock;
            const previewContent = block.content;
            const encryptedParts = Array.of<string>();
            if (block.type === "ENCRYPTED_THINKING") {
              for (const itemId of block.itemIds) {
                const encryptedContent = encryptedReasoningByItemId.get(itemId);
                if (encryptedContent) {
                  encryptedParts.push(encryptedContent);
                }
              }
            }

            if (previewContent.length > 0 || encryptedParts.length > 0) {
              const phaseDuration = activeReasoningPhaseKey
                ? reasoningPhaseDurationByKey.get(activeReasoningPhaseKey)
                : undefined;
              const startedAt =
                block.type === "THINKING" && activeReasoningPhaseKey
                  ? (reasoningPhaseStartedAtByKey.get(
                      activeReasoningPhaseKey
                    ) ?? block.startedAt)
                  : block.startedAt;
              const durationMs =
                block.type === "THINKING" && phaseDuration !== undefined
                  ? Math.max(0, phaseDuration)
                  : Math.max(0, performance.now() - startedAt);
              const finalizedBlock = {
                content:
                  encryptedParts.length > 0
                    ? encryptedParts.join("\n")
                    : previewContent,
                durationMs,
                itemIds: Array.from(block.itemIds),
                ordinal: nextOrdinal,
                previewContent:
                  block.type === "ENCRYPTED_THINKING"
                    ? this.encryptedTag
                    : previewContent,
                type: block.type
              } satisfies GrokFinalizedMessageBlock;
              trackedBlocks.push(finalizedBlock);
              nextOrdinal += 1;

              if (
                block.type === "THINKING" ||
                block.type === "ENCRYPTED_THINKING"
              ) {
                grokThinkingDuration += durationMs;
              }
              if (
                chunk.event === "response.output_item.done" &&
                chunk.data.item.type === "reasoning"
              ) {
                thinkingMessageBlock = {
                  type: finalizedBlock.type,
                  content: finalizedBlock.previewContent,
                  ordinal: finalizedBlock.ordinal,
                  conversationId,
                  durationMs: finalizedBlock.durationMs
                };
              }
            }
            if (block.type === "THINKING") {
              activeReasoningPhaseKey = undefined;
            }
            activeBlock = undefined;
          }

          if (chunk.event === "response.created") {
            this.logger.info(
              { round, responseId: chunk.data.response.id },
              "xAI response round started"
            );
          }

          if (chunk.event === "response.output_item.added") {
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
              if ("encrypted_content" in chunk.data.item) {
                encryptedReasoningByItemId.set(
                  chunk.data.item.id,
                  chunk.data.item.encrypted_content
                );
              }

              if (
                "encrypted_content" in chunk.data.item &&
                chunk.data.item.encrypted_content.length > 0 &&
                !reasoningItemsWithSummaryText.has(chunk.data.item.id) &&
                !displayedReasoningItemIds.has(chunk.data.item.id)
              ) {
                displayedReasoningItemIds.add(chunk.data.item.id);
                const encryptedContent = encryptedReasoningByItemId.get(
                  chunk.data.item.id
                );
                if (encryptedContent) {
                  trackedBlocks.push({
                    content: encryptedContent,
                    durationMs: 0,
                    itemIds: [chunk.data.item.id],
                    ordinal: nextOrdinal,
                    previewContent: this.encryptedTag,
                    type: "ENCRYPTED_THINKING"
                  });
                  thinkingMessageBlock = {
                    type: "ENCRYPTED_THINKING",
                    content: this.encryptedTag,
                    ordinal: nextOrdinal,
                    conversationId,
                    durationMs: 0
                  };
                  nextOrdinal += 1;
                }
                grokThinkingDisplayAgg =
                  grokThinkingDisplayAgg.length > 0
                    ? grokThinkingDisplayAgg.concat("\n", this.encryptedTag)
                    : this.encryptedTag;
                thinkingChunks.push(this.encryptedTag);
                thinkingText = this.encryptedTag;
              }
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

          if (chunk.event === "response.reasoning_summary_part.added") {
            const phaseKey = `${chunk.data.item_id}:${chunk.data.output_index}:${chunk.data.summary_index}`;

            reasoningPhaseStartedAtByKey.set(phaseKey, performance.now());
            activeReasoningPhaseKey = phaseKey;
            if (!activeBlock) {
              activeBlock = {
                content: "",
                itemIds: [chunk.data.item_id],
                startedAt: performance.now(),
                type: "THINKING"
              };
            } else if (!activeBlock.itemIds.includes(chunk.data.item_id)) {
              activeBlock.itemIds.push(chunk.data.item_id);
            }
          }

          if (chunk.event === "response.reasoning_summary_text.delta") {
            const phaseKey = `${chunk.data.item_id}:${chunk.data.output_index}:${chunk.data.summary_index}`;

            if (!reasoningPhaseStartedAtByKey.has(phaseKey)) {
              reasoningPhaseStartedAtByKey.set(phaseKey, performance.now());
            }

            activeReasoningPhaseKey = phaseKey;
            if (!activeBlock) {
              activeBlock = {
                content: "",
                itemIds: [chunk.data.item_id],
                startedAt: performance.now(),
                type: "THINKING"
              };
            } else if (!activeBlock.itemIds.includes(chunk.data.item_id)) {
              activeBlock.itemIds.push(chunk.data.item_id);
            }
            activeBlock.content += chunk.data.delta;
            grokThinkingDisplayAgg += chunk.data.delta;
            thinkingChunks.push(chunk.data.delta);
            reasoningItemsWithSummaryText.add(chunk.data.item_id);
            displayedReasoningItemIds.add(chunk.data.item_id);
            thinkingText = chunk.data.delta;
          }

          if (chunk.event === "response.reasoning_summary_text.done") {
            const phaseKey = `${chunk.data.item_id}:${chunk.data.output_index}:${chunk.data.summary_index}`;
            const startedAt = reasoningPhaseStartedAtByKey.get(phaseKey);

            if (typeof startedAt === "number") {
              reasoningPhaseDurationByKey.set(
                phaseKey,
                performance.now() - startedAt
              );
            }

            activeReasoningPhaseKey = phaseKey;
          }

          if (chunk.event === "response.reasoning_summary_part.done") {
            const phaseKey = `${chunk.data.item_id}:${chunk.data.output_index}:${chunk.data.summary_index}`;

            if (activeReasoningPhaseKey === phaseKey) {
              const startedAt = reasoningPhaseStartedAtByKey.get(phaseKey);

              if (typeof startedAt === "number") {
                reasoningPhaseDurationByKey.set(
                  phaseKey,
                  performance.now() - startedAt
                );
              }
            }
          }

          if (chunk.event === "response.output_text.delta") {
            if (!activeBlock) {
              activeBlock = {
                content: "",
                itemIds: [chunk.data.item_id],
                startedAt: performance.now(),
                type: "TEXT"
              };
            } else if (!activeBlock.itemIds.includes(chunk.data.item_id)) {
              activeBlock.itemIds.push(chunk.data.item_id);
            }
            activeBlock.content += chunk.data.delta;
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
            for (const output of chunk.data.response.output) {
              if (
                output.type === "reasoning" &&
                "encrypted_content" in output &&
                output.encrypted_content.length > 0
              ) {
                encryptedReasoningByItemId.set(
                  output.id,
                  output.encrypted_content
                );
                if (
                  !reasoningItemsWithSummaryText.has(output.id) &&
                  !displayedReasoningItemIds.has(output.id)
                ) {
                  displayedReasoningItemIds.add(output.id);
                  trackedBlocks.push({
                    content: output.encrypted_content,
                    durationMs: 0,
                    itemIds: [output.id],
                    ordinal: nextOrdinal,
                    previewContent: this.encryptedTag,
                    type: "ENCRYPTED_THINKING"
                  });
                  nextOrdinal += 1;
                  grokThinkingDisplayAgg =
                    grokThinkingDisplayAgg.length > 0
                      ? grokThinkingDisplayAgg.concat("\n", this.encryptedTag)
                      : this.encryptedTag;
                  thinkingChunks.push(this.encryptedTag);
                }
              }
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

          let closeAfterEvent =
            chunk.event === "response.completed" &&
            chunk.data.response.status === "completed";
          if (chunk.event === "response.reasoning_summary_text.done") {
            closeAfterEvent = true;
          } else if (chunk.event === "response.reasoning_summary_part.done") {
            const phaseKey = `${chunk.data.item_id}:${chunk.data.output_index}:${chunk.data.summary_index}`;
            closeAfterEvent = activeReasoningPhaseKey === phaseKey;
          }

          if (closeAfterEvent && activeBlock) {
            const block = activeBlock;
            const previewContent = block.content;
            const encryptedParts = Array.of<string>();
            if (block.type === "ENCRYPTED_THINKING") {
              for (const itemId of block.itemIds) {
                const encryptedContent = encryptedReasoningByItemId.get(itemId);
                if (encryptedContent) {
                  encryptedParts.push(encryptedContent);
                }
              }
            }

            if (previewContent.length > 0 || encryptedParts.length > 0) {
              const phaseDuration = activeReasoningPhaseKey
                ? reasoningPhaseDurationByKey.get(activeReasoningPhaseKey)
                : undefined;
              const startedAt =
                block.type === "THINKING" && activeReasoningPhaseKey
                  ? (reasoningPhaseStartedAtByKey.get(
                      activeReasoningPhaseKey
                    ) ?? block.startedAt)
                  : block.startedAt;
              const durationMs =
                block.type === "THINKING" && phaseDuration !== undefined
                  ? Math.max(0, phaseDuration)
                  : Math.max(0, performance.now() - startedAt);
              trackedBlocks.push({
                content:
                  encryptedParts.length > 0
                    ? encryptedParts.join("\n")
                    : previewContent,
                durationMs,
                itemIds: Array.from(block.itemIds),
                ordinal: nextOrdinal,
                previewContent:
                  block.type === "ENCRYPTED_THINKING"
                    ? this.encryptedTag
                    : previewContent,
                type: block.type
              } satisfies GrokFinalizedMessageBlock);
              nextOrdinal += 1;
              if (
                block.type === "THINKING" ||
                block.type === "ENCRYPTED_THINKING"
              ) {
                grokThinkingDuration += durationMs;
              }
            }
            if (block.type === "THINKING") {
              activeReasoningPhaseKey = undefined;
            }
            activeBlock = undefined;
          }

          let activeBlockDuration = 0;
          if (activeBlock) {
            const phaseDuration = activeReasoningPhaseKey
              ? reasoningPhaseDurationByKey.get(activeReasoningPhaseKey)
              : undefined;
            const startedAt =
              activeBlock.type === "THINKING" && activeReasoningPhaseKey
                ? (reasoningPhaseStartedAtByKey.get(activeReasoningPhaseKey) ??
                  activeBlock.startedAt)
                : activeBlock.startedAt;
            activeBlockDuration =
              activeBlock.type === "THINKING" && phaseDuration !== undefined
                ? Math.max(0, phaseDuration)
                : Math.max(0, performance.now() - startedAt);
          }

          const nextThinkingMessageBlock =
            thinkingMessageBlock ??
            (activeBlock
              ? {
                  type: activeBlock.type,
                  content:
                    activeBlock.type === "ENCRYPTED_THINKING"
                      ? this.encryptedTag
                      : activeBlock.content,
                  ordinal: nextOrdinal,
                  conversationId,
                  durationMs: activeBlockDuration
                }
              : undefined);
          const thinkingDuration =
            grokThinkingDuration +
            (activeBlock?.type === "THINKING" ||
            activeBlock?.type === "ENCRYPTED_THINKING"
              ? activeBlockDuration
              : 0);

          if (
            thinkingText ||
            nextThinkingMessageBlock?.type === "ENCRYPTED_THINKING"
          ) {
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
                messageBlocks: nextThinkingMessageBlock,
                thinkingDuration:
                  thinkingDuration > 0 ? thinkingDuration : undefined,
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
              thinkingDuration:
                thinkingDuration > 0 ? thinkingDuration : undefined,
              thinkingText,
              messageBlocks: nextThinkingMessageBlock,
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
            const nextTextMessageBlock = activeBlock
              ? {
                  type: activeBlock.type,
                  content: activeBlock.content,
                  ordinal: nextOrdinal,
                  conversationId,
                  durationMs: activeBlockDuration
                }
              : undefined;

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
                isThinking: false,
                messageBlocks: nextTextMessageBlock,
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
              isThinking: false,
              thinkingText:
                grokThinkingDisplayAgg.length > 0
                  ? grokThinkingDisplayAgg
                  : undefined,
              messageBlocks: nextTextMessageBlock,
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
          // Local read-only bridge: relay to the CLI via the socket-scoped
          // broker (which ALWAYS resolves — deadline/disconnect/cancel
          // become typed is_error results, so the await can never wedge the
          // loop); every other tool takes the existing server-side path.
          const toolName = call.name;
          if (
            this.isLocalToolName(toolName) &&
            localToolTurn?.advertised.has(toolName)
          ) {
            let input: unknown = {};
            let inputParseFailed = false;
            try {
              input = call.arguments ? JSON.parse<unknown>(call.arguments) : {};
            } catch {
              inputParseFailed = true;
            }
            let output: string;
            if (inputParseFailed) {
              output = `Malformed ${call.name} input JSON`;
            } else {
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
              const result = localResult.result;
              this.logger.info(
                {
                  turnId: localToolTurn.turnId,
                  toolCallId: call.call_id,
                  name: call.name,
                  round: round + 1,
                  ok: result.ok,
                  durationMs: result.durationMs,
                  ...(result.ok ? {} : { errorCode: result.error.code })
                },
                "local tool round trip (grok)"
              );
              output = JSON.stringify(
                result.ok ? result.value : { error: result.error }
              );
            }
            toolOutputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output
            } satisfies FunctionCallOutput<string>);
            continue;
          }
          toolOutputs.push(
            await this.executeFunctionToolCall(userId, conversationId, call)
          );
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
        trackedBlocks.push({
          content: grokAgg,
          durationMs: 0,
          itemIds: Array.of<string>(),
          ordinal: nextOrdinal,
          previewContent: grokAgg,
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
        thinkingText:
          grokThinkingDisplayAgg.length > 0
            ? grokThinkingDisplayAgg
            : undefined,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
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
          convo: d.convo,
          systemPrompt,
          usage,
          thinkingDuration:
            grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
          thinkingText:
            grokThinkingDisplayAgg.length > 0
              ? grokThinkingDisplayAgg
              : undefined,
          title,
          temperature,
          topP,
          model: m,
          chunk: grokAgg,
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
        convo: d.convo,
        title,
        userMsgId,
        usage,
        aiMsgId: d.aiMsgId,
        imgGenEnabled: false,
        thinkingDuration:
          grokThinkingDuration > 0 ? grokThinkingDuration : undefined,
        thinkingText:
          grokThinkingDisplayAgg.length > 0
            ? grokThinkingDisplayAgg
            : undefined,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
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
