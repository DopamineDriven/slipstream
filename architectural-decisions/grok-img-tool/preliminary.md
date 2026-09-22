# Grok `image_generation` tool — preliminary findings

Date: 2026-09-21

Status: probe-verified, design open. Nothing here is built yet beyond the types
in `apps/ws-server/src/xai/event-types.ts` and `responses-types.ts`.

Source: `apps/ws-server/grok-4-7-probe.sh` → `src/test/xai/tooling/grok-4.7.txt`
(image base64 trimmed; rendered image at
`src/test/__out__/grok/image_generation/one.jpg`, 1792×1008 JPEG, 16:9).

---

## 1. What the probe asked for

`grok-4.7`, `stream: true`, `store: false`, `reasoning.effort: xhigh`,
`include: ["reasoning.encrypted_content"]`. One user turn with text and an
`input_image`, a pre-seeded `function_call` + `function_call_output` pair for
a `get_weather` function, and five tools:

| tool | note |
| --- | --- |
| `image_generation` | `action: "auto"` |
| `file_search` | two collection ids, `max_num_results: 10` |
| `web_search` | `enable_image_understanding: true` |
| `x_search` | image + video understanding |
| `function` `get_weather` | |

The prompt asked for a forecast riff **and** a forecast image. So this is the
"model chooses to use the tool" case, but with a strong nudge.

---

## 2. What came back

1,144 SSE events, 10 output items, one `response.completed`.

| count | event |
| --- | --- |
| 1042 | `response.output_text.delta` |
| 47 | `response.reasoning_summary_text.delta` |
| 14 | `response.output_text.annotation.added` |
| 10 | `response.output_item.added` / `.done` |
| 2 each | `web_search_call.in_progress` / `.searching` / `.completed` |
| 1 each | `image_generation_call.in_progress` / `.generating` / `.completed` |
| 1 each | `file_search_call.in_progress` / `.searching` / `.completed` |
| 1 each | `created`, `in_progress`, `completed`, `content_part.added` / `.done`, `output_text.done`, `reasoning_summary_part.added` / `.done`, `reasoning_summary_text.done` |

Three `: keepalive` comment lines were interleaved; the parser must ignore
them.

### 2.1 Output items, in order

| index | item | id prefix | how it streamed |
| --- | --- | --- | --- |
| 0 | reasoning | `rs_` | 47 visible summary deltas |
| 1 | file_search_call | `fs_` | opened at seq 54, **closed at seq 72** — after items 2–5 |
| 2 | web_search_call | `ws_` | |
| 3 | reasoning | `tco_` | encrypted, arrives already `completed` on `added` |
| 4 | web_search_call | `ws_` | |
| 5 | reasoning | `tco_` | same as 3 |
| 6 | reasoning | `rs_` | encrypted, no deltas |
| **7** | **message** | `msg_` | **opened seq 75, closed seq 1142** |
| **8** | **image_generation_call** | `ig_` | **seq 117–121, inside item 7** |
| 9 | reasoning | `rs_` | encrypted, seq 122–123, **inside item 7** |

### 2.2 The interleave itself

```
  75  output_item.added        7  message
  76  content_part.added       7
  77  … 40 × output_text.delta (index 7)        ← "…Image incoming with the reading."
 117  output_item.added        8  image_generation_call   result: null
 118  image_generation_call.in_progress
 119  image_generation_call.generating
 120  image_generation_call.completed
 121  output_item.done         8  image_generation_call   result: <b64>, prompt: <799 chars>
 122  output_item.added        9  reasoning (rs_, encrypted, no deltas)
 123  output_item.done         9
 124  … 1002 × output_text.delta (index 7)      ← "**CHICAGO, AS READ BY THE UNFILTERED DESK**…"
1126  … 14 × output_text.annotation.added (index 7)
1140  output_text.done         7  (4,380 chars, ONE string)
1141  content_part.done        7
1142  output_item.done         7  message
1143  response.completed
```

**This is what "interleaving" means on the wire: the message item stays open
while other items open and close beneath it.** The text stops mid-answer
(195 chars, ending "Image incoming with the reading."), the image call runs,
an encrypted reasoning item follows, and the text resumes (4,161 chars) on
the **same** `msg_` item, same `content_index` 0, with no new message item and
no new content part. `output_text.done` at the end carries the whole 4,380
characters as one string.

OpenAI's Responses stream does not do this; an item there finishes before
the next begins. The chat handler's block logic was built on that
assumption.

### 2.3 The two events that matter

`response.output_item.added` (seq 117):

```json
{ "item": { "id": "ig_7fbbe394-…_call-e7344ff6-…-4",
            "type": "image_generation_call",
            "status": "in_progress",
            "result": null },
  "output_index": 8 }
```

`response.output_item.done` (seq 121):

```json
{ "item": { "id": "ig_7fbbe394-…_call-e7344ff6-…-4",
            "type": "image_generation_call",
            "status": "completed",
            "result": "<base64>",
            "prompt": "Cinematic weather-foreca…" },
  "output_index": 8 }
```

- `result` carries the bytes and is present **only** on `done` (and again on
  the matching item inside `response.completed.output`).
- `prompt` (799 chars) is the rewritten prompt Grok handed to the image
  model. It is the Grok equivalent of `revised_prompt` and belongs in that
  slot on persist.
- The three progress events between them carry only `item_id` and
  `output_index`. They are UI signals, not data.
- The `ig_` id is a UUID plus a `_call-…-N` suffix, ~80 chars. Unlike Meta's
  signed-token id it is safe to use as `itemId` / `seriesId`.

### 2.4 `tco_` reasoning items

New id prefix, not seen before this probe. They share the `_call-…-N` suffix
with the image item (tool-call reasoning). Two facts the handler must respect:

- They arrive with `status: "completed"` and `encrypted_content` **already on
  the `added` event**; `done` repeats the same body. No deltas between.
- Item 9 (an `rs_`, also encrypted, no deltas) lands **after** the image and
  **inside** the open message item.

Today's `output_item.added` branch calls `finalizeActiveBlock()` for every
non-reasoning item, so the image item splits the TEXT block around itself.
Under §5.3 that split is exactly right: TEXT, then an `IMAGE_GEN` block at
the image's position, then TEXT again.

### 2.5 Usage

```json
{ "input_tokens": 57743, "output_tokens": 4373,
  "output_tokens_details": { "reasoning_tokens": 3041 },
  "total_tokens": 62116,
  "num_server_side_tools_used": 4,
  "server_side_tool_usage_details": {
    "web_search_calls": 2, "file_search_calls": 1,
    "image_generation_calls": 1, "x_search_calls": 0, … },
  "cost_in_usd_ticks": 1575680000 }
```

`image_generation_calls` is a first-class counter, and `cost_in_usd_ticks`
is new. Neither is on the current `Usage` type in `event-types.ts`.

---

## 3. Equipping the tool

**Recommendation: always equip `image_generation` with `action: "auto"` on
every chat turn for `grok-4.6` and `grok-4.7`**, exactly as `web_search` and
`x_search` are already always on.

- It is free when unused. The definition costs a few request tokens; billing
  starts only when the model calls it, and the probe's usage block counted
  the one call it made.
- The model already exercises the judgement. Asked for one image, it made
  one, in the right place. On an ordinary turn it has no reason to generate.
  This is the same trust already extended for web and X search.
- An always-available tool is what makes interleaving worth having: the
  model can illustrate mid-answer with no user toggle.

Guard: equip only when `isGrokImgGenFacilitating(model)`. The 4.3 and 4.20
chat paths do not change.

---

## 4. Two entry points, one stream loop

| | chat turn | image job |
| --- | --- | --- |
| entry | `handleXAIAiResponsesApiRequest` (existing) | new file, sibling of `responses-api.ts` |
| image tool | equipped, `action: "auto"` | equipped, **obligatory** |
| obligatory how | — | exactly the OpenAI recipe: trimmed tool set + `tool_choice: "required"` + loop until an `image_generation_call` carries a `result`; throw on exhaustion. No system line |
| `imgGenFields` / `jobId` | absent unless the model generated | always; the `ImageGenJob` row exists |
| stream events | identical | identical |

The image support must live in the shared loop **once**. The job file is a
thin entry: force the tool, pass the job id, call the same loop. If it cannot
be thin, the image handling landed in the wrong layer.

**Resolved 2026-09-21 (Andrew, verified against the docs and Grok):**
xAI's `ToolChoiceUnion` is `"auto" | "none" | "required" | { type:
"function", function: { name } }`. The object form names a *function* only,
so a built-in tool cannot be forced by name. `required` is the only lever,
and it forces *a* tool call in a round, not *the* image tool: with the memory
tools equipped the model can satisfy `required` with a memory lookup, the
loop feeds the output back, and the next round is again `required`.

**The guarantee is the loop, not the flag — proven by the OpenAI path.**
`openai/responses-img-gen.ts` has always generated on this path with several
tools equipped, and it does so with no system-prompt edit (Andrew never edits
the system prompt beyond the global note). Four things act together there:

1. **Trimmed tool set.** `handleTooling` with `imgGenEnabled` equips only
   `image_generation`, the two HMEM memory tools and `web_search` (memory
   only, when there is no vector store). `file_search` / `user_store_search`
   are dropped, so no tool can plausibly answer the request without drawing.
2. **`tool_choice: "required"`** per round.
3. **The loop converges.** `finished` flips only when `response.completed`
   carries an `image_generation_call` with a `result`. A round that spent
   `required` on a memory lookup is fed back and re-run; once memory has been
   consulted the only tool left to satisfy `required` is the image tool.
4. Verbosity is set for a caption, not an essay, and `action: "auto"` lets
   the model pick generate vs. edit from the attached image.

The Grok job path copies this exactly: HMEM's two memory tools, `web_search`,
`image_generation`; `required`; loop until an image `result`; no
`file_search`, no `x_search`, no instruction.

**Shared gap to close in both paths:** on `MAX_TOOL_ROUNDS` exhaustion the
OpenAI handler logs a warning and `break`s, then falls off the end of the
method with **no `ai_chat_response` and no `ai_chat_error`** — the client
would wait forever. It has never fired because convergence works, but it is
the one place the guarantee is trusted rather than enforced. Both paths
should `throw` ("image job completed without an image"), which the
resolver already turns into `ai_chat_error`, as the Meta handler does.

---

## 5. Inlining an unrequested image

### 5.1 What exists today

- Generated images are `Attachment` rows on the message. `MessageBlockType`
  has no image member.
- The bubble renders `messageBlocks` in ordinal order and the attachment
  group **after** the body.
- An `ai_chat_chunk` carries one `messageBlocks` entry **and** `imgGenFields`
  together, so text and an image can share a frame.

### 5.2 First pass, no schema change

1. ~~Do not close the active TEXT block on `image_generation_call` added.~~
   **Withdrawn by §5.3**: the split is the desired behaviour once the image
   is its own block.
2. **On `done`, persist immediately and emit.** Bytes are present at seq
   121 with a thousand deltas still to come. Upload to S3 there, build the
   image sub-fields, send them as `imgGenFields` on the next chunk. The
   image appears mid-stream while text keeps flowing. `item.prompt` →
   `revisedPrompt`.
3. **At `response.completed`, persist as an image message.** `isImageGen:
   true`, attachment attached, text block as normal. The bubble renders it
   as it renders the OpenAI facilitator lane today.

Image sits below the text rather than at the exact interleave point. That
is the compromise the OpenAI lane already makes.

### 5.3 Resolved: `MessageBlockType.IMAGE_GEN`, no job row (Andrew, 2026-09-21)

Two different facts live at two different levels:

- **`Message.messageType = IMAGE_GEN`** is a *request-time* fact: the turn
  was an image job, an `ImageGenJob` row was minted before the provider was
  called, delivery is promised or the job fails.
- **`MessageBlockType.IMAGE_GEN`** is a *response-time* fact: an image
  occurred at this position in the output because the model chose to call
  its tool. Nothing promised it. It is an ordered piece of a `TEXT` message,
  as a `THINKING` block is.

So a spontaneous image is a **`TEXT` message containing an `IMAGE_GEN`
block**, not an `IMAGE_GEN` message. No `ImageGenJob` is minted, and
`imageGenOutput` stays unset on the attachment — that absence IS the
record-level signal that no job was bound. The job table keeps meaning
"promised". This supersedes the lazy-mint idea.

Schema, additive, no backfill:

```prisma
enum MessageBlockType { ENCRYPTED_THINKING THINKING TEXT IMAGE_GEN }

model MessageBlock {
  …
  attachmentId String?
  attachment   Attachment? @relation(fields: [attachmentId], references: [id], onDelete: SetNull)
}
```

The probe persists as:

| ordinal | type | content | attachment |
| --- | --- | --- | --- |
| 0 | THINKING | summary | |
| 1–5 | ENCRYPTED_THINKING | | |
| 6 | TEXT | "…Image incoming with the reading." | |
| 7 | IMAGE_GEN | Grok's 799-char `prompt` | the S3 attachment |
| 8 | ENCRYPTED_THINKING | | |
| 9 | TEXT | "**CHICAGO, AS READ…**" | |

Consequences:

- `content` has a natural value: the rewritten `prompt`, the same provenance
  `revisedPrompt` carries elsewhere.
- **The TEXT split is now correct, not a bug.** §5.2 step 1 is withdrawn:
  `finalizeActiveBlock()` on the image's `added` closes ordinal 6, the image
  takes 7, the resumed text opens 9. The wire's `output_index` order maps
  straight onto block ordinals, and the rewrite needs no special case.
- The `Attachment` row is created exactly as today, on the message, `origin:
  GENERATED`; the block is an ordered pointer to it, so attachment listings
  keep working.
- The bubble's `renderedMessageBlocks` gains an `IMAGE_GEN` case that renders
  the attachment inline at its ordinal, and the trailing attachment group
  must skip attachments a block already claims (or the image shows twice).
- `ChatChunkAndResMsgBlock` needs to carry the attachment on the block (or
  the client resolves it from `imgGenFields` by id; on-block is cleaner).
- **The obligatory job path emits the same `IMAGE_GEN` block.** Same wire,
  same persist, same bubble code; the only difference is the message is
  also `messageType: IMAGE_GEN` with a job bound. The loop does not fork.

---

## 6. `responses-api.ts` — why the rewrite, and its shape

### 6.1 What the block machinery is really tracking

Under seven closures and eight pieces of captured state the loop tracks one
thing: **the block currently being written, and the list already written.**
The rest is bookkeeping for two Grok quirks:

- Encrypted reasoning items arrive with no deltas. `encryptedReasoningByItemId`,
  `displayedReasoningItemIds`, `reasoningItemsWithSummaryText` decide, per
  item, whether to emit a placeholder block and never twice.
- A reasoning item can have several summary parts. The two `reasoningPhase*`
  maps give each part its own THINKING block and duration.

Neither needs closures. Each is a `Map`/`Set` mutated at the event that
learns the fact, which is already linear. The closures exist to *share*
mutation of `activeBlock` and `nextOrdinal` from many branches, and that
sharing is what makes the file hard to follow: `finalizeActiveBlock` is
called from seven places, and whether it emits depends on state set
elsewhere. This is the same risk class as the Meta `sendThinking` heartbeat
(a helper callable from anywhere can fire after a value was recorded).

### 6.2 Linear shape

```ts
const blocks = Array.of<GrokFinalizedMessageBlock>();
let active: GrokActiveMessageBlock | undefined = undefined;
let nextOrdinal = 0;
```

One `if / else if` chain over `chunk.event`; every branch written out in
full. "Close the active block" is six inline lines, repeated in the three or
four branches that close one:

```ts
if (active && active.content.length > 0) {
  blocks.push({ ...active, ordinal: nextOrdinal,
                durationMs: performance.now() - active.startedAt });
  nextOrdinal += 1;
}
active = undefined;
```

The repetition is the point: reading `output_text.delta` shows everything it
does to state without a jump. `meta/chat.ts` already inlines its frames this
way.

Goes away entirely:

| closure | replaced by |
| --- | --- |
| `currentActiveBlockDuration`, `currentThinkingDuration` | `performance.now() - startedAt` at the branch that needs it |
| `currentChunkMessageBlock`, `finalizedChunkMessageBlock` | named `const` frame literals at the send site |
| `ensureActiveBlock` | delta branches open a block inline when `active?.type` differs |
| `appendEncryptedThinkingPlaceholder` | one branch: `output_item.done` for a reasoning item (fires for every reasoning item incl. `tco_`). The second call site — the loop over `response.completed.output` — is redundant, every item already had its `done` |

Keep: `this.reasoningPhaseKey(...)`, a pure string builder on the class with
no captured state.

### 6.3 Folded in while rewriting

1. **The image call** (§5.3): `added` closes the active TEXT block like any
   other non-reasoning item; `done` stamps `tFinal`, uploads to S3, pushes an
   `IMAGE_GEN` block at the next ordinal with `content = item.prompt` and the
   attachment, and sends it on the next frame. A branch, not a closure.
2. **`tco_` items** (§2.4): treat `added` for any reasoning item as a no-op
   and act on `done` only, so a `tco_` landing mid-text after the image can
   never split the TEXT block.
3. **`Usage`** gains `cost_in_usd_ticks` and
   `server_side_tool_usage_details.image_generation_calls` / `x_posts_fetched`
   / `x_users_fetched` / `context_details`.

### 6.4 Estimate and cut-over

Roughly 650 lines against the current 1,080; ~200 of the saved lines are the
closures and the duplicated `completed` scans. Frame literals stay repeated.

Because the file is live in prod: write as `responses-api-v2.ts` beside the
current one, diff, cut over in `xai/index.ts`, delete the old file in a
separate commit.

---

## 7. Open questions

1. ~~`tool_choice` naming a built-in tool~~ — resolved §4: not possible;
   `required` + instruction + post-check.
2. ~~Job row for an unrequested image~~ — resolved §5.3: none; `IMAGE_GEN`
   block on a `TEXT` message.
3. ~~Force the tool per request or by instruction~~ — resolved §4: neither
   is sufficient alone and no instruction is used; the loop-until-result is
   the guarantee, copied from the OpenAI path.
4. ~~`IMAGE` block type: defer or design now~~ — resolved §5.3: design now,
   ship with the rewrite.
5. ~~`ToolChoiceUnion` still includes `null`~~ — done, Andrew dropped it.
6. ~~Bubble: trailing group filter vs. exclusive rendering~~ — resolved
   step 7: a filter on the trailing group (slot ownership), plus the shimmer
   placeholder on the inline block for the `added` → `done` gap (Andrew,
   2026-09-21).
7. `MAX_TOOL_ROUNDS` exhaustion in `openai/responses-img-gen.ts` falls off
   the end silently (§4). Fix alongside the Grok job path, or before.

---

## 8. Implementation plan

Ordered so that each step typechecks on its own, prod behaviour is unchanged
until the cut-over in step 8, and the two riskiest pieces (the migration and
the handler rewrite) each land in their own commit.

Build from the bottom of the dependency graph up: schema → types → server →
web. Every package is rebuilt by Andrew after it changes; consumers typecheck
against the rebuilt dist.

### Step 1 — schema: `IMAGE_GEN` block, block → attachment link

`packages/db/prisma/schema/messageblock.prisma`:

```prisma
enum MessageBlockType {
  ENCRYPTED_THINKING
  THINKING
  TEXT
  IMAGE_GEN
}

model MessageBlock {
  …
  attachmentId String?
  attachment   Attachment? @relation("MessageBlockAttachment", fields: [attachmentId], references: [id], onDelete: SetNull)
  @@index([attachmentId])
}
```

`attachment.prisma` gains the back-relation:
`messageBlocks MessageBlock[] @relation("MessageBlockAttachment")`.

- Additive: one enum member, one nullable column, one relation, one index.
  No backfill. Existing rows are untouched.
- `SetNull`, not `Cascade`: if an attachment is deleted the block survives
  with its `content` (the rewritten prompt) as the record of what was there.
- **Scope of the link (Andrew, 2026-09-21): `attachmentId` is set on
  `IMAGE_GEN` blocks only.** It does not mean "attachments belong to
  blocks". A user message is one `TEXT` block minted at request time with
  `content: prompt`; its attachments were uploaded as a batch before the
  message existed, have no position in the text, and stay linked to the
  **message** by `messageId` exactly as today. Only a generated image has a
  position inside the output, and that position is what the block records.
  Invariant enforced by the persist layer: `attachmentId` is non-null ⇔
  `type === "IMAGE_GEN"`. The `IMAGE_GEN` attachment is also still on the
  message's `attachments` list; the block is a pointer into that list, not a
  replacement for it. User messages: no new blocks, no backfill, no render
  change.
- Migration + client regenerate + `pnpm build:types`-style rebuilds of
  whatever packages re-export `$Enums`.

**Ships alone.** Nothing reads the new member yet, so prod is unaffected.

### Step 2 — types package: the block carries its attachment on the wire

`packages/types/src/contract/ai-chat-events.ts`:

```ts
export type ChatChunkAndResMsgBlock = {
  type: $Enums.MessageBlockType;
  content: string;
  ordinal: number;
  conversationId: string;
  durationMs: number;
  /** IMAGE_GEN only, always present on that block (§8.4a) */
  attachment?: AIChatResponseImgGenSubFields;
};
```

One optional field, `IMAGE_GEN` only, and always populated on that block:
an `IMAGE_GEN` frame is sent only once the S3 url exists. Width and height
ride on the attachment's own `image` metadata. `content` on that block is the
provider's rewritten prompt (`item.prompt` for Grok, `revised_prompt` for
OpenAI), empty on the opening frame.

Also, `apps/ws-server/src/xai/event-types.ts` `Usage` gains
`cost_in_usd_ticks?: number`, and `server_side_tool_usage_details` gains
`image_generation_calls`, `x_posts_fetched`, `x_users_fetched`; plus a
`context_details?: { input_tokens: number; output_tokens: number }` (§2.5).

`responses-types.ts`: `null` already dropped from `ToolChoiceUnion` (Andrew,
2026-09-21).

### Step 3 — persist: link the block to its attachment

`apps/ws-server/src/prisma/chat-response.ts` creates `messageBlocks` and
`attachments` as two independent nested `create` lists on one message, so no
block can reference an attachment inside that single write. Two options:

- **(a) Two-phase, chosen.** Keep the message create as is. After it
  returns, for each persisted block whose wire shape carried `attachment`,
  find the created attachment by `s3ObjectId` (unique per upload, already on
  the wire shape) and `update` the block's `attachmentId`. One extra query
  per image block, inside the existing transaction.
- (b) Create attachments first, then the message with blocks that
  `connect` by id. Larger restructuring of a hot persist path for the same
  result. Rejected.

`handleAiChatResponse` needs no signature change: `messageBlocks` already
flows in, and the `attachment` field rides on each block. The `IMAGE_GEN`
block's attachment is **also** still included in `imgGenFields.images`, so
the attachment row is created by the existing `mapImgs` path and the block
only links to it.

### Step 4 — `responses-api-v2.ts`: the linear rewrite (§6)

New file beside `responses-api.ts`. Same method name and signature,
`handleXAIAiResponsesApiRequest`, on a class the router can swap to.

**The base is the 2026-03-29 version of the handler**, preserved at
`reference/xai-responses-api-from-2026-03-29.md`: 600 lines, zero closures, six
`let`s, one `if` chain, frames inline. Everything the current file grew since
then is either (a) the block contract, which the client now renders by
ordinal and must be kept, or (b) closure scaffolding that only exists because
the closures could not see the loop's locals. The rewrite is the March file
plus (a), with the image branches added.

| grew since March | keep? | how |
| --- | --- | --- |
| `messageBlocks` on every frame; `trackedBlocks` → `roundTrack` on persist | yes | wire contract, not elaboration |
| per-summary-part THINKING blocks with their own clocks (`reasoningPhase*` maps, `reasoningPhaseKey`) | yes, simplified | the March two-variable clock does it: start on `summary_part.added`, settle on `summary_part.done`; the maps existed for the closures |
| `ENCRYPTED_THINKING` placeholder per item, three dedupe `Set`s | yes, no Sets | March put `encrypted_content` straight into `thinkingText` (leaked ciphertext to the browser); the placeholder is the fix. Emit it in exactly one place — `output_item.done` for a reasoning item that had no summary text — and it fires once per item by construction |
| second scan of `response.completed.output` for encrypted items | no | every item already had its `done` |
| local tool bridge | yes | real feature, lives in the tool-round section outside the stream loop |
| `MAX_TOOL_ROUNDS` 10 → 10,000,000 | keep current | unrelated (memory tools) |

State, in full — the March pair `grokIsCurrentlyThinking` +
`activeThinkingStartTime` becomes `activeBlock`, which says the same thing
(`activeBlock?.type === "THINKING"`, `activeBlock.startedAt`) while also
carrying the content and ordinal the block contract needs:

```ts
let activeBlock: GrokActiveMessageBlock | undefined = undefined; // { type, content, startedAt, itemId }
let nextOrdinal = 0;
const blocks = Array.of<GrokFinalizedMessageBlock>();
let grokThinkingDuration = 0, grokThinkingAgg = "", grokAgg = "", usage = 0;
const images = Array.of<AIChatResponseImgGenSubFields>();
```

One `if / else if` chain over `chunk.event`. Every "close the active block"
is the six inline lines from §6.2, repeated at each site that closes one.
Frame literals are named `const`s at the send site, as the March file does.

**The full loop skeleton is in `reference/loop-skeleton.md`** — state,
round loop, the stream chain branch by branch, and a walk of the probe's
ten output items through it showing the nine resulting block ordinals.

Branches, in the order they matter:

| event | does |
| --- | --- |
| `response.created` | log round start |
| `output_item.added`, `reasoning` | **no-op** (§2.4: `tco_` items are complete on `added`; act on `done`) |
| `output_item.added`, `image_generation_call` | close the active block (the TEXT split, §5.3). Nothing else: `done` follows within the same burst (§8.4a) |
| `output_item.added`, `function_call` | register pending call (unchanged) |
| `output_item.added`, anything else | close the active block |
| `reasoning_summary_part.added` / `_text.delta` / `_text.done` / `_part.done` | as today, inline; phase maps keyed by `reasoningPhaseKey` |
| `output_text.delta` | open a TEXT block if `active?.type !== "TEXT"`, append, send the text frame |
| `output_item.done`, `reasoning` with `encrypted_content` | store; if no summary text was seen for this id and no placeholder yet: close active, push an `ENCRYPTED_THINKING` block, send the placeholder frame |
| `output_item.done`, `image_generation_call` with `result` | (1) close the active block; (2) open a THINKING block, `content = item.prompt`, send its frame with `isThinking: true` — the client's own ticker starts; (3) `const uploadStartedAt = performance.now()`; decode; `getImageSpecsWorkup`; **`await` the S3 upload, plainly**; (4) close the THINKING block with `durationMs = now − uploadStartedAt`, send it with `isThinking: false`; (5) build the sub-fields (minted `seriesId`, `revisedPrompt = item.prompt`, `jobId` if the entry passed one, `imageGenOutput` only if `jobId`); push an `IMAGE_GEN` block `{ content: item.prompt, durationMs: 0, attachment }` — the wait was already attributed to the THINKING block; push into `images`; send its frame with `imgGenFields: { images, activeImage }`. No continuation, no second frame per block (§8.4a) |
| `output_item.done`, `file_search_call` | `parseFileSearchResults` (unchanged) |
| `output_item.done`, `function_call` | finalize the pending call (unchanged) |
| `response.completed` | close the active block; `usage`; collect `function_call`s for the next round. **No second scan for encrypted reasoning** — every item already had its `done` |
| `response.incomplete` / `response.failed` | throw, as the Meta lane does |

After the loop: the existing tool-round continuation, unchanged. After all
rounds: `handleAiChatResponse` with `messageBlocks` (now including the
`IMAGE_GEN` blocks with their `attachment`), `imgGenEnabled: images.length >
0`, `imgGenFields` with `images` when non-empty, `messageType` left to the
persist layer (`TEXT` unless the entry was an image job).

#### 8.4a Where the wait actually is, and how it is shown (Andrew, 2026-09-21)

The five image events — `output_item.added`, `in_progress`, `generating`,
`completed`, `output_item.done` — arrive as **one consecutive burst**, mid
text. xAI spends the generation time *before* emitting `added`; from the
stream's side the image is atomic. So the wait is **ours**: decode → specs →
S3 upload → CDN url. The wire hands us the bytes instantly; we take seconds.

**Show it as a THINKING block, and await the upload inline.** On the image
`done`: close the text block, open a THINKING block whose `content` is
Grok's rewritten `prompt` ("Composing: Cinematic weather-forecast image of…"
is truthful and more informative than blank), send it with `isThinking:
true`, and `await` the upload as a plain statement. The client's
`ThinkingSection` ticks on its own from `isThinking`, exactly as it does for
Meta. When the url is back, close the THINKING block with the measured upload
duration and send the `IMAGE_GEN` block with its attachment.

Why this beats the two earlier drafts of this section:

- **It is linear.** No fire-and-forget upload, no `.then` continuation, no
  `await` at `response.completed` to collect stragglers. The one deliberate
  exception to the no-continuations rule is gone.
- **The pause is a feature, not a bug.** While the loop is blocked on the
  upload, xAI keeps sending and the socket buffers. The user sees a ticking
  thinking block, which is true: the server is working. When the loop
  resumes, the backed-up deltas stream through at full speed.
- **The shimmer is no longer needed for the slot.** `IMAGE_GEN` is only ever
  sent *with* its attachment, so the empty-frame / `width` / `height`
  machinery from the previous draft is dropped. `shimmer()` remains useful
  only as `blurDataURL` for the paint after the url arrives.
- **Upload failure is simpler.** No `IMAGE_GEN` block is sent; the THINKING
  block still closes honestly; log and continue. Nothing attachment-less
  reaches the wire.

**Text pacing belongs on the client.** The backed-up deltas would otherwise
land in one frame as a wall of text. Metering them out reads better, but a
server-side timer draining a queue is a heartbeat by another name — the
Meta `setInterval` shape we removed. The client already owns render cadence
(`draft-to-message.ts` folds frames; the bubble renders on its own schedule),
so a small frame queue in the store, drained at a fixed rate whenever it
holds more than a few, gives the time-released effect with zero server
timing, and improves every provider's fast bursts, not just this one. That
is a step 7 item.

Tool equipping: `resolveResponsesTools` in `stream-workup.ts` adds
`{ type: "image_generation", action: "auto" }` when
`imgCtx.grokImgGenFacilitating(model)` (predicate exists in `img-gen`, line
143). Always on for 4.6 / 4.7 on the chat path (§3).

Estimated size: ~650 lines. Typecheck + lint clean before step 5.

### Step 5 — the job entry: `responses-image-api.ts`

Thin. Reuses step 4's loop through one added parameter on it,
`imageJob?: { jobId: string; imgGenFields: AIChatRequestImgGenFields }`:

- tools: `image_generation` (with `action: "auto"`, and `size`/`quality`
  from `imgGenFields` if xAI's tool takes them — verify against the docs;
  the probe sent only `action`), HMEM's two memory tools, `web_search`.
  **No `file_search`, no `x_search`, no local tools.**
- `tool_choice: "required"`.
- loop until an `image_generation_call` `done` carried a `result`; if
  `MAX_TOOL_ROUNDS` runs out first, **throw** "image job completed without an
  image" (closes open item 7 for Grok).
- passes `jobId` through so the sub-fields carry `imageGenOutput` and the
  persist layer sets `messageType: IMAGE_GEN`.

Router (`xai/index.ts`): `isGrokImgModel` → existing pure-image lane;
`grokImgGenFacilitating(model) && imgGenEnabled && imgGenFields` → this
entry; else → chat.

### Step 6 — the same exhaustion fix in `openai/responses-img-gen.ts`

`if (round === MAX_TOOL_ROUNDS) { warn; break; }` → `throw`. One line.
Closes open item 7 for OpenAI. Independent of everything else; can land
first.

### Step 7 — web: render the `IMAGE_GEN` block inline

- `apps/web/src/lib/draft-to-message.ts`: `mergeBlock` is already last-wins
  by ordinal, so the block flows through `deriveDraft` unchanged. Add the
  block's `attachment` to `imgGenAttachments` so the streaming bubble shows
  it mid-stream.
- `apps/web/src/lib/ui-message-helpers.ts` `toMessageBlocks`: carry
  `attachment` through.
- **New: an inline image-block component** (`apps/web/src/ui/chat/image-gen-block/`
  or similar). Props: the block's `attachment` (always present). Renders
  `next/image` with `placeholder="blur"` and
  `blurDataURL={shimmer([attachment.width, attachment.height])}` from
  `@slipstream/ui`'s `lib/shimmer.ts`, so nothing flashes between the CDN
  url arriving and the bytes painting. The wait *before* the url is the
  THINKING block (§8.4a), not this component.
- **Client-side text pacing (§8.4a).** When the store's draft receives a
  burst of text frames (the deltas that buffered while the server awaited an
  upload), drain them into the rendered draft at a fixed rate instead of in
  one paint. A queue in `state/chat/store.ts` `applyChunk`, drained by
  `requestAnimationFrame` while it holds more than N frames; empty queue =
  today's behaviour. Provider-agnostic.
- `apps/web/src/ui/chat/message-bubble/index.tsx`
  `renderedMessageBlocks`: an `IMAGE_GEN` case that renders that component
  at the block's ordinal.
- **Double-render rule.** The `IMAGE_GEN` attachment is also on the
  message's `attachments` list, so the trailing attachment group must skip
  any attachment referenced by an `IMAGE_GEN` block, or the image draws
  twice — once inline, once below. This is about slot ownership, not
  loading: a committed message has the link via `MessageBlock.attachmentId`,
  a streaming one via the wire field; both are covered by one filter. The
  trailing group is otherwise unchanged and keeps rendering user uploads
  and pure-image-lane outputs as today (it can adopt the same shimmer
  placeholder for its own loading, but that is independent of this work).
- `ThinkingSection` and the text renderer are untouched.

### Step 8 — cut over

- `xai/index.ts` imports the v2 service.
- One live turn per path: plain chat on 4.7 with no image request (expect
  no image, no `IMAGE_GEN` block); chat on 4.7 asking for an image mid-text
  (expect the probe's shape: TEXT / IMAGE_GEN / TEXT); the image job on 4.7
  (expect `messageType: IMAGE_GEN`, job bound, one image); 4.3 chat
  (expect no tool equipped, no behaviour change). Reload each and confirm
  the DB-loaded message renders the same as the streamed one.
- Delete `responses-api.ts` in a separate commit.

### Commit boundaries

| commit | contents |
| --- | --- |
| A | step 6 alone (one-line prod fix) |
| B | step 1 (schema + migration + rebuilds) |
| C | step 2 + 3 (types, persist link) |
| D | step 4 (`responses-api-v2.ts`, not yet routed) |
| E | step 5 (job entry) + router |
| F | step 7 (web) |
| G | delete `responses-api.ts` |

D is the one that needs a careful diff against the old file. Everything
before it is additive and everything after it is small.

### Not in scope

- Meta: unchanged. Its lane has no interleaving and one image; it keeps its
  attachment-only persist. Giving it an `IMAGE_GEN` block for consistency is
  a later, cosmetic change.
- OpenAI facilitators: `image_generation` is already always-equipped there
  only on the image path. Equipping it on the OpenAI *chat* path (the Grok
  §3 behaviour) is a separate decision.
- Partial images: Grok's tool emits none (probe: in_progress → generating →
  completed, no `partial_image`). The `partialImgArr` machinery is not
  ported.
- `IMAGE_GEN` blocks for the pure-image lanes (`grok-imagine-*`,
  `gpt-image-*`, `muse-image-1.0`): those messages are `messageType:
  IMAGE_GEN` with no text; a block adds nothing. Leave as attachments.
