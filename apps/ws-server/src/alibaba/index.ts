import type { AlibabaChatCompletionsRes, AlibabaUsage } from "@/alibaba/sse.ts";
import type {
  AlibabaAccumulatedToolCall,
  AlibabaActiveMessageBlock,
  AlibabaAssistantMessage,
  AlibabaAssistantToolCallMessage,
  AlibabaBaseMessage,
  AlibabaFinalizedMessageBlock,
  AlibabaForcedLoopStopReason,
  AlibabaFunctionTool,
  AlibabaFunctionToolCall,
  AlibabaImageContentPart,
  AlibabaRequestMessage,
  AlibabaTextContentPart,
  AlibabaToolMessage,
  AlibabaUserContentPart,
  AlibabaUserMessage
} from "@/alibaba/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { FileSearchInput } from "@/store/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type { Logger as PinoLogger } from "pino";
import {
  createAlibabaSSEParser,
  hasToolCallDelta,
  isContentDelta,
  isReasoningDelta
} from "@/alibaba/sse.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type {
  AlibabaModelIdUnion,
  EventTypeMap,
  MessageSingleton
} from "@slipstream/types";

const ALIBABA_TOOLING_LIMITS = {
  fileSearch: {
    defaultResults: 5,
    minResults: 5,
    maxResults: 15
  },
  maxToolRounds: 15
} as const satisfies {
  fileSearch: {
    defaultResults: number;
    minResults: number;
    maxResults: number;
  };
  maxToolRounds: number;
};

const ALIBABA_HISTORY_MESSAGE_LIMIT = 175;

function selectAlibabaHistoryMessages(msgs: readonly MessageSingleton<true>[]) {
  const orderedMsgs = [...msgs].sort((a, b) => a.ordinal - b.ordinal);
  if (orderedMsgs.length <= ALIBABA_HISTORY_MESSAGE_LIMIT) {
    return orderedMsgs;
  }

  const selectedIds = new Set<string>();

  for (
    let msgIndex = orderedMsgs.length - 1;
    msgIndex >= 0 && selectedIds.size < ALIBABA_HISTORY_MESSAGE_LIMIT;
    msgIndex--
  ) {
    const msg = orderedMsgs[msgIndex];
    if (!msg || msg.provider !== "ALIBABA") continue;
    selectedIds.add(msg.id);
  }

  for (
    let msgIndex = orderedMsgs.length - 1;
    msgIndex >= 0 && selectedIds.size < ALIBABA_HISTORY_MESSAGE_LIMIT;
    msgIndex--
  ) {
    const msg = orderedMsgs[msgIndex];
    if (!msg) continue;
    selectedIds.add(msg.id);
  }

  return orderedMsgs.filter(msg => selectedIds.has(msg.id));
}

export class AlibabaService {
  private readonly baseUrl = "https://ai-gateway.vercel.sh/v1/chat/completions";
  private logger: PinoLogger;

  constructor(
    logger: LoggerService,
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private userStoreVector: UserStoreVectorService,
    private apiKey?: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[Alibaba] " }
      );
  }

  private async *stream(
    model = "qwen3.7-max" satisfies AlibabaModelIdUnion,
    messages: readonly AlibabaRequestMessage[],
    apiKey?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_completion_tokens?: number;
      tools?: readonly AlibabaFunctionTool[];
    }
  ): AsyncGenerator<AlibabaChatCompletionsRes, void, unknown> {
    const key = apiKey ?? this.apiKey;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: `alibaba/${model}`,
        messages,
        stream: true,
        tools: options?.tools,
        providerOptions: {
          gateway: {
            zeroDataRetention: true
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Alibaba API error (${response.status}, ${response.statusText}): ${errorText}`
      );
    }

    const parser = createAlibabaSSEParser(response);

    for await (const event of parser) {
      yield event.data;
    }
  }

  private formatSystemInstruction(
    isNewChat: boolean,
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"]
  ) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return systemPrompt ? `${systemPrompt}\n\n${note}` : note;
  }

  private formatHistory(msgs: MessageSingleton<true>[]) {
    const historyMsgs = selectAlibabaHistoryMessages(msgs);
    const formatted = Array.of<AlibabaBaseMessage>();
    const lastIndex = historyMsgs.findLastIndex(
      m => m.provider === "ALIBABA" && m.senderType === "AI"
    );

    const isFirstAlibabaMsg = lastIndex === -1;

    for (const [msgIndex, msg] of historyMsgs.entries()) {
      const isFreshContext = isFirstAlibabaMsg || msgIndex > lastIndex;
      const isCurrentUserMsg = msgIndex === historyMsgs.length - 1;

      if (msg.senderType === "USER") {
        const content = Array.of<AlibabaUserContentPart>();
        const textParts = Array.of<string>();

        try {
          if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatStatus,
                compatCdnUrl,
                compatMime,
                assetType
              } = att;
              const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
              const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

              if (url && mime) {
                const [filename, ext] = this.prisma.filenameToHexExtTuple(
                  url,
                  compatStatus,
                  false
                );
                const name = `${filename}.${ext}`;

                if (assetType === "IMAGE") {
                  if (isFreshContext && isCurrentUserMsg) {
                    content.push({
                      type: "image_url",
                      image_url: { url, detail: "auto" }
                    } satisfies AlibabaImageContentPart);
                  } else {
                    textParts.push(`![${name}](${url})`);
                  }
                } else {
                  textParts.push(`[${name}](${url})`);
                }
              }
            }
          }
        } catch (err) {
          throw new Error(this.prisma.safeErrMsg(err));
        } finally {
          if (msg.messageBlocks && msg.messageBlocks.length > 0) {
            const textBlocks = Array.of<string>();
            for (const x of msg.messageBlocks) {
              if (x.type === "TEXT") {
                textBlocks.push(x.content);
              }
            }
            textParts.push(textBlocks.join(`\n`));
          } else {
            textParts.push(msg.content);
          }
        }

        content.push({
          type: "text",
          text: textParts.join(`\n\n`)
        } satisfies AlibabaTextContentPart);

        formatted.push({
          role: "user",
          content
        } satisfies AlibabaUserMessage);
      } else {
        const textParts = Array.of<string>();
        const modelIdentifier = `[${msg.provider.toLowerCase()}/${msg.model ?? "model"}]`;

        try {
          if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatStatus,
                assetType,
                compatCdnUrl,
                compatMime
              } = att;
              const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
              const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

              if (url && mime) {
                const [filename, ext] = this.prisma.filenameToHexExtTuple(
                  url,
                  att.compatStatus,
                  false
                );
                const name = `${filename}.${ext}`;

                if (assetType === "IMAGE") {
                  textParts.push(`${modelIdentifier}\n![${name}](${url})`);
                } else {
                  textParts.push(`${modelIdentifier}\n[${name}](${url})`);
                }
              }
            }
          }
        } catch (err) {
          this.logger.info(this.prisma.safeErrMsg(err));
        } finally {
          if (msg.messageBlocks && msg.messageBlocks.length > 0) {
            const textBlocks = Array.of<string>();
            for (const x of msg.messageBlocks) {
              if (x.type === "TEXT") {
                textBlocks.push(x.content);
              }
            }
            textParts.push(`${modelIdentifier}\n\n${textBlocks.join(`\n\n`)}`);
          } else {
            textParts.push(`${modelIdentifier}\n\n${msg.content}`);
          }
        }

        formatted.push({
          role: "assistant",
          content: textParts.join(`\n\n`)
        } satisfies AlibabaAssistantMessage);
      }
    }

    return formatted;
  }

  private fileSearchFunctionTool() {
    return {
      type: "function",
      function: {
        name: "file_search",
        description:
          "This tool utilizes a 'Partitioned Foraging' approach which recognizes that for the 200,000+ years that humans have existed " +
          "95%+ of it has been as foragers. Agents are trained exclusively on data aggregated/curated by humans; " +
          "think of it as agentic foraging complete with Jaccard similarity scores for cross-analyzing your bounties. " +
          "Search the user's uploaded documents. Uses semantic similarity by default. " +
          "When search_terms is provided, execjtes fulltext keyword search and returns " +
          "both result sets separately (semantic + fulltext) so you can reason about which signal " +
          "is most relevant to the user's intent. " +
          "STRONGLY recommend using semantic+fulltext for the richest results" +
          "Without search_terms: returns a flat JSON array of chunks. " +
          "With search_terms: returns { semantic: [...], fulltext: [...], overlap: { chunkIds, jaccardSimilarity }, meta }. " +
          "Call directly for single retrieval tasks, or from code_execution for multi-step programmatic workflows.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The semantic search query."
            },
            max_results: {
              type: "number",
              description:
                "Maximum results to return. Value must be no lower than 5 and no higher than 15. Default 5."
            },
            filename: {
              type: "string",
              description:
                "Optional filename filter (fuzzy, case-insensitive). Only chunks from documents whose filename closely matches this string are returned."
            },
            search_terms: {
              type: "string",
              description:
                "Optional exact-match search terms for fulltext search. " +
                "Supports quoted phrases and negation (-deprecated). " +
                "When provided, returns partitioned semantic + fulltext results instead of a flat array."
            }
          },
          required: ["query"],
          additionalProperties: false
        }
      }
    } as const satisfies AlibabaFunctionTool;
  }

  private async searchStore(
    userId: string,
    query: string,
    limit = 5,
    threshold = 0,
    filename?: string
  ) {
    return await this.userStoreVector.searchUserStoreChunks({
      userId,
      query,
      limit,
      threshold,
      filename
    });
  }

  private async searchStoreHybrid(
    userId: string,
    query: string,
    searchTerms: string,
    limit = 10,
    threshold = 0,
    filename?: string
  ) {
    return await this.userStoreVector.searchUserStoreChunksHybrid({
      userId,
      query,
      searchTerms,
      limit,
      threshold,
      filename
    });
  }

  private parseFileSearchInput(rawArguments: string): FileSearchInput {
    const parsed = this.parseFileSearchArguments(rawArguments);

    if ("query" in parsed && typeof parsed.query === "string") {
      const normalized = parsed.query.trim();
      if (normalized.length > 0) {
        const maxResults =
          "max_results" in parsed && typeof parsed.max_results === "number"
            ? parsed.max_results
            : undefined;

        const filenameInput =
          "filename" in parsed && typeof parsed.filename === "string"
            ? parsed.filename.trim() || undefined
            : undefined;

        const searchTermsInput =
          "search_terms" in parsed && typeof parsed.search_terms === "string"
            ? parsed.search_terms.trim() || undefined
            : undefined;

        return {
          query: normalized,
          max_results: maxResults,
          filename: filenameInput,
          search_terms: searchTermsInput
        } satisfies FileSearchInput;
      }
    }

    const queryList = Array.of<string>();
    if ("queries" in parsed && Array.isArray(parsed.queries)) {
      for (const query of parsed.queries) {
        if (typeof query !== "string") continue;
        const normalized = query.trim();
        if (normalized.length === 0) continue;
        queryList.push(normalized);
      }
    }

    const uniqueQueries = Array.from(new Set(queryList)).slice(0, 5);
    const firstQuery = uniqueQueries[0];
    if (!firstQuery) {
      throw new Error(
        `file_search input missing required "query": ${rawArguments}`
      );
    }

    const maxResults =
      "max_results" in parsed && typeof parsed.max_results === "number"
        ? parsed.max_results
        : undefined;

    const filenameInput =
      "filename" in parsed && typeof parsed.filename === "string"
        ? parsed.filename.trim() || undefined
        : undefined;

    const searchTermsInput =
      "search_terms" in parsed && typeof parsed.search_terms === "string"
        ? parsed.search_terms.trim() || undefined
        : undefined;

    return {
      queries: [firstQuery, ...uniqueQueries.slice(1)] as const,
      max_results: maxResults,
      filename: filenameInput,
      search_terms: searchTermsInput
    } satisfies FileSearchInput;
  }

  private parseFileSearchArguments(rawArguments: string) {
    const trimmed = rawArguments.trim();
    if (trimmed.length === 0) {
      return {} satisfies Record<string, unknown>;
    }

    try {
      return JSON.parse<Record<string, unknown>>(trimmed);
    } catch (error) {
      const recovered = this.extractFirstJsonObject(trimmed);
      if (!recovered) {
        throw error;
      }

      this.logger.warn(
        {
          rawArgumentsPreview: trimmed.slice(0, 300),
          recoveredPreview: recovered.slice(0, 300),
          error: this.prisma.safeErrMsg(error)
        },
        "Recovered malformed streamed Alibaba file_search arguments"
      );
      return JSON.parse<Record<string, unknown>>(recovered);
    }
  }

  private extractFirstJsonObject(raw: string) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (const [index, char] of Array.from(raw).entries()) {
      if (start === -1) {
        if (char === "{") {
          start = index;
          depth = 1;
        }
        continue;
      }

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === "\\") {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return raw.slice(start, index + 1);
        }
      }
    }

    return undefined;
  }

  private async executeFileSearch(userId: string, input: FileSearchInput) {
    const requestedMaxResults =
      input.max_results ?? ALIBABA_TOOLING_LIMITS.fileSearch.defaultResults;
    const maxResults =
      requestedMaxResults < ALIBABA_TOOLING_LIMITS.fileSearch.minResults
        ? ALIBABA_TOOLING_LIMITS.fileSearch.minResults
        : requestedMaxResults > ALIBABA_TOOLING_LIMITS.fileSearch.maxResults
          ? ALIBABA_TOOLING_LIMITS.fileSearch.maxResults
          : requestedMaxResults;

    if (input.search_terms) {
      const query = "query" in input ? input.query : input.queries[0];
      const partitioned = await this.searchStoreHybrid(
        userId,
        query,
        input.search_terms,
        maxResults,
        0,
        input.filename
      );
      return this.userStoreVector.formatPartitionedResults(partitioned, query);
    }

    const results =
      "query" in input
        ? await this.searchStore(
            userId,
            input.query,
            maxResults,
            0,
            input.filename
          )
        : (
            await Promise.all(
              input.queries.map(query =>
                this.searchStore(userId, query, maxResults, 0, input.filename)
              )
            )
          ).flat();

    if (results.length === 0) {
      return "[]";
    }

    return JSON.stringify(
      results.map(result => ({
        filename: result.filename,
        score: result.score != null ? Number(result.score.toFixed(4)) : 0,
        content: result.content,
        startOffset: result.startOffset,
        endOffset: result.endOffset,
        chunkIndex: result.chunkIndex
      }))
    );
  }

  private async executeToolCall(
    userId: string,
    toolCall: AlibabaFunctionToolCall
  ) {
    if (toolCall.function.name !== "file_search") {
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `Unknown tool: ${toolCall.function.name}`
      } as const satisfies AlibabaToolMessage;
    }

    try {
      const input = this.parseFileSearchInput(toolCall.function.arguments);
      const output = await this.executeFileSearch(userId, input);
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: output
      } as const satisfies AlibabaToolMessage;
    } catch (error) {
      this.logger.error(
        {
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "Alibaba function tool execution failed"
      );
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `file_search error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies AlibabaToolMessage;
    }
  }

  private accumulateToolCallDelta(
    registry: Map<number, AlibabaAccumulatedToolCall>,
    deltas: readonly {
      index: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }[]
  ) {
    for (const delta of deltas) {
      const current = registry.get(delta.index) ?? {
        id: "",
        name: "",
        arguments: ""
      };

      if (delta.id) {
        current.id = delta.id;
      }
      if (delta.function?.name) {
        current.name = delta.function.name;
      }
      if (typeof delta.function?.arguments === "string") {
        current.arguments += delta.function.arguments;
      }

      registry.set(delta.index, current);
    }
  }

  private materializeToolCalls(
    registry: Map<number, AlibabaAccumulatedToolCall>
  ) {
    const materialized = Array.of<AlibabaFunctionToolCall>();

    for (const [, toolCall] of Array.from(registry.entries()).sort(
      ([left], [right]) => left - right
    )) {
      if (!toolCall.id || !toolCall.name) {
        this.logger.warn(
          { toolCall },
          "Skipping incomplete streamed Alibaba tool call"
        );
        continue;
      }

      materialized.push({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      });
    }

    return materialized;
  }

  public async handleAlibabaAiChatRequest({
    chunks,
    conversationId,
    streamChannel,
    msgs,
    thinkingChunks,
    apiKey,
    ws,
    userMsgId,
    userId,
    hasUserStoreDocs,
    isNewChat,
    max_tokens,
    model,
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "alibaba" as const;
    let AlibabaThinkingDuration = 0,
      AlibabaThinkingAgg = "",
      AlibabaAgg = "",
      totalUsage = 0;
    const trackedBlocks = Array.of<AlibabaFinalizedMessageBlock>();
    let activeBlock: AlibabaActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;

    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();

    const finalizeActiveBlock = () => {
      if (!activeBlock || activeBlock.content.length === 0) {
        activeBlock = undefined;
        return;
      }

      const durationMs = performance.now() - activeBlock.startedAt;

      trackedBlocks.push({
        content: activeBlock.content,
        durationMs,
        ordinal: nextOrdinal,
        type: activeBlock.type
      });

      if (activeBlock.type === "THINKING") {
        AlibabaThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (type: AlibabaActiveMessageBlock["type"]) => {
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

    const currentThinkingDuration = () => {
      const activeThinkingDuration =
        activeBlock?.type === "THINKING"
          ? performance.now() - activeBlock.startedAt
          : 0;

      return AlibabaThinkingDuration + activeThinkingDuration;
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
        durationMs: performance.now() - activeBlock.startedAt
      } as const;
    };

    const appendReasoningDelta = (reasoningText?: string) => {
      if (!reasoningText) return;
      const block = ensureActiveBlock("THINKING");

      block.content += reasoningText;
      AlibabaThinkingAgg += reasoningText;
      thinkingChunks.push(reasoningText);

      return reasoningText;
    };

    const tools = hasUserStoreDocs
      ? [this.fileSearchFunctionTool()]
      : undefined;
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );

    let roundMessages = Array.of<AlibabaRequestMessage>(
      ...(systemInstruction
        ? [
            {
              role: "system",
              content: systemInstruction
            } satisfies AlibabaBaseMessage
          ]
        : []),
      ...this.formatHistory(msgs)
    );

    const MAX_TOOL_ROUNDS = ALIBABA_TOOLING_LIMITS.maxToolRounds;
    let forcedLoopStopReason: AlibabaForcedLoopStopReason = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const roundToolCalls = new Map<number, AlibabaAccumulatedToolCall>();
      let roundUsage: AlibabaUsage | undefined = undefined;
      let sawToolCallFinish = false;

      const streamer = this.stream(model, roundMessages, apiKey ?? undefined, {
        max_completion_tokens: max_tokens,
        top_p: topP,
        temperature,
        tools
      });

      for await (const chunk of streamer) {
        if (chunk.usage) {
          roundUsage = chunk.usage;
        }

        for (const choice of chunk.choices ?? []) {
          if (choice.finish_reason === "tool_calls") {
            sawToolCallFinish = true;
            finalizeActiveBlock();
          }

          if (isReasoningDelta(choice.delta)) {
            const reasoningText =
              "reasoning" in choice.delta &&
              typeof choice.delta.reasoning === "string"
                ? choice.delta.reasoning
                : choice.delta.reasoning_content;
            const emittedThinkingText = appendReasoningDelta(reasoningText);

            if (emittedThinkingText && emittedThinkingText.length > 0) {
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
                  thinkingText: emittedThinkingText,
                  messageBlocks: currentChunkMessageBlock(),
                  isThinking: true,
                  thinkingDuration:
                    currentThinkingDuration() > 0
                      ? currentThinkingDuration()
                      : undefined,
                  topP,
                  model,
                  done: false
                } satisfies EventTypeMap["ai_chat_chunk"])
              );

              void this.redis.publishTypedEvent(
                streamChannel,
                "ai_chat_chunk",
                {
                  type: "ai_chat_chunk",
                  conversationId,
                  userId,
                  model,
                  userMsgId,
                  imgGenEnabled: false,
                  title,
                  isThinking: true,
                  thinkingDuration:
                    currentThinkingDuration() > 0
                      ? currentThinkingDuration()
                      : undefined,
                  thinkingText: emittedThinkingText,
                  messageBlocks: currentChunkMessageBlock(),
                  systemPrompt,
                  temperature,
                  topP,
                  provider,
                  done: false
                }
              );

              if (thinkingChunks.length % 10 === 0) {
                void this.redis.saveStreamState(
                  conversationId,
                  chunks,
                  {
                    model,
                    provider,
                    title,
                    totalChunks: thinkingChunks.length,
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

          if (isContentDelta(choice.delta)) {
            const text = choice.delta.content;
            const block = ensureActiveBlock("TEXT");
            block.content += text;

            chunks.push(text);
            AlibabaAgg += text;

            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                title,
                provider,
                userMsgId,
                imgGenEnabled: false,
                systemPrompt,
                temperature,
                thinkingDuration:
                  AlibabaThinkingDuration > 0
                    ? AlibabaThinkingDuration
                    : undefined,
                isThinking: false,
                messageBlocks: currentChunkMessageBlock(),
                topP,
                model,
                chunk: text,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );

            void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
              type: "ai_chat_chunk",
              conversationId,
              userId,
              userMsgId,
              imgGenEnabled: false,
              model,
              title,
              thinkingDuration:
                AlibabaThinkingDuration > 0
                  ? AlibabaThinkingDuration
                  : undefined,
              isThinking: false,
              thinkingText:
                AlibabaThinkingAgg.length > 0 ? AlibabaThinkingAgg : undefined,
              messageBlocks: currentChunkMessageBlock(),
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

          if (hasToolCallDelta(choice.delta)) {
            this.accumulateToolCallDelta(
              roundToolCalls,
              choice.delta.tool_calls
            );
            finalizeActiveBlock();
          }
        }
      }

      finalizeActiveBlock();

      if (roundUsage) {
        totalUsage += roundUsage.total_tokens;
      }

      const materializedToolCalls = this.materializeToolCalls(roundToolCalls);
      const hasActionableToolCalls =
        materializedToolCalls.length > 0 && (sawToolCallFinish || !!roundUsage);

      if (!hasActionableToolCalls) {
        break;
      }

      if (round === MAX_TOOL_ROUNDS) {
        forcedLoopStopReason = "MAX_ROUNDS";
        this.logger.warn(
          {
            round,
            toolCallCount: materializedToolCalls.length
          },
          "Alibaba tool loop reached max rounds"
        );
        break;
      }

      const assistantToolMessage = {
        role: "assistant",
        content: "",
        tool_calls: materializedToolCalls
      } as const satisfies AlibabaAssistantToolCallMessage;

      const toolMessages = Array.of<AlibabaToolMessage>();
      for (const toolCall of materializedToolCalls) {
        toolMessages.push(await this.executeToolCall(userId, toolCall));
      }

      roundMessages = Array.of<AlibabaRequestMessage>(
        ...roundMessages,
        assistantToolMessage,
        ...toolMessages
      );

      this.logger.info(
        {
          round,
          toolCallCount: materializedToolCalls.length,
          toolOutputCount: toolMessages.length
        },
        "Alibaba tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && AlibabaAgg.trim().length === 0) {
      AlibabaAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        content: AlibabaAgg,
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

    const finalUsage = totalUsage > 0 ? totalUsage : undefined;
    const d = await this.prisma.handleAiChatResponse({
      chunk: AlibabaAgg,
      conversationId,
      done: true,
      provider,
      title,
      userId,
      userMsgId,
      imgGenEnabled: false,
      model,
      systemPrompt,
      thinkingDuration:
        AlibabaThinkingDuration > 0 ? AlibabaThinkingDuration : undefined,
      thinkingText:
        AlibabaThinkingAgg.length > 0 ? AlibabaThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      temperature,
      usage: finalUsage,
      topP
    });

    ws.send(
      JSON.stringify({
        type: "ai_chat_response",
        conversationId,
        userId,
        provider,
        convo: d.convo,
        userMsgId,
        aiMsgId: d.aiMsgId,
        imgGenEnabled: false,
        systemPrompt,
        thinkingDuration:
          AlibabaThinkingDuration > 0 ? AlibabaThinkingDuration : undefined,
        thinkingText:
          AlibabaThinkingAgg.length > 0 ? AlibabaThinkingAgg : undefined,
        title,
        temperature,
        topP,
        model,
        usage: finalUsage,
        chunk: AlibabaAgg,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
        done: true
      } satisfies EventTypeMap["ai_chat_response"])
    );

    void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
      type: "ai_chat_response",
      conversationId,
      userId,
      systemPrompt,
      convo: d.convo,
      userMsgId,
      aiMsgId: d.aiMsgId,
      imgGenEnabled: false,
      temperature,
      title,
      thinkingDuration:
        AlibabaThinkingDuration > 0 ? AlibabaThinkingDuration : undefined,
      thinkingText:
        AlibabaThinkingAgg.length > 0 ? AlibabaThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      topP,
      usage: finalUsage,
      provider,
      model,
      chunk: AlibabaAgg,
      done: true
    });

    void this.redis.del(`stream:state:${conversationId}`);
  }
}
