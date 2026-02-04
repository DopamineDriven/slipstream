# Step 7: Programmatic Tool Calling in `index.ts`

## Context — what's already done

Steps 1–6 are complete:
- Schema: `LocalStoreChunkState` enum, chunk `state`/`errorMessage` fields, indexes
- SQL: `updateLocalDocChunkState.sql`, search filters for `chunk.state = 'READY'`
- Caches: simplified to 2 Maps
- Two-phase chunk flow: QUEUED → embed → READY/ERROR with retry, overflow image chunks
- `fileSearchTool()`: `allowed_callers: ["code_execution_20250825"]`, JSON output schema in description
- `executeFileSearch()`: returns JSON array `[{ filename, score, content, startOffset, endOffset, chunkIndex }]`
- `createStreamWorkup()`: detects `hasLocalStore` via `localVectorStoreCheck`, passes to `tooling()` and `handleBetaHeaders()`
- `ToolUseAccumulator` type: `{ id, name, inputJson, callerType: "code_execution_20250825", callerToolId }`

## What this step does

Add PTC event handling inline in `index.ts`. The single-pass stream becomes a **bounded tool loop** that can re-enter the stream when `stop_reason === "tool_use"`.

---

## PTC flow (from Anthropic docs)

1. Claude writes Python code that calls `await file_search(query="...")` inside code execution sandbox
2. API **pauses** code execution and returns a response with `stop_reason: "tool_use"`
3. The response content contains:
   - `server_tool_use` block (code_execution, with `id: "srvtoolu_..."` and `input.code`)
   - `tool_use` block (file_search, with `caller: { type: "code_execution_20250825", tool_id: "srvtoolu_..." }`)
4. We execute `file_search` server-side, then send a **continuation request** with:
   - Full message history so far (assistant content blocks + user `tool_result` blocks)
   - `container: "<container_id>"` to reuse the paused code execution container
   - **Critical**: user message must contain **only** `tool_result` blocks, no text
5. Code execution resumes, processes the result, and may call more tools (loop) or finish
6. Final response has `stop_reason: "end_turn"` with `code_execution_tool_result` block + text

## SDK types involved

| Type | Location | Key fields |
|------|----------|------------|
| `BetaRawMessageStartEvent` | `message_start` | `message.container: BetaContainer \| null` |
| `BetaRawMessageDeltaEvent` | `message_delta` | `delta.container: BetaContainer \| null`, `delta.stop_reason` |
| `BetaRawContentBlockStartEvent` | `content_block_start` | `content_block: BetaToolUseBlock \| BetaServerToolUseBlock \| ...` |
| `BetaToolUseBlock` | tool_use content | `id`, `name`, `input`, `caller?: BetaDirectCaller \| BetaServerToolCaller` |
| `BetaServerToolCaller` | caller field | `{ type: "code_execution_20250825", tool_id: string }` |
| `BetaContainer` | container info | `{ id: string, expires_at: string }` |
| `MessageCreateParams` | continuation | `container?: BetaContainerParams \| string \| null` |

---

## Changes to `index.ts`

### Principle: minimal diff to existing stream loop

The existing `for await (const chunk of stream)` loop handles thinking, text, web search, citations, and finalization. We add tool accumulation **alongside** the existing event handling, then branch after the stream ends.

### New state variables (alongside existing ones)

```ts
const toolAccumulators = new Map<number, ToolUseAccumulator>();
let containerId: string | undefined;
// Track all assistant content blocks for message history reconstruction
const assistantContentBlocks = Array.of<Anthropic.Beta.BetaContentBlockParam>();
```

### New event handling (additions to existing `content_block_start` / `content_block_delta` / `message_delta`)

**`content_block_start`** — add a new branch for `type === "tool_use"`:
```ts
if (chunk.content_block.type === "tool_use") {
  const block = chunk.content_block;
  if (block.caller && block.caller.type === "code_execution_20250825") {
    toolAccumulators.set(chunk.index, {
      id: block.id,
      name: block.name,
      inputJson: "",
      callerType: "code_execution_20250825",
      callerToolId: block.caller.tool_id
    });
  }
}
```

**`content_block_delta`** — the existing `input_json_delta` handler currently only logs during web search. Add accumulation for PTC tool calls:
```ts
if (chunk.delta.type === "input_json_delta") {
  const acc = toolAccumulators.get(chunk.index);
  if (acc) {
    acc.inputJson += chunk.delta.partial_json;
  } else if (anthropicWebsearchToolUse === true) {
    // existing web search logging
  }
}
```

**`message_delta`** — capture container ID:
```ts
if (chunk.delta.container) {
  containerId = chunk.delta.container.id;
}
```

**`message_delta` stop_reason** — change existing guard to also capture `"tool_use"`:
```ts
if (chunk.delta.stop_reason) {
  if (chunk.delta.stop_reason === "tool_use" || chunk.delta.stop_reason === "pause_turn") {
    done = chunk.delta.stop_reason;  // now we DO set done for tool_use
  } else {
    done = chunk.delta.stop_reason;
  }
}
```

### After the stream loop: branch on `done`

Currently the stream loop has one exit: `if (done) { persist + ws.send + break }`.

New structure — wrap the entire stream in a **bounded outer loop**:

```ts
const MAX_TOOL_ROUNDS = 8;

for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
  // create stream (first round uses initial params, subsequent rounds use continuation params)

  for await (const chunk of stream) {
    // ... existing event handling + new tool accumulation ...

    if (done === "tool_use" && toolAccumulators.size > 0) {
      break;  // exit inner loop to handle tools
    }

    if (done && done !== "tool_use" && done !== "pause_turn") {
      // persist, ws.send, redis — existing finalization code
      return;  // exit method entirely
    }
  }

  // If we're here, stop_reason was "tool_use" — execute tools and continue
  if (done !== "tool_use" || toolAccumulators.size === 0) {
    break;  // unexpected state, exit outer loop
  }

  // Execute file_search tools
  const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
  for (const acc of toolAccumulators.values()) {
    if (acc.name === "file_search") {
      const input = JSON.parse(acc.inputJson || "{}");
      const json = await this.executeFileSearch(userId, input);
      toolResults.push({ type: "tool_result", tool_use_id: acc.id, content: json });
    } else {
      toolResults.push({
        type: "tool_result", tool_use_id: acc.id,
        content: `Unknown tool: ${acc.name}`, is_error: true
      });
    }
  }

  // Build continuation params
  // assistantContentBlocks: all content blocks from this round's response
  // toolResults: ONLY tool_result blocks, no text (PTC requirement)
  params = {
    ...params,
    container: containerId,
    messages: [
      ...params.messages,
      { role: "assistant", content: assistantContentBlocks },
      { role: "user", content: toolResults }
    ]
  };

  // Reset per-round state
  toolAccumulators.clear();
  assistantContentBlocks.length = 0;
  done = null;
}
```

### Content block tracking for message history (per-block via events)

For the continuation request, we need the assistant's content blocks from the current round.

**New state**: `blockBuilders` — a `Map<number, BlockBuilder>` keyed by `chunk.index`:

```ts
interface BlockBuilder {
  type: string;
  id?: string;
  name?: string;
  text?: string;          // accumulated from text_delta
  thinking?: string;      // accumulated from thinking_delta
  inputJson?: string;     // accumulated from input_json_delta
  input?: unknown;        // server_tool_use input (comes fully formed)
  signature?: string;     // accumulated from signature_delta
  caller?: Anthropic.Beta.BetaServerToolCaller;
}
```

**`content_block_start`** — open a builder for every block:

```ts
const bb: BlockBuilder = { type: chunk.content_block.type };

if (chunk.content_block.type === "server_tool_use") {
  bb.id = chunk.content_block.id;
  bb.name = chunk.content_block.name;
  bb.input = chunk.content_block.input;
}
if (chunk.content_block.type === "tool_use") {
  bb.id = chunk.content_block.id;
  bb.name = chunk.content_block.name;
  bb.inputJson = "";
  if (chunk.content_block.caller?.type === "code_execution_20250825") {
    bb.caller = chunk.content_block.caller;
  }
}
if (chunk.content_block.type === "text") {
  bb.text = "";
}
if (chunk.content_block.type === "thinking") {
  bb.thinking = "";
}
blockBuilders.set(chunk.index, bb);
```

**`content_block_delta`** — accumulate into the builder:

```ts
const bb = blockBuilders.get(chunk.index);
if (bb) {
  if (chunk.delta.type === "text_delta") bb.text = (bb.text ?? "") + chunk.delta.text;
  if (chunk.delta.type === "thinking_delta") bb.thinking = (bb.thinking ?? "") + chunk.delta.thinking;
  if (chunk.delta.type === "input_json_delta") bb.inputJson = (bb.inputJson ?? "") + chunk.delta.partial_json;
  if (chunk.delta.type === "signature_delta") bb.signature = (bb.signature ?? "") + chunk.delta.signature;
}
```

**After inner stream ends** — convert builders to `BetaContentBlockParam[]`:

```ts
for (const [, bb] of blockBuilders) {
  if (bb.type === "text") {
    assistantContentBlocks.push({ type: "text", text: bb.text ?? "" });
  }
  if (bb.type === "thinking") {
    assistantContentBlocks.push({ type: "thinking", thinking: bb.thinking ?? "", signature: bb.signature ?? "" });
  }
  if (bb.type === "server_tool_use") {
    assistantContentBlocks.push({ type: "server_tool_use", id: bb.id!, name: bb.name!, input: bb.input });
  }
  if (bb.type === "tool_use") {
    assistantContentBlocks.push({
      type: "tool_use", id: bb.id!, name: bb.name!,
      input: JSON.parse(bb.inputJson || "{}"),
      caller: bb.caller
    });
  }
}
```

This captures **every** content block type with exact content, suitable for the assistant message in continuation params. The existing event handling (text → ws.send, thinking → thinkingChunks, etc.) continues to work alongside this — the builders are additive, not replacement.

### What does NOT change

- All existing text/thinking/webSearch/citation streaming → ws.send and redis.publish untouched
- The `handleAiChatResponse` persist call at `done === "end_turn"` stays exactly where it is
- Redis stream state saves every 10 chunks stays
- No new methods on vector-store.ts — `executeFileSearch` is already there

---

## Files modified

| File | What |
|------|------|
| `apps/ws-server/src/anthropic/index.ts` | Outer tool loop, tool_use accumulation, container tracking, continuation requests |
| `apps/ws-server/src/anthropic/types.ts` | Already updated — `ToolUseAccumulator` has `callerType` + `callerToolId` |

## Design decisions (confirmed)

1. **Stream everything** — thinking/text deltas stream to the client during tool rounds, same as web search behavior
2. **`pause_turn` handled identically** to `tool_use` — same outer loop, same continuation pattern
3. **Per-block event tracking** — `content_block_start` opens blocks, deltas accumulate, `content_block_stop` finalizes

## Verification

1. `pnpm typecheck` passes
2. Non-PTC requests (no local store, haiku model) work exactly as before — outer loop runs once, exits on `end_turn`
3. PTC request with file_search: stream shows thinking → code execution → tool_use pause → tool result → code execution resumes → end_turn with final text
4. Container ID is captured and reused across tool rounds
5. `tool_result` continuation message contains ONLY `tool_result` blocks (no text)
