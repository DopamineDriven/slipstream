# Appendix — the linear loop skeleton for `responses-api-v2.ts`

Companion to `preliminary.md` §8, step 4. Read with
`xai-responses-api-from-2026-03-29.md` beside it: this is that file's shape
with the block contract and the image branch added, and nothing else.

The skeleton is deliberately not compilable as-is. Frame bodies are elided
with `…` where they are identical to the existing ones, and `// →` marks a
comment that stands in for lines you will write. Every symbol it names
exists today: `createResponsesStream`, `resolveResponsesTools`,
`canUseFunctionTools`, `executeFunctionToolCall`, `parseFileSearchResults`,
`reasoningPhaseKey`, `uploadGenerated`, `getImageSpecsWorkup`,
`handleAiChatResponse`, and the local tool broker.

---

## 1. The shape, in one screen

```
handler
├─ state (declared once, above the round loop)
│    activeBlock, nextOrdinal, blocks[], grokAgg, thinkingAgg, thinkingDuration, usage
│    images[]                       ← crosses rounds: what to persist
│    imageLanded = false            ← crosses rounds: the job-path guarantee
│
├─ for round …                      ← the ONLY loop that re-enters the provider
│    ├─ per-round locals: pendingFunctionCalls, functionCalls, roundCompleted
│    ├─ for await chunk             ← one if / else-if chain, every branch inline
│    │    (block accounting, frames, the image upload — all here)
│    ├─ if !roundCompleted → throw
│    ├─ if functionCalls empty → break        ← the model stopped calling tools
│    ├─ if round === MAX → break
│    └─ execute functionCalls, append to roundInput   ← the ONE cross-round handoff
│
├─ if imageJob && !imageLanded → throw        ← the guarantee, one line, after the loop
└─ persist + ai_chat_response
```

Three facts make this linear and they are worth stating before the code:

1. **Only `functionCalls` crosses a round boundary, and it crosses it once,
   at the bottom.** Nothing inside the stream loop reads it; nothing after
   the round loop reads it. It is filled by `added` / `arguments.*` / `done`
   and consumed by the executor.
2. **The image never enters the tool loop.** It is a server-side tool: it
   completes inside its round with no output to feed back. Its branch does
   its own work inline (including the `await` on S3) and the loop moves on.
   From the round loop's point of view it did not happen.
3. **`imageLanded` is the only thing the image path adds across rounds**, and
   it is a boolean set in one branch and read in one `if`. The convergence
   the OpenAI lane gets from its `finished` flag + inner `break` falls out of
   the existing "stopped calling tools" exit instead: with `required` and a
   trimmed tool set, the model stops calling tools once it has called the
   image tool.

---

## 2. State

```ts
// ── request-scoped, above the round loop ──────────────────────────────
const provider = "grok" as const;
const m = model as GrokModelIdUnion;
const supportsFunctionTools = this.canUseFunctionTools(m);
const imageTool = this.prisma.grokImgGenFacilitating(m);   // 4.6 / 4.7 only

// block accounting — the March pair (grokIsCurrentlyThinking +
// activeThinkingStartTime) becomes activeBlock, which says the same thing
// (activeBlock?.type === "THINKING", activeBlock.startedAt) and also carries
// the content and item id the block contract needs
let activeBlock: GrokActiveMessageBlock | undefined = undefined;
let nextOrdinal = 0;
const blocks = Array.of<GrokFinalizedMessageBlock>();

let grokAgg = "";
let grokThinkingAgg = "";
let grokThinkingDuration = 0;
let usage = 0;
let responseOutput: string | undefined = undefined;

// image lane — both cross rounds; neither is touched by the tool loop
const images = Array.of<AIChatResponseImgGenSubFields>();
let imageLanded = false;
```

`MAX_TOOL_ROUNDS`, `roundInput`, `forcedLoopStopReason`,
`unexpectedFunctionCallSeen`, the local-tool `turn` and `collectionId` are
exactly as in the current file.

---

## 3. The round loop

```ts
for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
  const parser = await this.createResponsesStream({
    …,
    payload: {
      round_input: roundInput,
      // chat path: tools as today + the image tool when the model is a facilitator
      // job path:  image tool + HMEM memory tools + web_search only, tool_choice_input: "required"
      …
    }
  });

  // per-round locals — the March three, unchanged
  const pendingFunctionCalls = new Map<string, FunctionCallContext>();
  const functionCalls = Array.of<FunctionCallContext>();
  const functionCallIds = new Set<string>();
  let roundCompleted = false;

  for await (const chunk of parser) {
    // §4 — the stream loop
  }

  if (!roundCompleted) {
    throw new Error("xAI response stream ended without completion");
  }
  if (functionCalls.length === 0) break;           // the model is done with tools
  if (round === MAX_TOOL_ROUNDS) {
    forcedLoopStopReason = "MAX_ROUNDS";
    this.logger.warn({ round, functionCallCount: functionCalls.length }, "xAI tool loop reached max rounds");
    break;
  }

  // the one cross-round handoff — as today, incl. the local tool bridge
  const toolOutputs = Array.of<FunctionCallOutput<string>>();
  for (const call of functionCalls) {
    // → local bridge relay, else executeFunctionToolCall — unchanged
  }
  roundInput = [...roundInput, ...functionCalls, ...toolOutputs];
}

if (!responseOutput) {
  throw new Error("xAI response output missing after tool rounds");
}
// the job-path guarantee. The chat path passes no imageJob, so this never fires there.
if (imageJob && !imageLanded) {
  throw new Error("image job completed without an image");
}
```

---

## 4. The stream loop — one chain, every branch inline

The order of branches matters only where noted. `text` / `thinkingText`
per-chunk locals are the March ones.

```ts
for await (const chunk of parser) {
  let text: string | undefined = undefined;
  let thinkingText: string | undefined = undefined;

  if (chunk.event === "response.created") {
    this.logger.info({ round, responseId: chunk.data.response.id }, "xAI response round started");

  // ── output_item.added ────────────────────────────────────────────────
  } else if (chunk.event === "response.output_item.added") {
    const item = chunk.data.item;

    if (item.type === "reasoning") {
      // NO-OP. tco_ items arrive already completed on added (probe §2.4);
      // rs_ items with summary text open their block on summary_part.added.
      // Act on done only.
    } else if (item.type === "function_call") {
      if (!supportsFunctionTools) {
        // → warn once, as today
      } else {
        pendingFunctionCalls.set(item.id, { type: "function_call", id: item.id, call_id: item.call_id, name: item.name, arguments: item.arguments });
      }
    } else {
      // message, image_generation_call, web/file/custom tool calls:
      // any of these ends whatever block was open.
      // For image_generation_call this IS the TEXT split (§5.3): the text
      // before the image closes here, the text after opens a new block.
      if (activeBlock && activeBlock.content.length > 0) {
        blocks.push({ content: activeBlock.content, durationMs: Math.max(0, Math.round(performance.now() - activeBlock.startedAt)), itemIds: activeBlock.itemIds, ordinal: nextOrdinal, previewContent: activeBlock.content, type: activeBlock.type });
        if (activeBlock.type === "THINKING") grokThinkingDuration += Math.round(performance.now() - activeBlock.startedAt);
        nextOrdinal += 1;
      }
      activeBlock = undefined;
    }

  // ── function call arguments ──────────────────────────────────────────
  } else if (supportsFunctionTools && chunk.event === "response.function_call_arguments.delta") {
    const pending = pendingFunctionCalls.get(chunk.data.item_id);
    if (pending) pending.arguments += chunk.data.delta;
  } else if (supportsFunctionTools && chunk.event === "response.function_call_arguments.done") {
    const pending = pendingFunctionCalls.get(chunk.data.item_id);
    if (pending) pending.arguments = chunk.data.arguments;

  // ── visible reasoning ────────────────────────────────────────────────
  } else if (chunk.event === "response.reasoning_summary_part.added") {
    // a new THINKING block per summary part — the March start-stamp, inline
    if (activeBlock && activeBlock.content.length > 0) { /* → close it, 6 lines as above */ }
    activeBlock = { content: "", itemIds: [chunk.data.item_id], startedAt: performance.now(), type: "THINKING" };
  } else if (chunk.event === "response.reasoning_summary_text.delta") {
    if (activeBlock?.type !== "THINKING") {
      // delta without a part.added: open one now (defensive, same shape)
      if (activeBlock && activeBlock.content.length > 0) { /* → close it */ }
      activeBlock = { content: "", itemIds: [chunk.data.item_id], startedAt: performance.now(), type: "THINKING" };
    }
    activeBlock.content += chunk.data.delta;
    thinkingText = chunk.data.delta;
  } else if (chunk.event === "response.reasoning_summary_part.done") {
    // the March settle-stamp: close the THINKING block here
    if (activeBlock?.type === "THINKING" && activeBlock.content.length > 0) { /* → close it */ }
    activeBlock = undefined;

  // ── output_item.done ─────────────────────────────────────────────────
  } else if (chunk.event === "response.output_item.done") {
    const item = chunk.data.item;

    if (item.type === "reasoning") {
      // encrypted-only item (no summary text ever streamed for it): one
      // ENCRYPTED_THINKING placeholder block, emitted HERE and nowhere else.
      // done fires exactly once per item, so no dedupe Set is needed.
      // A summarised rs_ item already closed its THINKING block on
      // summary_part.done and has nothing to add here.
      if ("encrypted_content" in item && item.encrypted_content.length > 0 && activeBlock === undefined) {
        blocks.push({ content: item.encrypted_content, durationMs: 0, itemIds: [item.id], ordinal: nextOrdinal, previewContent: this.encryptedTag, type: "ENCRYPTED_THINKING" });
        nextOrdinal += 1;
        grokThinkingAgg = grokThinkingAgg.length > 0 ? `${grokThinkingAgg}\n${this.encryptedTag}` : this.encryptedTag;
        thinkingChunks.push(this.encryptedTag);
        thinkingText = this.encryptedTag;
      }

    } else if (item.type === "file_search_call") {
      const { results, ...rest } = item;
      if (results) this.parseFileSearchResults({ ...rest, results });

    } else if (supportsFunctionTools && item.type === "function_call") {
      // → finalize into functionCalls, as today

    } else if (item.type === "image_generation_call" && item.result) {
      // §8.4a. Everything below is inline and awaited plainly. The socket
      // buffers while we upload; the user sees a ticking THINKING block.

      // (1) open the upload THINKING block; its content is Grok's rewritten prompt
      activeBlock = { content: item.prompt, itemIds: [item.id], startedAt: performance.now(), type: "THINKING" };
      const uploadOpened = { type: "ai_chat_chunk", …, isThinking: true, thinkingText: item.prompt, messageBlocks: { type: "THINKING", content: item.prompt, ordinal: nextOrdinal, conversationId, durationMs: 0 }, done: false } as const satisfies EventTypeMap["ai_chat_chunk"];
      ws.send(JSON.stringify(uploadOpened));
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", uploadOpened);

      // (2) the wait — ours, not xAI's
      const uploadStartedAt = performance.now();
      const buffer = Buffer.from(item.result, "base64");
      const specs = this.prisma.extractor.getImageSpecsWorkup(buffer, 4096 * 48);
      const seriesId = await this.generateId("seriesId");
      const rt = await this.s3.uploadGenerated(buffer, this.prisma.isProd, { contentType: specs.contentType ?? `image/${specs.format}`, filename: `${seriesId}-0.${specs.format}`, origin: "GENERATED", userId, size: specs.byteSize ?? buffer.byteLength, conversationId });
      const uploadDuration = Math.round(performance.now() - uploadStartedAt);

      // (3) close the THINKING block with the measured duration
      blocks.push({ content: item.prompt, durationMs: uploadDuration, itemIds: [item.id], ordinal: nextOrdinal, previewContent: item.prompt, type: "THINKING" });
      grokThinkingDuration += uploadDuration;
      const uploadClosedOrdinal = nextOrdinal;
      nextOrdinal += 1;
      activeBlock = undefined;

      // (4) the IMAGE_GEN block, with its attachment, at the next ordinal
      const attachment = { /* → the AIChatResponseImgGenSubFields literal: revisedPrompt: item.prompt, seriesId, jobId if imageJob, imageGenOutput only if imageJob */ } as const satisfies AIChatResponseImgGenSubFields;
      images.push(attachment);
      blocks.push({ content: item.prompt, durationMs: 0, itemIds: [item.id], ordinal: nextOrdinal, previewContent: item.prompt, type: "IMAGE_GEN" });
      const imageBlockOrdinal = nextOrdinal;
      nextOrdinal += 1;
      imageLanded = true;

      // (5) two frames: the closed THINKING block, then the IMAGE_GEN block
      const uploadClosed = { type: "ai_chat_chunk", …, isThinking: false, messageBlocks: { type: "THINKING", content: item.prompt, ordinal: uploadClosedOrdinal, conversationId, durationMs: uploadDuration }, thinkingDuration: grokThinkingDuration, done: false } as const satisfies EventTypeMap["ai_chat_chunk"];
      ws.send(JSON.stringify(uploadClosed));
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", uploadClosed);

      const imageFrame = { type: "ai_chat_chunk", …, isThinking: false, imgGenEnabled: true, imgGenFields: { images, activeImage: attachment, actualCount: images.length }, messageBlocks: { type: "IMAGE_GEN", content: item.prompt, ordinal: imageBlockOrdinal, conversationId, durationMs: 0, attachment }, done: false } as const satisfies EventTypeMap["ai_chat_chunk"];
      ws.send(JSON.stringify(imageFrame));
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", imageFrame);
      // the text that resumes after this opens a fresh TEXT block in the delta branch
    }

  // ── text ─────────────────────────────────────────────────────────────
  } else if (chunk.event === "response.output_text.delta") {
    if (activeBlock?.type !== "TEXT") {
      if (activeBlock && activeBlock.content.length > 0) { /* → close it */ }
      activeBlock = { content: "", itemIds: [chunk.data.item_id], startedAt: performance.now(), type: "TEXT" };
    }
    activeBlock.content += chunk.data.delta;
    text = chunk.data.delta;

  // ── terminal ─────────────────────────────────────────────────────────
  } else if (chunk.event === "response.completed" && chunk.data.response.status === "completed") {
    roundCompleted = true;
    if (chunk.data.response.usage) usage += chunk.data.response.usage.total_tokens;
    responseOutput = JSON.stringify(chunk.data.response.output);
    if (activeBlock && activeBlock.content.length > 0) { /* → close it */ }
    activeBlock = undefined;
    // function calls the stream may have finalized only here — as today.
    // NO scan of response.output for encrypted reasoning: every item had its done.
    for (const output of chunk.data.response.output) {
      if (supportsFunctionTools && output.type === "function_call" && !functionCallIds.has(output.id)) { /* → push */ }
    }
  }

  // ── frames for this chunk — the March two, plus the block on each ────
  if (thinkingText) {
    grokThinkingAgg += thinkingText;   // (not for the placeholder branch, which already appended)
    thinkingChunks.push(thinkingText);
    const thinkingFrame = { type: "ai_chat_chunk", …, isThinking: true, thinkingText, messageBlocks: activeBlock ? { type: activeBlock.type, content: activeBlock.content, ordinal: nextOrdinal, conversationId, durationMs: Math.round(performance.now() - activeBlock.startedAt) } : undefined, thinkingDuration: grokThinkingDuration + (activeBlock?.type === "THINKING" ? Math.round(performance.now() - activeBlock.startedAt) : 0), done: false } as const satisfies EventTypeMap["ai_chat_chunk"];
    ws.send(JSON.stringify(thinkingFrame));
    void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", thinkingFrame);
  }
  if (text) {
    chunks.push(text);
    grokAgg += text;
    const textFrame = { type: "ai_chat_chunk", …, isThinking: false, chunk: text, messageBlocks: activeBlock ? { type: "TEXT", content: activeBlock.content, ordinal: nextOrdinal, conversationId, durationMs: Math.round(performance.now() - activeBlock.startedAt) } : undefined, thinkingDuration: grokThinkingDuration > 0 ? grokThinkingDuration : undefined, done: false } as const satisfies EventTypeMap["ai_chat_chunk"];
    ws.send(JSON.stringify(textFrame));
    void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", textFrame);
    if (chunks.length % 10 === 0) void this.redis.saveStreamState(…);
  }
}
```

---

## 5. What the probe's stream does to this loop

Walking the 10 output items of `grok-4.7.txt` through §4, so the ordinals
can be checked against §5.3 of the plan:

| seq | event | branch | effect |
| --- | --- | --- | --- |
| 2 | added, reasoning `rs_` (0) | no-op | |
| 3 | summary_part.added | open THINKING | `activeBlock` = THINKING |
| 4–50 | summary_text.delta ×47 | append | thinking frames stream |
| 52 | summary_part.done | close | **block 0: THINKING** |
| 53 | done, reasoning | `activeBlock` undefined but summary was seen… | see note ¹ |
| 54–72 | file/web search items | added → close (nothing open); done → parse | no blocks |
| 62, 69, 73 | added, reasoning `tco_`/`rs_` (3, 5, 6) | no-op | |
| 63, 70, 74 | done, reasoning, encrypted | placeholder | **blocks 1, 2, 3: ENCRYPTED_THINKING** |
| 75 | added, message (7) | close (nothing open) | |
| 77–116 | text.delta ×40 | open TEXT, append | |
| 117 | added, image_generation_call (8) | close | **block 4: TEXT** "…Image incoming with the reading." |
| 121 | done, image_generation_call | §8.4a | **block 5: THINKING** (upload), **block 6: IMAGE_GEN** |
| 122 | added, reasoning `rs_` (9) | no-op | |
| 123 | done, reasoning, encrypted | placeholder | **block 7: ENCRYPTED_THINKING** |
| 124–1125 | text.delta ×1002 | open TEXT, append | |
| 1143 | completed | close | **block 8: TEXT** "**CHICAGO, AS READ…**" |

¹ The `done` for a summarised `rs_` item (seq 53) carries `encrypted_content`
too. The guard `activeBlock === undefined` alone would emit a spurious
placeholder for it. The March-shaped fix is one more per-request `Set`:
`summarisedItemIds`, added to on `summary_part.added`, checked in the
placeholder branch. That is the single dedupe set the rewrite keeps (the
current file has three); it exists because the wire genuinely carries both
forms on one item.

Result: 9 blocks, ordinals 0–8, the image at 6 with the upload THINKING at
5 directly before it. Persisted via `handleAiChatResponse` with
`messageBlocks: blocks` (each block's `attachment` on the `IMAGE_GEN` one),
`imgGenEnabled: images.length > 0`, `imgGenFields: { images, … }` when
non-empty.

---

## 6. The job entry, for completeness

`responses-image-api.ts` is this same method with three differences at the
top, and none in the loop:

```ts
// tools: image_generation + memorySearch + memoryGetChunk + web_search. Nothing else.
// tool_choice_input: "required"
// imageJob: { jobId, imgGenFields }   ← makes the post-loop throw live and
//                                       stamps jobId / imageGenOutput on the attachment
```

If the loop cannot be shared without forking it, the image handling landed
in the wrong layer (plan §4).
