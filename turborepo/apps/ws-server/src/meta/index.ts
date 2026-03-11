import type { OpenAIFileSearchToolInput } from "@/openai/types.ts";
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
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { LlamaAPIClient } from "llama-api-client";
import type {
  EventTypeMap,
  MessageSingleton,
  MetaModelIdUnion
} from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

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
  | "MAX_ROUNDS"
  | "MAX_FILE_SEARCH_CALLS"
  | "REPEATED_TOOL_CALLS"
  | null;

export class LlamaService {
  private defaultClient: LlamaAPIClient;
  private logger: PinoLogger;
  constructor(
    logger: LoggerService,
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private userStoreVector: UserStoreVectorService,
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

  private buildSystemPrompt(
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"],
    fileSearchEnabled = false
  ) {
    const basePrompt = fileSearchEnabled
      ? "Tool policy: if document lookup would help, call the provided file_search tool using that exact name. Use file_search sparingly. Do not repeat the same query. If results are empty or not improving, stop using tools and answer directly with the best available guidance plus what is missing."
      : undefined;

    const historyNote =
      "Note: Previous responses in this conversation may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    if (systemPrompt && basePrompt) {
      return `${systemPrompt}\n\n${basePrompt}\n\n${historyNote}`;
    }
    if (systemPrompt) {
      return `${systemPrompt}\n\n${historyNote}`;
    }
    if (basePrompt) {
      return `${basePrompt}\n\n${historyNote}`;
    }
    return historyNote;
  }

  private prependProviderModelTag(
    msgs: Pick<
      MessageSingleton<true>,
      "senderType" | "provider" | "model" | "content"
    >[]
  ) {
    return msgs.map(msg => {
      if (msg.senderType === "USER") {
        return { role: "user", content: msg.content } as const;
      }

      const provider = msg.provider.toLowerCase();
      const model = msg.model ?? "";
      const modelIdentifier = `[${provider}/${model}]`;
      return {
        role: "assistant",
        content: `${modelIdentifier} \n${msg.content}`
      } as const;
    }) satisfies (UserMessage | CompletionMessage)[];
  }

  private formatMsgs(
    msgs: readonly (
      | {
          readonly role: "user";
          readonly content:
            | string
            | (MessageTextContentItem | MessageImageContentItem)[];
        }
      | { readonly role: "assistant"; readonly content: string }
    )[],
    systemPrompt?: string,
    fileSearchEnabled = false
  ) {
    return [
      {
        role: "system",
        content: this.buildSystemPrompt(systemPrompt, fileSearchEnabled)
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

  private parseFileSearchInput(rawArguments: string): OpenAIFileSearchToolInput {
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
        ? await this.searchStore(userId, input.query, maxResults, 0, input.filename)
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
    toolCall: CompletionMessage.ToolCall
  ) {
    if (toolCall.function.name !== "file_search") {
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `Unknown tool: ${toolCall.function.name}`
      } as const satisfies ToolResponseMessage;
    }

    try {
      const input = this.parseFileSearchInput(toolCall.function.arguments);
      const output = await this.executeFileSearch(userId, input);
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: output
      } as const satisfies ToolResponseMessage;
    } catch (error) {
      this.logger.error(
        {
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "llama function tool execution failed"
      );
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `file_search error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies ToolResponseMessage;
    }
  }

  public llamaFormat(
    isNewChat: boolean,
    msgs: ProviderChatRequestEntity["msgs"],
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"],
    fileSearchEnabled = false
  ) {
    const buildUserContent = (m: MessageSingleton<true>) => {
      const parts = Array.of<MessageTextContentItem | MessageImageContentItem>();
      if (m.attachments?.length > 0) {
        for (const att of m.attachments) {
          const url = att.compatCdnUrl ?? att.cdnUrl ?? att.sourceUrl;
          const mime = att.compatMime ?? att.mime ?? "";
          if (url && mime.startsWith("image/")) {
            parts.push({ type: "image_url", image_url: { url } });
          }
        }
      }
      parts.push({ type: "text", text: m.content });
      return parts;
    };

    if (isNewChat) {
      const first = msgs[0];
      if (!first) {
        return [
          {
            role: "system",
            content: this.buildSystemPrompt(systemPrompt, fileSearchEnabled)
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
          content: this.buildSystemPrompt(systemPrompt, fileSearchEnabled)
        },
        userMsg
      ] as const satisfies Message[];
    }

    const last = msgs.at(-1);
    if (last?.senderType === "USER") {
      const history = this.prependProviderModelTag(msgs.slice(0, -1));
      const base = this.formatMsgs(history, systemPrompt, fileSearchEnabled);
      const parts = buildUserContent(last);
      const userMsg =
        parts.length === 1 && parts[0]?.type === "text"
          ? ({ role: "user", content: parts[0].text } as const)
          : ({ role: "user", content: parts } as const);
      return [...base, userMsg] as const satisfies Message[];
    }

    return this.formatMsgs(
      this.prependProviderModelTag(msgs),
      systemPrompt,
      fileSearchEnabled
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
      const textParts = content
        .flatMap(item => ("text" in item ? [item.text] : []))
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
              toolCallId: current.id || incomingId || null,
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

  private materializeToolCalls(registry: Map<string, LlamaAccumulatedToolCall>) {
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
    const client = this.llamaClient(apiKey ?? undefined);

    const hasUserStoreDocs = await this.prisma.hasUserStoreDocs(userId);
    const tools = hasUserStoreDocs
      ? [this.fileSearchFunctionTool()]
      : undefined;

    const initialMessages = this.llamaFormat(
      isNewChat,
      msgs,
      systemPrompt,
      hasUserStoreDocs
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
          this.accumulateToolCallDelta(roundToolCalls, chunk.event.delta);
        }
        if (chunk.event.event_type === "complete") {
          stopReason = chunk.event.stop_reason ?? "stop";
        }

        if (text) {
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
              argumentsPreview: this.previewText(toolCall.function.arguments, 160)
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
        toolMessages.push(await this.executeToolCall(userId, toolCall));
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
      model
    });
    ws.send(
      JSON.stringify({
        type: "ai_chat_response",
        conversationId,
        userId,
        userMsgId,
        aiMsgId: d.aiMsgId,
        provider,
        systemPrompt,
        title,
        temperature,
        topP,
        model,
        chunk: metaAgg,
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
      temperature,
      title,
      topP,
      provider,
      model,
      chunk: metaAgg,
      done: true
    });
    void this.redis.del(`stream:state:${conversationId}`);
  }
}
