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

type V0ForcedLoopStopReason =
  | "MAX_ROUNDS"
  | "MAX_FILE_SEARCH_CALLS"
  | "REPEATED_TOOL_CALLS"
  | null;

export class v0Service {
  private readonly baseUrl = "https://api.v0.dev/v1/chat/completions";
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
        model,
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
    fileSearchEnabled = false
  ) {
    const basePrompt = fileSearchEnabled
      ? "You are a knowledgeable full-stack expert. Use only explicitly provided tools when they materially improve the answer. Never invoke internal or undeclared Vercel tools such as QuickEdit. Use file_search sparingly, do not repeat the same low-value query, and if results are empty or not improving then answer directly with the best available guidance plus what is missing."
      : "You are a knowledgeable full-stack expert; without using any tools provide assistance by outputting formatted code blocks into chat. Tools such as QuickEdit are not to be used and are unnecessary for this.";

    const historyNote =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return systemPrompt
      ? `${systemPrompt}\n\n${basePrompt}\n\n${historyNote}`
      : `${basePrompt}\n\n${historyNote}`;
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
      const userContent = first ? first.content : "";
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
          "Search the user's uploaded documents using semantic similarity. " +
          "Pass one or more queries in a single call. " +
          "Returns a JSON array of matching chunks with filename, score, content, offsets, and chunk index.",
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
            }
          },
          required: ["queries"],
          additionalProperties: false
        }
      }
    } as const satisfies V0FunctionTool;
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

    return {
      queries: [firstQuery, ...uniqueQueries.slice(1)] as const,
      max_results: maxResults,
      filename: filenameInput
    } satisfies OpenAIFileSearchToolInput;
  }

  private async executeFileSearch(
    userId: string,
    input: OpenAIFileSearchToolInput
  ) {
    const maxResults = Math.max(1, Math.min(input.max_results ?? 5, 5));
    const queryResults = await Promise.all(
      input.queries.map(query =>
        this.searchStore(userId, query, maxResults, 0, input.filename)
      )
    );
    const results = queryResults.flat();

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
    let v0ThinkingStartTime: number | null = null,
      v0ThinkingDuration = 0,
      v0IsCurrentlyThinking = false,
      v0ThinkingAgg = "",
      v0Agg = "",
      iThink = 0,
      v0HasThinkingAggregateFinal = false,
      totalUsage = 0;

    const hasUserStoreDocs = await this.prisma.hasUserStoreDocs(userId);
    const tools = hasUserStoreDocs
      ? [this.fileSearchFunctionTool()]
      : undefined;

    let roundMessages = Array.of<V0RequestMessage>(
      ...this.v0Format(isNewChat, msgs, systemPrompt, hasUserStoreDocs)
    );

    const MAX_TOOL_ROUNDS = 8;
    const maxFileSearchCalls = 4;
    const toolCallSignatureRegistry = new Map<string, number>();
    let fileSearchCallsTotal = 0;
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
          }

          if (hasToolCallDelta(choice.delta)) {
            this.accumulateToolCallDelta(
              roundToolCalls,
              choice.delta.tool_calls
            );
          }

          if (isReasoningDelta(choice.delta)) {
            const thinkingText = choice.delta.reasoning_content;
            if (typeof v0ThinkingStartTime !== "number") {
              v0ThinkingStartTime = performance.now();
            }
            if (v0IsCurrentlyThinking === false) {
              v0IsCurrentlyThinking = true;
            }

            iThink += 1;
            let emittedThinkingText = thinkingText;
            if (
              iThink > 3 &&
              Math.abs(v0ThinkingAgg.length - thinkingText.length) <= 4 * iThink
            ) {
              v0HasThinkingAggregateFinal = true;
              const prependNew = `\n${thinkingText}`;
              emittedThinkingText =
                v0ThinkingAgg.length < prependNew.length
                  ? prependNew.substring(v0ThinkingAgg.length)
                  : "";
            }

            if (emittedThinkingText.length > 0) {
              if (v0HasThinkingAggregateFinal) {
                v0ThinkingAgg += emittedThinkingText;
                thinkingChunks.push(emittedThinkingText);
              } else {
                v0ThinkingAgg += thinkingText;
                thinkingChunks.push(thinkingText);
              }

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
                  isThinking: v0IsCurrentlyThinking,
                  thinkingDuration: v0ThinkingStartTime
                    ? performance.now() - v0ThinkingStartTime
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
                  isThinking: v0IsCurrentlyThinking,
                  thinkingDuration: v0ThinkingStartTime
                    ? performance.now() - v0ThinkingStartTime
                    : undefined,
                  thinkingText: emittedThinkingText,
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
            if (
              v0IsCurrentlyThinking === true &&
              v0ThinkingStartTime !== null
            ) {
              v0IsCurrentlyThinking = false;
              v0ThinkingDuration = Math.round(
                performance.now() - v0ThinkingStartTime
              );
            }

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
        }
      }

      if (roundUsage) {
        totalUsage += roundUsage.total_tokens;
      }

      const materializedToolCalls = this.materializeToolCalls(roundToolCalls);
      const hasActionableToolCalls =
        materializedToolCalls.length > 0 && (sawToolCallFinish || !!roundUsage);

      if (!hasActionableToolCalls) {
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
          "v0 tool loop stopped after file_search call cap"
        );
        break;
      }

      if (repeatedSignatures === materializedToolCalls.length) {
        forcedLoopStopReason = "REPEATED_TOOL_CALLS";
        this.logger.warn(
          {
            round,
            repeatedSignatures,
            toolCallCount: materializedToolCalls.length
          },
          "v0 tool loop stopped due to repeated tool calls"
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
