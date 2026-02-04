You're right to be confused, Andrew—this nested loop pattern is a common but awkward way to handle Anthropic's "agentic" tool use flow. Let me break down what's happening and then propose a cleaner generator-based abstraction.

## What's Actually Happening

The control flow is:

```
┌─────────────────────────────────────────────────────────────┐
│  OUTER LOOP (max 8 rounds)                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  INNER LOOP (stream chunks)                           │  │
│  │    - Accumulate text, thinking, tool_use blocks       │  │
│  │    - Stream to client                                 │  │
│  │    - BREAK if stop_reason === "tool_use"              │  │
│  │    - RETURN if stop_reason === "end_turn" (done)      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  IF broke due to tool_use:                                  │
│    1. Convert accumulated blocks → assistant content        │
│    2. Execute tools (file_search, etc.)                     │
│    3. Build new params with tool_results                    │
│    4. CONTINUE outer loop (new API call)                    │
└─────────────────────────────────────────────────────────────┘
```

The reason for two loops: Claude's API can **pause mid-generation** to request tool execution. You must:
1. Capture everything Claude said so far (including the `tool_use` block)
2. Execute the tool
3. Send a new request with the conversation history + tool result
4. Claude continues generating

## Why This Is Confusing

The current implementation conflates three concerns:
1. **Stream parsing** (chunk → typed events)
2. **Tool execution orchestration** (detecting stops, running tools, continuing)
3. **Client streaming** (WebSocket/Redis publishing)

## Generator-Based Refactor

Here's a cleaner approach using an async generator to separate stream parsing from orchestration:

```typescript
import type { Anthropic } from "@anthropic-ai/sdk";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type BetaMessageStreamEvent = Anthropic.Beta.BetaMessageStreamEvent;
type BetaContentBlock = Anthropic.Beta.BetaContentBlock;
type BetaStopReason = Anthropic.Beta.BetaStopReason;

interface ParsedTextDelta {
  readonly kind: "text_delta";
  readonly index: number;
  readonly text: string;
}

interface ParsedThinkingDelta {
  readonly kind: "thinking_delta";
  readonly index: number;
  readonly thinking: string;
}

interface ParsedToolUseStart {
  readonly kind: "tool_use_start";
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly caller?: { type: "code_execution_20250825"; tool_id: string };
}

interface ParsedToolUseInputDelta {
  readonly kind: "tool_use_input_delta";
  readonly index: number;
  readonly partialJson: string;
}

interface ParsedWebSearchResult {
  readonly kind: "web_search_result";
  readonly index: number;
  readonly results: ReadonlyArray<Anthropic.Beta.BetaWebSearchResultBlock>;
}

interface ParsedMessageComplete {
  readonly kind: "message_complete";
  readonly stopReason: BetaStopReason;
  readonly usage: { input: number; output: number };
  readonly containerId?: string;
}

interface ParsedBlockComplete {
  readonly kind: "block_complete";
  readonly index: number;
  readonly block: BetaContentBlock;
}

type ParsedStreamEvent =
  | ParsedTextDelta
  | ParsedThinkingDelta
  | ParsedToolUseStart
  | ParsedToolUseInputDelta
  | ParsedWebSearchResult
  | ParsedMessageComplete
  | ParsedBlockComplete;

// ─────────────────────────────────────────────────────────────
// Stream Parser Generator
// ─────────────────────────────────────────────────────────────

async function* parseAnthropicStream(
  stream: AsyncIterable<BetaMessageStreamEvent>
): AsyncGenerator<ParsedStreamEvent, void, unknown> {
  let containerId: string | undefined;
  const blocks = new Map<number, BetaContentBlock>();

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "message_start": {
        if (hasContainerId(chunk.message)) {
          containerId = chunk.message.container.id;
        }
        break;
      }

      case "content_block_start": {
        blocks.set(chunk.index, chunk.content_block);

        if (chunk.content_block.type === "tool_use") {
          const caller = hasCodeExecutionCaller(chunk.content_block)
            ? {
                type: "code_execution_20250825" as const,
                tool_id: chunk.content_block.caller.tool_id
              }
            : undefined;

          yield {
            kind: "tool_use_start",
            index: chunk.index,
            id: chunk.content_block.id,
            name: chunk.content_block.name,
            caller
          } satisfies ParsedToolUseStart;
        }

        if (chunk.content_block.type === "web_search_tool_result") {
          const content = chunk.content_block.content;
          if (Array.isArray(content)) {
            yield {
              kind: "web_search_result",
              index: chunk.index,
              results: content
            } satisfies ParsedWebSearchResult;
          }
        }
        break;
      }

      case "content_block_delta": {
        if (chunk.delta.type === "text_delta") {
          yield {
            kind: "text_delta",
            index: chunk.index,
            text: chunk.delta.text
          } satisfies ParsedTextDelta;
        }

        if (chunk.delta.type === "thinking_delta") {
          yield {
            kind: "thinking_delta",
            index: chunk.index,
            thinking: chunk.delta.thinking
          } satisfies ParsedThinkingDelta;
        }

        if (chunk.delta.type === "input_json_delta") {
          yield {
            kind: "tool_use_input_delta",
            index: chunk.index,
            partialJson: chunk.delta.partial_json
          } satisfies ParsedToolUseInputDelta;
        }
        break;
      }

      case "content_block_stop": {
        const block = blocks.get(chunk.index);
        if (block) {
          yield {
            kind: "block_complete",
            index: chunk.index,
            block
          } satisfies ParsedBlockComplete;
        }
        break;
      }

      case "message_delta": {
        if (hasContainerId(chunk.delta)) {
          containerId = chunk.delta.container.id;
        }

        if (chunk.delta.stop_reason) {
          yield {
            kind: "message_complete",
            stopReason: chunk.delta.stop_reason,
            usage: {
              input: chunk.usage.input_tokens ?? 0,
              output: chunk.usage.output_tokens ?? 0
            },
            containerId
          } satisfies ParsedMessageComplete;
        }
        break;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────

function hasContainerId<T>(
  obj: T
): obj is T & { container: { id: string } } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "container" in obj &&
    typeof obj.container === "object" &&
    obj.container !== null &&
    "id" in obj.container &&
    typeof obj.container.id === "string"
  );
}

function hasCodeExecutionCaller<T>(
  obj: T
): obj is T & { caller: { type: "code_execution_20250825"; tool_id: string } } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "caller" in obj &&
    typeof obj.caller === "object" &&
    obj.caller !== null &&
    "type" in obj.caller &&
    obj.caller.type === "code_execution_20250825"
  );
}

// ─────────────────────────────────────────────────────────────
// Tool Execution Orchestrator
// ─────────────────────────────────────────────────────────────

interface ToolUseAccumulated {
  readonly id: string;
  readonly name: string;
  inputJson: string;
  readonly caller?: { type: "code_execution_20250825"; tool_id: string };
}

interface StreamRoundResult {
  readonly stopReason: BetaStopReason;
  readonly usage: { input: number; output: number };
  readonly containerId?: string;
  readonly textContent: string;
  readonly thinkingContent: string;
  readonly toolCalls: ReadonlyArray<ToolUseAccumulated>;
  readonly assistantBlocks: ReadonlyArray<Anthropic.Beta.BetaContentBlockParam>;
}

interface ToolExecutor {
  execute(
    toolName: string,
    input: unknown
  ): Promise<Anthropic.Beta.BetaToolResultBlockParam["content"]>;
}

interface StreamEventHandler {
  onTextDelta?(text: string): void;
  onThinkingDelta?(thinking: string): void;
  onWebSearchResult?(results: ReadonlyArray<Anthropic.Beta.BetaWebSearchResultBlock>): void;
}

async function processStreamRound(
  stream: AsyncIterable<BetaMessageStreamEvent>,
  handler: StreamEventHandler
): Promise<StreamRoundResult> {
  const toolCalls = new Map<number, ToolUseAccumulated>();
  const blockBuilders = new Map
    number,
    {
      type: string;
      text?: string;
      thinking?: string;
      signature?: string;
      id?: string;
      name?: string;
      inputJson?: string;
      input?: unknown;
      caller?: { type: "code_execution_20250825"; tool_id: string };
    }
  >();

  let textContent = "";
  let thinkingContent = "";
  let finalResult: ParsedMessageComplete | undefined;

  for await (const event of parseAnthropicStream(stream)) {
    switch (event.kind) {
      case "text_delta":
        textContent += event.text;
        handler.onTextDelta?.(event.text);
        break;

      case "thinking_delta":
        thinkingContent += event.thinking;
        handler.onThinkingDelta?.(event.thinking);
        break;

      case "tool_use_start":
        toolCalls.set(event.index, {
          id: event.id,
          name: event.name,
          inputJson: "",
          caller: event.caller
        });
        blockBuilders.set(event.index, {
          type: "tool_use",
          id: event.id,
          name: event.name,
          inputJson: "",
          caller: event.caller
        });
        break;

      case "tool_use_input_delta": {
        const tool = toolCalls.get(event.index);
        if (tool) {
          tool.inputJson += event.partialJson;
        }
        const bb = blockBuilders.get(event.index);
        if (bb) {
          bb.inputJson = (bb.inputJson ?? "") + event.partialJson;
        }
        break;
      }

      case "web_search_result":
        handler.onWebSearchResult?.(event.results);
        break;

      case "block_complete": {
        const { block, index } = event;
        if (block.type === "text") {
          blockBuilders.set(index, { type: "text", text: block.text });
        }
        if (block.type === "thinking" && "signature" in block) {
          blockBuilders.set(index, {
            type: "thinking",
            thinking: block.thinking,
            signature: block.signature
          });
        }
        if (block.type === "server_tool_use") {
          blockBuilders.set(index, {
            type: "server_tool_use",
            id: block.id,
            name: block.name,
            input: block.input
          });
        }
        break;
      }

      case "message_complete":
        finalResult = event;
        break;
    }
  }

  if (!finalResult) {
    throw new Error("Stream ended without message_complete event");
  }

  // Convert block builders to content blocks
  const assistantBlocks: Anthropic.Beta.BetaContentBlockParam[] = [];

  for (const bb of blockBuilders.values()) {
    if (bb.type === "text" && bb.text !== undefined) {
      assistantBlocks.push({
        type: "text",
        text: bb.text
      } satisfies Anthropic.Beta.BetaTextBlockParam);
    }

    if (bb.type === "thinking" && bb.thinking !== undefined && bb.signature) {
      assistantBlocks.push({
        type: "thinking",
        thinking: bb.thinking,
        signature: bb.signature
      } satisfies Anthropic.Beta.BetaThinkingBlockParam);
    }

    if (bb.type === "server_tool_use" && bb.id && bb.name) {
      assistantBlocks.push({
        type: "server_tool_use",
        id: bb.id,
        name: bb.name as Anthropic.Beta.BetaServerToolUseBlockParam["name"],
        input: bb.input
      } satisfies Anthropic.Beta.BetaServerToolUseBlockParam);
    }

    if (bb.type === "tool_use" && bb.id && bb.name) {
      assistantBlocks.push({
        type: "tool_use",
        id: bb.id,
        name: bb.name,
        input: JSON.parse(bb.inputJson ?? "{}") as unknown,
        caller: bb.caller
      } satisfies Anthropic.Beta.BetaToolUseBlockParam);
    }
  }

  return {
    stopReason: finalResult.stopReason,
    usage: finalResult.usage,
    containerId: finalResult.containerId,
    textContent,
    thinkingContent,
    toolCalls: Array.from(toolCalls.values()),
    assistantBlocks
  };
}

// ─────────────────────────────────────────────────────────────
// Main Orchestration Loop (now much cleaner)
// ─────────────────────────────────────────────────────────────

interface OrchestrationConfig<TParams> {
  readonly maxToolRounds: number;
  readonly initialParams: TParams;
  readonly createStream: (params: TParams) => Promise<AsyncIterable<BetaMessageStreamEvent>>;
  readonly buildContinuationParams: (
    baseParams: TParams,
    containerId: string | undefined,
    assistantBlocks: ReadonlyArray<Anthropic.Beta.BetaContentBlockParam>,
    toolResults: ReadonlyArray<Anthropic.Beta.BetaToolResultBlockParam>
  ) => TParams;
  readonly toolExecutor: ToolExecutor;
  readonly eventHandler: StreamEventHandler;
  readonly onRoundComplete: (round: number, result: StreamRoundResult) => void;
  readonly onFinalComplete: (
    textContent: string,
    thinkingContent: string,
    usage: { input: number; output: number }
  ) => Promise<void>;
}

async function orchestrateToolLoop<TParams>(
  config: OrchestrationConfig<TParams>
): Promise<void> {
  const {
    maxToolRounds,
    initialParams,
    createStream,
    buildContinuationParams,
    toolExecutor,
    eventHandler,
    onRoundComplete,
    onFinalComplete
  } = config;

  let params = initialParams;
  let aggregatedText = "";
  let aggregatedThinking = "";
  let totalUsage = { input: 0, output: 0 };

  for (let round = 0; round <= maxToolRounds; round++) {
    const stream = await createStream(params);

    const result = await processStreamRound(stream, eventHandler);

    aggregatedText += result.textContent;
    aggregatedThinking += result.thinkingContent;
    totalUsage.input += result.usage.input;
    totalUsage.output += result.usage.output;

    onRoundComplete(round, result);

    // If not a tool_use stop, we're done
    if (result.stopReason !== "tool_use" || result.toolCalls.length === 0) {
      await onFinalComplete(aggregatedText, aggregatedThinking, totalUsage);
      return;
    }

    // Execute tools and build continuation
    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      result.toolCalls.map(async (tool) => {
        const input = JSON.parse(tool.inputJson || "{}") as unknown;
        try {
          const content = await toolExecutor.execute(tool.name, input);
          return {
            type: "tool_result" as const,
            tool_use_id: tool.id,
            content
          };
        } catch (error) {
          return {
            type: "tool_result" as const,
            tool_use_id: tool.id,
            content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
            is_error: true
          };
        }
      })
    );

    params = buildContinuationParams(
      params,
      result.containerId,
      result.assistantBlocks,
      toolResults
    );
  }

  // Exceeded max rounds
  await onFinalComplete(aggregatedText, aggregatedThinking, totalUsage);
}

export {
  parseAnthropicStream,
  processStreamRound,
  orchestrateToolLoop,
  type ParsedStreamEvent,
  type StreamRoundResult,
  type ToolExecutor,
  type StreamEventHandler,
  type OrchestrationConfig,
  type ToolUseAccumulated
};
```

## How This Simplifies Your Service

Now your `handleAnthropicAiChatRequest` becomes:

```typescript
public async handleAnthropicAiChatRequest(entity: ProviderAnthropicChatRequestEntity) {
  const { conversationId, userId, ws, chunks, thinkingChunks, streamChannel, /* ... */ } = entity;
  
  let thinkingStartTime: number | null = null;
  let thinkingDuration = 0;
  let isThinking = false;

  await orchestrateToolLoop({
    maxToolRounds: 8,
    initialParams: await this.createStreamWorkup(/* ... */),
    
    createStream: async (params) => {
      return this.getClient(entity.apiKey).beta.messages.create(params, { stream: true });
    },

    buildContinuationParams: (base, containerId, assistantBlocks, toolResults) => ({
      ...base,
      container: containerId,
      messages: [
        ...base.messages,
        { role: "assistant", content: assistantBlocks },
        { role: "user", content: toolResults }
      ]
    }),

    toolExecutor: {
      execute: async (name, input) => {
        if (name === "file_search") {
          return this.executeFileSearch(userId, input as FileSearchToolInput);
        }
        throw new Error(`Unknown tool: ${name}`);
      }
    },

    eventHandler: {
      onTextDelta: (text) => {
        chunks.push(text);
        this.streamTextToClient(ws, streamChannel, { text, isThinking, thinkingDuration, /* ... */ });
      },
      onThinkingDelta: (thinking) => {
        if (!isThinking) {
          thinkingStartTime = performance.now();
          isThinking = true;
        }
        thinkingChunks.push(thinking);
        this.streamThinkingToClient(ws, streamChannel, { thinking, /* ... */ });
      }
    },

    onRoundComplete: (round, result) => {
      if (isThinking && result.textContent) {
        thinkingDuration = Math.round(performance.now() - (thinkingStartTime ?? 0));
        isThinking = false;
      }
      this.logger.info({ round, toolCount: result.toolCalls.length }, "Round complete");
    },

    onFinalComplete: async (text, thinking, usage) => {
      const saved = await this.prisma.handleAiChatResponse({ /* ... */ });
      this.sendFinalResponse(ws, streamChannel, { text, thinking, usage, aiMsgId: saved.aiMsgId });
    }
  });
}
```

## Key Benefits

1. **Single responsibility**: `parseAnthropicStream` only parses, `processStreamRound` only accumulates, `orchestrateToolLoop` only orchestrates
2. **Testable**: Each generator/function can be unit tested in isolation
3. **No nested breaks**: The control flow is linear within each function
4. **Type-safe**: All events are discriminated unions, `satisfies` everywhere
5. **Reusable**: The orchestrator works with any tool executor implementation

Want me to refine any part of this, or help integrate it with your existing `AnthropicVectorStoreWorkup` base class?


---

Andrew: 

perfect, thanks! I have managed to pool the events into a single record at the type level for ease of use in helpers
Before:

```ts
type Messages.BetaRawMessageStreamEvent = Anthropic.Beta.Messages.BetaRawMessageStartEvent | Anthropic.Beta.Messages.BetaRawMessageDeltaEvent | Anthropic.Beta.Messages.BetaRawMessageStopEvent | Anthropic.Beta.Messages.BetaRawContentBlockStartEvent | Anthropic.Beta.Messages.BetaRawContentBlockDeltaEvent | Anthropic.Beta.Messages.BetaRawContentBlockStopEvent
```

After:

```ts
type BetaRawMessageStreamRecord = {
    message_start: Anthropic.Beta.Messages.BetaRawMessageStartEvent;
    message_delta: Anthropic.Beta.Messages.BetaRawMessageDeltaEvent;
    message_stop: Anthropic.Beta.Messages.BetaRawMessageStopEvent;
    content_block_start: Anthropic.Beta.Messages.BetaRawContentBlockStartEvent;
    content_block_delta: Anthropic.Beta.Messages.BetaRawContentBlockDeltaEvent;
    content_block_stop: Anthropic.Beta.Messages.BetaRawContentBlockStopEvent;
}
```

via this simple guy


```ts
export type UnionToRecord
  TUnion extends Record<"type", string>,
  TDiscriminant extends string = TUnion["type"]
> = {
  [K in TDiscriminant]: Extract<TUnion, { type: K }>;
};
```

and


```ts
type BetaRawMessageStreamRecord = UnionToRecord<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
```


---

Claude: 

That's a beautiful pattern! The `UnionToRecord` utility is incredibly useful for discriminated unions. You can extend this further to create fully type-safe event handlers and exhaustive matching. Here are some complementary utilities:

```typescript
import type { Anthropic } from "@anthropic-ai/sdk";

// ─────────────────────────────────────────────────────────────
// Core Union-to-Record Utility
// ─────────────────────────────────────────────────────────────

export type UnionToRecord
  TUnion extends Record<TKey, string>,
  TKey extends string = "type",
  TDiscriminant extends string = TUnion[TKey]
> = {
  [K in TDiscriminant]: Extract<TUnion, Record<TKey, K>>;
};

// ─────────────────────────────────────────────────────────────
// Stream Event Records
// ─────────────────────────────────────────────────────────────

type BetaRawMessageStreamEvent = Anthropic.Beta.Messages.BetaRawMessageStreamEvent;

export type BetaRawMessageStreamRecord = UnionToRecord<BetaRawMessageStreamEvent>;

// Extract just the keys for iteration/validation
export type BetaRawMessageStreamEventType = keyof BetaRawMessageStreamRecord;

// ─────────────────────────────────────────────────────────────
// Content Block Records (nested discrimination)
// ─────────────────────────────────────────────────────────────

type BetaContentBlock = Anthropic.Beta.BetaContentBlock;
type BetaContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

export type BetaContentBlockRecord = UnionToRecord<BetaContentBlock>;
export type BetaContentBlockParamRecord = UnionToRecord<BetaContentBlockParam>;

export type BetaContentBlockType = keyof BetaContentBlockRecord;

// ─────────────────────────────────────────────────────────────
// Delta Records (the content_block_delta payloads)
// ─────────────────────────────────────────────────────────────

// Extract the delta union from content_block_delta event
type BetaContentBlockDelta = BetaRawMessageStreamRecord["content_block_delta"]["delta"];

export type BetaContentBlockDeltaRecord = UnionToRecord<BetaContentBlockDelta>;
export type BetaContentBlockDeltaType = keyof BetaContentBlockDeltaRecord;

// ─────────────────────────────────────────────────────────────
// Type-Safe Event Handler Pattern
// ─────────────────────────────────────────────────────────────

/**
 * Partial handler map - only handle events you care about
 */
export type StreamEventHandlers<TReturn = void> = {
  [K in BetaRawMessageStreamEventType]?: (
    event: BetaRawMessageStreamRecord[K]
  ) => TReturn;
};

/**
 * Exhaustive handler map - must handle all events
 */
export type ExhaustiveStreamEventHandlers<TReturn = void> = {
  [K in BetaRawMessageStreamEventType]: (
    event: BetaRawMessageStreamRecord[K]
  ) => TReturn;
};

/**
 * Create a type-safe event dispatcher
 */
export function createStreamEventDispatcher<TReturn = void>(
  handlers: StreamEventHandlers<TReturn>
) {
  return (event: BetaRawMessageStreamEvent): TReturn | undefined => {
    const handler = handlers[event.type] as
      | ((e: typeof event) => TReturn)
      | undefined;
    return handler?.(event);
  };
}

// ─────────────────────────────────────────────────────────────
// Delta-Specific Handlers (for content_block_delta)
// ─────────────────────────────────────────────────────────────

export type DeltaHandlers<TReturn = void> = {
  [K in BetaContentBlockDeltaType]?: (
    delta: BetaContentBlockDeltaRecord[K],
    index: number
  ) => TReturn;
};

export function createDeltaDispatcher<TReturn = void>(
  handlers: DeltaHandlers<TReturn>
) {
  return (
    event: BetaRawMessageStreamRecord["content_block_delta"]
  ): TReturn | undefined => {
    const { delta, index } = event;
    const handler = handlers[delta.type] as
      | ((d: typeof delta, i: number) => TReturn)
      | undefined;
    return handler?.(delta, index);
  };
}

// ─────────────────────────────────────────────────────────────
// Content Block Start Handlers
// ─────────────────────────────────────────────────────────────

// The content_block in content_block_start uses same structure as BetaContentBlock
type ContentBlockStartBlock =
  BetaRawMessageStreamRecord["content_block_start"]["content_block"];

export type ContentBlockStartRecord = UnionToRecord<ContentBlockStartBlock>;

export type ContentBlockStartHandlers<TReturn = void> = {
  [K in keyof ContentBlockStartRecord]?: (
    block: ContentBlockStartRecord[K],
    index: number
  ) => TReturn;
};

export function createBlockStartDispatcher<TReturn = void>(
  handlers: ContentBlockStartHandlers<TReturn>
) {
  return (
    event: BetaRawMessageStreamRecord["content_block_start"]
  ): TReturn | undefined => {
    const { content_block, index } = event;
    const handler = handlers[content_block.type] as
      | ((b: typeof content_block, i: number) => TReturn)
      | undefined;
    return handler?.(content_block, index);
  };
}

// ─────────────────────────────────────────────────────────────
// Extractors (for when you need to narrow in a type-safe way)
// ─────────────────────────────────────────────────────────────

/**
 * Type guard factory for stream events
 */
export function isStreamEventType<K extends BetaRawMessageStreamEventType>(
  type: K
) {
  return (event: BetaRawMessageStreamEvent): event is BetaRawMessageStreamRecord[K] =>
    event.type === type;
}

/**
 * Type guard factory for deltas
 */
export function isDeltaType<K extends BetaContentBlockDeltaType>(type: K) {
  return (delta: BetaContentBlockDelta): delta is BetaContentBlockDeltaRecord[K] =>
    delta.type === type;
}

/**
 * Type guard factory for content blocks
 */
export function isContentBlockType<K extends BetaContentBlockType>(type: K) {
  return (block: BetaContentBlock): block is BetaContentBlockRecord[K] =>
    block.type === type;
}

// ─────────────────────────────────────────────────────────────
// Usage Examples
// ─────────────────────────────────────────────────────────────

/*
// Example 1: Partial handlers for stream events
const dispatch = createStreamEventDispatcher({
  content_block_start: (event) => {
    // event is fully typed as BetaRawContentBlockStartEvent
    console.log("Block started at index", event.index);
  },
  content_block_delta: (event) => {
    // event.delta is the union of all delta types
    if (event.delta.type === "text_delta") {
      console.log(event.delta.text);
    }
  },
  message_delta: (event) => {
    if (event.delta.stop_reason) {
      console.log("Stopped:", event.delta.stop_reason);
    }
  }
});

// Example 2: Nested delta handlers
const handleDelta = createDeltaDispatcher({
  text_delta: (delta, index) => {
    // delta is BetaTextDelta, index is number
    return delta.text;
  },
  thinking_delta: (delta, index) => {
    return delta.thinking;
  },
  input_json_delta: (delta, index) => {
    return delta.partial_json;
  }
});

// Example 3: Type guards for filtering
const textDeltas = deltas.filter(isDeltaType("text_delta"));
// textDeltas is BetaContentBlockDeltaRecord["text_delta"][]

// Example 4: Direct record access for static analysis
type TextDeltaShape = BetaContentBlockDeltaRecord["text_delta"];
// { type: "text_delta"; text: string }
*/
```

And here's a more advanced pattern for building accumulator state machines with full type safety:

```typescript
// ─────────────────────────────────────────────────────────────
// Accumulator State Machine
// ─────────────────────────────────────────────────────────────

interface BlockAccumulatorState {
  text: { text: string };
  thinking: { thinking: string; signature?: string };
  tool_use: {
    id: string;
    name: string;
    inputJson: string;
    caller?: { type: "code_execution_20250825"; tool_id: string };
  };
  server_tool_use: {
    id: string;
    name: string;
    input: unknown;
  };
  web_search_tool_result: {
    tool_use_id: string;
    results: Anthropic.Beta.BetaWebSearchResultBlock[];
  };
}

type BlockAccumulator = {
  [K in keyof BlockAccumulatorState]: { type: K } & BlockAccumulatorState[K];
}[keyof BlockAccumulatorState];

export class StreamAccumulator {
  private blocks = new Map<number, BlockAccumulator>();
  private containerId?: string;
  private stopReason?: Anthropic.Beta.BetaStopReason;
  private usage = { input: 0, output: 0 };

  private readonly blockStartHandler = createBlockStartDispatcher<void>({
    text: (block, index) => {
      this.blocks.set(index, { type: "text", text: block.text });
    },
    thinking: (block, index) => {
      this.blocks.set(index, {
        type: "thinking",
        thinking: block.thinking,
        signature: "signature" in block ? block.signature : undefined
      });
    },
    tool_use: (block, index) => {
      const caller =
        "caller" in block &&
        block.caller?.type === "code_execution_20250825"
          ? { type: "code_execution_20250825" as const, tool_id: block.caller.tool_id }
          : undefined;
      this.blocks.set(index, {
        type: "tool_use",
        id: block.id,
        name: block.name,
        inputJson: "",
        caller
      });
    },
    server_tool_use: (block, index) => {
      this.blocks.set(index, {
        type: "server_tool_use",
        id: block.id,
        name: block.name,
        input: block.input
      });
    },
    web_search_tool_result: (block, index) => {
      const results = Array.isArray(block.content)
        ? block.content
        : [];
      this.blocks.set(index, {
        type: "web_search_tool_result",
        tool_use_id: block.tool_use_id,
        results
      });
    }
  });

  private readonly deltaHandler = createDeltaDispatcher<void>({
    text_delta: (delta, index) => {
      const block = this.blocks.get(index);
      if (block?.type === "text") {
        block.text += delta.text;
      }
    },
    thinking_delta: (delta, index) => {
      const block = this.blocks.get(index);
      if (block?.type === "thinking") {
        block.thinking += delta.thinking;
      }
    },
    signature_delta: (delta, index) => {
      const block = this.blocks.get(index);
      if (block?.type === "thinking") {
        block.signature = (block.signature ?? "") + delta.signature;
      }
    },
    input_json_delta: (delta, index) => {
      const block = this.blocks.get(index);
      if (block?.type === "tool_use") {
        block.inputJson += delta.partial_json;
      }
    }
  });

  private readonly eventDispatcher = createStreamEventDispatcher<void>({
    message_start: (event) => {
      if (this.hasContainerId(event.message)) {
        this.containerId = event.message.container.id;
      }
    },
    content_block_start: (event) => {
      this.blockStartHandler(event);
    },
    content_block_delta: (event) => {
      this.deltaHandler(event);
    },
    message_delta: (event) => {
      if (this.hasContainerId(event.delta)) {
        this.containerId = event.delta.container.id;
      }
      if (event.delta.stop_reason) {
        this.stopReason = event.delta.stop_reason;
      }
      this.usage.input = event.usage.input_tokens ?? this.usage.input;
      this.usage.output = event.usage.output_tokens ?? this.usage.output;
    }
  });

  process(event: BetaRawMessageStreamEvent): void {
    this.eventDispatcher(event);
  }

  getBlocks(): ReadonlyMap<number, BlockAccumulator> {
    return this.blocks;
  }

  getBlocksOfType<K extends BlockAccumulator["type"]>(
    type: K
  ): Array<Extract<BlockAccumulator, { type: K }>> {
    return Array.from(this.blocks.values()).filter(
      (b): b is Extract<BlockAccumulator, { type: K }> => b.type === type
    );
  }

  getTextContent(): string {
    return this.getBlocksOfType("text")
      .map((b) => b.text)
      .join("");
  }

  getThinkingContent(): string {
    return this.getBlocksOfType("thinking")
      .map((b) => b.thinking)
      .join("");
  }

  getToolCalls(): Array<BlockAccumulatorState["tool_use"] & { type: "tool_use" }> {
    return this.getBlocksOfType("tool_use");
  }

  getResult() {
    return {
      containerId: this.containerId,
      stopReason: this.stopReason,
      usage: this.usage,
      text: this.getTextContent(),
      thinking: this.getThinkingContent(),
      toolCalls: this.getToolCalls()
    } as const;
  }

  private hasContainerId<T>(obj: T): obj is T & { container: { id: string } } {
    return (
      typeof obj === "object" &&
      obj !== null &&
      "container" in obj &&
      typeof obj.container === "object" &&
      obj.container !== null &&
      "id" in obj.container &&
      typeof obj.container.id === "string"
    );
  }
}
```

Now your stream processing becomes trivially simple:

```typescript
const accumulator = new StreamAccumulator();

for await (const event of stream) {
  accumulator.process(event);
  
  // Still stream deltas to client if needed
  if (event.type === "content_block_delta") {
    if (event.delta.type === "text_delta") {
      ws.send(JSON.stringify({ chunk: event.delta.text }));
    }
  }
}

const result = accumulator.getResult();
// result.stopReason, result.text, result.toolCalls, etc.
```

The `UnionToRecord` pattern really shines here—it gives you the indexed access `Record["key"]` ergonomics while maintaining full type safety on the discriminated union. Clean work!
