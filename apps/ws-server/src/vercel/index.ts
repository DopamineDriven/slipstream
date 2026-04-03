import type { OpenAIFileSearchToolInput } from "@/openai/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type { v0ChatCompletionsRes, v0Usage } from "@/vercel/sse.ts";
import type { Logger as PinoLogger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import {
  createV0SSEParser,
  hasToolCallDelta,
  isContentDelta,
  isReasoningDelta
} from "@/vercel/sse.ts";
import type {
  EventTypeMap,
  MessageSingleton,
  VercelModelIdUnion
} from "@slipstream/types";
import { $Enums } from "@slipstream/db/node/generated/client";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

interface V0FunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: "string" | "number" | "array";
          description: string;
          items?: { type: "string" };
          minItems?: number;
          maxItems?: number;
        }
      >;
      required: string[];
      additionalProperties: boolean;
    };
  };
}

type V0FunctionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type V0BaseMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type V0AssistantToolCallMessage = {
  role: "assistant";
  content: "";
  tool_calls: readonly V0FunctionToolCall[];
};

type V0ToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

type V0RequestMessage =
  | V0BaseMessage
  | V0AssistantToolCallMessage
  | V0ToolMessage;

type V0AccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

interface V0ActiveMessageBlock {
  content: string;
  reasoningChunkCount: number;
  sawAggregateTail: boolean;
  startedAt: number;
  type: "THINKING" | "TEXT";
}

interface V0FinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

type V0ForcedLoopStopReason =
  | "MAX_ROUNDS"
  | null;

export class v0Service {
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
        { msgPrefix: "[v0] " }
      );
  }

  private async *stream(
    model = "v0-1.5-md" satisfies VercelModelIdUnion,
    messages: readonly V0RequestMessage[],
    apiKey?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_completion_tokens?: number;
      tools?: readonly V0FunctionTool[];
    }
  ): AsyncGenerator<v0ChatCompletionsRes, void, unknown> {
    const key = apiKey ?? this.apiKey;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: `vercel/${model}`,
        messages,
        stream: true,
        ...(typeof options?.temperature === "number"
          ? { temperature: options.temperature }
          : {}),
        ...(typeof options?.top_p === "number" ? { top_p: options.top_p } : {}),
        ...(typeof options?.max_completion_tokens === "number"
          ? { max_completion_tokens: options.max_completion_tokens }
          : {}),
        ...(options?.tools && options.tools.length > 0
          ? { tools: options.tools }
          : {})
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Vercel v0 API error (${response.status}, ${response.statusText}): ${errorText}`
      );
    }

    const parser = createV0SSEParser(response);

    for await (const event of parser) {
      yield event.data;
    }
  }

  private buildSystemPrompt(
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"],
    _fileSearchEnabled = false
  ) {
    // const basePrompt = fileSearchEnabled
    //   ? "You are a knowledgeable full-stack expert. If document lookup would help, use the provided file_search tool."
    //   : "You are a knowledgeable full-stack expert; without using any tools provide assistance by outputting formatted code blocks into chat. Tools such as QuickEdit are not to be used and are unnecessary for this.";

    const historyNote =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return systemPrompt
      ? `${systemPrompt}\n\n${historyNote}`
      : `${historyNote}`;
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
      "senderType" | "provider" | "model" | "content" | "messageBlocks"
    >[]
  ) {
    return msgs.map(msg => {
      const text = this.messageText(msg);

      if (msg.senderType === "USER") {
        return { role: "user", content: text } as const;
      }

      const provider = msg.provider.toLowerCase();
      const model = msg.model ?? "";
      const modelIdentifier = `[${provider}/${model}]`;
      return {
        role: "assistant",
        content: `${modelIdentifier} \n${text}`
      } as const;
    }) satisfies V0BaseMessage[];
  }

  private formatMsgs(
    msgs: readonly V0BaseMessage[],
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"],
    fileSearchEnabled = false
  ) {
    return [
      {
        role: "system",
        content: this.buildSystemPrompt(systemPrompt, fileSearchEnabled)
      },
      ...msgs
    ] satisfies V0RequestMessage[];
  }

  private v0Format(
    isNewChat: boolean,
    msgs: ProviderChatRequestEntity["msgs"],
    systemPrompt?: ProviderChatRequestEntity["systemPrompt"],
    fileSearchEnabled = false
  ) {
    if (isNewChat) {
      const first = msgs[0];
      const userContent = first ? this.messageText(first) : "";
      return [
        {
          role: "system",
          content: this.buildSystemPrompt(systemPrompt, fileSearchEnabled)
        },
        { role: "user", content: userContent }
      ] satisfies V0RequestMessage[];
    }

    return this.formatMsgs(
      this.prependProviderModelTag(msgs),
      systemPrompt,
      fileSearchEnabled
    );
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
    } as const satisfies V0FunctionTool;
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

  private parseFileSearchInput(
    rawArguments: string
  ): OpenAIFileSearchToolInput {
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
        } satisfies OpenAIFileSearchToolInput;
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
    } satisfies OpenAIFileSearchToolInput;
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
        "Recovered malformed streamed v0 file_search arguments"
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

  private async executeFileSearch(
    userId: string,
    input: OpenAIFileSearchToolInput
  ) {
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

  private async executeToolCall(userId: string, toolCall: V0FunctionToolCall) {
    if (toolCall.function.name !== "file_search") {
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `Unknown tool: ${toolCall.function.name}`
      } as const satisfies V0ToolMessage;
    }

    try {
      const input = this.parseFileSearchInput(toolCall.function.arguments);
      const output = await this.executeFileSearch(userId, input);
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: output
      } as const satisfies V0ToolMessage;
    } catch (error) {
      this.logger.error(
        {
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "v0 function tool execution failed"
      );
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `file_search error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies V0ToolMessage;
    }
  }

  private accumulateToolCallDelta(
    registry: Map<number, V0AccumulatedToolCall>,
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

  private materializeToolCalls(registry: Map<number, V0AccumulatedToolCall>) {
    const materialized = Array.of<V0FunctionToolCall>();

    for (const [, toolCall] of Array.from(registry.entries()).sort(
      ([left], [right]) => left - right
    )) {
      if (!toolCall.id || !toolCall.name) {
        this.logger.warn(
          { toolCall },
          "Skipping incomplete streamed v0 tool call"
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

  public async handleV0AiChatRequest({
    chunks,
    conversationId,
    streamChannel,
    msgs,
    thinkingChunks,
    apiKey,
    ws,
    userMsgId,
    userId,
    isNewChat,
    max_tokens,
    model,
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "vercel" as const;
    let v0ThinkingDuration = 0,
      v0ThinkingAgg = "",
      v0Agg = "",
      totalUsage = 0;
    const trackedBlocks = Array.of<V0FinalizedMessageBlock>();
    let activeBlock: V0ActiveMessageBlock | undefined = undefined;
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
        v0ThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (type: V0ActiveMessageBlock["type"]) => {
      if (activeBlock?.type !== type) {
        finalizeActiveBlock();
        activeBlock = {
          content: "",
          reasoningChunkCount: 0,
          sawAggregateTail: false,
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

      return v0ThinkingDuration + activeThinkingDuration;
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

    const appendReasoningDelta = (reasoningText: string) => {
      const block = ensureActiveBlock("THINKING");
      block.reasoningChunkCount += 1;

      let emittedThinkingText = reasoningText;
      if (
        block.reasoningChunkCount > 3 &&
        Math.abs(block.content.length - reasoningText.length) <=
          4 * block.reasoningChunkCount
      ) {
        block.sawAggregateTail = true;
        const prependNew = `\n${reasoningText}`;
        emittedThinkingText =
          block.content.length < prependNew.length
            ? prependNew.substring(block.content.length)
            : "";
      }

      if (emittedThinkingText.length === 0) {
        return undefined;
      }

      const appendedText = block.sawAggregateTail
        ? emittedThinkingText
        : reasoningText;

      block.content += appendedText;
      v0ThinkingAgg += appendedText;
      thinkingChunks.push(appendedText);

      return emittedThinkingText;
    };

    const hasUserStoreDocs = await this.prisma.hasUserStoreDocs(userId);
    const tools = hasUserStoreDocs
      ? [this.fileSearchFunctionTool()]
      : undefined;

    let roundMessages = Array.of<V0RequestMessage>(
      ...this.v0Format(isNewChat, msgs, systemPrompt, hasUserStoreDocs)
    );

    const MAX_TOOL_ROUNDS = 10;
    let forcedLoopStopReason: V0ForcedLoopStopReason = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const roundToolCalls = new Map<number, V0AccumulatedToolCall>();
      let roundUsage: v0Usage | undefined = undefined;
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
            const emittedThinkingText = appendReasoningDelta(
              choice.delta.reasoning_content
            );

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
                  thinkingDuration: currentThinkingDuration() > 0
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
                  thinkingDuration: currentThinkingDuration() > 0
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
            v0Agg += text;

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
                  v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
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
                v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
              isThinking: false,
              thinkingText:
                v0ThinkingAgg.length > 0 ? v0ThinkingAgg : undefined,
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
          "v0 tool loop reached max rounds"
        );
        break;
      }

      const assistantToolMessage = {
        role: "assistant",
        content: "",
        tool_calls: materializedToolCalls
      } as const satisfies V0AssistantToolCallMessage;

      const toolMessages = Array.of<V0ToolMessage>();
      for (const toolCall of materializedToolCalls) {
        toolMessages.push(await this.executeToolCall(userId, toolCall));
      }

      roundMessages = Array.of<V0RequestMessage>(
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
        "v0 tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && v0Agg.trim().length === 0) {
      v0Agg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        content: v0Agg,
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
      chunk: v0Agg,
      conversationId,
      done: true,
      provider,
      title,
      userId,
      userMsgId,
      imgGenEnabled: false,
      model,
      systemPrompt,
      thinkingDuration: v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
      thinkingText: v0ThinkingAgg.length > 0 ? v0ThinkingAgg : undefined,
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
        userMsgId,
        aiMsgId: d.aiMsgId,
        imgGenEnabled: false,
        systemPrompt,
        thinkingDuration:
          v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
        thinkingText: v0ThinkingAgg.length > 0 ? v0ThinkingAgg : undefined,
        title,
        temperature,
        topP,
        model,
        usage: finalUsage,
        chunk: v0Agg,
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
      imgGenEnabled: false,
      temperature,
      title,
      thinkingDuration: v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
      thinkingText: v0ThinkingAgg.length > 0 ? v0ThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      topP,
      usage: finalUsage,
      provider,
      model,
      chunk: v0Agg,
      done: true
    });

    void this.redis.del(`stream:state:${conversationId}`);
  }
}
