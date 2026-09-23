# Continuity — 2026-09-22 — Claude Fable 5.1

Session: `https://claude.ai/code/session_01MjRt7SNjwxBvqY8G3EDCPB`
Branch: `sweet-summer-child` (never push; commit locally when asked).
Previous note: `CONTINUITY/2026-09-18/anthropic/claude-fable-5-1.md` (STT lane). Read
this one first; it supersedes where they overlap.

---

## 0. Read these before doing anything

1. `architectural-decisions/grok-img-tool/preliminary.md` — findings + the 8-step plan (§8). **It is the spec.**
2. `architectural-decisions/grok-img-tool/reference/loop-skeleton.md` — the linear loop for the handler rewrite.
3. `architectural-decisions/grok-img-tool/reference/xai-responses-api-from-2026-03-29.md` — Andrew's hand-written March handler, zero closures. **The base for the rewrite.**
4. Memory files (auto-loaded): `feedback_linear_imperative_handlers`, `project_meta_muse_image_wire`, `project_grok_reasoning_effort_ceilings`, `feedback_formatting_not_a_gate`, `feedback_enum_exclude_over_keyed_event_unions`.

---

## 1. State of the tree at compaction

**2026-09-22, later:** everything below was committed as a checkpoint (see git log).
Landed in that checkpoint: the schema + migration `20260922234809_added_inline_image_gen_output_table`
+ regenerated client (commit B); `apps/ws-server/src/xai/responses-api-linear.ts`, Andrew's
own linearization of the current handler, routed from `xai/index.ts` and live-tested (tool
calling, image sharing, document sharing); `InlineImageGenOutputSingleton` in
`@slipstream/types`; `grokFacilitatingImgGenModel` gating the image tool; the doc rewrites.

**Flagged, not edited (Andrew's file):** `packages/types/src/types.ts`
`MessageBlockSingleton.attachments?: AttachmentSingleton<T>` should be `AttachmentSingleton<T>[]`
(the relation is `Attachment[]`).

`pnpm db:migrate` / `db:generate` / rebuilds are Andrew's (never check dist freshness, never
remind him). **Never run prisma CLI commands.**

---

## 2. What was done this session (commits, newest first)

| commit | what |
| --- | --- |
| `d3c8d24` | plan: block→attachments one-to-many, `InlineImageGenOutput`, no job for one-offs |
| `48188c9` | doc: keepalive already handled by SSE parser (`xai/response-sse.ts:13`) |
| `541c30f` | `reference/loop-skeleton.md` |
| `f6113ea` | xAI tool equipping by model; `reasoningByModel` single effort source; per-model effort ceilings in `InputReasoningProps<T>` |
| `5a789ee` | Grok 4.7 + image tool types + per-model Grok image opts + the design doc + March reference |
| `413ff00` | Meta image lane: dispatch-time thinking clock (linear rewrite), validated sizes, muse-spark reasoning summaries |
| `da47b3a` | web image settings for Meta + Grok 2.0 (per-model option tables) |
| `b35822c` | ws-server Meta image lane (`meta/responses-image.ts`) |
| `7e0a733` | types restructure, codegen class rewrite, muse-image probe |

Earlier in the session (before 09-21): STT rehydrate lane proven (`f52dbc1`), STT overview doc.

### 2.1 Meta image lane — DONE and live-tested

`apps/ws-server/src/meta/responses-image.ts`, routed by `isMetaImgModel` in `meta/index.ts`.
Meta "streams" exactly two events, both at the END (headers arrive at ~19 s via the SDK).
Clock starts at DISPATCH (`tInitial`), one blank THINKING frame at ordinal 0 with
`isThinking: true` before the await; `tFinal` on `response.completed`; same ordinal re-sent
with the summary + `tFinal − tInitial`. No heartbeat, no closures. Sizes: a fixed list
(`auto`, `1024x1024`, `1024x1536`, `1536x1024`); `MetaImgSize = BaseOpenAISize`. Web hook
`use-meta-img-gen.ts` offers exactly those four with pixel sizes. Output always webp.
Planner tools default ON per Meta docs, so `metaImageTool` (in `meta/workup.ts`, Andrew's)
sends only `type`, `size`, `output_format`, `reasoning_strength: "high"`.

### 2.2 Grok tool equipping — DONE (`f6113ea`)

- `image_generation { action: "auto" }` on **grok-4.6 / grok-4.7 only**, inside
  `resolveResponsesTools(model, …)` in `xai/stream-workup.ts`, behind `canUseServerTools`.
- `file_search` (user's collection) on **multi-agent only**.
- image/video models get **no tools** (`canUseFunctionTools` excludes them).
- `reasoningByModel` in `xai/base.ts` is the single effort source: multi-agent low, 4.3 low,
  4.5 high, 4.6/4.7 xhigh. Ceilings enforced by `InputReasoningProps<T>` (4.5 has its own
  branch, no xhigh). **No Grok model takes `max`.**
- `routeXai` throws on missing/non-grok model. Default model grok-4.7.

**Known window:** the current `responses-api.ts` has NO `image_generation_call` branch, so
if 4.7 draws on a chat turn today the `result` is silently dropped (text still flows, no
error). Harmless until commit D lands.

---

## 3. The Grok `image_generation` design — settled decisions

All recorded in `preliminary.md`; summary:

- **Wire shape (two dumps of the SAME prompt, `src/test/xai/tooling/grok-4.7.txt` and
  `grok-4.7-2.txt`; item order differs by design — parallel tool calls, up to 350 tools):**
  invariants in `preliminary.md` §2.2. The `message` item stays OPEN while
  `image_generation_call` (5 consecutive events: added, in_progress, generating, completed,
  done — wall-clock between them UNKNOWN, dumps have no timestamps) and an encrypted `rs_`
  reasoning item complete INSIDE it. Text resumes on the same `msg_` item. `done` carries
  `prompt` (rewritten, 799 / 734 chars) + `result` (b64). `tco_` = tool-call reasoning
  items, arrive already `completed` on `added`. Tool items can `done` with `status:
  "failed"` (results: [], not billed) without failing the response. Annotations can land
  mid-text — the annotation branch is a no-op and never closes the TEXT block.
- **Generator:** xAI docs (pasted by Andrew at compaction): *"It uses the latest Imagine
  image models (grok-imagine-image-2.0)… the model can also chain calls — generating an
  image and then editing it — within a single request."* So `generatingModel` for a Grok
  facilitator is a documented fact, not an assumption. **Chaining means one request can
  yield MULTIPLE image_generation_call items** (generate, then edit) — the handler must not
  assume one.
- **Equip always** for 4.6/4.7 (done). Free when unused.
- **Two entry points, one loop:** chat turn (tools as today, `auto`) vs image job
  (`image_generation` + HMEM's 2 memory tools + `web_search` ONLY, `tool_choice: "required"`,
  loop until an image `result`, **throw** on exhaustion). No system-prompt instruction —
  Andrew never edits the system prompt beyond the global note. This is exactly the OpenAI
  `responses-img-gen.ts` recipe. `tool_choice` cannot name a built-in tool on xAI.
- **Spontaneous image = `TEXT` message with an `IMAGE_GEN` MessageBlock.** No `ImageGenJob`
  (a job is only for `messageType: IMAGE_GEN`). Block owns MANY attachments (partials +
  final render as ONE slot that sharpens). Lineage lives on a new `InlineImageGenOutput`
  table, fully independent of `ImageGenJob`/`ImageGenOutput` (whose `jobId` stays required).
- **The TEXT split around the image is CORRECT** (TEXT / IMAGE_GEN / TEXT), not a bug.
- **One THINKING block from image `added` to the CDN url (Andrew, 09-22).** On `added`:
  close the text block → open a blank THINKING (`isThinking: true`; the clock starts HERE.
  The dumps have no timestamps, so generation time between `added` and `done` is unknown;
  my earlier "one burst, atomic" claim was inferred from sequence adjacency). On `done`:
  re-send the same ordinal with `content = item.prompt` → `await` the upload plainly →
  close THINKING with ONE duration (added → url) → push `IMAGE_GEN` with `inlineImageData`
  → send → release `heldText` (deltas the server held while the image block was open) as
  one TEXT frame. **No fire-and-forget, no continuation, no server timer.** Metering the
  released text over time is the CLIENT's job (rAF-drained frame queue in the store).
- **Shimmer:** only as `blurDataURL` after the url exists (`@slipstream/ui` `lib/shimmer.ts`).
- **Trailing attachment group** must skip attachments with `messageBlockId` / referenced by
  an `IMAGE_GEN` block (slot ownership, else double render).

---

## 4. `InlineImageGenOutput` — where the schema conversation ended

Andrew's file `packages/db/prisma/schema/inline-image-gen-output.prisma`, **final** (he
migrated it 2026-09-22; `preliminary.md` step 1 now matches it verbatim):

```prisma
model InlineImageGenOutput {
  id   String             @id @default(cuid(2))
  kind ImageGenOutputKind @default(FINAL)
  provider          Provider
  facilitatingModel String        // grok-4.7 / gpt-5.6-sol
  generatingModel   String        // grok-imagine-image-2.0 / gpt-image-2.5-sunburst
  seriesId          String        // cuid2, shared by every frame of one generation
  seriesOrdinal     Int           // 0-based, ONE counter across kinds: PARTIALs 0..n-1, FINAL is n
  attachmentId      String     @unique
  width  Int   height Int   mime String   ext String     // REQUIRED — extractor knows them before upload
  revisedPrompt     String?
  createdAt/updatedAt
  attachment Attachment @relation("InlineImageGenOutputToAttachment", fields: [attachmentId], references: [id], onDelete: Cascade)
  @@unique([seriesId, seriesOrdinal])
  @@index([provider, facilitatingModel, generatingModel])
  @@index([createdAt])
}
```

Decisions reached: `seriesOrdinal` (Andrew prefers "ordinal" to "index") is one counter
across kinds — FINAL after 3 PARTIALs is **3, not 0** — which differs on purpose from
`ImageGenOutput.seriesIndex` (per-kind). Never share a sort helper between the two. Dropped:
`ordinal`, `messageBlockOrdinal`, `messageBlockId`, `aspectRatio` (each a copy of a fact one
relation hop away). `facilitatingModel`/`generatingModel` split is Andrew's; keep the
facilitator→generator mapping in ONE `as const` per provider (OpenAI names it on the tool
at `responses-img-gen.ts:315`; Grok's is documented, see §3).

Settled: no `isPartial` — derive from `kind === "PARTIAL"`. The one-off renderer (step 7)
must NOT reuse the job renderer's `seriesIndex` / `isPartial` helper.

Also: **never run prisma CLI commands** (validate, migrate, generate). Andrew rejected a
`prisma validate` on 2026-09-22. Review `.prisma` files by reading them.

---

## 5. Remaining work (plan §8, commit boundaries)

| commit | step | status |
| --- | --- | --- |
| A | 6: `openai/responses-img-gen.ts` — `MAX_TOOL_ROUNDS` exhaustion `break` → `throw` (falls off the end silently today) | not started, independent, one line |
| B | 1: schema (§4, final) + migration + regenerate | **landed 2026-09-22** |
| C | 2+3: **minimal wire as conditional fields (Andrew, 09-22, implementing himself):** `ChatChunkAndResMsgBlock.inlineImageData?: { width, height, cdnUrl, kind: $Enums.ImageGenOutputKind }` — FOUR fields, no `seriesId` (the url encodes it: `generated/:userId/:timestampMs-:seriesId-:seriesOrdinal.:ext`, derive with fixed offset 14 + `lastIndexOf`), NO `isInlineImage` boolean (`type === "IMAGE_GEN"` is the discriminant; a union on `type` would break 19 providers' `roundTrack`); `AIChatResponseImgGenSubFields` gains `inlineImageGenOutput` (lineage rides on `imgGenFields.images`, not the block); persist: `updateMany` the message's attachments by the `seriesId` derived from the block's `cdnUrl` → `messageBlockId` after the create, nested `inlineImageGenOutput: { create }` when no `jobId`; `isImageGen` stays false for one-offs; `Usage` gains `cost_in_usd_ticks`, `image_generation_calls`, `context_details`. **Contract landed** as `ChatChunkAndResInlineImageData` (commit after 266976d). **Persist (plan step 3, Andrew 09-23):** a dedicated `else if` branch in `handleAiChatResponse` for inline images — job-lane types UNCHANGED (`jobId` stays required, `mapImgs` untouched, do NOT propose optional jobId); chat path persists with `imgGenEnabled: false` (true ⇒ messageType IMAGE_GEN) and NO `imgGenFields`; the inline branch creates attachments + nested `inlineImageGenOutput`, links by seriesId derived from cdnUrl, and its `updateMany` runs BEFORE the read that produces `convo`; attachments include gains `inlineImageGenOutput: true`; input shape is Andrew's. **Sub-field model = `imgFinal` in `openai/responses-img-gen.ts:828-933`** (lineage nested as a plain object at 916-932, `seriesId` on the sub-field at 884, `jobId: jobId ?? ""` at 882 — so the inline literal carries `jobId: ""`, nothing loosened) | contract done; Usage + inline persist branch open (Andrew) |
| L | Andrew's `xai/responses-api-linear.ts` (linearized current file, NOT a March rebuild; phase maps + 3 sets + completed-scan kept) + cut-over in `xai/index.ts` | **landed 2026-09-22** |
| D | 4: the image branches IN `responses-api-linear.ts` — plan step 4 has the site-by-site table (closeBeforeEvent guards, added → open THINKING, delta → heldText, done → (1)–(6), persist flags). Handle MULTIPLE image items per request (chaining). Needs C first (`inlineImageData?` on the wire block type) | not started |
| E | 5: `xai/responses-image-api.ts` thin job entry (trimmed tools, `required`, `imageJob` param → throw if `!imageLanded`) + router in `xai/index.ts` | not started |
| F | 7: web — inline image-block component (sort by `seriesOrdinal`, show FINAL else highest PARTIAL, `blurDataURL` shimmer), bubble `IMAGE_GEN` case, trailing-group filter, client-side text pacing queue | not started |
| G | 8: live-test 4 turns with the image branches, delete `responses-api.ts` | not started (cut-over itself already done in L) |

Also open, smaller: Meta `dictationSweep` still ignores unsent STT rows (see 09-18 note);
Meta `meta/types.ts` unused `MetaImgGenOpts` import (lint warning).

---

## 6. Conventions that bit this session (beyond CLAUDE.md)

- **Linear and imperative.** No closure helpers in handlers, no `setInterval` heartbeats,
  `tInitial`/`tFinal` `performance.now()` deltas taken once, named `const` frames sent
  inline, `if / else if` chains. Andrew: earlier model generations "fought against the
  linearity at every turn". The March file is the reference.
- **Typecheck = the package-local script, nothing else:** `pnpm -C apps/ws-server typecheck`
  (Andrew, 09-23: "it will error if anything is awry"). Do NOT `rm` the tsgo cache before every
  run — he rejected that. Typecheck only my own edits; after his rebuilds / `clean:house`, don't.
- **Formatting is not a gate.** Don't report prettier failures. Format my own files silently.
- **Andrew always rebuilds packages he changes.** Don't check, don't remind.
- **Don't edit his in-flight files** without asking; he rejected several of my edits to
  files he was mid-way through. Propose, then let him write, or ask.
- `Exclude<$Enums.X, …>` for enum-subset fields, never unions of `EventTypeMap[…][…]`.
- `notes.md` / `notes/` are globally gitignored → `reference/` for tracked appendices.
- Probe outputs live under `src/test/<provider>/__out__` (gitignored per-provider).
- Commit message style: `feature:` / `fix:` / `docs:` / `wip:` prefix, bullet body,
  Co-Authored-By + Claude-Session trailers.

---

## 7. Traps

- `response.created` from Meta arrives at the END, not early. Never key timing off it.
- Meta `size` is a fixed list despite docs saying "any WxH"; billing is per image.
- Grok `ig_` ids are short and safe to reuse; Meta `ig_` ids are ~360-char signed tokens —
  mint our own.
- `ImageGenOutput.seriesIndex` (per-kind, FINAL=0) ≠ `InlineImageGenOutput.seriesOrdinal`
  (one counter, FINAL=n).
- The OpenAI image loop's guarantee is the loop-until-result, not `tool_choice: "required"`;
  `required` is satisfiable by a memory-tool call.
- xAI `tool_choice` object form is `{ type: "function", function: { name } }` only — no
  way to force a built-in tool.
