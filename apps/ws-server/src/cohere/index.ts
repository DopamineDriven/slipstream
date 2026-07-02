import type {
  CohereAccumulatedToolCall,
  CohereActiveMessageBlock,
  CohereChatRequestMessage,
  CohereFinalizedMessageBlock,
  CohereForcedLoopStopReason
} from "@/cohere/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { FileSearchInput } from "@/store/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type { Cohere } from "cohere-ai";
import type { Logger as PinoLogger } from "pino";
import { CohereClientV2 } from "cohere-ai";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type {
  CohereModelIdUnion,
  EventTypeMap,
  MessageSingleton
} from "@slipstream/types";

export class CohereService {
  protected defaultClient: CohereClientV2;
  protected logger: PinoLogger;

  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected redis: EnhancedRedisPubSub,
    protected userStoreVector: UserStoreVectorService,
    protected apiKey: string,
    protected memoryService: ConversationMemoryVectorService
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[cohere] " }
      );
    this.defaultClient = new CohereClientV2({
      token: this.apiKey,
      logging: {
        logger: this.logger,
        silent: this.prisma.isProd
      }
    });
  }

  protected getClient(overrideKey?: string) {
    if (overrideKey) {
      return new CohereClientV2({
        token: overrideKey,
        logging: {
          logger: this.logger,
          silent: this.prisma.isProd
        }
      });
    }

    return this.defaultClient;
  }

  protected isCohereModel(m = "command-a-reasoning-08-2025") {
    return (
      m === "command-a-plus-05-2026" ||
      m === "command-a-03-2025" ||
      m === "command-a-reasoning-08-2025"
    );
  }

  protected resolveModel(m = "command-a-reasoning-08-2025") {
    if (this.isCohereModel(m)) {
      return m;
    }

    return "command-a-reasoning-08-2025" satisfies CohereModelIdUnion;
  }

  protected isReasoningCapable(m = "command-a-reasoning-08-2025") {
    return (
      m === "command-a-reasoning-08-2025" || m === "command-a-plus-05-2026"
    );
  }

  protected isToolCapable(m = "command-a-reasoning-08-2025") {
    return (
      m === "command-a-03-2025" ||
      m === "command-a-reasoning-08-2025" ||
      m === "command-a-plus-05-2026"
    );
  }

  protected isVisionCapable(m = "command-a-plus-05-2026") {
    return m === "command-a-plus-05-2026";
  }

  protected formatSystemInstruction(
    isNewChat: boolean,
    systemPrompt?: string,
    fileSearchEnabled = false
  ) {
    const fileSearchNote = fileSearchEnabled
      ? "Tool policy: do not set the file_search filename filter unless the user explicitly asks to limit search to a specific file."
      : undefined;

    if (isNewChat) {
      if (systemPrompt && fileSearchNote) {
        return `${systemPrompt}\n\n${fileSearchNote}`;
      }

      return systemPrompt ?? fileSearchNote;
    }

    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation. " +
      "Older messages of long conversations may be omitted from your view — use conversation_memory_search to recall them.";

    if (systemPrompt && fileSearchNote) {
      return `${systemPrompt}\n\n${fileSearchNote}\n\n${note}`;
    }

    if (systemPrompt) {
      return `${systemPrompt}\n\n${note}`;
    }

    if (fileSearchNote) {
      return `${fileSearchNote}\n\n${note}`;
    }

    return note;
  }

  protected formatHistory(msgs: MessageSingleton<true>[]) {
    const formatted = Array.of<CohereChatRequestMessage>();

    const lastIndex = msgs.findLastIndex(
      m => m.provider === "COHERE" && m.senderType === "AI"
    );

    const isFirstCohereMsg = lastIndex === -1;

    for (const [msgIndex, msg] of msgs.entries()) {
      const isFreshContext = isFirstCohereMsg || msgIndex > lastIndex;
      const isCurrentUserMsg = msgIndex === msgs.length - 1;
      if (msg.senderType === "USER") {
        const content = Array.of<Cohere.Content>();
        const textParts = Array.of<string>();
        try {
          if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatStatus,
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
                if (att.assetType === "DOCUMENT") {
                  try {
                    if (isFreshContext) {
                      try {
                        if (!isCurrentUserMsg) {
                          textParts.push(`[${name}](${url})`);
                        } else {
                          textParts.push(`[${name}](${url})`);
                        }
                      } catch {
                        textParts.push(`[${name}](${url})`);
                      }
                    } else {
                      textParts.push(`[${name}](${url})`);
                    }
                  } catch {
                    textParts.push(`[${name}](${url})`);
                  }
                } else if (att.assetType === "IMAGE") {
                  if (
                    isFreshContext &&
                    msg.model &&
                    this.isVisionCapable(msg.model)
                  ) {
                    content.push({
                      imageUrl: { url, detail: "high" },
                      type: "image_url"
                    });
                  }
                  textParts.push(`![${name}](${url})`);
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
        content.push({ type: "text", text: textParts.join(`\n\n`) });
        formatted.push({ role: "user", content });
      } else {
        const content = Array.of<Cohere.AssistantMessageV2ContentOneItem>();
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
            textParts.push(textBlocks.join(`\n\n`));
          } else {
            textParts.push(msg.content);
          }
        }

        content.push({ type: "text", text: textParts.join(`\n\n`) });
        formatted.push({ role: "assistant", content });
      }
    }

    return formatted;
  }

  private fileSearchTool() {
    return {
      type: "function",
      function: {
        name: "file_search",
        description:
          "This tool utilizes a 'Partitioned Foraging' approach which recognizes that for the 200,000+ years that humans have existed " +
          "95%+ of it has been as foragers. Agents are trained exclusively on data aggregated/curated by humans; " +
          "think of it as agentic foraging complete with Jaccard similarity scores for cross-analyzing your bounties. " +
          "Search the user's uploaded documents. Uses semantic similarity by default. " +
          "When search_terms is provided, also performs fulltext keyword search and returns " +
          "both result sets separately (semantic + fulltext) so you can reason about which signal is most relevant. " +
          "Without search_terms: returns a flat JSON array. " +
          "With search_terms: returns { semantic, fulltext, overlap, meta }.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The semantic search query."
            },
            max_results: {
              type: "number",
              description: "Maximum results to return (1-10, default 5)"
            },
            filename: {
              type: "string",
              description:
                "Optional filename filter (fuzzy, case-insensitive). Only use this when the user explicitly asks to limit search to a specific file. Only chunks from documents whose filename closely matches this string are returned."
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
    } as const satisfies Cohere.ToolV2;
  }

  private memorySearchTool() {
    return {
      type: "function",
      function: {
        name: "conversation_memory_search",
        description:
          "Search the user's indexed conversation history — older sections of this conversation and other conversations. " +
          "Sections are ~8k-token transcript slices with model-written technical summaries; summary keyword hits outrank " +
          "raw transcript hits in the fulltext lane. Semantic similarity by default; when search_terms is provided, also " +
          "performs fulltext keyword search and returns { semantic_results, fulltext_results, overlap_results, metadata }. " +
          "scope 'current_conversation' (default) reaches this conversation's older indexed sections — including messages " +
          "beyond your context window; 'all_conversations' reaches the user's entire history, with conversation_id + " +
          "conversation_title on every hit for citation. Sections are keyed by 0-based message ordinal ranges [start, end). " +
          "Expand a hit with conversation_memory_get_chunk.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The semantic search query"
            },
            search_terms: {
              type: "string",
              description:
                "Optional exact-match terms for the fulltext lane. Supports quoted phrases and negation (-deprecated)."
            },
            scope: {
              type: "string",
              enum: ["current_conversation", "all_conversations"],
              description:
                "Where to search (default current_conversation). Use all_conversations for cross-conversation recall."
            },
            max_results: {
              type: "number",
              description: "Maximum results per signal (1-10, default 5)"
            },
            threshold: {
              type: "number",
              description:
                "Cosine similarity floor for the semantic lane (default 0)"
            },
            include_transcript: {
              type: "boolean",
              description:
                "Return full section transcripts inline (default false — summaries + excerpts)"
            }
          },
          required: ["query"],
          additionalProperties: false
        }
      }
    } as const satisfies Cohere.ToolV2;
  }

  private memoryGetChunkTool() {
    return {
      type: "function",
      function: {
        name: "conversation_memory_get_chunk",
        description:
          "Fetch one indexed conversation-memory section in full: by chunk_id (from a conversation_memory_search hit), " +
          "or by conversation_id + ordinal (the section covering that 0-based message ordinal). " +
          "direction walks to the adjacent previous/next section — search finds the doorway, traversal walks the room. " +
          "Returns the full transcript + summary by default, plus has_previous/has_next.",
        parameters: {
          type: "object",
          properties: {
            chunk_id: {
              type: "string",
              description: "Section id from a conversation_memory_search result"
            },
            conversation_id: {
              type: "string",
              description:
                "Conversation id — pair with ordinal to fetch the covering section"
            },
            ordinal: {
              type: "number",
              description: "0-based message ordinal (pair with conversation_id)"
            },
            direction: {
              type: "string",
              enum: ["previous", "next"],
              description:
                "Optional: return the adjacent section instead of the resolved one"
            },
            include_transcript: {
              type: "boolean",
              description: "Include the full transcript (default true)"
            }
          },
          required: [],
          additionalProperties: false
        }
      }
    } as const satisfies Cohere.ToolV2;
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

  private parseFileSearchInput(rawArguments: string) {
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
        "Recovered malformed streamed cohere file_search arguments"
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
    const maxResults = Math.max(1, Math.min(input.max_results ?? 5, 10));

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
    conversationId: string,
    toolCall: Cohere.ToolCallV2
  ) {
    const toolName = toolCall.function?.name;

    try {
      if (toolName === "file_search") {
        const input = this.parseFileSearchInput(
          toolCall.function?.arguments ?? ""
        );
        const output = await this.executeFileSearch(userId, input);

        return {
          role: "tool",
          toolCallId: toolCall.id,
          content: output
        } as const satisfies Cohere.ChatMessageV2.Tool;
      }

      if (toolName === "conversation_memory_search") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.function?.arguments ?? "",
          toolName
        );
        const output = await this.memoryService.searchMemoryFromToolInput(
          userId,
          conversationId,
          parsed
        );

        return {
          role: "tool",
          toolCallId: toolCall.id,
          content: output
        } as const satisfies Cohere.ChatMessageV2.Tool;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.function?.arguments ?? "",
          toolName
        );
        const output = await this.memoryService.getMemoryChunkFromToolInput(
          userId,
          parsed
        );

        return {
          role: "tool",
          toolCallId: toolCall.id,
          content: output
        } as const satisfies Cohere.ChatMessageV2.Tool;
      }

      return {
        role: "tool",
        toolCallId: toolCall.id,
        content: `Unknown tool: ${toolName ?? "unknown"}`
      } as const satisfies Cohere.ChatMessageV2.Tool;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          toolCallId: toolCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "cohere function tool execution failed"
      );

      return {
        role: "tool",
        toolCallId: toolCall.id,
        content: `${toolName ?? "unknown"} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies Cohere.ChatMessageV2.Tool;
    }
  }

  private accumulateToolCallStart(
    registry: Map<number, CohereAccumulatedToolCall>,
    event: Cohere.V2ChatStreamResponse.ToolCallStart
  ) {
    const index = event.index ?? 0;
    const delta = event.delta?.message?.toolCalls;
    const current = registry.get(index) ?? {
      id: "",
      name: "",
      arguments: "",
      index
    };

    if (delta?.id) {
      current.id = delta.id;
    }

    if (delta?.function?.name) {
      current.name = delta.function.name;
    }

    if (typeof delta?.function?.arguments === "string") {
      current.arguments += delta.function.arguments;
    }

    registry.set(index, current);
  }

  private accumulateToolCallDelta(
    registry: Map<number, CohereAccumulatedToolCall>,
    event: Cohere.V2ChatStreamResponse.ToolCallDelta
  ) {
    const index = event.index ?? 0;
    const current = registry.get(index) ?? {
      id: "",
      name: "",
      arguments: "",
      index
    };

    const deltaArgs = event.delta?.message?.toolCalls?.function?.arguments;

    if (typeof deltaArgs === "string") {
      current.arguments += deltaArgs;
    }

    registry.set(index, current);
  }

  private materializeToolCalls(
    registry: Map<number, CohereAccumulatedToolCall>
  ) {
    const materialized = Array.of<Cohere.ToolCallV2>();

    for (const [, toolCall] of Array.from(registry.entries()).sort(
      ([left], [right]) => left - right
    )) {
      if (!toolCall.id || !toolCall.name) {
        this.logger.warn(
          { toolCall },
          "Skipping incomplete streamed cohere tool call"
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

  private usageTotalTokens(usage?: Cohere.Usage) {
    const inputTokens = usage?.tokens?.inputTokens ?? 0;
    const outputTokens = usage?.tokens?.outputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    return totalTokens > 0 ? totalTokens : undefined;
  }

  private buildStreamRequest(
    model: CohereModelIdUnion,
    messages: CohereChatRequestMessage[],
    tools?: Cohere.ToolV2[]
  ) {
    const requestBase = {
      messages,
      model,
      citationOptions: { mode: "ENABLED" },
      tools
    } satisfies Cohere.V2ChatStreamRequest;

    if (this.isReasoningCapable(model)) {
      return {
        ...requestBase,
        thinking: { type: "enabled" }
      } satisfies Cohere.V2ChatStreamRequest;
    }

    return requestBase;
  }

  public async handleCohereAIChatRequest({
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
    model,
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "cohere" as const;
    const resolvedModel = this.resolveModel(model);

    const cohereClient = this.getClient(apiKey ?? undefined);
    const allowThinking = this.isReasoningCapable(resolvedModel);
    let cohereThinkingDuration = 0,
      cohereThinkingAgg = "",
      cohereAgg = "",
      totalUsage = 0;
    const trackedBlocks = Array.of<CohereFinalizedMessageBlock>();
    let activeBlock: CohereActiveMessageBlock | undefined = undefined;
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
        cohereThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (type: CohereActiveMessageBlock["type"]) => {
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
          ? Math.round(performance.now() - activeBlock.startedAt)
          : 0;

      return cohereThinkingDuration + activeThinkingDuration;
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
      if (!allowThinking || thinkingText.length === 0) {
        return;
      }

      const block = ensureActiveBlock("THINKING");
      block.content += thinkingText;
      cohereThinkingAgg += thinkingText;
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
          messageBlocks: currentChunkMessageBlock(),
          isThinking: true,
          thinkingDuration:
            currentThinkingDuration() > 0
              ? currentThinkingDuration()
              : undefined,
          topP,
          model: resolvedModel,
          done: false
        } satisfies EventTypeMap["ai_chat_chunk"])
      );

      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
        type: "ai_chat_chunk",
        conversationId,
        userId,
        model: resolvedModel,
        userMsgId,
        imgGenEnabled: false,
        title,
        isThinking: true,
        thinkingDuration:
          currentThinkingDuration() > 0 ? currentThinkingDuration() : undefined,
        thinkingText,
        messageBlocks: currentChunkMessageBlock(),
        systemPrompt,
        temperature,
        topP,
        provider,
        done: false
      });

      if (thinkingChunks.length % 10 === 0) {
        void this.redis.saveStreamState(
          conversationId,
          chunks,
          {
            model: resolvedModel,
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
    };

    const emitTextChunk = (text: string) => {
      if (text.length === 0) {
        return;
      }

      const block = ensureActiveBlock("TEXT");
      block.content += text;

      chunks.push(text);
      cohereAgg += text;

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
            cohereThinkingDuration > 0 ? cohereThinkingDuration : undefined,
          isThinking: false,
          messageBlocks: currentChunkMessageBlock(),
          topP,
          model: resolvedModel,
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
        model: resolvedModel,
        title,
        thinkingDuration:
          cohereThinkingDuration > 0 ? cohereThinkingDuration : undefined,
        isThinking: false,
        thinkingText:
          cohereThinkingAgg.length > 0 ? cohereThinkingAgg : undefined,
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
            model: resolvedModel,
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

    const processContentChunk = (
      content:
        | Cohere.ChatContentStartEventDeltaMessageContent
        | Cohere.ChatContentDeltaEventDeltaMessageContent
        | undefined
    ) => {
      if (!content) {
        return;
      }

      if (typeof content.thinking === "string" && content.thinking.length > 0) {
        emitThinkingChunk(content.thinking);
      }

      if (typeof content.text === "string" && content.text.length > 0) {
        emitTextChunk(content.text);
      }
    };

    // memory tools attach whenever the model is tool-capable — conversation
    // memory exists independently of uploaded documents
    const tools = this.isToolCapable(resolvedModel)
      ? [
          ...(hasUserStoreDocs
            ? [this.fileSearchTool()]
            : Array.of<Cohere.ToolV2>()),
          this.memorySearchTool(),
          this.memoryGetChunkTool()
        ]
      : undefined;
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt,
      !!tools
    );
    let roundMessages = Array.of<CohereChatRequestMessage>(
      ...(systemInstruction
        ? [
            {
              role: "system",
              content: systemInstruction
            } satisfies Cohere.ChatMessageV2.System
          ]
        : []),
      ...this.formatHistory(msgs)
    );

    const MAX_TOOL_ROUNDS = 10;
    let forcedLoopStopReason: CohereForcedLoopStopReason = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const roundToolCalls = new Map<number, CohereAccumulatedToolCall>();
      let roundUsageTotalTokens: number | undefined = undefined;
      let roundFinishReason: Cohere.ChatFinishReason | undefined = undefined;
      let roundToolPlan = "";

      const stream = await cohereClient.chatStream(
        this.buildStreamRequest(resolvedModel, roundMessages, tools)
      );

      for await (const event of stream) {
        switch (event.type) {
          case "content-start": {
            processContentChunk(event.delta?.message?.content);
            break;
          }
          case "content-delta": {
            processContentChunk(event.delta?.message?.content);
            break;
          }
          case "content-end": {
            finalizeActiveBlock();
            break;
          }
          case "tool-plan-delta": {
            const toolPlanDelta = event.delta?.message?.toolPlan;
            if (typeof toolPlanDelta === "string" && toolPlanDelta.length > 0) {
              roundToolPlan += toolPlanDelta;
              emitThinkingChunk(toolPlanDelta);
            }
            break;
          }
          case "tool-call-start": {
            this.accumulateToolCallStart(roundToolCalls, event);
            finalizeActiveBlock();
            break;
          }
          case "tool-call-delta": {
            this.accumulateToolCallDelta(roundToolCalls, event);
            finalizeActiveBlock();
            break;
          }
          case "tool-call-end": {
            finalizeActiveBlock();
            break;
          }
          case "message-end": {
            roundFinishReason = event.delta?.finishReason;
            roundUsageTotalTokens = this.usageTotalTokens(event.delta?.usage);
            finalizeActiveBlock();
            break;
          }
          default: {
            break;
          }
        }
      }

      finalizeActiveBlock();

      if (typeof roundUsageTotalTokens === "number") {
        totalUsage += roundUsageTotalTokens;
      }

      const materializedToolCalls = this.materializeToolCalls(roundToolCalls);
      const hasActionableToolCalls =
        materializedToolCalls.length > 0 &&
        (roundFinishReason === "TOOL_CALL" ||
          typeof roundFinishReason === "undefined");

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
          "cohere tool loop reached max rounds"
        );
        break;
      }

      const assistantToolMessage = {
        role: "assistant",
        ...(roundToolPlan.length > 0 ? { toolPlan: roundToolPlan } : {}),
        toolCalls: materializedToolCalls
      } satisfies Cohere.ChatMessageV2.Assistant;

      const toolMessages = Array.of<Cohere.ChatMessageV2.Tool>();

      for (const toolCall of materializedToolCalls) {
        toolMessages.push(
          await this.executeToolCall(userId, conversationId, toolCall)
        );
      }

      roundMessages = [
        ...roundMessages,
        assistantToolMessage,
        ...toolMessages
      ] satisfies CohereChatRequestMessage[];

      this.logger.info(
        {
          round,
          toolCallCount: materializedToolCalls.length,
          toolOutputCount: toolMessages.length
        },
        "cohere tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && cohereAgg.trim().length === 0) {
      cohereAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        content: cohereAgg,
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
      chunk: cohereAgg,
      conversationId,
      done: true,
      provider,
      title,
      userId,
      userMsgId,
      imgGenEnabled: false,
      model: resolvedModel,
      systemPrompt,
      thinkingDuration:
        cohereThinkingDuration > 0 ? cohereThinkingDuration : undefined,
      thinkingText:
        cohereThinkingAgg.length > 0 ? cohereThinkingAgg : undefined,
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
          cohereThinkingDuration > 0 ? cohereThinkingDuration : undefined,
        thinkingText:
          cohereThinkingAgg.length > 0 ? cohereThinkingAgg : undefined,
        title,
        temperature,
        topP,
        model: resolvedModel,
        usage: finalUsage,
        chunk: cohereAgg,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
        done: true
      } satisfies EventTypeMap["ai_chat_response"])
    );

    void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
      type: "ai_chat_response",
      conversationId,
      userId,
      systemPrompt,
      userMsgId,
      aiMsgId: d.aiMsgId,
      convo: d.convo,
      imgGenEnabled: false,
      temperature,
      title,
      thinkingDuration:
        cohereThinkingDuration > 0 ? cohereThinkingDuration : undefined,
      thinkingText:
        cohereThinkingAgg.length > 0 ? cohereThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      topP,
      usage: finalUsage,
      provider,
      model: resolvedModel,
      chunk: cohereAgg,
      done: true
    });

    void this.redis.del(`stream:state:${conversationId}`);
  }
}
