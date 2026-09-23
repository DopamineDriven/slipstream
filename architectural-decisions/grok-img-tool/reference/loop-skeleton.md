# Appendix — the linear loop skeleton for `responses-api-v2.ts`

Companion to `preliminary.md` §8, step 4.

**2026-09-22:** the live handler is now Andrew's
`apps/ws-server/src/xai/responses-api-linear.ts`, his own linearization of
the current file (closures dissolved into two inline close sites; per-phase
clocks, dedupe sets and the `completed` scan kept). It was not rebuilt from
the March file. What this appendix still owns is **§4's image branches**;
plan step 4 maps each onto its site in the linear file. §2–3 describe the
surrounding shape with the skeleton's names (`blocks` is `trackedBlocks`,
`grokThinkingAgg` is `grokThinkingDisplayAgg`).

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
│    heldText = ""                  ← text that arrives while an image block is open; released after it
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
// §8.4a: text deltas the server holds while an image THINKING block is open
let heldText = "";
let heldTextItemId = "";
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

      if (item.type === "image_generation_call") {
        // §8.4a: the image THINKING block opens HERE, blank — the clock starts
        // at added, not done. item.type is what the typed union narrows on;
        // item.id starting with "ig_" is a second check that agrees. The
        // content (Grok's rewritten prompt) is only known on done.
        activeBlock = { content: "", itemIds: [item.id], startedAt: performance.now(), type: "THINKING" };
        const imageOpened = { type: "ai_chat_chunk", …, isThinking: true, messageBlocks: { type: "THINKING", content: "", ordinal: nextOrdinal, conversationId, durationMs: 0 }, done: false } as const satisfies EventTypeMap["ai_chat_chunk"];
        ws.send(JSON.stringify(imageOpened));
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", imageOpened);
      }
    }

  } else if (chunk.event === "response.image_generation_call.in_progress" || chunk.event === "response.image_generation_call.generating" || chunk.event === "response.image_generation_call.completed") {
    // NO-OP. The client ticks on its own from the open THINKING block.

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
      // a failed item (status: "failed", probe run 2 idx 3) carries
      // results: [] — the parse is a no-op over it; never throw here
      const { results, ...rest } = item;
      if (results) this.parseFileSearchResults({ ...rest, results });

    } else if (supportsFunctionTools && item.type === "function_call") {
      // → finalize into functionCalls, as today

    } else if (item.type === "image_generation_call" && item.result) {
      // §8.4a. Everything below is inline and awaited plainly. The socket
      // buffers while we upload; the user sees a ticking THINKING block.
      // xAI documents chaining (generate, then edit, in one request), so this
      // branch can run more than once per round. Nothing below is shared
      // between runs except `images` and `imageLanded`: each run mints its
      // own seriesId and its own THINKING + IMAGE_GEN pair.

      // (1) the THINKING block has been open since this item's added (blank,
      //     ticking). The prompt is known now: fill it in and re-send the same
      //     ordinal, still ticking — the upload is about to start.
      const imageAddedAt = activeBlock?.startedAt ?? performance.now();
      activeBlock = { content: item.prompt, itemIds: [item.id], startedAt: imageAddedAt, type: "THINKING" };
      const imagePrompted = { type: "ai_chat_chunk", …, isThinking: true, thinkingText: item.prompt, messageBlocks: { type: "THINKING", content: item.prompt, ordinal: nextOrdinal, conversationId, durationMs: Math.round(performance.now() - imageAddedAt) }, done: false } as const satisfies EventTypeMap["ai_chat_chunk"];
      ws.send(JSON.stringify(imagePrompted));
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", imagePrompted);

      // (2) the upload — awaited plainly; the socket buffers meanwhile
      const buffer = Buffer.from(item.result, "base64");
      const specs = this.prisma.extractor.getImageSpecsWorkup(buffer, 4096 * 48);
      const seriesId = await this.generateId("seriesId");
      const rt = await this.s3.uploadGenerated(buffer, this.prisma.isProd, { contentType: specs.contentType ?? `image/${specs.format}`, filename: `${seriesId}-0.${specs.format}`, origin: "GENERATED", userId, size: specs.byteSize ?? buffer.byteLength, conversationId });

      // (3) close the THINKING block: ONE duration, added → cdn url
      //     (generation + upload; whichever dominated, the clock is honest)
      const imageDuration = Math.round(performance.now() - imageAddedAt);
      blocks.push({ content: item.prompt, durationMs: imageDuration, itemIds: [item.id], ordinal: nextOrdinal, previewContent: item.prompt, type: "THINKING" });
      grokThinkingDuration += imageDuration;
      const imageThinkingOrdinal = nextOrdinal;
      nextOrdinal += 1;
      activeBlock = undefined;

      // (4) the IMAGE_GEN block, owning its attachments, at the next ordinal.
      // Grok emits one FINAL, so the array has one entry; the shape is an
      // array because OpenAI facilitators add 0-3 PARTIALs to the same block.
      // Lineage: job path → jobId + imageGenOutput; chat path →
      // inlineImageGenOutput { kind: FINAL, seriesOrdinal: 0, seriesId, provider, facilitatingModel: m, generatingModel: "grok-imagine-image-2.0", width, height, mime, ext, revisedPrompt: item.prompt }
      const attachment = { /* → the AIChatResponseImgGenSubFields literal */ } as const satisfies AIChatResponseImgGenSubFields;
      images.push(attachment);
      blocks.push({ content: item.prompt, durationMs: 0, itemIds: [item.id], ordinal: nextOrdinal, previewContent: item.prompt, type: "IMAGE_GEN" });
      const imageBlockOrdinal = nextOrdinal;
      nextOrdinal += 1;
      imageLanded = true;

      // (5) two frames: the closed THINKING block, then the IMAGE_GEN block
      const imageClosed = { type: "ai_chat_chunk", …, isThinking: false, messageBlocks: { type: "THINKING", content: item.prompt, ordinal: imageThinkingOrdinal, conversationId, durationMs: imageDuration }, thinkingDuration: grokThinkingDuration, done: false } as const satisfies EventTypeMap["ai_chat_chunk"];
      ws.send(JSON.stringify(imageClosed));
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", imageClosed);

      const imageFrame = { type: "ai_chat_chunk", …, isThinking: false, imgGenEnabled: true, imgGenFields: { images, activeImage: attachment, actualCount: images.length }, messageBlocks: { type: "IMAGE_GEN", content: item.prompt, ordinal: imageBlockOrdinal, conversationId, durationMs: 0, attachments: [attachment] }, done: false } as const satisfies EventTypeMap["ai_chat_chunk"];
      ws.send(JSON.stringify(imageFrame));
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", imageFrame);

      // (6) release the text the server held while the image block was open:
      //     one TEXT block, one frame — sent by the frame site at the bottom
      //     of the loop, after the image frame. The client meters it (step 7).
      if (heldText.length > 0) {
        activeBlock = { content: heldText, itemIds: [heldTextItemId], startedAt: performance.now(), type: "TEXT" };
        text = heldText;
        heldText = "";
      }
      // text that arrives after this appends to that TEXT block, or opens one, in the delta branch
    }

  // ── text ─────────────────────────────────────────────────────────────
  } else if (chunk.event === "response.output_text.delta") {
    if (activeBlock?.type === "THINKING" && activeBlock.itemIds[0]?.startsWith("ig_")) {
      // §8.4a: an image block is open. The server HOLDS text until the image
      // has landed; nothing is sent. Unobserved in both probe runs (the model
      // was blocked on its tool), but the order is never the same twice.
      heldText += chunk.data.delta;
      heldTextItemId = chunk.data.item_id;
    } else {
      if (activeBlock?.type !== "TEXT") {
        if (activeBlock && activeBlock.content.length > 0) { /* → close it */ }
        activeBlock = { content: "", itemIds: [chunk.data.item_id], startedAt: performance.now(), type: "TEXT" };
      }
      activeBlock.content += chunk.data.delta;
      text = chunk.data.delta;
    }

  } else if (chunk.event === "response.output_text.annotation.added") {
    // NO-OP, as in the March file. Annotations land mid-text in probe run 2
    // (seq 429, between two delta runs) and must never close the TEXT block.

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
| 117 | added, image_generation_call (8) | close; open the image THINKING, blank, ticking | **block 4: TEXT** "…Image incoming with the reading." |
| 121 | done, image_generation_call | §8.4a: prompt in, await upload, close, push | **block 5: THINKING** (added → url), **block 6: IMAGE_GEN** |
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

Result: 9 blocks, ordinals 0–8, the image at 6 with its THINKING block at
5 directly before it.

The same prompt's second run (`grok-4.7-2.txt`) opens with four parallel
file searches (one fails), then the `tco_`, then the visible summary, and
walks through the same chain to **7 blocks**: 0 ENCRYPTED_THINKING (`tco_`),
1 THINKING (summary), 2 TEXT, 3 THINKING (image), 4 IMAGE_GEN, 5
ENCRYPTED_THINKING (`rs_`), 6 TEXT. Its one mid-text annotation (seq 429)
hits the no-op branch and the open TEXT block at 6 keeps accumulating. Its
summarised `rs_` `done` (seq 79) is caught by `summarisedItemIds` exactly
as run 1's seq 53 is. Nothing in the chain is keyed on item order. Persisted via `handleAiChatResponse` with
`messageBlocks: blocks` (the `IMAGE_GEN` block carrying its `attachments`),
`imgGenEnabled: images.length > 0`, `imgGenFields: { images, … }` when
non-empty; each one-off attachment nests an `inlineImageGenOutput` create.

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
