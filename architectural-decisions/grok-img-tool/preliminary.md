# Grok `image_generation` tool — preliminary findings

Date: 2026-09-21

Status: probe-verified; design settled 2026-09-22. Shipped: the event and
request types (`apps/ws-server/src/xai/event-types.ts`, `responses-types.ts`),
tool equipping (`f6113ea`), and the step 1 schema (migrating 2026-09-22).
Open: steps 2–8 of §8.

Source: `apps/ws-server/grok-4-7-probe.sh`, run twice with the identical
request → `src/test/xai/tooling/grok-4.7.txt` (run 1, image base64 trimmed;
rendered image at `src/test/__out__/grok/image_generation/one.jpg`, 1792×1008
JPEG, 16:9) and `grok-4.7-2.txt` (run 2). Every event shape is typed in
`apps/ws-server/src/xai/event-types.ts`.

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

## 2. What came back — two runs, same prompt

Run 1: 1,144 events. Run 2: 1,219 events. Both: 10 output items, one
`message`, one `image_generation_call`, one `response.completed`. **The item
order differs between them, and that is by design.** Grok runs its tool
calls in parallel (`parallel_tool_calls: true`; up to 350 tools can be
equipped at once), so the order in which tool items open and close is never
the same twice. The handler must be order-agnostic. The only things it may
rely on are the invariants in §2.2.

Three `: keepalive` comment lines were interleaved in run 1. Already
handled: the SSE parser skips any line starting with `:`.

### 2.1 The two item skeletons, side by side

Delta runs collapsed; numbers are `sequence_number`.

| run 1 (`grok-4.7.txt`) | run 2 (`grok-4.7-2.txt`) |
| --- | --- |
| 2–53 · reasoning `rs_` idx 0 — 47 visible summary deltas (203 chars); its `done` carries `encrypted_content` too | 2–13 · **four** `file_search_call` idx 0–3, all `added` before any `done` |
| 54 · `file_search_call` idx 1 added | 14 · idx 3 `done` with **`status: "failed"`**, `results: []`, no `.completed` progress event |
| 57–61 · `web_search_call` idx 2 | 15–19 · `web_search_call` idx 4 |
| 62–63 · reasoning `tco_` idx 3, complete on `added` | 20–21 · reasoning `tco_` idx 5, complete on `added` |
| 64–68 · `web_search_call` idx 4 | 22–27 · the file searches close as **1, 0, 2** — not by index |
| 69–70 · reasoning `tco_` idx 5 | 28–79 · reasoning `rs_` idx 6 — 47 visible summary deltas (997 chars); its `done` carries `encrypted_content` too |
| 71–72 · `file_search_call` idx 1 closes **after items 2–5** | |
| 73–74 · reasoning `rs_` idx 6, encrypted, no deltas | |
| 75–76 · `message` idx 7 opens | 80–81 · `message` idx 7 opens |
| 77–116 · 40 text deltas | 82–107 · 26 text deltas |
| 117–121 · `image_generation_call` idx 8: added / in_progress / generating / completed / done, consecutive; `prompt` 799 chars | 108–112 · `image_generation_call` idx 8: the same five, consecutive; `prompt` 734 chars |
| 122–123 · reasoning `rs_` idx 9, encrypted, **inside the open message** | 113–114 · reasoning `rs_` idx 9, encrypted, **inside the open message** |
| 124–1125 · 1,002 text deltas on the same `msg_` item | 115–428 · 314 text deltas on the same `msg_` item |
| 1126–1139 · **14 annotations, all trailing** (`collections://` citations, indices 0/0) | 429 · **one annotation mid-text** (`url_citation`, indices 1274–1335) |
| | 430–1214 · 785 more text deltas |
| 1140–1142 · `output_text.done` (4,380 chars, one string); message `done` | 1215–1217 · `output_text.done` (4,730 chars, one string); message `done` |
| 1143 · `response.completed` | 1218 · `response.completed` |

### 2.2 Invariants and variants

Held in both runs — the handler may rely on these:

1. **The message item stays open around the image.** The image call and an
   encrypted `rs_` item open and close *inside* it; text resumes on the
   same `msg_` item, same `content_index` 0, no new message item, no new
   content part. `output_text.done` carries the whole text as one string.
   OpenAI's Responses stream never does this — an item there finishes
   before the next begins — and the current handler's block logic was
   built on that assumption.
2. **The image is a five-event burst**: `added`, `in_progress`,
   `generating`, `completed`, `done`, consecutive, mid-text. `result` and
   `prompt` are on `done` only (§2.3).
3. **`tco_` reasoning items are complete on `added`** (§2.4).
4. **A summarised `rs_` item's `done` also carries `encrypted_content`.**
   The placeholder branch must know a summary was already streamed for
   that id — the one dedupe `Set` the rewrite keeps (`summarisedItemIds`).
5. **Tool items open in parallel and close out of order**, and a tool item
   can `done` with `status: "failed"` (run 2, idx 3) without failing the
   response: it carries `results: []`, gets no `.completed` progress event,
   and is not counted in usage (`file_search_calls: 3` for four items).
   Nothing to parse, nothing to throw.
6. **Annotations are not a boundary.** They can land after all the text
   (run 1) or between text deltas (run 2). The annotation branch is a no-op
   in the March file and today, and stays one: it never closes the TEXT
   block.
7. Usage carries `image_generation_calls` and `cost_in_usd_ticks` (§2.5).

Varied — the handler must not assume any of it:

| | run 1 | run 2 |
| --- | --- | --- |
| where the visible reasoning sits | idx 0, **before** every tool | idx 6, **after** every tool, right before the message |
| tool mix | 1 file search, 2 web searches, 2 `tco_` | 4 file searches (1 failed), 1 web search, 1 `tco_` |
| close order of parallel items | idx 1 closes after 2–5 | 3, 4, 5, 1, 0, 2 |
| text before / after the image | 40 / 1,002 deltas | 26 / 1,099 deltas |
| annotations | 14, all trailing | 1, mid-text |
| input / output / reasoning tokens | 57,743 / 4,373 / 3,041 | 102,700 / 3,399 / 1,908 |
| `cost_in_usd_ticks` | 1,575,680,000 | 2,076,540,000 |

Both runs happened to stream exactly 47 summary deltas. Coincidence, not a
number to key on.

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
- `prompt` (799 chars in run 1, 734 in run 2) is the rewritten prompt Grok
  handed to the image model. It is the Grok equivalent of `revised_prompt` and belongs in that
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
is new. Neither is on the current `Usage` type in `event-types.ts`. Run 2
counted `file_search_calls: 3` for four emitted items: the failed one is
not billed.

### 2.6 Generator model and chaining (xAI docs, 2026-09-22)

Two facts from the tool's documentation rather than the probe:

- The tool "uses the latest Imagine image models (grok-imagine-image-2.0)".
  So `generatingModel` for a Grok facilitator is documented, as OpenAI's is
  named on the tool definition; the facilitator → generator mapping is one
  `as const` per provider.
- "The model can also chain calls — generating an image and then editing
  it — within a single request." One round can therefore carry **several**
  `image_generation_call` items. The probe had one; the handler must not
  assume one. Each `done` is handled on its own (§8, step 4).

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
chat paths do not change. **Done in `f6113ea`**: `resolveResponsesTools` in
`stream-workup.ts`.

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

Schema, additive, no backfill (settled 2026-09-22, see step 1 for the
full shape):

```prisma
enum MessageBlockType { ENCRYPTED_THINKING THINKING TEXT IMAGE_GEN }

model MessageBlock {
  …
  attachments Attachment[] @relation("MessageBlockAttachments")   // ONE block → MANY attachments
}

model Attachment {
  …
  messageBlockId       String?
  messageBlock         MessageBlock?         @relation("MessageBlockAttachments", …, onDelete: SetNull)
  inlineImageGenOutput InlineImageGenOutput?                      // one-off lineage, no job
}

model InlineImageGenOutput { … }   // kind / seriesOrdinal / seriesId / dims / models, keyed by attachment
```

**Why one-to-many, not one-to-one (Andrew):** a facilitator's tool call can
yield 0–3 partial images during streaming plus a final. One block must own
all of them, or the partials render consecutively as separate images. The
block is the group; the attachments are its frames.

**Why a new table, not `ImageGenOutput` (Andrew):** `kind` / `seriesIndex`
/ `isPartial` — the fields the renderer sorts and splits on — live on
`ImageGenOutput`, whose `jobId` is required and cascades from `ImageGenJob`.
An `ImageGenJob` is defined only for a `messageType: IMAGE_GEN` message; a
spontaneous tool call is not a job and must not fake one. Making `jobId`
optional ripples through every image lane. So a one-off's outputs get their
own table, `InlineImageGenOutput`, fully independent of the job tables,
hanging off `Attachment` one-to-one. (The earlier "mint a job at
completion" idea is withdrawn: a job hangs off a message via a unique
`requestMessageId`, and reaching it from the block through
`attachments → imageGenOutput → job` while also linking it directly is
circular.)

The two probe runs persist as (the upload THINKING block is §8.4a; the
walk through the loop is in `reference/loop-skeleton.md` §5):

| ordinal | run 1 | run 2 |
| --- | --- | --- |
| 0 | THINKING — summary | ENCRYPTED_THINKING — `tco_` |
| 1 | ENCRYPTED_THINKING — `tco_` | THINKING — summary |
| 2 | ENCRYPTED_THINKING — `tco_` | TEXT — "…Image incoming…" |
| 3 | ENCRYPTED_THINKING — `rs_` | THINKING — the upload, `content` = the 734-char `prompt` |
| 4 | TEXT — "…Image incoming with the reading." | **IMAGE_GEN** — `content` = the `prompt`, `inlineImageData` (FINAL) |
| 5 | THINKING — the upload, `content` = the 799-char `prompt` | ENCRYPTED_THINKING — `rs_` |
| 6 | **IMAGE_GEN** — `content` = the `prompt`, `inlineImageData` (FINAL) | TEXT — the rest |
| 7 | ENCRYPTED_THINKING — `rs_` | |
| 8 | TEXT — "**CHICAGO, AS READ…**" | |

Grok emits one FINAL per image call; an OpenAI facilitator would re-send
the same ordinal as each PARTIAL lands, and the client's last-wins merge
keeps the latest. Nine blocks and seven blocks
from the same prompt: the ordinals follow the wire, whatever order it
comes in.

Consequences:

- `content` has a natural value: the rewritten `prompt`, the same provenance
  `revisedPrompt` carries elsewhere.
- **Every generated attachment still records its frame** — `kind`,
  `seriesOrdinal`, `seriesId`, dims, both models — on `inlineImageGenOutput`
  instead of `imageGenOutput`. The one-off renderer sorts by `seriesOrdinal`
  and shows the FINAL if present, else the highest PARTIAL. It must **not**
  share a sort helper with the job renderer: `ImageGenOutput.seriesIndex` is
  per kind (the FINAL is 0), `seriesOrdinal` is one counter across kinds (the
  FINAL after three PARTIALs is 3).
- **The TEXT split is now correct, not a bug.** §5.2 step 1 is withdrawn:
  closing the active block on the image's `added` ends the text before the
  image; the upload THINKING and the `IMAGE_GEN` take the next two
  ordinals; the resumed text opens a fresh TEXT block after the encrypted
  placeholder. The wire's order maps straight onto block ordinals, and the
  rewrite needs no special case.
- The `Attachment` rows are created exactly as today, on the message,
  `origin: GENERATED`; the block is an ordered owner of them, so attachment
  listings keep working.
- The bubble's `renderedMessageBlocks` gains an `IMAGE_GEN` case that renders
  the attachment inline at its ordinal, and the trailing attachment group
  must skip attachments a block already claims (or the image shows twice).
- `ChatChunkAndResMsgBlock` carries `inlineImageData?` — width, height,
  `cdnUrl`, `kind` — exactly what the renderer paints (Andrew, 2026-09-22:
  "minimal wire as conditional fields"). `seriesId` is not on the wire
  because the generated-asset url already encodes it (step 2). The full
  lineage rides on `imgGenFields.images` as today. No `isInlineImage`
  boolean: `type === "IMAGE_GEN"` is the discriminant.
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

1. **The image call** (§5.3, §8.4a): `added` closes the active TEXT block
   like any other non-reasoning item and opens the image THINKING block
   (the clock starts here); `done` fills in `item.prompt`, uploads to S3,
   closes the THINKING with one duration, pushes an `IMAGE_GEN` block at
   the next ordinal with the attachment, and releases any held text. Two
   branches, no closure.
2. **`tco_` items** (§2.4): treat `added` for any reasoning item as a no-op
   and act on `done` only, so a `tco_` landing mid-text after the image can
   never split the TEXT block.
3. **`Usage`** gains `cost_in_usd_ticks` and
   `server_side_tool_usage_details.image_generation_calls` / `x_posts_fetched`
   / `x_users_fetched` / `context_details`.

### 6.4 Landed: `responses-api-linear.ts` (Andrew, 2026-09-22)

Andrew linearized the current file himself rather than rebuilding from
March: `apps/ws-server/src/xai/responses-api-linear.ts`, 1,124 lines, zero
closures. The seven helpers became two inline close sites (a
`closeBeforeEvent` decision at the top of the loop body, a `closeAfterEvent`
decision at the bottom, each followed by the same six-line close written
out) and named frame literals at the send site. The per-summary-part clocks
(`reasoningPhase*` maps), the three dedupe sets, and the second
`response.completed` scan are all **kept**, unchanged in behaviour; §6.2's
proposed simplifications were not taken and are not needed. `xai/index.ts`
extends it; live-tested for tool calling, image sharing, and document
sharing. `responses-api.ts` stays beside it until commit G.

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

### Step 1 — schema: `IMAGE_GEN` block, block → attachments, `InlineImageGenOutput`

Three edits, all Andrew's (validated and migrated 2026-09-22).

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
  attachments Attachment[] @relation("MessageBlockAttachments")
}
```

`attachment.prisma` — the holding side of the one-to-many, plus the
one-off lineage relation:

```prisma
model Attachment {
  …
  messageBlockId       String?
  messageBlock         MessageBlock?         @relation("MessageBlockAttachments", fields: [messageBlockId], references: [id], onDelete: SetNull)
  inlineImageGenOutput InlineImageGenOutput? @relation("InlineImageGenOutputToAttachment")
  @@index([messageBlockId])
}
```

New, `inline-image-gen-output.prisma`, **completely independent of
`ImageGenJob` and `ImageGenOutput`**:

```prisma
model InlineImageGenOutput {
  id   String             @id @default(cuid(2))
  kind ImageGenOutputKind @default(FINAL)

  provider          Provider
  facilitatingModel String
  generatingModel   String
  /// cuid2 (24 chars [a-z0-9]) shared by series ordinals
  seriesId          String
  /// 0-based, up to 4 total per series (0 through 3, eg, PARTIAL, PARTIAL, PARTIAL, FINAL)
  seriesOrdinal     Int
  attachmentId      String     @unique
  width             Int
  height            Int
  mime              String
  ext               String
  revisedPrompt     String?
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  attachment        Attachment @relation("InlineImageGenOutputToAttachment", fields: [attachmentId], references: [id], onDelete: Cascade)

  @@unique([seriesId, seriesOrdinal])
  @@index([provider, facilitatingModel, generatingModel])
  @@index([createdAt])
}
```

- `ImageGenOutputKind` is reused, not duplicated: the same PARTIAL / FINAL
  vocabulary. There is no `isPartial`; it is `kind === "PARTIAL"`.
- **`seriesOrdinal` is one counter across kinds**: PARTIALs take 0…n−1 and
  the FINAL takes n (three partials → the FINAL is 3). Deliberately
  different from `ImageGenOutput.seriesIndex`, which is per kind (FINAL is
  0). The unique key is `[seriesId, seriesOrdinal]`; its leading column
  covers lookups by `seriesId`, so there is no separate `seriesId` index.
- `facilitatingModel` (the chat model, `grok-4.7`) and `generatingModel`
  (what drew, `grok-imagine-image-2.0`, §2.6) are both here because there is
  no job to carry them, and provenance for a one-off must not depend on the
  parent message. The facilitator → generator mapping is one `as const` per
  provider in the handler.
- `width` / `height` / `mime` / `ext` are **required**: the extractor knows
  all four before the upload, so a nullable column would only encode a bug.
- `revisedPrompt` is the provider's rewritten prompt (Grok `prompt`, OpenAI
  `revised_prompt`).
- No `jobId`, no `jobIndex` (job concepts); no `ordinal`, `messageBlockId`,
  `aspectRatio` (each one relation hop away).
- All additive: one enum member, one nullable column on `Attachment` with
  its index, one new table. No backfill; existing rows untouched;
  `ImageGenOutput.jobId` stays required.
- `SetNull` on `Attachment.messageBlockId` so deleting a block leaves its
  attachments on the message; `Cascade` on the lineage row so it dies with
  its attachment, exactly as `ImageGenOutput` does.

**Scope of the link (Andrew, 2026-09-21): `messageBlockId` is set on
attachments owned by an `IMAGE_GEN` block only.** It does not mean
"attachments belong to blocks". A user message is one `TEXT` block minted at
request time with `content: prompt`; its attachments were uploaded as a
batch before the message existed, have no position in the text, and stay
linked to the **message** by `messageId` exactly as today. Only a generated
image has a position inside the output, and that position is what the block
records. Invariant enforced by the persist layer: an attachment has a
`messageBlockId` ⇔ its block is `IMAGE_GEN`. The owned attachments are
**also** still on the message's `attachments` list; the block is an ordered
owner within that list, not a replacement for it. User messages: no new
blocks, no backfill, no render change.

Migration + client regenerate + rebuilds of whatever packages re-export
`$Enums` / the Prisma types.

**Ships alone.** Nothing reads the new member yet, so prod is unaffected.

### Step 2 — types package: the minimal wire, as conditional fields

`packages/types/src/contract/ai-chat-events.ts`:

Landed 2026-09-22 (Andrew):

```ts
export type ChatChunkAndResInlineImageData = {
  width: number;
  height: number;
  cdnUrl: string;
  kind: $Enums.ImageGenOutputKind;
};

export type ChatChunkAndResMsgBlock = {
  type: $Enums.MessageBlockType;
  content: string;
  ordinal: number;
  conversationId: string;
  durationMs: number;
  inlineImageData?: ChatChunkAndResInlineImageData;
};
```

One optional object, defined if and only if `type === "IMAGE_GEN"`. It is
what the client needs to paint the slot (width, height, url, and `kind` for
the partial-vs-final decision) and nothing else. The full lineage
(`seriesOrdinal`, the two models, `revisedPrompt`, mime, ext) rides on
`imgGenFields.images` exactly as a job's does.

**`seriesId` is not on the wire because the url is reproducible (Andrew,
2026-09-22).** Every generated asset lives at

```
https://assets[-dev].aicoalesce.com/generated/:userId/:timestampMs-:seriesId-:seriesOrdinal.:ext
```

`assets-dev` locally, `assets` in production; `userId` a cuid2; the
timestamp 13 digits; then the series id (nanoid, 21 chars, on the job lane;
cuid2, 24 chars of `[a-z0-9]`, for inline images); then the 0-based
ordinal (0–3 at most, with three partials); then the extension. No query
params, ever. So whoever holds a `cdnUrl` holds the series id:

```ts
const basename = cdnUrl.slice(cdnUrl.lastIndexOf("/") + 1);        // 1790010492109-cTygUBM6EZ4cHeSElCCJN-0.webp
const stem = basename.slice(14, basename.lastIndexOf("."));         // cTygUBM6EZ4cHeSElCCJN-0
const seriesId = stem.slice(0, stem.lastIndexOf("-"));              // cTygUBM6EZ4cHeSElCCJN
```

Fixed offsets, `lastIndexOf` for the two separators (a nanoid may itself
contain `-`, a cuid2 cannot; the ordinal separator is always the last dash,
so `lastIndexOf` keeps a dashed nanoid whole), no defensive parsing.
`mapImgs` in the persist layer already derives the series id from the url
path the same way, and `apps/web/src/lib/helpers.ts:211`
`toCdnUrlConstituents(cdnUrl)` is the client's one implementation — it
returns `{ type, sId, sOrdinal, ext, timestampMs }`, where `type` is the
attachment relation the url belongs to, decided by the cuid2 shape
**anchored to the whole id** — `/^[a-z0-9]{24}$/.test(sId)` →
`"inlineImageGenOutput"`, else `"imageGenOutput"` (a 21-char nanoid from
Meta / the pure image lanes, or the OpenAI facilitator's item id, which is
`/^ig_[a-f0-9]{50}$/`, 53 chars, verified across half a dozen). The anchors
matter: unanchored, fifty contiguous hex chars contain 24-runs of `[a-z0-9]`
and every OpenAI facilitator output would read as inline. Forward intent:
inline OpenAI images (a later feature) will mint cuid2 series ids too, so
"cuid2 ⇒ inline" holds across providers and `ig_` stays a job-lane shape.
Verified in the TS playground against a live Meta url: `{ type: "imageGenOutput", sId:
"cTygUBM6EZ4cHeSElCCJN", sOrdinal: 0, ext: "webp", timestampMs: 1790010492109 }`.

Why not a discriminated union on `type`, and why no `isInlineImage`
boolean: nineteen provider handlers build `roundTrack` entries as
`{ type: $Enums.MessageBlockType, … }`, and a union that requires the field
when `type` is `IMAGE_GEN` would stop every one of them compiling. The
optional field is additive. A boolean beside `type` would be a second copy
of the same fact, and TypeScript cannot couple two independent optionals
anyway; the client narrows on `inlineImageData !== undefined`.

**The `IMAGE_GEN` chunk frame also carries the row itself, once (Andrew,
2026-09-24).** `inlineImagePostUploadObj` already builds the DB-ready
`InlineImageGenAggProps` from real S3 values for persist; the same object
rides the chunk frame that carries the `IMAGE_GEN` block, as a frame-level
field beside `imgGenFields`. One field, cardinality by event, mirroring
`messageBlocks` exactly (Andrew, 2026-09-24): the singleton on a chunk, the
aggregate array on the response —

```ts
// on AIChatResEntity<T>
inlineImgGenData?: T extends "ai_chat_chunk"
  ? InlineImageGenAggProps
  : InlineImageGenAggProps[];
```

On a chunk: one image per frame, one frame per image under chaining,
nothing accumulates across frames. On the response: the array the server
collected, in the create shape, not a re-projection of rows — the persisted
`AttachmentSingleton<true>` rows are already inside
`convo.messages[0].attachments`, which is the truth at completion. The
response-level field has the same standing as response-level
`messageBlocks`: a mirror of what the server had, which the web store
ignores and the CLI no longer reads at final state. `inlineImgAttachmentIds`
remains the light bridge into `convo` for the persisted ids.

Why: the client synthesizes its streaming attachment from a faithful
template instead of placeholders (§10.11 b), exactly as the job lane does
from `imgGenFields.images`; nothing new is exposed, since the committed row
goes to the client wholesale at `applyResponse` anyway; and it is ~1.5 KB
once per image, never per token — the base64 `result` is the bulk, and it
stays out. The block's own `inlineImageData` remains the four-field render
contract for lightweight consumers (the CLI paints from chunk blocks).

An `IMAGE_GEN` frame is sent only once the url exists. For Grok that is one
frame per image. For an OpenAI facilitator later, the same ordinal is
re-sent as each PARTIAL lands and again for the FINAL; the client's
last-wins merge by ordinal replaces the object, so "show the FINAL, else
the latest PARTIAL" is the merge itself. On hydration the same object is
derived from `MessageBlockSingleton.attachments[]`: FINAL if present, else
the highest `seriesOrdinal`, with width, height, and kind read off
`inlineImageGenOutput`. One component prop type, two producers.

`AIChatResponseImgGenSubFields` gains `inlineImageGenOutput` beside the
existing `imageGenOutput`; a given attachment populates exactly one of the
two. `content` on that block is the
provider's rewritten prompt (`item.prompt` for Grok, `revised_prompt` for
OpenAI).

Also, `apps/ws-server/src/xai/event-types.ts` `Usage` gains
`cost_in_usd_ticks?: number`, and `server_side_tool_usage_details` gains
`image_generation_calls`, `x_posts_fetched`, `x_users_fetched`; plus a
`context_details?: { input_tokens: number; output_tokens: number }` (§2.5).

`responses-types.ts`: `null` already dropped from `ToolChoiceUnion` (Andrew,
2026-09-21).

### Step 3 — persist: own the attachments, write the lineage

`apps/ws-server/src/prisma/chat-response.ts` creates `messageBlocks` and
`attachments` as two independent nested `create` lists on one message, so no
block can reference attachments inside that single write. Two options:

- **(a) Two-phase, chosen.** Keep the message create as is. After it
  returns, for each persisted `IMAGE_GEN` block, `updateMany` the message's
  attachments whose `seriesId` equals the one derived from the block's
  `inlineImageData.cdnUrl` (step 2), setting `messageBlockId`. One statement per
  image block, inside the existing transaction, and it claims every frame
  of the series (partials included, when OpenAI facilitators get blocks).
- (b) Create attachments first, then the message with blocks that
  `connect` by id. Larger restructuring of a hot persist path for the same
  result. Rejected.

The `InlineImageGenOutput` row is created **nested on the attachment
create**, the same way `imageGenOutput` is today (`mapImgs` already builds a
nested `imageGenOutput: { create }` when `jobId` is present). The rule:

| attachment carries | nested create |
| --- | --- |
| `imageGenOutput` (a job's output) | `imageGenOutput: { create }` — unchanged |
| `inlineImageGenOutput` (a one-off) | `inlineImageGenOutput: { create }` — new |
| neither | none |

`handleAiChatResponse` needs no signature change: `messageBlocks` already
flows in, `inlineImageData` rides on each `IMAGE_GEN` block, and the
attachment rows come from `imgGenFields.images` so `mapImgs` creates them
(with the nested `inlineImageGenOutput` when there is no `jobId`).

Three facts from `chat-response.ts` (read 2026-09-22) the chat path must
respect:

1. **`imgGenEnabled` decides `messageType` and `isImageGen`** (`IMAGE_GEN`
   when true). A one-off is a `TEXT` message, so the chat path persists
   with `imgGenEnabled: false`. It does not pass `imgGenFields` at all:
   that is the job lane's input (and its `revisedPrompt` would replace the
   message `content`).
2. **The link must precede the read.** `ai_chat_response.convo` is what the
   client reconciles from, and the hydration mapper derives
   `inlineImageData` from attachments by `messageBlockId`. So the
   `updateMany` runs after the create and before the read that produces
   `convo`, inside the same transaction, and the attachments `include`
   gains `inlineImageGenOutput: true`.
3. **Inline images get their own `else if` branch in `handleAiChatResponse`**
   (Andrew, 2026-09-23), beside the audio-job and image-job branches. The
   job-lane types keep `jobId` required and `mapImgs` is untouched; the
   inline branch creates the attachment rows with the nested
   `inlineImageGenOutput`, links them to their `IMAGE_GEN` block by the
   series id derived from `inlineImageData.cdnUrl`, and does its read. Its
   input is `AIChatResponseDb.inlineImageGenAgg?: InlineImageGenAggProps[]`,
   the DB-ready object `inlineImagePostUploadObj` builds. **The splice is
   written out in §9.**

   **The model for the sub-field is `imgFinal` in
   `apps/ws-server/src/openai/responses-img-gen.ts` (lines 828–933).** The
   job lane builds one full `AIChatResponseImgGenSubFields` literal per
   image, `as const satisfies`, with the lineage row as a nested plain
   object (`imageGenOutput: { ext, height, width, isPartial, jobId,
   jobIndex, kind, mime, revisedPrompt, seriesId, seriesIndex }`, lines
   916–932), and `seriesId` on the sub-field itself (line 884). Persist
   creates the `ImageGenOutput` row from that nested object. The inline
   lane does exactly the same with `inlineImageGenOutput: { kind, provider,
   facilitatingModel, generatingModel, seriesId, seriesOrdinal, width,
   height, mime, ext, revisedPrompt }` nested on the literal and
   `imageGenOutput: null`. The required `jobId` on the sub-field is not a
   problem: the job lane itself writes `jobId: jobId ?? ""` (line 882), so
   the inline literal carries `jobId: ""` and `jobIndex: 0`, and nothing is
   loosened. Partials, when an OpenAI facilitator gets blocks, follow the
   same file's `ImageGenPartialArr` tuple (`openai/types.ts` 37–65) →
   `mapPersistenceImgGenArr` path; Grok has none. `messageType` stays whatever the request was (`TEXT` for a chat turn);
`isImageGen` is left `false` for a one-off, since that flag means "this
message is an image-gen message", which it is not.

### Step 4 — the image branches in `responses-api-linear.ts` (§6.4)

The linear file is live (§6.4), so this step is no longer a rewrite. It is
the image branches, added to that file. `reference/loop-skeleton.md` §4
shows them in isolation; here is where each slots in.

| site in `responses-api-linear.ts` | change |
| --- | --- |
| state, above the round loop | `const images = Array.of<AIChatResponseImgGenSubFields>()`, `let imageLanded = false`, `let heldText = ""`, `let heldTextItemId = ""` |
| the `closeBeforeEvent` decision | two guards while the image THINKING is open (`activeBlock.itemIds[0]` starts with `ig_`): an `output_text.delta` must **not** close it (the delta is held), and a reasoning `output_item.done` must **not** close it (§8.4a's unobserved case: hold that too rather than splitting the block) |
| `output_item.added` handler | `image_generation_call` → the close already happened above; open the THINKING block blank, `startedAt = now`, send its frame inline with `isThinking: true` (the bottom-of-loop thinking frame is gated on `thinkingText`, which is empty here, so the send is explicit) |
| `output_text.delta` handler | image THINKING open → `heldText += delta`, `heldTextItemId = item_id`, set no `text`; else as today |
| `output_item.done` handler | `image_generation_call` with `result` → skeleton §4 steps (1)–(6): prompt into the open block and re-send its ordinal; decode, specs, `await` the upload; close with `now − startedAt`; sub-fields (`inlineImageGenOutput` on the chat path, `imageGenOutput` + `jobId` on the job path); push and send the `IMAGE_GEN` block with `inlineImageData: { width, height, cdnUrl, kind: "FINAL" }` and, on the same frame, `inlineImgGenData: inlineImgObj` (the DB-ready row, singular on a chunk, step 2); then `activeBlock = TEXT(heldText)`, `text = heldText`, so the existing bottom-of-loop text frame releases it |
| persist + `ai_chat_response` | `imgGenEnabled` stays `false` (a one-off is a TEXT message, step 3); no `imgGenFields`; the inline sub-fields go to the persist call's dedicated inline branch (input shape Andrew's, step 3); each `roundTrack` entry for an `IMAGE_GEN` block carries `inlineImageData` |

The progress events and annotations need no code: neither matches a
`closeBeforeEvent` case nor a handler, and with `thinkingText` and `text`
unset the frame sites send nothing.

The branch-by-branch design, as the skeleton states it (names there are the
skeleton's; the linear file's are `trackedBlocks`, `grokThinkingDisplayAgg`,
`roundTrack`):

| event | does |
| --- | --- |
| `response.created` | log round start |
| `output_item.added`, `reasoning` | **no-op** (§2.4: `tco_` items are complete on `added`; act on `done`) |
| `output_item.added`, `image_generation_call` | close the active block (the TEXT split, §5.3); **open the image THINKING block here**, blank, send it with `isThinking: true`. The clock starts at `added`, not `done` (§8.4a). `item.type` is the discriminant the typed union narrows on; `item.id` starting with `ig_` is a second check that agrees |
| `image_generation_call.in_progress` / `.generating` / `.completed` | no-op; the client ticks on its own from the open THINKING |
| `output_item.added`, `function_call` | register pending call (unchanged) |
| `output_item.added`, anything else | close the active block |
| `reasoning_summary_part.added` / `_text.delta` / `_text.done` / `_part.done` | as today, inline; phase maps keyed by `reasoningPhaseKey` |
| `output_text.delta` | if the image THINKING is open: append to `heldText`, send nothing (§8.4a). Else open a TEXT block if `active?.type !== "TEXT"`, append, send the text frame |
| `output_item.done`, `reasoning` with `encrypted_content` | store; if no summary text was seen for this id and no placeholder yet: close active, push an `ENCRYPTED_THINKING` block, send the placeholder frame |
| `output_item.done`, `image_generation_call` with `result` | (1) the THINKING block has been open since `added`; fill `content = item.prompt` and re-send the same ordinal, still `isThinking: true`; (2) decode; `getImageSpecsWorkup`; **`await` the S3 upload, plainly**; (3) close the THINKING block with **one** `durationMs = now − addedAt` (generation + upload), send it with `isThinking: false`; (4) build the sub-fields (minted `seriesId`, `revisedPrompt = item.prompt`; on the job path `jobId` + `imageGenOutput`, on the chat path `inlineImageGenOutput` with `kind: FINAL`, `seriesOrdinal: 0`, `provider`, `facilitatingModel` = the chat model, `generatingModel` = `grok-imagine-image-2.0` (§2.6), dims from the extractor); push an `IMAGE_GEN` block `{ content: item.prompt, durationMs: 0, inlineImageData: { width, height, cdnUrl, kind: "FINAL" } }`, the wait having been attributed to the THINKING block; push into `images`; send its frame with `imgGenEnabled: false` and no `imgGenFields` (the block's `inlineImageData` is the whole client contract; `true` flips the client into the job lane); (5) if `heldText` is non-empty, open a TEXT block with it and send it as one frame. **Runs once per `done`**: with chaining (§2.6) a round can carry several image items, and each gets its own `seriesId`, its own THINKING + `IMAGE_GEN` pair, and its own entry in `images` |
| `output_item.done`, `file_search_call` | `parseFileSearchResults` (unchanged). A `status: "failed"` item carries `results: []` — nothing to parse, nothing to throw (§2.2) |
| `output_text.annotation.added` | **no-op**, as in the March file. Annotations can land mid-text (§2.2, run 2) and must never close the TEXT block |
| `output_item.done`, `function_call` | finalize the pending call (unchanged) |
| `response.completed` | close the active block; `usage`; collect `function_call`s for the next round. **No second scan for encrypted reasoning** — every item already had its `done` |
| `response.incomplete` / `response.failed` | throw, as the Meta lane does |

After the loop: the existing tool-round continuation, unchanged. After all
rounds: `handleAiChatResponse` with `messageBlocks` (now including the
`IMAGE_GEN` blocks with their `inlineImageData`), `imgGenEnabled: false`,
no `imgGenFields`, and the inline sub-fields for the persist layer's inline
branch (step 3). The message stays `TEXT`; only the job entry (step 5)
passes `imgGenEnabled: true` and `imgGenFields`.

#### 8.4a Where the wait actually is, and how it is shown (Andrew, 2026-09-21)

The five image events — `output_item.added`, `in_progress`, `generating`,
`completed`, `output_item.done` — are consecutive in sequence number, mid
text. The dumps carry no timestamps, so **how much wall-clock passes between
`added` and `done` is not known**; the progress events exist because the
generation happens in that window. After `done` the wait is certainly ours:
decode → specs → S3 upload → CDN url. The design below is correct under
either reading because the clock starts at `added`.

**One THINKING block from `added` to the CDN url, the upload awaited inline
(Andrew, 2026-09-22).** On the image `added`: close the text block (the TEXT
split), open a THINKING block, blank, and send it with `isThinking: true`.
The client's `ThinkingSection` ticks on its own from there, exactly as it
does for Meta, and "Grok is using a tool" is visible for the whole of
generation. On `done`: the rewritten `prompt` is now known, so re-send the
same ordinal with `content = item.prompt`, still ticking, then `await` the
upload as a plain statement. When the url is back, close the THINKING block
with **one** duration, `added` → url, and send the `IMAGE_GEN` block at the
next ordinal with its attachment.

**The server holds text while the image block is open.** Any
`output_text.delta` that arrives between `added` and the url is appended to
`heldText` and not sent (unobserved in both probe runs, where the model was
blocked on its tool, but the order is never the same twice, §2). After the
`IMAGE_GEN` frame the held text opens a TEXT block and goes out as one
frame. Releasing it *over time* is the client's job (step 7): the server
gates, the client meters. An encrypted reasoning `done` inside that window
is likewise unobserved; if it ever shows up, hold its id the same way and
emit the placeholder after the image.

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

Tool equipping: **done (`f6113ea`)**. `resolveResponsesTools` in
`stream-workup.ts` adds `{ type: "image_generation", action: "auto" }` for
4.6 / 4.7 on the chat path (§3).

Typecheck + lint clean before step 5.

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
  by ordinal, so the block flows through `deriveDraft` unchanged, carrying
  `inlineImageData`.
- `apps/web/src/lib/ui-message-helpers.ts` `toMessageBlocks`: for a
  DB-loaded `IMAGE_GEN` block, derive `inlineImageData` from
  `MessageBlockSingleton.attachments[]` — FINAL if present, else the highest
  `seriesOrdinal` — reading width, height, and kind off
  `inlineImageGenOutput`. This is the one place the hydrated shape and the
  streamed shape meet.
- **New: an inline image-block component** (`apps/web/src/ui/chat/image-gen-block/`
  or similar). Props: `InlineImageData`. It renders exactly one frame and
  never sorts anything; the FINAL-else-latest-PARTIAL decision was made by
  the producer (the server on the stream, `toMessageBlocks` on hydration).
  Renders `next/image` with `placeholder="blur"` and
  `blurDataURL={shimmer([width, height])}` from `@slipstream/ui`'s
  `lib/shimmer.ts`, so nothing flashes between the CDN url arriving and the
  bytes painting. The wait *before* the url is the THINKING block (§8.4a),
  not this component. Partials never render consecutively: the block is one
  slot that sharpens.
- **Client-side text pacing (§8.4a).** When the store's draft receives a
  burst of text frames (the deltas that buffered while the server awaited an
  upload), drain them into the rendered draft at a fixed rate instead of in
  one paint. A queue in `state/chat/store.ts` `applyChunk`, drained by
  `requestAnimationFrame` while it holds more than N frames; empty queue =
  today's behaviour. Provider-agnostic.
- `apps/web/src/ui/chat/message-bubble/index.tsx`
  `renderedMessageBlocks`: an `IMAGE_GEN` case that renders that component
  at the block's ordinal.
- **Double-render rule.** The `IMAGE_GEN` attachments are also on the
  message's `attachments` list, so the trailing attachment group must skip
  any attachment with a `messageBlockId` (committed) or whose `cdnUrl`
  derives to the same series id as an `IMAGE_GEN` block's
  `inlineImageData.cdnUrl` (streaming, step 2's slice), or the image draws
  twice — once inline, once below. This is about slot ownership, not loading; both
  cases are one filter. The
  trailing group is otherwise unchanged and keeps rendering user uploads
  and pure-image-lane outputs as today (it can adopt the same shimmer
  placeholder for its own loading, but that is independent of this work).
- `ThinkingSection` and the text renderer are untouched.

### Step 8 — cut over

- ~~`xai/index.ts` imports the v2 service.~~ Done 2026-09-22: it extends `GrokResponsesApiLinearService`.
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
| B | step 1 (schema: block type, one-to-many, `InlineImageGenOutput`; migration + rebuilds) — **landed 2026-09-22** (`20260922234809_added_inline_image_gen_output_table`) |
| C | step 2 + 3 (types, persist link) |
| L | `responses-api-linear.ts` + cut-over in `xai/index.ts` — **landed 2026-09-22** |
| D | step 4 (the image branches in `responses-api-linear.ts`) |
| E | step 5 (job entry) + router |
| F | step 7 (web) |
| G | delete `responses-api.ts` |

L absorbed the risk D used to carry; D is now additive branches in a
live, tested file. Everything after it is small.

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

---

## 9. Persist splice: `inlineImageGenAgg` → `handleAiChatResponse`

State on 2026-09-23: `AIChatResponseDb` carries
`inlineImageGenAgg?: InlineImageGenAggProps[]` (the DB-ready attachment shape
from `inlineImagePostUploadObj`, now exported by `@slipstream/types`), and
`apps/ws-server/src/prisma/chat-response.ts` has an empty
`inlineImageGenAggWorkup` stub plus a `const xox = data.inlineImageGenAgg`
placeholder. Six cuts, in file order. Nothing in the job-lane path moves.

### 9.1 The helper: rows to create, and which block each row belongs to

The agg entry is already the attachment row. Two things stand between it and
Prisma: `size` is a number and the column is `BigInt`, and the two children
ride as plain objects where Prisma wants `{ create }`. `audio` and `document`
are `null` on the entry and are relations on the input, so they come off.

The pairing uses the url anatomy (step 2): the block's wire `cdnUrl` encodes
the series id, the entry carries `seriesId` as a column. Matching on the
series rather than the exact url means partials pair to their block too,
when an OpenAI facilitator gets blocks.

```ts
import type { AttachmentUncheckedCreateWithoutMessageInput } from "@slipstream/db/node/generated/models";
import type { InlineImageGenAggProps } from "@slipstream/types";

  protected inlineImageGenAggWorkup({
    inlineImageGenAgg,
    messageBlocks
  }: {
    inlineImageGenAgg: InlineImageGenAggProps[];
    messageBlocks: AIChatResponseDb["messageBlocks"];
  }) {
    const creates = Array.of<AttachmentUncheckedCreateWithoutMessageInput>();
    const links = Array.of<{ cdnUrl: string; ordinal: number }>();

    for (const entry of inlineImageGenAgg) {
      const {
        audio: _audio,
        document: _document,
        image,
        inlineImageGenOutput,
        size,
        ...scalars
      } = entry;

      creates.push({
        ...scalars,
        size: size != null ? BigInt(size) : undefined,
        image: { create: image },
        inlineImageGenOutput: { create: inlineImageGenOutput }
      } satisfies AttachmentUncheckedCreateWithoutMessageInput);

      for (const block of messageBlocks ?? []) {
        if (block.type !== "IMAGE_GEN" || !block.inlineImageData) continue;
        const url = block.inlineImageData.cdnUrl;
        const basename = url.slice(url.lastIndexOf("/") + 1);
        const stem = basename.slice(14, basename.lastIndexOf("."));
        const blockSeriesId = stem.slice(0, stem.lastIndexOf("-"));
        if (entry.seriesId === blockSeriesId && entry.cdnUrl) {
          links.push({ cdnUrl: entry.cdnUrl, ordinal: block.ordinal });
        }
      }
    }

    return { creates, links };
  }
```

`userId` and `conversationId` are already scalars on the entry, so the stub's
two extra params go. The unchecked input is the right one here: the entry
carries FK scalars, exactly as the builder wrote them (the job lane's
`mapImgs` uses the checked form with `user: { connect }`; both are fine per
element, and this branch has its own `create` array anyway).

### 9.2 Call site, replacing `const xox`

```ts
    const inline =
      data.inlineImageGenAgg && data.inlineImageGenAgg.length > 0
        ? this.inlineImageGenAggWorkup({
            inlineImageGenAgg: data.inlineImageGenAgg,
            messageBlocks: data.messageBlocks
          })
        : undefined;
```

### 9.3 The nested create gains a third arm

```ts
              attachments: mapImgs
                ? { create: mapImgs }
                : mapAudio
                  ? { create: [mapAudio] }
                  : inline
                    ? { create: inline.creates }
                    : undefined,
```

`messageType` and `isImageGen` stay driven by `imgGenEnabled`, which the
chat path sends as `false`, so this is a `TEXT` message. `content` falls to
`data.chunk` because the chat path sends no `imgGenFields`.

### 9.4 The include: one more relation, ordered by `ordinal`

In the `conversation.update` include, under `attachments.include`, add
`inlineImageGenOutput: true` (additive; `AttachmentSingleton` already has
the optional field). And order the tandem by `ordinal`, not `createdAt`:
`Message` has `@@unique([conversationId, ordinal])`, so it is indexed and
deterministic, and it is the column that defines message order.

```ts
          messages: {
            orderBy: { ordinal: "desc" },
            take: 2,
            include: {
              …
              attachments: {
                include: {
                  imageGenOutput: true,
                  audioGenOutput: true,
                  inlineImageGenOutput: true,
                  image: true,
                  document: true,
                  audio: true
                }
              }
            }
          },
```

The same include is written out again in 9.5. Two copies; it becomes a
getter only if a third reader appears.

### 9.5 After the transaction: claim the rows, pull a fresh tandem

Andrew's form (2026-09-23). The transaction is untouched; the inline `else
if` arm in its return chain goes, so an inline turn returns through the
existing `TEXT` branch. After the transaction resolves, and only when there
are links: set `messageBlockId` on each row, then read the conversation
again with the same include and return the result with `convo` replaced.

Why the second read is required and not cosmetic: `applyResponse` on the
client calls `ingestConversation(evt.convo)` and drops the draft. From then
on the committed AI message renders from `convo.messages[0]` alone; the
response's wire `messageBlocks` array is not read by the store. A DB
`IMAGE_GEN` block carries no url, so the client finds the image only through
the attachment's `messageBlockId`. A `convo` read before the link would
render the slot empty and the image in the trailing group until reload.

```ts
    const transaction = await this.prismaClient.$transaction(async t => {
      …unchanged…
    });

    if (inline && inline.links.length > 0) {
      const aiMsg = transaction.convo.messages.find(
        m => m.id === transaction.aiMsgId
      );
      for (const link of inline.links) {
        const msgBlock = aiMsg?.messageBlocks?.find(
          v => v.ordinal === link.ordinal
        );
        if (!msgBlock) continue;
        await this.prismaClient.attachment.updateMany({
          where: { messageId: transaction.aiMsgId, cdnUrl: link.cdnUrl },
          data: { messageBlockId: msgBlock.id }
        });
      }

      const fresh = await this.prismaClient.conversation.findUniqueOrThrow({
        where: { id: transaction.convo.id },
        include: { /* the 9.4 include, copied */ }
      });
      const { messages, ...c } = fresh;
      const s = messages.map(p => { /* the bigint → number mapping, copied */ });
      return { ...transaction, convo: { ...c, messages: s } };
    }

    return transaction;
```

`updateMany` by `messageId` + `cdnUrl` needs no null guard on the nullable
column and touches only rows this create made. One `updateMany` per image
and one read, on image turns only; text-only turns never enter the `if`.

**The mapping and the include are copied, not extracted.** Two call sites;
a helper would need a Prisma include-payload type in its signature with
bigint conversions inside, and that costs more than the duplication. It
gets a method at the third site.

**The cost, named:** the link runs after the commit. If the process dies
between the two, the message exists with unlinked rows and that turn's
image renders in the trailing group until something re-links it (the url
anatomy makes that recoverable). Accepted for a one-off image turn in
exchange for keeping the transaction body untouched; the inside-the-
transaction form with a re-read closes the window if it ever matters.

### 9.6 The xAI handler feeds it: two lines

In `responses-api-linear.ts`, the `roundTrack` push carries the block's
image data, and the persist call passes the agg:

```ts
      for (const block of trackedBlocks) {
        roundTrack.push({
          type: block.type,
          content: block.content,
          durationMs: block.durationMs,
          ordinal: block.ordinal,
          conversationId,
          inlineImageData: block.inlineImageData
        });
      }

      const d = await this.prisma.handleAiChatResponse({
        …,
        imgGenEnabled: false,
        inlineImageGenAgg:
          inlineImageGenAgg.length > 0 ? inlineImageGenAgg : undefined,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
        …
      });
```

`roundTrack`'s `inlineImageData` is the server-side `BlockImgData`, a
superset of the four wire fields, so it assigns without a cast. It also
rides on the `ai_chat_response` frames as-is; if you want the final frame to
carry only the four wire fields, map it there.

### 9.7 What the client then has

- **Streaming:** the `IMAGE_GEN` chunk frame with `inlineImageData` (four
  fields) at its ordinal.
- **At completion:** `ai_chat_response.messageBlocks` (the `IMAGE_GEN` block
  with its data) and `convo.messages[0].attachments[]` with `messageBlockId`
  set and `inlineImageGenOutput` populated, from the re-read.
- **On reload:** the DB block plus its attachments by `messageBlockId`;
  `toMessageBlocks` derives `inlineImageData` from them (step 7).

---

## 10. Web investigation: how the client renders blocks and attachments today

Read-only survey of `apps/web`, `packages/ui`, and `packages/types`,
2026-09-23, before any web code is written for `IMAGE_GEN`. Findings only;
the approach is decided after this, and step 7 will be rewritten from it.
Line numbers are as of commit `d18b555`.

### 10.1 Streaming path (chunk frames → the draft bubble)

- `store-registry.ts:139` routes every `ai_chat_chunk` to
  `ChatStore.applyChunk` (`state/chat/store.ts:220-229`), which appends the
  raw frame to `draftSnapshot`. Nothing else happens per frame.
- `ai-chat-context.tsx:171-174` folds the draft with `deriveDraft` in a
  `useMemo`. `deriveDraft` (`lib/draft-to-message.ts:94-170`):
  - `mergeBlock` (36-43) replaces the block at the same ordinal wholesale
    and re-sorts (`orderBlocks`, 30-31). A later frame for an ordinal wins.
  - `textFromBlocks` (45-49) keeps `TEXT` only; `thinkingTextFromBlocks`
    (51-55) and `thinkingDurationFromBlocks` (57-64) keep `THINKING` /
    `ENCRYPTED_THINKING` only (`isThinkingBlock`, 33-34).
  - `isThinking` (132-137) takes `evt.isThinking` when it is a boolean, else
    `isThinkingBlock(latest)`. Every xAI frame sets the boolean, so an
    `IMAGE_GEN` frame with `isThinking: false` behaves.
  - `derived.blocks` keeps the wire blocks intact, `inlineImageData`
    included. The context exposes them as `streamingMessageBlocks`
    (`ai-chat-context.tsx:213`); **no UI reads that field.**
- `streamingMessageFromDerived` (`draft-to-message.ts:204-242`) builds the
  bubble's message: id `streaming-${conversationId}` (208); `messageType`
  is `IMAGE_GEN` only via the job-lane `imgGenEnabled` flag, else `TEXT`
  (215-219); `attachments` come from `imgGenAttachments(derived.imgGenFields)`
  (182-196), job lane only, so an inline turn streams with **no
  attachments**; `messageBlocks` is `toMessageBlocks(id, [...derived.blocks])`
  (240).
- **`toMessageBlocks` drops `inlineImageData`.** `lib/ui-message-helpers.ts:25-35`
  promotes a wire block by enumerating nine fields; the DB branch (18-23)
  spreads. So the streaming bubble's blocks carry no url, size, or kind.
  The promoted type is `MessageBlockSingleton<true>`, which has no image
  field (`packages/types/src/types.ts:146-151`).
- `dynamic/index.tsx:119-125` appends the streaming message to the committed
  list; `chat-feed/index.tsx:190-231` passes the `live*` props only to the
  bubble whose id starts with `streaming-`.

### 10.2 Committed and hydrated paths

- **Live commit.** `store.ts:239-257` `applyResponse` →
  `ingestConversation(evt.convo)` (159-173): split, upsert by id,
  `rebuildCommitted` sorts by `ordinal` (`message-workup.ts:26-31`). The
  draft is dropped. The AI message is `convo.messages[0]`
  (`message-workup.ts:55-59`). The response's own `messageBlocks` array is
  never read (§10.8 rule holds by construction).
- **What the live commit carries** comes from
  `apps/ws-server/src/prisma/chat-response.ts:257-277`: `messageBlocks: true`,
  attachments with `imageGenOutput`, `audioGenOutput`,
  **`inlineImageGenOutput: true`** (269), `image`, `document`, `audio`; the
  post-transaction fresh pull uses the same include (§9.5).
- **SWR hydration** (`hooks/use-hydrate-chat-store.ts:21-27` →
  `store.hydratePage` → `ingestConversation`). Loader
  `hooks/use-conversation-messages.ts:68-81`: page 0 hits
  `app/api/users/[userId]/chat/[conversationId]/route.ts:31`, older pages
  `messages/[cursorId]/route.ts:45`; both call
  `PrismaUserMessageService.getConversationMessagesPage` (`orm/index.ts:13`).
- **The hydration include lacks the lineage relation.**
  `orm/user-message-service.ts:161-191`: `messageBlocks: { orderBy: { ordinal:
  "asc" } }` (175); attachments include `audioGenOutput, image, video,
  document, imageGenOutput, audio` (178-185). **`inlineImageGenOutput` is
  not there.** `messageBlockId` does come through (a scalar on
  `Attachment`). Same gap in `getMsgsByCursorId` (113-135) and
  `getMessagesByConversationIdWithAssets` (237-261);
  `getMessagesByConversationId` (36-47) loads no attachments at all.
  `bigIntToIntMsg` (49-84) spreads the attachment, so the relation would
  pass through once selected. Net: **a live commit and a reload return
  different attachment shapes today.**
- **The WS prewarm is a fourth producer** (see
  `architectural-decisions/2026-06-26/conversation-hydration.md`). Once page 0
  is visible and has a `nextCursor`, `ConversationHydrationProvider`
  (`context/convo-hydration-context.tsx`) sends `hydrate_conversation`; the
  ws-server's `PrismaConvoHydrationService` async generator
  (`apps/ws-server/src/prisma/convo-hydration.ts:103-127`) yields pages
  (`ordinal < cursor`, `messageBlocks` ordered asc) that come back on one
  `hydrate_conversation_ack` and are written straight into SWR cursor keys
  (`["cursor", userId, conversationId, cursorOrdinal]`, keys from
  `lib/conversation-pages.ts`) with `revalidate: false`. They never touch the
  store until `useLoadOlderHistory` bumps SWR `size`; then they flow through
  `hydratePage` → `ingestConversation` like any fetched page. **Its include
  (116-122) lists `imageGenOutput, audioGenOutput, image, document, audio`
  and not `inlineImageGenOutput`**, so the mapper's `inlineImageGenOutput ??
  undefined` (38-40) always resolves to `undefined`.
- **Shape parity is a four-producer problem, and the prewarm is the one
  that carries the volume.** A message can reach the store from the live
  commit (`chat-response.ts`, has the lineage), the page-0 route, a cursor
  route, or a prewarmed cursor key (all three missing it). In practice the
  client fetches only the first page (`CONVERSATION_PAGE_SIZE = 12`), the
  server then pushes every remaining page within milliseconds, and the
  viewport observer's upward trigger resolves each older page from the warm
  key; the cursor route only fires when a key is cold. So **every message
  beyond page 0 normally arrives through the prewarm generator**, which
  makes its include the first of the three to fix, not the last. The bubble
  renders whichever shape it was handed, so the same message can render
  differently depending on how it arrived.
- Blocks are never loaded with their `attachments` relation anywhere; the
  only block → image path is `message.attachments.find(a => a.messageBlockId
  === block.id)`, and **no such lookup exists in `apps/web`.**

### 10.3 The bubble (`ui/chat/message-bubble/index.tsx`)

- `orderedMessageBlocks` (128-142), AI only, sorted by ordinal;
  `latestMessageBlock` (145); `blockOrdinalKey` (146).
- Committed blocks get async markdown (453-516) through
  `processMarkdownToReact` with no type filter, so an `IMAGE_GEN` block's
  content (the prompt) is markdown-processed too. Cache key
  `block-${message.id}-${ordinal}-${type}-${len}` (482).
- **`renderedMessageBlocks` (518-582) has exactly two branches.**
  `THINKING` / `ENCRYPTED_THINKING` (538-554) → `<ThinkingSection>` keyed
  `${message.id}-thinking-${ordinal}`, live only when streaming AND
  `liveIsThinking === true` AND it is the latest block (532-536).
  **Everything else** (556-569), which today includes `IMAGE_GEN`, → a
  `<div>` keyed `${message.id}-text-${ordinal}` with the content as
  streamed or processed markdown. Empty content is skipped (556-558). So an
  `IMAGE_GEN` block currently renders its prompt as a paragraph.
- **Keys include `message.id`** (541, 562). When the `streaming-<id>` message
  is replaced by the committed row at `applyResponse`, every block remounts.
  An inline image rendered at its block would remount at that moment and
  show its placeholder again.
- **Job-lane image logic** (`imageGenerationData`, 193-336): reads
  `liveImgGenFields` via `normalizeImgGenFields`; falls back to
  `message.attachments.filter(att => att.imageGenOutput !== null)` (264-270).
  Inline rows have `imageGenOutput: null`, so they are excluded from it.
  Renders `<ImageGenerationCanvasTest>` (679-696); else, when attachments
  exist AND `messageType === "IMAGE_GEN"`, a second canvas over every
  attachment url (697-728). Inline turns are committed as `TEXT`, so they
  miss this too.
- **The trailing attachment group (730-745) renders nothing visible for AI
  messages.** The label is `sr-only` for AI (735-738) and
  `<AttachmentDisplay>` mounts **only for USER** (741-743). There is no
  filtering because there is nothing to filter. What does happen: the bubble
  widens to `w-[85%]` whenever `attachments.length > 0` (604-608).
- Net for a committed inline turn today: the image row is present on the
  message and **renders nowhere**; the block renders the prompt as text; the
  bubble is widened.
- `liveImgGenEnabled` is destructured and unused (39, 67-79).
  `liveImgGenAttachmentId` reaches any bubble while `imgGenFields` is defined
  (`chat-feed:194-202`). `MessageBubble` is `memo`'d (776).

### 10.4 The existing image component

- **`ImageGenerationCanvasTest`** (`ui/chat/image-gen/index.tsx`; it lived in
  `test.tsx` until 2026-09-24, when Andrew moved it into the previously
  unreferenced `index.tsx`, fixed the bubble's import, and deleted
  `test.tsx`) is the one the bubble uses. The bubble picks FINAL vs latest PARTIAL, not the
  component: it sorts by `imageGenOutput.seriesIndex`, dedupes by `cdnUrl`,
  passes `currentImageIndex = urls.length - 1`; `kind === "FINAL"` ends
  `isGenerating` (`message-bubble:221-251, 272-294`).
- Inside: refs + state update the displayed url / width / height / id /
  kind **only when the new value differs and is truthy** (29-87). The last
  good image stays on screen between frames. That is the zero-flicker
  mechanism.
- One `next/image` `<Image>` with **no `key`**, so it is not remounted when
  `src` changes (107-117): `width={w} height={h}`, `style={{ aspectRatio: w /
  h }}`, `object-cover`, `priority`, `placeholder="blur"`,
  `blurDataURL={shimmer([w, h])}`.
- The container is a fixed **`aspect-square w-full max-w-3xl rounded-2xl`**
  (93); the image is `object-cover` inside it, so a 16:9 image is cropped to
  a square. PARTIAL overlays: `scanning-line`, `animate-pulse-glow` corners
  (119-128); a `ripple-container` and a "Generating image…" pill with the
  prompt show until the first url (94-100, 169-183).
- `ImageGenerationCanvas` (`image-generation-canvas.tsx`) and `series-stack.tsx`
  are unreferenced today and **stay on purpose**: they are the basis for a
  future replay of partial-image output. Don't prune. The generic
  `AttachmentDisplay` image branch
  (`attachment-display/index.tsx:179-241`) is a fixed `h-64` box with
  `<Image fill object-contain>`, no placeholder; USER messages only.

### 10.5 Shimmer, image config, sizing

- `packages/ui/src/lib/shimmer.ts`: `shimmer([w, h])` returns a
  `data:image/svg+xml;base64,…` animated gradient; exported from
  `packages/ui/src/index.ts:264-265`. Used in the canvas
  (`image-gen/index.tsx`) and `ui/auth/index.tsx:80` only.
- `next.config.ts` `images.remotePatterns` lists `assets.aicoalesce.com` and
  `assets-dev.aicoalesce.com` (https). **`unoptimized: true` is set
  globally**, so `next/image` serves the CDN url as-is; `placeholder="blur"`
  with an explicit `blurDataURL` still works.
- No component sizes an image from its real width and height: both canvases
  are `aspect-square`, `AttachmentDisplay` is `h-64`.
  `ui/atoms/aspect-ratio-shape/index.tsx:24-34` computes a w/h fit;
  `packages/ui/src/lib/scale-ratio.ts` exists (not read).

### 10.6 Thinking UI (`ui/chat/thinking/index.tsx`)

- Props: `thinkingContent`, `isStreaming`, `duration` (ms), `className`,
  `isThinking` (18-24). While `isThinking`, a `requestAnimationFrame` loop
  from `performance.now()` drives `displayDuration` at ~10 Hz, 0.1 s
  precision (45-84); when not thinking, `round(duration / 1000, 1)` (87-106).
- Header is hard-coded: "Thinking for" / "Thought for" + `<AnimateNumber>`
  (motion-plus) + "seconds…" (173-190), spinning `Sparkles` while thinking
  (154-172). Body is a collapsed-by-default Radix `Accordion` (197-216).
- **No per-type variant.** The image THINKING block would read "Thinking
  for 4.2 seconds…" with "*Generating Image...*" hidden inside the collapsed
  accordion.

### 10.7 Types in play

The singleton types preserve the database relations, nothing more, nothing
less (`packages/db/erd/ERD.mmd` is the source; the one tolerated deviation
is an omitted back-mapping to `User` where it caused trouble). The edges
this feature rides on: `Attachment }o--|o MessageBlock` (the block's
`attachments[]` is the back-relation), `ImageMetadata |o--|| Attachment`,
`InlineImageGenOutput |o--|| Attachment`. `MessageBlock` has no image-shaped
edge, so `MessageBlockSingleton` gets no image field — the streaming path
synthesizes the attachment instead (§10.11 b).

- `MessageBlockSingleton<T>` (`types.ts:146-151`): Prisma `MessageBlock`
  (`id, conversationId, messageId, ordinal, content, type, durationMs,
  createdAt, updatedAt`) + `message?` + `attachments?: AttachmentSingleton<T>[]`.
  No image field.
- `AttachmentSingleton<T>` (`types.ts:220-234`): includes the
  `messageBlockId: string | null` scalar, `imageGenOutput: … | null`,
  `image: … | null`, and `inlineImageGenOutput?: InlineImageGenOutputSingleton<T>`
  (233, optional).
- `InlineImageGenOutputSingleton` (`types.ts:84-88`): `kind, provider,
  facilitatingModel, generatingModel, seriesId, seriesOrdinal, attachmentId,
  width, height, mime, ext, revisedPrompt?`.
- `ChatChunkAndResInlineImageData` (`contract/ai-chat-events.ts:47-52`) =
  `{ width, height, cdnUrl, kind }`; `ChatChunkAndResMsgBlock` (54-61) adds
  `inlineImageData?`. `$Enums.MessageBlockType` =
  `ENCRYPTED_THINKING | THINKING | TEXT | IMAGE_GEN`.

### 10.8 Text pacing

- **None exists.** Streaming text re-renders synchronously from
  `processStreamingMarkdown` (`lib/markdown-streaming.tsx:25`) on every
  draft change (`message-bubble:159-162, 564-565`). The only frame
  coalescing is `hooks/use-chat-ws.ts:38-44` (`lastEventCb`, one call per
  frame), and the chat store bypasses it: `store-registry.ts:139` receives
  events directly from `addListener`, one `applyChunk` per frame. The only
  rAF loops in chat UI are the ThinkingSection timer and scroll-to-bottom
  (`chat-feed:131-153`). `ui/atoms/animated-reveal` is a menu demo, not a
  text revealer.

### 10.9 Gaps for `IMAGE_GEN`, as they stand

1. `renderedMessageBlocks` has no `IMAGE_GEN` case; the block renders its
   prompt as text (556-569), and the async markdown pass processes it.
2. `toMessageBlocks` drops `inlineImageData` (`ui-message-helpers.ts:25-35`),
   so the streaming bubble has no url, size, or kind for the block.
3. `MessageBlockSingleton` has no image field **and must not get one**:
   image data is a child of `Attachment` (`ImageMetadata`,
   `InlineImageGenOutput`). The block → attachment lookup by
   `messageBlockId` exists nowhere in the client yet.
4. The streaming message has no attachments for an inline turn
   (`imgGenAttachments` covers the job lane only), so nothing on it carries
   the url. The job lane solves the same problem by synthesizing
   committed-shaped attachments from the wire (`lib/img-gen-to-attachment.ts`);
   the inline lane can do the same from the block's `inlineImageData`, keyed
   to the block by the synthetic id `toMessageBlocks` mints, so committed and
   streaming resolve through one path.
5. Four producers, one with the lineage: the live commit includes
   `inlineImageGenOutput`; the web page-0 loader, the cursor loader, and the
   ws-server prewarm generator (`convo-hydration.ts:116-122`) do not. One
   include line in each of the three (plus `getMsgsByCursorId` and
   `getMessagesByConversationIdWithAssets` if they stay in use).
6. The feed keys every bubble by `message.id` (`chat-feed/index.tsx:207`),
   so the streaming → committed swap remounts the whole bubble; block keys
   are irrelevant to it and nothing inside the bubble can prevent it. It
   does not need preventing: the committed image has the same `src`, the
   browser has it cached from the streaming paint, and `next/image` removes
   the blur placeholder as soon as the mounted `img` reports `complete`.
   The job lane's canvas remounts the same way today with no visible flash.
7. The trailing group renders nothing for AI messages, so there is no
   double render to filter; the plan's step 7 premise is inverted. The
   bubble does widen to `w-[85%]` when the message has attachments.
8. The only image canvas is `aspect-square` with `object-cover`; a
   non-square inline image would be cropped.
9. ~~`ThinkingSection` has one label~~ — not a gap; the component stays untouched by design (§10.11 g).
10. There is no client-side text pacing; the post-upload burst lands as one
    synchronous re-render.

### 10.10 Corrections this makes to step 7

- Drop the "double-render rule" bullet: nothing renders in the AI trailing
  group. Replace with the `w-[85%]` observation.
- `toMessageBlocks` is a projection, not a derivation (§10.1); the fix is
  the derived `UIMessageBlock` spread, not a field added to the enumeration.
- Add: every producer of message rows needs `inlineImageGenOutput: true` —
  the two web loaders AND the ws-server prewarm generator, or prewarmed
  pages render the image differently from fetched ones.
- Add: the streaming → committed remount is at the feed level and is
  harmless for a cached `src`; no key gymnastics.
- Add: `unoptimized: true` is global, so `next/image` sizing comes entirely
  from the props we pass.
- The client-side text pacing item stays open; there is no existing hook to
  attach it to.

### 10.11 Targeted changes, one snippet per gap

Proposals against the code as read in §10.1–10.9. Nothing here is applied.
Each is the smallest change that closes its gap; together they are step 7.

**(a) Gap 5, shape parity — one line in each producer. Done 2026-09-24
(Andrew).** Prewarm first, since it carries every page beyond page 0. And the mirror-image gap while
in there: the web loaders include `audioGenJob` beside `imageGenJob` (the
ERD gives both the same `|o--|| Message : requestMessage` edge), but the
live commit (`chat-response.ts:264`, `:505`) and the prewarm generator's
include (`convo-hydration.ts:112`) carry `imageGenJob` only. Nothing reads
`message.audioGenJob` on the client yet; the point is that all four
producers return the same message shape.

```ts
// apps/ws-server/src/prisma/convo-hydration.ts:116   (prewarm generator)
// apps/web/src/orm/user-message-service.ts:178        (page 0)
// apps/web/src/orm/user-message-service.ts:124, 247   (cursor fallback, with-assets)
                include: {
                  imageGenOutput: true,
                  audioGenOutput: true,
                  inlineImageGenOutput: true,   // ← the one line
                  image: true,
                  document: true,
                  audio: true
                }

// and on the message include of the live commit + prewarm generator:
              imageGenJob: true,
              audioGenJob: true,                // ← already present in the web loaders
```

**(b) Gap 4, the streaming message synthesizes the attachment from the
frame's template.** Blocks stay blocks; the image is an attachment, exactly
as it is once persisted. The `IMAGE_GEN` chunk frame carries the DB-ready
row (`inlineImgGenData`, singular on a chunk, step 2) beside the block, so the client adds only what
Prisma would mint — temp `id`, `messageBlockId`, `messageId`, timestamps —
and nothing is placeholdered or parsed from the url. `messageBlockId` uses
the same id scheme `toMessageBlocks` mints for the block, so the join holds
by construction. The synthetic row is display-only; the committed row
replaces it wholesale at `applyResponse`.

The type is the **read** shape, not `InlineImageGenAggProps`. The agg is the
create shape: it strips `id`, timestamps, `messageId`, `messageBlockId` and
the relations because Prisma mints or scopes them — and those are exactly
what the client adds. Same row, other side of persist:

```ts
// packages/types (beside InlineImageGenAggProps)
export type InlineImageAttachment = DX<
  Rm<AttachmentSingleton<true>, "image" | "inlineImageGenOutput"> & {
    image: ImageSingleton;
    inlineImageGenOutput: InlineImageGenOutputSingleton<true>;
  }
>;
```

Why the agg can `Rm` what it does: on `AttachmentSingleton` the relations
whose presence depends on the query's include are optional (`providerLinks?`,
`providerStoreDocs?`, `userStoreDoc?`, `ttsJob?`, `dictationJobs?`,
`inlineImageGenOutput?`), and the five every standard include selects are
required-nullable (`image`, `document`, `audio`, `imageGenOutput`,
`audioGenOutput`). The agg removes the conditional ones *before* `CTR`, or
`CTR` would turn "absent because not included" into "required". The read
shape above only tightens the two children this row always has.

```ts
// apps/web/src/lib/draft-to-message.ts — in the fold: pair the frame's
// template with the frame's IMAGE_GEN block (same frame, same ordinal)
    if (evt.inlineImgGenData && evt.messageBlocks?.type === "IMAGE_GEN") {
      inlineImages.push({ agg: evt.inlineImgGenData, ordinal: evt.messageBlocks.ordinal });
    }
// DraftDerivation gains `inlineImages: { agg: InlineImageGenAggProps; ordinal: number }[]`

// apps/web/src/lib/img-gen-to-attachment.ts (beside imgGenToAttachmentWorkup)
// `streamingMessageId` is the synthetic `streaming-${conversationId}` that
// streamingMessageFromDerived mints — the same value it hands toMessageBlocks —
// known from the first frame. The real AI message id never enters this path.
export function inlineImageAttachments(
  streamingMessageId: string,
  items: readonly { agg: InlineImageGenAggProps; ordinal: number }[]
) {
  const now = new Date();
  const out = Array.of<InlineImageAttachment>();
  for (const { agg, ordinal } of items) {
    const { image, inlineImageGenOutput, ...row } = agg;
    // the temp id is real identity: `${seriesId}-${seriesOrdinal}` is the
    // url stem, minted on the server, unique per frame. Replaced by the
    // cuid2 when `convo` hydrates the store at ai_chat_response.
    const attachmentId = `${inlineImageGenOutput.seriesId}-${inlineImageGenOutput.seriesOrdinal}`;
    out.push({
      ...row,
      id: attachmentId,
      messageBlockId: `${streamingMessageId}-block-${ordinal}`, // ← toMessageBlocks' scheme, same input
      messageId: streamingMessageId,
      generationGroupId: null,
      imageGenOutput: null,
      audioGenOutput: null,
      createdAt: now,
      updatedAt: now,
      image: { ...image, attachmentId, createdAt: now, updatedAt: now },
      inlineImageGenOutput: {
        ...inlineImageGenOutput,
        id: `${attachmentId}-inline`,
        attachmentId,
        createdAt: now,
        updatedAt: now
      }
    } satisfies InlineImageAttachment);
  }
  return out;
}

// apps/web/src/lib/draft-to-message.ts:236 — the streaming message gets both lanes' attachments
    attachments: [
      ...imgGenAttachments(derived.imgGenFields),
      ...inlineImageAttachments(id, derived.inlineImages)
    ],
```

Every field the row carries is the value persist will write, because it is
the same object. The only things minted here are the ids and timestamps,
and the two the agg set to `null` because the builder had to
(`document`, `audio`) come through as-is.

**(c) Gap 2, `toMessageBlocks` becomes a derivation anyway.** Not
load-bearing for the image now (the attachment carries it), but a
projection that predates a field will drop the next one too. Spread
properties are not excess-checked, so nothing is added to the singleton.

```ts
// apps/web/src/lib/ui-message-helpers.ts:25-35
    return {
      ...block,
      id: `${messageId}-block-${block.ordinal}`,
      messageId,
      createdAt: now,
      updatedAt: now
    } satisfies MessageBlockSingleton<true>;
```

**(d) Gap 3, one resolver, one path.** Streaming and committed messages
both answer through the attachments the block owns: FINAL if present, else
the highest `seriesOrdinal`. The block itself is never consulted for image
data.

```ts
// apps/web/src/lib/inline-image.ts (new)
export function inlineImageFor(
  block: MessageBlockSingleton<true>,
  attachments: AttachmentSingleton<true>[]
) {
  let pick: AttachmentSingleton<true> | undefined = undefined;
  for (const a of attachments) {
    if (a.messageBlockId !== block.id || !a.inlineImageGenOutput || !a.cdnUrl) continue;
    if (a.inlineImageGenOutput.kind === "FINAL") {
      pick = a;
      break;
    }
    if (
      !pick?.inlineImageGenOutput ||
      a.inlineImageGenOutput.seriesOrdinal > pick.inlineImageGenOutput.seriesOrdinal
    ) {
      pick = a;
    }
  }
  if (!pick?.inlineImageGenOutput || !pick.cdnUrl) return undefined;
  const { width, height, kind } = pick.inlineImageGenOutput;
  return {
    attachmentId: pick.id, // synthetic while streaming, the cuid2 after applyResponse
    width,
    height,
    kind,
    cdnUrl: pick.cdnUrl
  } as const;
}
```

`attachmentId` rides with the four render fields because the component
needs a DOM anchor (below), and the row is the only honest source of it:
the url stem (`${seriesId}-${seriesOrdinal}`) while streaming, the cuid2 once
the persisted row replaces it.

**(e) Gap 1, the bubble's `IMAGE_GEN` case.** Goes before the
`if (!blockContent) continue;` fallback at `message-bubble/index.tsx:556`,
and `message.attachments` joins the memo deps. `blockContent` is the prompt,
rendered as the subcaption **through the same two markdown renderers TEXT
uses** (Andrew, 2026-09-24): `processStreamingMarkdown` while streaming, and
the lazy-loaded `processMarkdownToReact` (`lib/processor.tsx`) once
committed — the async pass at 472-493 already processes every block with
content, `IMAGE_GEN` included, so nothing changes in either renderer. The
raw `block.content` is kept for the image's `alt`. The React `key` is the
block ordinal, never the attachment id: the id changes per frame
(`…-0`, `…-1`, the FINAL) and again at commit (stem → cuid2), while the
slot's ordinal is stable for its whole life, so partial → final updates in
place — the same reason the job lane keys the canvas by slot and lets the
id and src move underneath it.

```tsx
      if (block.type === "IMAGE_GEN") {
        const image = inlineImageFor(block, message.attachments);
        if (!image) continue; // an IMAGE_GEN block is only ever sent with its url
        rendered.push(
          <InlineImageBlock
            key={`${message.id}-image-${block.ordinal}`}
            attachmentId={image.attachmentId}
            image={image}
            alt={block.content}
            caption={
              isStreaming
                ? processStreamingMarkdown(blockContent)
                : (renderedBlockContent[blockOrdinalKey(block.ordinal)] ??
                  blockContent)
            }
          />
        );
        continue;
      }
```

**(f) Gap 8, the component: the canvas, made interleavable.** Andrew,
2026-09-24: "we should almost mimic all of it but it will be an
interleavable component like thinking block is." So `InlineImageBlock` is
`ImageGenerationCanvasTest` (`ui/chat/image-gen/index.tsx`) carried over
nearly whole — ref-gated display state (url, width, height, id, kind update
only on a truthy, changed value, so the last good frame stays up and a
PARTIAL → FINAL swap is an in-place `src` change), no `key` on `<Image>`,
the `ripple-container` and "Generating image…" pill for the no-url state,
the PARTIAL `scanning-line` and `animate-pulse-glow` corners, the FINAL-only
hover overlay with view / download, `placeholder="blur"` with
`shimmer([w, h])`, the `attachment-${id}` anchor — with three deliberate
differences:

1. **It is a block-level leaf, rendered at its ordinal** by the bubble's
   `IMAGE_GEN` case, interleaved between TEXT and THINKING blocks exactly as
   `ThinkingSection` is. Not the message-level canvas slot.
2. **Its caption arrives already rendered** (`caption: ReactNode`), like
   `ThinkingSection`'s `thinkingContent`; the bubble owns both markdown
   processors. The raw prompt is kept for `alt`.
3. **The container is sized from the real dimensions**, `aspectRatio:
   width / height` with `object-contain`, not `aspect-square` /
   `object-cover` (gap 8). `next/image` is globally `unoptimized`, so the
   props are for layout only.

The no-url state is inert for Grok today (an `IMAGE_GEN` block is only sent
with its url; the THINKING block before it owns the wait), but it stays so
the component is ready for a producer that opens the slot before the first
frame lands.

**No provider logic for PARTIAL vs FINAL (Andrew, 2026-09-24).** The canvas
treats every provider the same way — Meta, Gemini, Grok, OpenAI image jobs
all render through it flawlessly — because it reacts only to `kind` on the
frame in hand. The inline component does exactly that. A Grok inline frame
is FINAL by construction (its tool emits one frame); an OpenAI frame is
PARTIAL until the FINAL lands; the component never asks who sent it. For
context, not code: only Grok (4.6 / 4.7) and the OpenAI facilitators have
`image_generation` tooling to date, and of the two only OpenAI streams
partials.

```tsx
// apps/web/src/ui/chat/inline-image/index.tsx (new)
"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { $Enums } from "@slipstream/db/node/generated/client";
import { Button, Download, Eye, shimmer } from "@slipstream/ui";
import type { ChatChunkAndResInlineImageData } from "@slipstream/types";

interface InlineImageBlockProps {
  attachmentId: string;
  image: ChatChunkAndResInlineImageData;
  alt: string;
  caption: ReactNode; // already markdown-processed by the bubble's renderer of the moment
}

export function InlineImageBlock({ attachmentId, image, alt, caption }: InlineImageBlockProps) {
  const urlRef = useRef<string | null>(null);
  const kindRef = useRef<$Enums.ImageGenOutputKind | null>(null);
  const idRef = useRef<string | null>(null);
  const widthRef = useRef<number | null>(null);
  const heightRef = useRef<number | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [displayKind, setDisplayKind] = useState<$Enums.ImageGenOutputKind | null>(null);
  const [displayId, setDisplayId] = useState<string | undefined>(undefined);
  const [w, setW] = useState<number | null>(null);
  const [h, setH] = useState<number | null>(null);

  useEffect(() => {
    if (image.height !== 0 && heightRef.current !== image.height) {
      heightRef.current = image.height;
      setH(image.height);
    }
  }, [image.height]);
  useEffect(() => {
    if (image.width !== 0 && widthRef.current !== image.width) {
      widthRef.current = image.width;
      setW(image.width);
    }
  }, [image.width]);
  useEffect(() => {
    if (image.cdnUrl && urlRef.current !== image.cdnUrl) {
      urlRef.current = image.cdnUrl;
      setDisplayUrl(image.cdnUrl);
    }
  }, [image.cdnUrl]);
  useEffect(() => {
    if (attachmentId && idRef.current !== attachmentId) {
      idRef.current = attachmentId;
      setDisplayId(attachmentId);
    }
  }, [attachmentId]);
  useEffect(() => {
    if (kindRef.current !== image.kind) {
      kindRef.current = image.kind;
      setDisplayKind(image.kind);
    }
  }, [image.kind]);

  const isFinal = displayKind === "FINAL";
  const isGenerating = !displayUrl;

  return (
    <figure
      id={displayId ? `attachment-${displayId}` : undefined}
      data-attachment-id={displayId ?? undefined}
      className="my-3 w-full max-w-3xl">
      <div
        className="bg-muted group relative mx-auto w-full overflow-hidden rounded-2xl"
        style={w && h ? { aspectRatio: w / h } : undefined}>
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-500",
            isGenerating ? "opacity-100" : "opacity-0"
          )}>
          <div className="ripple-container" />
        </div>

        {displayUrl && w && h && (
          <div className="absolute inset-0 scale-100 opacity-100 transition-all duration-700 ease-out">
            <Image
              src={displayUrl}
              alt={alt}
              width={w}
              height={h}
              style={{ aspectRatio: w / h }}
              className="h-full w-full object-contain"
              priority
              placeholder="blur"
              blurDataURL={shimmer([w, h])}
            />
            {displayKind === "PARTIAL" && (
              <>
                <div className="scanning-line" />
                <div className="border-primary/30 animate-pulse-glow absolute inset-0 border-2" />
                <div className="border-primary animate-pulse-glow absolute top-2 left-2 h-8 w-8 border-t-2 border-l-2" />
                <div className="border-primary animate-pulse-glow absolute top-2 right-2 h-8 w-8 border-t-2 border-r-2" />
                <div className="border-primary animate-pulse-glow absolute bottom-2 left-2 h-8 w-8 border-b-2 border-l-2" />
                <div className="border-primary animate-pulse-glow absolute right-2 bottom-2 h-8 w-8 border-r-2 border-b-2" />
              </>
            )}
          </div>
        )}

        <div
          className={cn(
            "absolute inset-0 bg-black/0 transition-colors duration-300 hover:bg-black/20",
            (isGenerating || !isFinal) && "pointer-events-none"
          )}>
          <div
            className={cn(
              "absolute top-4 right-4 flex gap-2 opacity-30 transition-opacity duration-300",
              !isGenerating && isFinal && "group-hover:opacity-100 focus:opacity-100"
            )}>
            <Button size="icon" variant="ghost" className="bg-foreground/90 text-background hover:foreground backdrop-blur-sm">
              <Eye className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="bg-foreground/90 text-background hover:foreground backdrop-blur-sm"
              onClick={() => {
                if (!displayUrl) return;
                const link = document.createElement("a");
                link.href = displayUrl;
                link.target = "_blank";
                link.rel = "noreferrer noopener";
                link.download = displayUrl.slice(displayUrl.lastIndexOf("/") + 1);
                link.click();
              }}>
              <Download className="size-4" />
            </Button>
          </div>
        </div>

        {isGenerating && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="animate-fade-in space-y-4 text-center">
              <div className="bg-background/80 border-border inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-sm">
                <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
                <span className="text-sm font-medium">Generating image...</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <figcaption className="text-muted-foreground mt-2 text-xs">{caption}</figcaption>
    </figure>
  );
}
```

The download filename is the url's basename (`<ms>-<seriesId>-<ordinal>.<ext>`),
which beats the canvas's `generated-<Date.now()>`. The pill's prompt line is
gone because the caption below the figure is the prompt.

**(g) Gap 9 — closed, not a gap.** `ThinkingSection` is not touched, props
or otherwise (Andrew, 2026-09-24): it works, it is fully interleaved, and
only THINKING blocks drive it. The image's THINKING block is an ordinary
THINKING block and renders through it exactly as any other, "Thinking for
4.2 seconds…" with `*Generating Image...*` inside. The inline image is its
own interleaved component (f), rendered from the `IMAGE_GEN` block that
follows.

**(h) Gap 7, the trailing group.** Nothing to change: it renders no image
for AI messages. The `w-[85%]` widening at 604-608 applies to an inline
turn because it has attachments, and the image wants the width anyway.

**(i) Gap 6, the remount.** Nothing to change; see the corrected gap 6.

**(j) Gap 10, text pacing — the first, cheap step.** `applyChunk` notifies
once per frame instead of once per token; a burst of buffered deltas then
costs one fold and one paint per animation frame rather than one per
delta. This is coalescing, not metering; releasing the backlog *over time*
(a release cursor advanced by N frames per tick while the backlog is deep)
is the follow-on, and there is no existing hook to hang it on (§10.8).

```ts
// apps/web/src/state/chat/store.ts:220-229
  private draftNotifyHandle: number | undefined = undefined;

  public applyChunk(evt: AIChatChunk) {
    this.draftSnapshot =
      this.draftSnapshot !== undefined ? [...this.draftSnapshot, evt] : [evt];
    if (this.draftNotifyHandle === undefined) {
      this.draftNotifyHandle = requestAnimationFrame(() => {
        this.draftNotifyHandle = undefined;
        this.notify(this.draftListeners);
      });
    }
    if (this.phase === "awaiting-id") this.phase = "streaming";
    if (!this.isStreaming) this.isStreaming = true;
    if (typeof evt.title === "string") this.title = evt.title;
    this.commitStatus();
  }
```

Order that keeps prod unchanged until the last step: (a) → (c) → (b) → (d)
→ (f) → (e) → (j). Everything before (e) is invisible to a user.
