import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  FunctionCallContext,
  FunctionCallOutput,
  GrokActiveMessageBlock,
  ResponsesComprehensive
} from "@/xai/responses-types.ts";
import type { GrokProviderChatRequestEntity } from "@/xai/types.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import { GrokImgGenService } from "@/xai/img-gen.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  ChatChunkAndResBlock,
  EventTypeMap,
  InlineImageGenAggProps
} from "@slipstream/types";

export class GrokResponsesApiLinearService extends GrokImgGenService {
  protected cuid2: Promise<() => string>;
  constructor(
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    logger: LoggerService,
    prisma: PrismaService,
    userStore: UserStoreVectorService,
    memoryService: ConversationMemoryVectorService,
    apiKey: string,
    managementKey: string,
    // gate using the `via ==="cli"` prop in handleGrokResponsesApiRequest
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
    this.cuid2 = import("@paralleldrive/cuid2").then(t => t.createId);
  }
  protected encryptedTag = "*encrypted output...*" as const;
  protected async handleGrokResponsesApiRequest({
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
    // block accounting: the closed blocks (ordinal === index) and the one
    // being written. Closing is written out inline wherever the wire ends an
    // item or phase, or a different kind of content starts. The closed block
    // IS the wire/persist shape — the same object rides the frame, the
    // ai_chat_response array, and handleAiChatResponse.
    const trackedBlocks = Array.of<ChatChunkAndResBlock>();
    let activeBlock: GrokActiveMessageBlock | undefined = undefined;
    // a summarised reasoning item's `done` also carries encrypted_content;
    // this is how the placeholder branch knows a summary already streamed
    const reasoningItemsWithSummaryText = new Set<string>();
    let inlineImageActive = false;
    let seriesOrdinal = -1;
    const inlineImageGenAgg = Array.of<InlineImageGenAggProps>();
    let seriesId: string | undefined = undefined;
    const seriesIdAgg = Array.of<string>();
    let inlineImgAggArr:
      | [number, string, string, string, string, $Enums.ImageGenOutputKind]
      | undefined = undefined;

    const supportsFunctionTools = this.canUseFunctionTools(m);
    const collectionId = await this.getUserCollectionIdWithFallback(
      userId,
      management_api_key
    );

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
          localTools,
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
            imgDetail: "high",
            store: false,
            stream: true,
            user: userId,
            parallel_tool_calls: true,
            logprobs: false,
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
          // a THINKING / ENCRYPTED_THINKING block that closed during this
          // chunk; the thinking frame below carries it (final duration at its
          // ordinal) in place of the active block
          let closedBlock: ChatChunkAndResBlock | undefined = undefined;
          // an IMAGE_GEN frame built this chunk. Sent after the thinking frame
          // below, so the closed image THINKING block (ordinal N) precedes the
          // image (ordinal N+1) on the wire in the same order as trackedBlocks
          let pendingImageFrame: EventTypeMap["ai_chat_chunk"] | undefined =
            undefined;

          if (chunk.event === "response.output_item.added") {
            if (chunk.data.item.type !== "reasoning") {
              // any non-reasoning item ends whatever block was open
              if (activeBlock && activeBlock.content.length > 0) {
                const closed = {
                  content: activeBlock.content,
                  conversationId,
                  durationMs: Math.max(
                    0,
                    performance.now() - activeBlock.startedAt
                  ),
                  ordinal: trackedBlocks.length,
                  type: activeBlock.type
                } satisfies ChatChunkAndResBlock;
                trackedBlocks.push(closed);
                if (closed.type === "THINKING") {
                  grokThinkingDuration += closed.durationMs;
                  closedBlock = closed;
                }
              }
              activeBlock = undefined;
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
            } else if (chunk.data.item.type === "image_generation_call") {
              // the image THINKING block opens here, after the close above, so
              // the text before the image is kept and this block's clock runs
              // from `added` through generation and the upload
              thinkingText = "*Generating Image...*";
              activeBlock = {
                type: "THINKING",
                content: thinkingText,
                itemIds: [chunk.data.item.id],
                startedAt: performance.now()
              };
              thinkingChunks.push(thinkingText);
              grokThinkingDisplayAgg += thinkingText;
            }
          }

          if (chunk.event === "response.output_item.done") {
            if (chunk.data.item.type === "image_generation_call") {
              if (typeof seriesId === "undefined") {
                const cuid2 = (await this.cuid2)();
                seriesId = cuid2;
              } else {
                const gt0 = seriesIdAgg.length > 0;
                if (gt0) {
                  const lastIndex = seriesIdAgg[seriesIdAgg.length - 1];
                  if (lastIndex && lastIndex === seriesId) {
                    seriesId = undefined;
                    seriesId = (await this.cuid2)();
                  }
                }
              }
              if (seriesOrdinal === -1) {
                seriesOrdinal += 1;
              }
              inlineImgAggArr = [
                seriesOrdinal,
                chunk.data.item.result,
                chunk.data.item.id,
                chunk.data.item.prompt,
                seriesId,
                "FINAL"
              ];
              inlineImageActive = true;
              if (!seriesIdAgg.includes(seriesId)) {
                seriesIdAgg.push(seriesId);
              }
            }
          }

          if (inlineImageActive && typeof inlineImgAggArr !== "undefined") {
            const sOrdinal = inlineImgAggArr[0];
            const revisedPrompt = inlineImgAggArr[3];
            const sId = inlineImgAggArr[4];
            const kind = inlineImgAggArr[5];
            const b64 = inlineImgAggArr[1];
            const b64Buff= Buffer.from(b64, "base64");

            const specs = (await this.prisma.extractor.extractRemote(
              b64Buff,
              4096 * 48
            )) as ExpandedImgSpecs;
            const format = specs.format;
            const filename = `${sId}-${sOrdinal}.${format}`;
            const mime = specs.contentType ?? this.prisma.getGenMime(format);

            const uploadImgInitial = performance.now();

            const s3RTHelper = await this.s3.uploadGenerated(
              b64Buff,
              this.prisma.isProd,
              {
                contentType:
                  specs.contentType ?? this.prisma.getGenMime(format),
                filename,
                origin: "GENERATED",
                userId,
                size: specs.byteSize ?? b64Buff.byteLength,
                conversationId
              }
            );
            const cdnUrl = s3RTHelper.cdnUrl;
            const uploadDuration = performance.now() - uploadImgInitial;

            const s3LastModified = s3RTHelper.lastModified
              ? new Date(s3RTHelper.lastModified)
              : new Date(Date.now());

            const inlineImgObj = this.inlineImagePostUploadObj({
              specs,
              s3RTHelper,
              userId,
              filename,
              format,
              size: b64Buff.byteLength,
              mime,
              cdnUrl,
              generatingModel: "grok-imagine-image-2.0",
              facilitatingModel: m,
              provider: "GROK",
              conversationId,
              seriesOrdinal: sOrdinal,
              seriesId: sId,
              revisedPrompt,
              kind,
              uploadDuration,
              s3LastModified
            });

            inlineImageGenAgg.push(inlineImgObj);

            // the image lands in the block system, three steps, inline:
            // (1) close the image THINKING block — one duration, added → cdn url
            if (activeBlock && activeBlock.content.length > 0) {
              const closed = {
                content: activeBlock.content,
                conversationId,
                durationMs: Math.max(
                  0,
                  performance.now() - activeBlock.startedAt
                ),
                ordinal: trackedBlocks.length,
                type: activeBlock.type
              } satisfies ChatChunkAndResBlock;
              trackedBlocks.push(closed);
              if (closed.type === "THINKING") {
                grokThinkingDuration += closed.durationMs;
                closedBlock = closed;
              }
            }
            activeBlock = undefined;

            // (2) the IMAGE_GEN block at the next ordinal: the prompt is its
            //     content (the subcaption), the four wire fields ride with it
            const imageBlock = {
              content: revisedPrompt,
              conversationId,
              durationMs: 0,
              ordinal: trackedBlocks.length,
              type: "IMAGE_GEN",
              inlineImageData: {
                width: specs.width,
                height: specs.height,
                cdnUrl,
                kind
              }
            } satisfies ChatChunkAndResBlock<"IMAGE_GEN">;
            trackedBlocks.push(imageBlock);

            // (3) one frame for it, held until after the thinking frame below
            //     so its THINKING block goes out first. imgGenEnabled stays
            //     false: a one-off is a TEXT message, and `true` flips the
            //     client into the job lane.
            const imageFrame = {
              type: "ai_chat_chunk",
              conversationId,
              userId,
              title,
              userMsgId,
              imgGenEnabled: false,
              provider,
              chunk: revisedPrompt,
              systemPrompt,
              temperature,
              topP,
              model: m,
              isThinking: false,
              messageBlocks: imageBlock,
              // the DB-ready row, once, on the frame that carries its block:
              // the client synthesizes its streaming attachment from it
              inlineImgGenData: inlineImgObj,
              done: false
            } as const satisfies EventTypeMap["ai_chat_chunk"];
            pendingImageFrame = imageFrame;

            if (kind === "FINAL" && seriesId) {
              seriesId = undefined;
            }
            if (kind === "FINAL" && seriesOrdinal !== -1) {
              seriesOrdinal = -1;
            }
            inlineImageActive = false;
            inlineImgAggArr = undefined;
          }

          if (chunk.event === "response.created") {
            this.logger.info(
              { round, responseId: chunk.data.response.id },
              "xAI response round started"
            );
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
            if (
              chunk.data.item.type === "reasoning" &&
              "encrypted_content" in chunk.data.item &&
              chunk.data.item.encrypted_content.length > 0 &&
              !reasoningItemsWithSummaryText.has(chunk.data.item.id)
            ) {
              // encrypted-only reasoning item (tco_, or an rs_ with no summary):
              // one placeholder block, pushed here and nowhere else — `done`
              // fires once per item. Close whatever is open first so the
              // placeholder takes its own ordinal.
              if (activeBlock && activeBlock.content.length > 0) {
                const closed = {
                  content: activeBlock.content,
                  conversationId,
                  durationMs: Math.max(
                    0,
                    performance.now() - activeBlock.startedAt
                  ),
                  ordinal: trackedBlocks.length,
                  type: activeBlock.type
                } satisfies ChatChunkAndResBlock;
                trackedBlocks.push(closed);
                if (closed.type === "THINKING") {
                  grokThinkingDuration += closed.durationMs;
                }
              }
              activeBlock = undefined;

              // content is the ciphertext (persisted, store-only); the frame
              // site swaps in the tag for the wire
              const encryptedBlock = {
                content: chunk.data.item.encrypted_content,
                conversationId,
                durationMs: 0,
                ordinal: trackedBlocks.length,
                type: "ENCRYPTED_THINKING"
              } satisfies ChatChunkAndResBlock;
              trackedBlocks.push(encryptedBlock);
              closedBlock = encryptedBlock;
              grokThinkingDisplayAgg =
                grokThinkingDisplayAgg.length > 0
                  ? grokThinkingDisplayAgg.concat("\n", this.encryptedTag)
                  : this.encryptedTag;
              thinkingChunks.push(this.encryptedTag);
              thinkingText = this.encryptedTag;
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
            // a new summary part is a new THINKING block: close whatever is
            // open and open one; its clock runs from here to part.done
            if (activeBlock && activeBlock.content.length > 0) {
              const closed = {
                content: activeBlock.content,
                conversationId,
                durationMs: Math.max(
                  0,
                  performance.now() - activeBlock.startedAt
                ),
                ordinal: trackedBlocks.length,
                type: activeBlock.type
              } satisfies ChatChunkAndResBlock;
              trackedBlocks.push(closed);
              if (closed.type === "THINKING") {
                grokThinkingDuration += closed.durationMs;
                closedBlock = closed;
              }
            }
            activeBlock = {
              content: "",
              itemIds: [chunk.data.item_id],
              startedAt: performance.now(),
              type: "THINKING"
            };
          }

          if (chunk.event === "response.reasoning_summary_text.delta") {
            if (activeBlock?.type !== "THINKING") {
              // a delta with no part.added before it: same as part.added
              if (activeBlock && activeBlock.content.length > 0) {
                const closed = {
                  content: activeBlock.content,
                  conversationId,
                  durationMs: Math.max(
                    0,
                    performance.now() - activeBlock.startedAt
                  ),
                  ordinal: trackedBlocks.length,
                  type: activeBlock.type
                } satisfies ChatChunkAndResBlock;
                trackedBlocks.push(closed);
              }
              activeBlock = {
                content: "",
                itemIds: [chunk.data.item_id],
                startedAt: performance.now(),
                type: "THINKING"
              };
            }
            activeBlock.content += chunk.data.delta;
            grokThinkingDisplayAgg += chunk.data.delta;
            thinkingChunks.push(chunk.data.delta);
            reasoningItemsWithSummaryText.add(chunk.data.item_id);
            thinkingText = chunk.data.delta;
          }

          if (chunk.event === "response.reasoning_summary_part.done") {
            // the settle-stamp: the THINKING block for this part closes here
            if (activeBlock && activeBlock.content.length > 0) {
              const closed = {
                content: activeBlock.content,
                conversationId,
                durationMs: Math.max(
                  0,
                  performance.now() - activeBlock.startedAt
                ),
                ordinal: trackedBlocks.length,
                type: activeBlock.type
              } satisfies ChatChunkAndResBlock;
              trackedBlocks.push(closed);
              if (closed.type === "THINKING") {
                grokThinkingDuration += closed.durationMs;
                closedBlock = closed;
              }
            }
            activeBlock = undefined;
          }

          if (chunk.event === "response.output_text.delta") {
            if (activeBlock?.type !== "TEXT") {
              // text after a THINKING (or after the image) opens a fresh TEXT block
              if (activeBlock && activeBlock.content.length > 0) {
                const closed = {
                  content: activeBlock.content,
                  conversationId,
                  durationMs: Math.max(
                    0,
                    performance.now() - activeBlock.startedAt
                  ),
                  ordinal: trackedBlocks.length,
                  type: activeBlock.type
                } satisfies ChatChunkAndResBlock;
                trackedBlocks.push(closed);
                if (closed.type === "THINKING") {
                  grokThinkingDuration += closed.durationMs;
                  closedBlock = closed;
                }
              }
              activeBlock = {
                content: "",
                itemIds: [chunk.data.item_id],
                startedAt: performance.now(),
                type: "TEXT"
              };
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

            // the round is over: close whatever is open. No re-scan of the
            // output for encrypted reasoning — every item already had its done.
            if (activeBlock && activeBlock.content.length > 0) {
              const closed = {
                content: activeBlock.content,
                conversationId,
                durationMs: Math.max(
                  0,
                  performance.now() - activeBlock.startedAt
                ),
                ordinal: trackedBlocks.length,
                type: activeBlock.type
              } satisfies ChatChunkAndResBlock;
              trackedBlocks.push(closed);
              if (closed.type === "THINKING") {
                grokThinkingDuration += closed.durationMs;
                closedBlock = closed;
              }
            }
            activeBlock = undefined;

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

          // frames: whatever is open rides on every frame with a live ordinal
          // and duration; a block that closed this chunk goes out once with
          // its final duration in place of it
          const activeBlockDuration = activeBlock
            ? Math.max(0, performance.now() - activeBlock.startedAt)
            : 0;
          const activeFrameBlock = activeBlock
            ? {
                type: activeBlock.type,
                content: activeBlock.content,
                ordinal: trackedBlocks.length,
                conversationId,
                durationMs: activeBlockDuration
              }
            : undefined;
          const closedFrameBlock = closedBlock
            ? {
                ...closedBlock,
                // the wire gets the tag; the block keeps the ciphertext
                content:
                  closedBlock.type === "ENCRYPTED_THINKING"
                    ? this.encryptedTag
                    : closedBlock.content
              }
            : undefined;
          const thinkingDuration =
            grokThinkingDuration +
            (activeBlock?.type === "THINKING" ? activeBlockDuration : 0);

          if (thinkingText || closedFrameBlock) {
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
                messageBlocks: closedFrameBlock ?? activeFrameBlock,
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
              messageBlocks: closedFrameBlock ?? activeFrameBlock,
              systemPrompt,
              temperature,
              topP,
              provider,
              done: false
            });
          }

          // the image frame goes out after its THINKING block, never before
          if (pendingImageFrame) {
            ws.send(JSON.stringify(pendingImageFrame));
            void this.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              pendingImageFrame
            );
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
                isThinking: false,
                messageBlocks: activeFrameBlock,
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
              messageBlocks: activeFrameBlock,
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
            via === "cli" &&
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
          conversationId,
          durationMs: 0,
          ordinal: trackedBlocks.length,
          type: "TEXT"
        });
      }

      const d = await this.prisma.handleAiChatResponse({
        jobId,
        requestMessageId,
        usage,
        chunk: grokAgg,
        conversationId,
        done: true,
        imgGenEnabled: false,
        audioGenEnabled,
        inlineImageGenAgg:
          inlineImageGenAgg.length > 0 ? inlineImageGenAgg : undefined,
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
        messageBlocks: trackedBlocks.length > 0 ? trackedBlocks : undefined,
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
          messageBlocks: trackedBlocks.length > 0 ? trackedBlocks : undefined,
          inlineImgGenData:
            inlineImageGenAgg.length > 0 ? inlineImageGenAgg : undefined,
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
        messageBlocks: trackedBlocks.length > 0 ? trackedBlocks : undefined,
        inlineImgGenData:
          inlineImageGenAgg.length > 0 ? inlineImageGenAgg : undefined,
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
