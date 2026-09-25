# Continuity — 2026-09-24 — Claude Fable 5.1

Session: `https://claude.ai/code/session_01MjRt7SNjwxBvqY8G3EDCPB`
Branch: `sweet-summer-child` (never push; commit locally only when asked).
Previous note: `CONTINUITY/2026-09-22/anthropic/claude-fable-5-1.md` — read it too; this one supersedes where they overlap.

---

## 0. Read these first

1. `architectural-decisions/grok-img-tool/preliminary.md` — **the spec**. §8 plan; **§9** persist splice (done); **§10** web investigation + **§10.11** one snippet per client gap (the next work).
2. `architectural-decisions/grok-img-tool/reference/notes.md` — Sol (gpt-5.6-sol) review of the linear handler + my response section with verdicts (#67 fixed; #69 time-bound only; #70 overstated).
3. `architectural-decisions/grok-img-tool/reference/why-not-send-this-to-client.md` — Andrew's note that led to `inlineImgGenData` on the wire.
4. `packages/db/erd/ERD.mmd` — **source of truth for what a singleton type may carry**.
5. Memory files (auto-loaded) — especially `feedback_items_not_blocks`, `feedback_singletons_mirror_db`, `feedback_thinking_section_untouched`, `feedback_rule_of_three_prisma_bigint`, `feedback_dont_reverify_andrews_builds`, `feedback_no_prisma_commands`, `feedback_pnpm_typecheck`, `project_generated_cdn_url_anatomy`, `project_image_gen_tooling_providers`, `project_image_gen_dir_layout`.

---

## 1. State of the tree

Last commit `da2a87e` ("xAI handler sends inlineImgGenData"). **Uncommitted at compaction:**
- `apps/ws-server/src/xai/responses-api-linear.ts` — **wire-order fix (Sol #67)**: per-chunk `let pendingImageFrame`, assigned in the image branch, sent after the thinking-frame block so the closed THINKING (ordinal N) precedes IMAGE_GEN (N+1) on the wire. Typecheck clean (`pnpm -C apps/ws-server typecheck`).
- `architectural-decisions/grok-img-tool/reference/notes.md` — my response section appended.
- `architectural-decisions/grok-img-tool/preliminary.md` — the last few §10.11 edits (field renamed to `inlineImgGenData`, provider prior removed, ThinkingSection untouched, canvas mimic).
Andrew may have touched the linear file after my last read (system note said it changed) — re-read before editing.

Commits this session (newest first): `da2a87e` inlineImgGenData sends · `679d1c5` inlineImgGenData contract field + docs · `08f0f71` toCdnUrlConstituents + §10.11 refinements · `11e6929` prisma ERD generator, canvas consolidation, include parity, §10 · `a794494` opus-5.5 threaded · `d18b555` xAI inline IMAGE_GEN blocks wired + CLI reconciles from convo · `2222957` block accounting as inline gates · `3abf2e6` nextOrdinal → trackedBlocks.length · `50f4f92` inline image persist branch · `f8438e1` gpt-6-sol/luna + xAI inline workup · `266976d`/`421fada` schema + linear handler checkpoint.

---

## 2. What is DONE (server side complete end to end)

- **Schema** (migration `20260922234809`): `MessageBlockType.IMAGE_GEN`; `Attachment.messageBlockId` ↔ `MessageBlock.attachments[]`; `InlineImageGenOutput` (kind, provider, facilitatingModel, generatingModel, seriesId cuid2, seriesOrdinal one counter across kinds, required dims, revisedPrompt), independent of ImageGenJob/ImageGenOutput.
- **xAI linear handler** `apps/ws-server/src/xai/responses-api-linear.ts` (Andrew's own linearization of the old file; live via `xai/index.ts`): block accounting = `trackedBlocks: ChatChunkAndResMsgBlock[]` + `activeBlock` + one `Set` (`reasoningItemsWithSummaryText`); eight inline close sites; `closedBlock` per chunk; image `added` opens a THINKING block (content `*Generating Image...*` — intentional, persisted); image `done` → cuid2 seriesId, extract specs, await S3 upload, `inlineImagePostUploadObj` (base.ts) builds the DB-ready `InlineImageGenAggProps`, close THINKING, push `IMAGE_GEN` block `{ content: prompt, inlineImageData: { width, height, cdnUrl, kind } }`, frame carries `inlineImgGenData: inlineImgObj` (singleton), response frames carry the array; persist gets `inlineImageGenAgg` + `messageBlocks: trackedBlocks`, `imgGenEnabled: false`. xAI no longer sends `responseOutput` to persist (bulk).
- **Persist** `apps/ws-server/src/prisma/chat-response.ts`: `inlineImageGenAggWorkup` pairs rows to IMAGE_GEN blocks by seriesId+ordinal parsed from the block's cdnUrl → `{ creates, links }`; third arm on `attachments` (unchecked create, nested `image`/`inlineImageGenOutput`); after the transaction: `updateMany` messageBlockId per link, then a **fresh tandem pull** (same include) returned as `convo`; `inlineImgAttachmentIds` mirrors imgGenAttachmentId/audioGenAttachmentId; include ordered by message `ordinal` desc, take 2 ([0] AI, [1] user).
- **Include parity (all four producers)**: `inlineImageGenOutput: true` in the live commit, web page-0/cursor loaders (`apps/web/src/orm/user-message-service.ts`), and the WS prewarm generator (`convo-hydration.ts`); `audioGenJob` beside `imageGenJob` everywhere.
- **Wire contract** (`packages/types/src/contract/ai-chat-events.ts`): `ChatChunkAndResInlineImageData { width, height, cdnUrl, kind }`; `ChatChunkAndResMsgBlock.inlineImageData?`; `inlineImgGenData?: T extends "ai_chat_chunk" ? InlineImageGenAggProps : InlineImageGenAggProps[]` on `AIChatResEntity<T>` (singleton per image chunk, array on response — response copy is a mirror the store ignores in favour of convo). `InlineImageGenAggProps` exported from types (the create shape: Attachment row minus ids/timestamps/relations + `image` + `inlineImageGenOutput` children).
- **CLI** `packages/cli/src/render.ts` `renderResponse`: reconciles from the persisted AI message in `convo`, skips ENCRYPTED_THINKING (ciphertext). Rule: wire blocks are consumed only during `ai_chat_chunk`; final state = convo.
- **Web helper** `apps/web/src/lib/helpers.ts` `toCdnUrlConstituents(cdnUrl)` → `{ type, sId, sOrdinal:number, ext, timestampMs:number }`; `type` = `"inlineImageGenOutput"` iff `/^[a-z0-9]{24}$/` (anchored!) else `"imageGenOutput"`.
- Docs: §9 persist splice, §10 web investigation (four producers incl. WS prewarm; bubble two-branch renderer; canvas at `image-gen/index.tsx`; ThinkingSection; no text pacing), §10.9 gaps, §10.10 corrections, §10.11 snippets.

---

## 3. What REMAINS — the web client (§10.11, landing order)

**Superseded 2026-09-24 (later the same day) by `preliminary.md` §11:**
`MessageBlock` now carries `cdnUrl` / `width` / `height`, so (b) and (d)
are dropped, (c) is done (Andrew's three `?? null` lines in
`toMessageBlocks`), and what remains is (f) the component, (e) the bubble
case, and a bubble-width disjunct. Read §11 first; the list below is the
pre-column plan.

(a) include parity — **done**. Then: **(c)** `toMessageBlocks` as a spread derivation (`ui-message-helpers.ts:25-35`) → **(b)** streaming attachment synthesized from the frame's `inlineImgGenData` (read shape `InlineImageAttachment`; temp id = `${seriesId}-${seriesOrdinal}` url stem; `messageBlockId` = `${streamingMessageId}-block-${ordinal}` matching toMessageBlocks; fold pairs `evt.inlineImgGenData` with the frame's IMAGE_GEN block ordinal; appended to the streaming message's `attachments` beside `imgGenAttachments`) → **(d)** one resolver `inlineImageFor(block, attachments)` (attachments only, FINAL else highest seriesOrdinal, returns `attachmentId` + four fields) → **(f)** `InlineImageBlock` component (`ui/chat/inline-image/`): the job canvas made interleavable — ref-gated state, no key on `<Image>`, ripple/pill for no-url, PARTIAL scanner/corners, FINAL hover overlay, shimmer blur, `attachment-${id}` anchor; real aspect ratio + object-contain; `caption: ReactNode` already processed; `alt` raw prompt; reacts to `kind` only (no provider logic) → **(e)** bubble `IMAGE_GEN` case before the text fallback (`message-bubble/index.tsx:556`), key by block ordinal, caption through the bubble's two markdown processors (stream `processStreamingMarkdown`, committed `processMarkdownToReact` — neither file touched) → **(j)** rAF-coalesced `applyChunk` (first pacing step; metering is a follow-on).
- Andrew wants ALL of it visual/snippet-driven; **do not touch** `ThinkingSection`, `lib/processor.tsx`, `lib/markdown-streaming.tsx`.
- Open from Sol's review (owner's call): `responseOutput` sentinel (stringifies image b64 per round → boolean), double base64 decode, `controller.abort()` in finally, `TOOL_DEADLINE_MS` (time-bound only — CLAUDE.md forbids token/cost caps), `chunk: revisedPrompt` on the image frame (inert but contradicts "prompt is block content"), orphaned S3 object on mid-stream failure (cleanup policy, not provisional persistence).
- Smaller: Meta dictationSweep unsent rows; `meta/types.ts` unused import.

---

## 4. Rules that bit this session (beyond CLAUDE.md + memories)

- **Items, not blocks.** Design from provider items + what the client paints; blocks are the persisted record. Wire field = what the renderer consumes + one join key.
- **Singletons mirror the DB, nothing more, nothing less** (ERD is the source). No image field on MessageBlockSingleton; streaming synthesizes the Attachment child row.
- **Never "make X optional" to fit a new case** — give it its own lane (InlineImageGenOutput table; inline `else if` persist branch; additive wire field).
- **Copy twice, abstract at the third use**; never a helper whose param is a Prisma payload type with bigint mapping.
- **ThinkingSection is untouchable.** New block types get their own interleaved component.
- **Never run prisma commands. Never re-verify Andrew's builds. Typecheck only my own edits with `pnpm -C apps/<pkg> typecheck`** (no cache clearing).
- `ws.send` is synchronous — no `void`; `void` only on `redis.publishTypedEvent`.
- `messageBlocks` is ALWAYS defined on AI messages; `Message.content`/`thinkingText` are deprecated write-only.
- User message is persisted BEFORE the provider call (`userMsgId` is real throughout).
- Redis stream state is resumability only, chunks + thinking text.
- Generated url anatomy: `generated/:userId/:ms-:seriesId-:ordinal.:ext`; series-id shapes: nanoid 21 (Meta/pure lanes), `ig_[a-f0-9]{50}` (OpenAI facilitator jobs), cuid2 24 (inline; OpenAI inline will use cuid2 too).
- Only Grok 4.6/4.7 + OpenAI facilitators have image tooling; only OpenAI streams partials — context only, the component reacts to `kind`.
- Andrew's style: objects, arrays, lets gated linearly; propose bare field lines for his contract files; he rejects closures/helpers and enumerated projections ("abstraction of the contract, not a derivation").
