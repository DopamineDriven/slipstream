import type { LoggerService } from "@/logger/index.ts";
import type { MemoryAssemblyView } from "@/memory/types.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { OpenAIFileSearchToolInput } from "@/openai/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type {
  CompletionMessage,
  CreateChatCompletionResponseStreamChunk,
  Message,
  MessageImageContentItem,
  MessageTextContentItem,
  SystemMessage,
  ToolResponseMessage,
  UserMessage
} from "llama-api-client/resources/index.mjs";
import type { Logger as PinoLogger } from "pino";
import { LlamaAPIClient } from "llama-api-client";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type {
  EventTypeMap,
  MessageSingleton,
  MetaModelIdUnion
} from "@slipstream/types";

interface MetaActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "TEXT";
}

interface MetaFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

interface LlamaFunctionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: { [key: string]: unknown };
    strict?: boolean;
  };
}

type LlamaAccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
  ordinal: number;
};

type LlamaForcedLoopStopReason =
  "MAX_ROUNDS" | "MAX_FILE_SEARCH_CALLS" | "REPEATED_TOOL_CALLS" | null;

export class LlamaService {
  private defaultClient: LlamaAPIClient;
  private logger: PinoLogger;
  constructor(
    logger: LoggerService,
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private userStoreVector: UserStoreVectorService,
    private memoryService: ConversationMemoryVectorService,
    private apiKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[llama] " }
      );
    this.defaultClient = new LlamaAPIClient({
      apiKey: this.apiKey,
      logger: this.logger,
      logLevel: "debug"
    });
  }

  public llamaClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }

    return client;
  }

  private messageText(
    msg: Pick<MessageSingleton<true>, "content" | "messageBlocks">
  ) {
    const textBlocks = Array.of<string>();

    if (msg.messageBlocks && msg.messageBlocks.length > 0) {
      for (const block of msg.messageBlocks) {
        if (block.type === "TEXT") {
          textBlocks.push(block.content);
        }
      }
    }

    if (textBlocks.length > 0) {
      return textBlocks.join("\n");
    }

    return msg.content;
  }

  private prependProviderModelTag(
    msgs: Pick<
      MessageSingleton<true>,
      "senderType" | "provider" | "model" | "content" | "messageBlocks" | "ordinal"
    >[],
    memoryView: MemoryAssemblyView | null
  ) {
    return msgs.flatMap<
      | { readonly role: "user"; readonly content: string }
      | { readonly role: "assistant"; readonly content: string }
    >(msg => {
      // HMEM substitution assembly (Part II §2)
      const claim = memoryView?.claim(msg.ordinal);
      if (claim) {
        return claim.emit != null
          ? [{ role: "assistant", content: claim.emit } as const]
          : [];
      }
      const text = this.messageText(msg);

      if (msg.senderType === "USER") {
        return [{ role: "user", content: text } as const];
      }

      const provider = msg.provider.toLowerCase();
      const model = msg.model ?? "";
      const modelIdentifier = `[${provider}/${model}]`;
      return [
        {
          role: "assistant",
          content: `${modelIdentifier} \n${text}`
        } as const
      ];
    }) satisfies (UserMessage | CompletionMessage)[];
  }

  private formatMsgs(
    msgs: readonly (
      | {
          readonly role: "user";
          readonly content:
            string | (MessageTextContentItem | MessageImageContentItem)[];
        }
      | { readonly role: "assistant"; readonly content: string }
    )[],
    systemPrompt?: string
  ) {
    return [
      {
        role: "system",
        content: this.prisma.formatSysNote(systemPrompt)
      },
      ...msgs
    ] as const satisfies Message[];
  }

  private fileSearchFunctionTool() {
    return {
      type: "function",
      function: {
        name: "file_search",
        description:
          "Search the user's uploaded documents. Uses semantic similarity by default. " +
          "When search_terms is provided, also performs fulltext keyword search and returns " +
          "both result sets separately (semantic + fulltext) so you can reason about which signal is most relevant. " +
          "Without search_terms: returns a flat JSON array. " +
          "With search_terms: returns { semantic, fulltext, overlap, meta }.",
        parameters: {
          type: "object",
          properties: {
            queries: {
              type: "array",
              description:
                "One or more semantic search queries. Prefer batching related queries in one tool call (max 5).",
              items: { type: "string" },
              minItems: 1,
              maxItems: 5
            },
            max_results: {
              type: "number",
              description: "Maximum results to return (1-10, default 5)"
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
          required: ["queries"],
          additionalProperties: false
        },
        strict: true
      }
    } as const satisfies LlamaFunctionTool;
  }

  private memorySearchFunctionTool() {
    return {
      type: "function",
      function: {
        name: "conversation_memory_search",
        description:
          "Search the user's indexed conversation history — older sections of this conversation and other conversations. " +
          "Sections are ~8k-token transcript slices of firsthand conversation history; an invisible summary layer boosts " +
          "fulltext ranking for conceptual keywords. Semantic similarity by default; when search_terms is provided, also " +
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
            conversation_title: {
              type: "string",
              description:
                "Optional fuzzy conversation-title filter (case-insensitive) — providing it implies all_conversations scope. " +
                "Recall by name: 'the Catullan one' matches 'Catullan Odes & Combinatorics'. " +
                "Same contract as the filename filter on the document-search tool."
            },
            max_results: {
              type: "number",
              description: "Maximum results per signal (1-10, default 5)"
            },
            threshold: {
              type: "number",
              description:
                "Cosine similarity floor for the semantic lane (default 0)"
            }
          },
          required: ["query"],
          additionalProperties: false
        },
        strict: false
      }
    } as const satisfies LlamaFunctionTool;
  }

  private memoryGetChunkFunctionTool() {
    return {
      type: "function",
      function: {
        name: "conversation_memory_get_chunk",
        description:
          "Fetch one indexed conversation-memory section in full: by chunk_id (from a conversation_memory_search hit), " +
          "or by conversation_id + ordinal (the section covering that 0-based message ordinal). " +
          "direction walks to the adjacent previous/next section — search finds the doorway, traversal walks the room. " +
          "Returns the full firsthand transcript plus previous/next section refs for onward traversal.",
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
            }
          },
          required: [],
          additionalProperties: false
        },
        strict: false
      }
    } as const satisfies LlamaFunctionTool;
  }

  private truncateFileSearchContent(content: string, maxChars = 1200) {
    if (content.length <= maxChars) return content;
    return content.slice(0, maxChars).concat("...");
  }

  private async searchStore(
    userId: string,
    query: string,
    limit = 5,
    threshold = 0.3,
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

  private parseFileSearchInput(
    rawArguments: string
  ): OpenAIFileSearchToolInput {
    const parsed = rawArguments.trim().length
      ? JSON.parse<Record<string, unknown>>(rawArguments)
      : {};

    const queryList = Array.of<string>();
    if ("queries" in parsed && Array.isArray(parsed.queries)) {
      for (const query of parsed.queries) {
        if (typeof query !== "string") continue;
        const normalized = query.trim();
        if (normalized.length === 0) continue;
        queryList.push(normalized);
      }
    }

    if (
      queryList.length === 0 &&
      "query" in parsed &&
      typeof parsed.query === "string"
    ) {
      const normalized = parsed.query.trim();
      if (normalized.length > 0) {
        queryList.push(normalized);
      }
    }

    const uniqueQueries = Array.from(new Set(queryList)).slice(0, 5);
    const firstQuery = uniqueQueries[0];
    if (!firstQuery) {
      throw new Error(
        `file_search input missing required "queries": ${rawArguments}`
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
    } satisfies OpenAIFileSearchToolInput;
  }

  private async executeFileSearch(
    userId: string,
    input: OpenAIFileSearchToolInput
  ) {
    const maxResults = Math.max(1, Math.min(input.max_results ?? 5, 5));

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

    const unique = new Map<
      string,
      {
        filename: string;
        score: number;
        content: string;
        startOffset: number | null;
        endOffset: number | null;
        chunkIndex: number;
      }
    >();

    for (const result of results) {
      const mapped = {
        filename: result.filename,
        score: result.score != null ? Number(result.score.toFixed(4)) : 0,
        content: this.truncateFileSearchContent(result.content),
        startOffset: result.startOffset,
        endOffset: result.endOffset,
        chunkIndex: result.chunkIndex
      };
      const key = `${mapped.filename}::${mapped.chunkIndex}::${mapped.startOffset ?? "null"}::${mapped.endOffset ?? "null"}`;
      const previous = unique.get(key);
      if (!previous || mapped.score > previous.score) {
        unique.set(key, mapped);
      }
    }

    const mapped = Array.from(unique.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(maxResults, 5), 10));

    const maxOutputChars = 48_000;
    if (JSON.stringify(mapped).length <= maxOutputChars) {
      return JSON.stringify(mapped);
    }

    const reduced = [...mapped];
    while (
      reduced.length > 1 &&
      JSON.stringify(reduced).length > maxOutputChars
    ) {
      reduced.pop();
    }

    if (JSON.stringify(reduced).length <= maxOutputChars) {
      return JSON.stringify(reduced);
    }

    return JSON.stringify(
      reduced.map(result => ({
        filename: result.filename,
        score: result.score,
        content: this.truncateFileSearchContent(result.content, 600),
        startOffset: result.startOffset,
        endOffset: result.endOffset,
        chunkIndex: result.chunkIndex
      }))
    );
  }

  private async executeToolCall(
    userId: string,
    conversationId: string,
    toolCall: CompletionMessage.ToolCall
  ) {
    const toolName = toolCall.function.name;
    try {
      if (toolName === "file_search") {
        const input = this.parseFileSearchInput(toolCall.function.arguments);
        const output = await this.executeFileSearch(userId, input);
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: output
        } as const satisfies ToolResponseMessage;
      }

      if (toolName === "conversation_memory_search") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.function.arguments,
          toolName
        );
        const output = await this.memoryService.searchMemoryFromToolInput(
          userId,
          conversationId,
          parsed
        );
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: output
        } as const satisfies ToolResponseMessage;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.function.arguments,
          toolName
        );
        const output = await this.memoryService.getMemoryChunkFromToolInput(
          userId,
          parsed
        );
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: output
        } as const satisfies ToolResponseMessage;
      }

      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `Unknown tool: ${toolName}`
      } as const satisfies ToolResponseMessage;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          toolCallId: toolCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "llama function tool execution failed"
      );
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `${toolName} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies ToolResponseMessage;
    }
  }

  public async llamaFormat(
    isNewChat: boolean,
    msgs: ProviderChatRequestEntity["msgs"],
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"]
  ) {
    const buildUserContent = (m: MessageSingleton<true>) => {
      const parts = Array.of<
        MessageTextContentItem | MessageImageContentItem
      >();
      if (m.attachments?.length > 0) {
        for (const att of m.attachments) {
          const url = att.compatCdnUrl ?? att.cdnUrl ?? att.sourceUrl;
          const mime = att.compatMime ?? att.mime ?? "";
          if (url && mime.startsWith("image/")) {
            parts.push({ type: "image_url", image_url: { url } });
          }
        }
      }
      parts.push({ type: "text", text: this.messageText(m) });
      return parts;
    };

    if (isNewChat) {
      const first = msgs[0];
      if (!first) {
        return [
          {
            role: "system",
            content: this.prisma.formatSysNote(systemPrompt)
          },
          { role: "user", content: "" }
        ] as const satisfies Message[];
      }
      const parts = buildUserContent(first);
      const userMsg =
        parts.length === 1 && parts[0]?.type === "text"
          ? ({ role: "user", content: parts[0].text } as const)
          : ({ role: "user", content: parts } as const);
      return [
        {
          role: "system",
          content: this.prisma.formatSysNote(systemPrompt)
        },
        userMsg
      ] as const satisfies Message[];
    }

    const memoryView = await this.memoryService.getHistoryAssemblyView(
      msgs[0]?.conversationId,
      msgs.reduce((max, m) => (m.ordinal >= max ? m.ordinal + 1 : max), 0)
    );

    const last = msgs.at(-1);
    if (last?.senderType === "USER") {
      const history = this.prependProviderModelTag(
        msgs.slice(0, -1),
        memoryView
      );
      const base = this.formatMsgs(history, systemPrompt);
      const parts = buildUserContent(last);
      const userMsg =
        parts.length === 1 && parts[0]?.type === "text"
          ? ({ role: "user", content: parts[0].text } as const)
          : ({ role: "user", content: parts } as const);
      return [...base, userMsg] as const satisfies Message[];
    }

    return this.formatMsgs(
      this.prependProviderModelTag(msgs, memoryView),
      systemPrompt
    ) satisfies Message[];
  }

  private buildToolContinuationBase(messages: readonly Message[]) {
    const continuationBase = Array.of<Message>();
    const systemMessage = messages.find(
      (message): message is SystemMessage => message.role === "system"
    );

    let lastUserMessage: UserMessage | undefined = undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role === "user") {
        lastUserMessage = message;
        break;
      }
    }

    if (systemMessage) {
      continuationBase.push(systemMessage);
    }
    if (lastUserMessage) {
      continuationBase.push(lastUserMessage);
    }

    return continuationBase;
  }

  private previewText(text: string, maxChars = 160) {
    const normalized = text.replaceAll(/\s+/g, " ").trim();
    if (normalized.length <= maxChars) return normalized;
    return normalized.slice(0, maxChars).concat("...");
  }

  private messageTextPreview(
    content:
      | string
      | MessageTextContentItem
      | readonly MessageTextContentItem[]
      | readonly (MessageTextContentItem | MessageImageContentItem)[]
  ) {
    if (typeof content === "string") {
      return this.previewText(content);
    }

    if (Array.isArray(content)) {
      const textParts = (content as object[])
        .flatMap(item => ("text" in item ? [item.text] : [""]))
        .join(" ");
      return this.previewText(textParts);
    }

    return "text" in content ? this.previewText(content.text) : "";
  }

  private summarizeLlamaMessage(message: Message) {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.tool_call_id,
        contentPreview: this.messageTextPreview(message.content)
      };
    }

    if (message.role === "assistant") {
      return {
        role: "assistant",
        stop_reason: message.stop_reason ?? null,
        contentPreview: this.messageTextPreview(message.content ?? ""),
        tool_calls:
          message.tool_calls?.map(toolCall => ({
            id: toolCall.id,
            name: toolCall.function.name,
            argumentsPreview: this.previewText(toolCall.function.arguments, 100)
          })) ?? []
      };
    }

    return {
      role: message.role,
      contentPreview: this.messageTextPreview(message.content)
    };
  }

  private accumulateToolCallDelta(
    registry: Map<string, LlamaAccumulatedToolCall>,
    delta: CreateChatCompletionResponseStreamChunk.Event.ToolCallDelta
  ) {
    const lastEntry = Array.from(registry.entries()).at(-1);
    const incomingId = delta.id;

    if (
      incomingId &&
      lastEntry &&
      lastEntry[0].startsWith("pending_") &&
      !registry.has(incomingId)
    ) {
      const pending = lastEntry[1];
      registry.delete(lastEntry[0]);
      registry.set(incomingId, {
        ...pending,
        id: incomingId
      });
    }

    const activeKey =
      incomingId ?? lastEntry?.[0] ?? `pending_${String(registry.size)}`;
    const current = registry.get(activeKey) ?? {
      id: incomingId ?? "",
      name: "",
      arguments: "",
      ordinal: registry.size
    };

    if (incomingId) {
      current.id = incomingId;
    }
    if (delta.function.name) {
      const incomingName = delta.function.name.trim();
      if (incomingName.length > 0) {
        if (current.name.length === 0) {
          current.name = incomingName;
        } else if (current.name !== incomingName) {
          this.logger.warn(
            {
              toolCallId: current.id ?? incomingId ?? null,
              currentName: current.name,
              incomingName
            },
            "Ignoring conflicting streamed llama tool name delta"
          );
        }
      }
    }
    if (typeof delta.function.arguments === "string") {
      current.arguments += delta.function.arguments;
    }

    registry.set(activeKey, current);
  }

  private materializeToolCalls(
    registry: Map<string, LlamaAccumulatedToolCall>
  ) {
    const materialized = Array.of<CompletionMessage.ToolCall>();

    for (const toolCall of Array.from(registry.values()).sort(
      (left, right) => left.ordinal - right.ordinal
    )) {
      if (!toolCall.id || !toolCall.name) {
        this.logger.warn(
          { toolCall },
          "Skipping incomplete streamed llama tool call"
        );
        continue;
      }

      materialized.push({
        id: toolCall.id,
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      });
    }

    return materialized;
  }

  public async handleMetaAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    userMsgId,
    thinkingChunks,
    streamChannel,
    userId,
    hasUserStoreDocs,
    ws,
    apiKey,
    max_tokens,
    model = "Llama-4-Maverick-17B-128E-Instruct-FP8" satisfies MetaModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "meta" as const;
    let metaAgg = "";
    const trackedBlocks = Array.of<MetaFinalizedMessageBlock>();
    let activeBlock: MetaActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;
    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();
    const client = this.llamaClient(apiKey ?? undefined);

    const finalizeActiveBlock = () => {
      if (!activeBlock || activeBlock.content.length === 0) {
        activeBlock = undefined;
        return;
      }

      trackedBlocks.push({
        content: activeBlock.content,
        durationMs: Math.max(
          0,
          Math.round(performance.now() - activeBlock.startedAt)
        ),
        ordinal: nextOrdinal,
        type: activeBlock.type
      });

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = () => {
      activeBlock ??= {
        content: "",
        startedAt: performance.now(),
        type: "TEXT"
      };

      return activeBlock;
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

    // memory tools attach unconditionally — conversation memory exists
    // independently of uploaded documents
    const tools = hasUserStoreDocs
      ? [
          this.fileSearchFunctionTool(),
          this.memorySearchFunctionTool(),
          this.memoryGetChunkFunctionTool()
        ]
      : [this.memorySearchFunctionTool(), this.memoryGetChunkFunctionTool()];

    const initialMessages = await this.llamaFormat(
      isNewChat,
      msgs,
      systemPrompt
    );
    let roundMessages = Array.of<Message>(...initialMessages);
    let toolConversationMessages = Array.of<Message>(
      ...this.buildToolContinuationBase(initialMessages)
    );

    const MAX_TOOL_ROUNDS = 8;
    const maxFileSearchCalls = 4;
    const toolCallSignatureRegistry = new Map<string, number>();
    let fileSearchCallsTotal = 0;
    let forcedLoopStopReason: LlamaForcedLoopStopReason = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const roundToolCalls = new Map<string, LlamaAccumulatedToolCall>();
      let stopReason: CompletionMessage["stop_reason"] | null = null;

      if (round > 0) {
        this.logger.info(
          {
            round,
            messageCount: roundMessages.length,
            messageSummary: roundMessages
              .slice(Math.max(0, roundMessages.length - 4))
              .map(message => this.summarizeLlamaMessage(message))
          },
          "llama continuation request payload summary"
        );
      }

      const stream = await client.chat.completions.create(
        {
          user: userId,
          top_p: topP ?? 1.0,
          temperature: temperature ?? 1.0,
          model,
          max_completion_tokens: max_tokens ?? 4096,
          messages: roundMessages,
          stream: true,
          ...(tools && tools.length > 0
            ? { tools, tool_choice: "auto" as const }
            : {})
        },
        { stream: true }
      );

      for await (const chunk of stream) {
        let text: string | undefined = undefined;

        if (chunk.event.delta.type === "text") {
          text = chunk.event.delta.text;
        }
        if (chunk.event.delta.type === "tool_call") {
          finalizeActiveBlock();
          this.accumulateToolCallDelta(roundToolCalls, chunk.event.delta);
        }
        if (chunk.event.event_type === "complete") {
          stopReason = chunk.event.stop_reason ?? "stop";
        }

        if (text) {
          const block = ensureActiveBlock();
          block.content += text;
          chunks.push(text);
          metaAgg += text;
          ws.send(
            JSON.stringify({
              type: "ai_chat_chunk",
              conversationId,
              userId,
              userMsgId,
              title,
              provider,
              systemPrompt,
              temperature,
              topP,
              model,
              chunk: text,
              messageBlocks: currentChunkMessageBlock(),
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
            userMsgId,
            topP,
            provider,
            chunk: text,
            messageBlocks: currentChunkMessageBlock(),
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

      finalizeActiveBlock();

      const materializedToolCalls = this.materializeToolCalls(roundToolCalls);
      const shouldContinueWithTools =
        stopReason === "tool_calls" || materializedToolCalls.length > 0;

      if (materializedToolCalls.length > 0) {
        this.logger.info(
          {
            round,
            stopReason,
            toolCalls: materializedToolCalls.map(toolCall => ({
              id: toolCall.id,
              name: toolCall.function.name,
              argumentsPreview: this.previewText(
                toolCall.function.arguments,
                160
              )
            }))
          },
          "llama streamed tool calls materialized"
        );
      }

      if (!shouldContinueWithTools) {
        break;
      }

      let repeatedSignatures = 0;
      for (const toolCall of materializedToolCalls) {
        if (toolCall.function.name === "file_search") {
          fileSearchCallsTotal += 1;
        }
        const signature = `${toolCall.function.name}:${toolCall.function.arguments.trim()}`;
        const seenCount = toolCallSignatureRegistry.get(signature) ?? 0;
        if (seenCount > 0) {
          repeatedSignatures += 1;
        }
        toolCallSignatureRegistry.set(signature, seenCount + 1);
      }

      if (fileSearchCallsTotal > maxFileSearchCalls) {
        forcedLoopStopReason = "MAX_FILE_SEARCH_CALLS";
        this.logger.warn(
          {
            round,
            fileSearchCallsTotal,
            maxFileSearchCalls
          },
          "llama tool loop stopped after file_search call cap"
        );
        break;
      }

      if (
        materializedToolCalls.length > 0 &&
        repeatedSignatures === materializedToolCalls.length
      ) {
        forcedLoopStopReason = "REPEATED_TOOL_CALLS";
        this.logger.warn(
          {
            round,
            repeatedSignatures,
            toolCallCount: materializedToolCalls.length
          },
          "llama tool loop stopped due to repeated tool calls"
        );
        break;
      }

      if (round === MAX_TOOL_ROUNDS) {
        forcedLoopStopReason = "MAX_ROUNDS";
        this.logger.warn(
          {
            round,
            toolCallCount: materializedToolCalls.length
          },
          "llama tool loop reached max rounds"
        );
        break;
      }

      const assistantToolMessage = {
        role: "assistant",
        stop_reason: "tool_calls",
        tool_calls: materializedToolCalls
      } as const satisfies CompletionMessage;

      const toolMessages = Array.of<ToolResponseMessage>();
      for (const toolCall of materializedToolCalls) {
        toolMessages.push(
          await this.executeToolCall(userId, conversationId, toolCall)
        );
      }

      toolConversationMessages = Array.of<Message>(
        ...toolConversationMessages,
        assistantToolMessage,
        ...toolMessages
      );
      roundMessages = toolConversationMessages;

      this.logger.info(
        {
          round,
          toolCallCount: materializedToolCalls.length,
          toolOutputCount: toolMessages.length
        },
        "llama tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && metaAgg.trim().length === 0) {
      metaAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        type: "TEXT",
        content: metaAgg,
        durationMs: 0,
        ordinal: nextOrdinal
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
      chunk: metaAgg,
      systemPrompt,
      temperature,
      topP,
      userMsgId,
      conversationId,
      done: true,
      provider,
      title,
      userId,
      model,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined
    });
    ws.send(
      JSON.stringify({
        type: "ai_chat_response",
        conversationId,
        userId,
        userMsgId,
        aiMsgId: d.aiMsgId,
        convo: d.convo,
        provider,
        systemPrompt,
        title,
        temperature,
        topP,
        model,
        chunk: metaAgg,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
        done: true
      } satisfies EventTypeMap["ai_chat_response"])
    );
    void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
      type: "ai_chat_response",
      conversationId,
      userId,
      userMsgId,
      aiMsgId: d.aiMsgId,
      systemPrompt,
      convo: d.convo,
      temperature,
      title,
      topP,
      provider,
      model,
      chunk: metaAgg,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      done: true
    });
    void this.redis.del(`stream:state:${conversationId}`);
  }
}
