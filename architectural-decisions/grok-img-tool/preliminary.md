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
contain `-`, a cuid2 cannot), no defensive parsing. `mapImgs` in the
persist layer already derives the series id from the url path the same
way.

Why not a discriminated union on `type`, and why no `isInlineImage`
boolean: nineteen provider handlers build `roundTrack` entries as
`{ type: $Enums.MessageBlockType, … }`, and a union that requires the field
when `type` is `IMAGE_GEN` would stop every one of them compiling. The
optional field is additive. A boolean beside `type` would be a second copy
of the same fact, and TypeScript cannot couple two independent optionals
anyway; the client narrows on `inlineImageData !== undefined`.

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
   series id derived from `inlineImageData.cdnUrl`, and does its read. The
   branch's input shape is Andrew's.

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
| `output_item.done` handler | `image_generation_call` with `result` → skeleton §4 steps (1)–(6): prompt into the open block and re-send its ordinal; decode, specs, `await` the upload; close with `now − startedAt`; sub-fields (`inlineImageGenOutput` on the chat path, `imageGenOutput` + `jobId` on the job path); push and send the `IMAGE_GEN` block with `inlineImageData: { width, height, cdnUrl, kind: "FINAL" }` and `imgGenFields`; then `activeBlock = TEXT(heldText)`, `text = heldText`, so the existing bottom-of-loop text frame releases it |
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
