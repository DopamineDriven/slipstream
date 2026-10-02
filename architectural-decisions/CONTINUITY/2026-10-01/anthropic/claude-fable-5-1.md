# Continuity — 2026-10-01 — Claude Fable 5.1

Session: `https://claude.ai/code/session_01MjRt7SNjwxBvqY8G3EDCPB`
Branch: `sweet-summer-child` — **commit locally only when asked, NEVER push.**
Previous notes: `CONTINUITY/2026-09-27/anthropic/claude-fable-5-1.md` (attachment url hygiene, inline
IMAGE_GEN lane, registry design start) and `2026-09-24/…`. This note covers 2026-09-28 → 10-01 and
supersedes where they overlap.

Tree at the moment of writing: **`6a33cf8`**, plus two uncommitted doc edits in
`architectural-decisions/grok-img-tool/2026-10-01-media-viewing-plan.md` (§1 wasm correction, §8a two
waveforms). Nothing else uncommitted.

---

## 0. Read these first, in order

1. `architectural-decisions/grok-img-tool/2026-10-01-media-viewing-plan.md` — **the current plan of
   attack** (audio player, lightbox bodies, document/user-asset viewing). Landing order §10.
2. `architectural-decisions/grok-img-tool/navigation-warmed-registry.md` — the attachment registry
   as built (user-driven, navigation-warmed; snippets §1–§5 are what landed).
3. `architectural-decisions/grok-img-tool/attachment-registry-blueprint.md` — the earlier eager
   blueprint; **superseded** where it says "push on connect"; still right on shape/store/provider.
4. `architectural-decisions/grok-img-tool/lightbox.md` — regroup doc with landing-order strikeouts.
5. `architectural-decisions/2026-06-26/conversation-hydration.md` — the model everything
   user-driven copies.
6. Memory (auto-loaded): see §7 for the ones minted this stretch.

---

## 1. What landed (commits newest first)

- **`6a33cf8`** url-constituents test: `byType` counter covers the widened generated `type` union
  (`AudioGenOutput`, `TTSJob`).
- **`621b40e`** (87 files) lineage columns + audio pipeline + media-viewing groundwork — see §2–§4.
- **`0618f60`** navigation-warmed attachment mirror + client-side lightbox pages.
- **`fe3b602`** registry moved to `PrismaAttachmentHydrationService` (public), user-driven flip,
  web store/provider/hooks, `src/navigation/` transition store.
- **`3e27eb0`** registry on the resolver link (since moved), blueprint doc.
- **`2e8dde3`** `attachmentHydrationGenerator` + `AudioGenOutput.kind` migration + loader dedupe.
- **`80e8071`** hydrate-attachments contract (3 lanes / 6 frames), resolver link stub, ws-client slots.
- **`aec9b79`** xAI MCP event types (unwired), `inlineImagePostUploadObj` hoisted to PrismaUtils.

---

## 2. Attachment registry — as built (server)

**Where:** `apps/ws-server/src/prisma/attachment-hydration.ts` (`PrismaAttachmentHydrationService`,
second link in the prisma ladder — see the JSDoc ladder in `prisma/index.ts`; same ladder convention
in `resolver/index.ts`). Public members (Andrew: sole dev, `protected`/`public` freely, no team
constraints):

```ts
attachmentRegistry: Map<userId, Map<conversationId | "new-chat", Map<attachmentId, AttachmentSingleton<true>>>>
NEW_CHAT = "new-chat"
populateAttachmentRegistry(userId)          // whole-user, dormant lane only
setRegistryAttachment(userId, row) → key     // key = row.conversationId ?? "new-chat"
rekeyRegistryAttachments(userId, rows)       // new-chat → real id, by the persisted rows
registryAttachmentById(userId, id)           // scan the user's keys
attachmentsByConversation(userId, id|null)   // ONE findMany for that key (null = new-chat rows)
attachmentById(userId, id)                   // findFirst, user-scoped, same filter
attachmentHydrationGenerator(userId)         // whole-user generator (dormant hydrate_attachments lane)
```

Filter (`private get attachmentFilter`, `as const satisfies AttachmentWhereInput` from
`@slipstream/db/node/generated/models`): `status != FAILED` AND (`origin != GENERATED` | `imageGenOutput.kind FINAL`
| `inlineImageGenOutput.kind FINAL` | `audioGenOutput.kind FINAL`). TTS rows fall out (no FINAL arm) —
deliberate; TTS has its own lane. User audio uploads are IN (providers take mp3/wav).
Include = image, audioGenOutput, document, audio, imageGenOutput, inlineImageGenOutput, messageBlock;
map `size → Number`, `inlineImageGenOutput ?? undefined`, `messageBlock ?? undefined`.

**Resolver link** `resolver/attachment-hydration.ts` (between `asset-compat` and
`asset-attach-or-paste`): three handlers only —
- `hydrateAttachmentByConversationId` — **primary**: registry hit → ack; miss → `attachmentsByConversation` → set → ack.
- `hydrateAttachmentById` — requested key → real key elsewhere → `attachmentById` (set under real key) → `INVALID_ID` echoing the requested key. Its ack is ALSO the push-on-write frame.
- `hydrateAttachments` — dormant whole-user lane (gallery someday; infinite scroll would page anyway).
Acks carry **no `userId`** (socket = user). Contract: `packages/types/src/contract/hydrate-attachments.ts`.

**Write-through sites (all land):** `resolver/asset-complete.ts` after `updateAttachment` (row → singleton
with `imageGenOutput: null, audioGenOutput: null`, `set`, inline `hydrate_attachment_by_id_ack`);
`resolver/chat.ts` after `handleAiChatRequest` when `isNewChat && batchId` (`rekey` + one ack per row);
`prisma/chat-response.ts` tail of `handleAiChatResponse` at BOTH exits (`setRegistryAttachment` for
the AI message's attachments — one site for all 13 providers; the client ingests the same rows from
`ai_chat_response.convo`, no frame). No eviction (process lifetime). No delete lane (`asset_deleted` is
a dead frame; users can't delete attachments; conversation delete runs through the web API route,
not ws-server — stale key until restart, accepted). No connection push (removed).

## 3. Attachment registry — as built (client, `apps/web`)

- `src/state/attachments/store.ts` `AttachmentRegistryStore`: `setBucket` (replace wholesale),
  `setOne` (set; moves if `bucketOf` disagrees = rekey arriving), per-row / per-bucket snapshots,
  `getOrInsertComputed` used (Andrew's call; browser baseline unverified).
- `src/context/attachment-registry-context.tsx` `AttachmentRegistryProvider` (no `userId` prop):
  `addListener` ingest of the three acks + `ai_chat_response` (AI message attachments → `setOne`);
  `warm(key)` ("home"→"new-chat", 5-min TTL, dropped while disconnected, sends
  `hydrate_attachments_by_conversation_id`), `warmAttachment(id)` (by-id with the last warmed key as
  the believed key). Hooks in `src/hooks/use-attachment.ts`, `use-conversation-attachments.ts`
  (Andrew moved them). `useAttachmentRegistryCtx()`.
- `src/instrumentation-client.ts` → `publishRouterTransitionStart` into `src/navigation/transition-store.ts`
  (v0's, Andrew placed; `RouterTransition*` types export from `next` 16.3.6 ✓).
  `src/navigation/routes.ts`: `conversationIdFromUrl` (returns `"home"` for `/`), `attachmentIdFromUrl`.
- `src/ui/navigation-sync/index.tsx`: `TransitionWarmer` (pre-commit, replays latest) +
  `CommittedRouteWarmer` (`useParams` behind Suspense — the only warm a hard load gets). Mounted in
  `app/(chat)/layout.tsx` directly inside `AttachmentRegistryProvider`.
- Pages are no-params client renders: `@modal/(.)attachment/[id]/page.tsx` → `ShallowLightbox`,
  `attachment/[id]/page.tsx` → `AttachmentPageView` (Andrew's; caption shows facilitator/generator via
  `imgCtx.isPureImageGenModelHistoric` + `pureImageGenDisplayNameMap` getter / `getModelDisplayName`).
  `generateMetadata`/OG dropped by decision. `inlineImageGenSpecsByAttachmentId` ORM method: delete when
  nothing references it (check).
- `PathnameProvider`/`PathnameSync` (`context/pathname-context.tsx`) are half-baked — **untouched by
  design**, consumers migrate later.
- Mid-stream new-chat `replaceState` does NOT fire `onRouterTransitionStart` (by design, verified by v0
  against 16.3 source); the `router.replace` at completion does. No conflict with the router deception.

## 4. Lineage columns + backfills (all landed, dev backfilled)

- `ImageGenOutput`: `generatingModel String?`, `facilitatingModel String?`, `provider Provider?`
  (migration `20260929230533_1_to_1_parity_with_inlineimagegenoutput`). Backfill
  `packages/db/src/test/backfill-imagegen-models.ts` — **ran on dev 230/230, cross-check clean**;
  prod pending deploy. Rules: pure model (per-provider explicit list incl. retired
  `grok-2-image-1212`, `grok-imagine-image-pro`, `dall-e-2/3`) → both = job.model; OpenAI text
  facilitator → era table (**dev = branch commit instants** f2fedb6 / 28c4fc4 / 89f5997; **prod =
  main merge instants** PR #307/#357/#407; pre-era = `gpt-image-1`); else unresolved (reported).
  Only OpenAI ever has facilitator ≠ generator in the JOB lane; Grok 4.6/4.7 facilitate only INLINE.
- `AudioGenOutput`: `kind AudioGenOutputKind @default(FINAL)` (separate enum, Andrew's taste) +
  `content String?` (**not** `lyrics` — generic for future speech models; the reader decides) +
  `generatingModel`, `facilitatingModel`, `provider` (migration
  `20261002024519_normalizing_audiogen_output_columns`). Lyria is pure (`lyria-3-pro-preview`,
  `lyria-3.5`). Backfill `backfill-audiogen-models.ts` (set-based joins: models/provider from
  `AudioGenJob`, `content` from the AI `Message.content`) — Andrew ran it on dev.
  Persist at `gemini/interactions-sse.ts` ~L1087 writes all of them; `chat-response.ts` `audioGenOutput`
  create is `satisfies AudioGenOutputCreateNestedOneWithoutAttachmentInput`, dead `jobId` fallback removed.
- **Lyria's text output IS the lyric sheet** (`[[A0]]` / `[:]` markers; `apps/web/src/lib/lyrics.ts`
  parses it). Nothing else comes back as text when `audioGenEnabled`.
- `AudioMetadata.waveformPeaks Int[]`: server writes 1024 buckets, 0..100 (`extract/index.ts`
  `waveformPeaksColumn`, `analyzeBuffer` on `@d0paminedriven/audiodown` — Rust/napi port of
  `packages/audio-metadata`, which entered the repo in `621b40e` with two changesets). Backfill
  `backfill-waveform-peaks.ts` (gen-rows → analyze → exe → cross-check; `audiodown` is a db devDep) —
  **ran on dev and prod 2026-10-02**. The `[0]` placeholder arm at `asset-complete` is unreachable:
  users upload images and documents only; when audio uploads open, that arm calls
  `this.wsServer.prisma.extractor.analyzeRemote` (server decodes, never the client).
- `ExtractService` constructor now takes the addon (`new ExtractService(new AudioService())`); I fixed
  `src/test/memory-section-dryrun.ts` to match.

## 5. Web helpers / tests touched

- `apps/web/src/lib/helpers.ts`: `isUserImage` (jpg/jpeg/webp/png + avif heic tif tiff bmp svg ico gif
  apng — missing by evidence: `jfif` (1 prod row), `heif`; used on ALIASED originals only), `cdnUrlHandler(cdnUrl, isProd?)`
  → `toCdnUrlConstituents | userCdnUrlConstituents` via `trimBase(cdnUrl, isProd)` (**env-dependent**:
  `getCdnUrlBase(isProd = process.env.IS_PROD)`; `undefined` ⇒ default param ⇒ env; in the browser
  `IS_PROD` is always undefined ⇒ prod base — Andrew accepted; pass `"abc123"` for dev in tests).
  `assetOrigin` literals are now UPPERCASE (`GENERATED|UPLOAD|PASTED`). Generated `type` union now
  includes `AudioGenOutput`, `TTSJob`.
- `apps/web/src/tests/cdn-url-constituents.test.ts`: routes every fixture url through `cdnUrlHandler`,
  asserts routing (AI vs USER) + rebuild; `isUserImage` for ALIASED expectations; **15/15**. Run:
  `cd apps/web && node --test --import tsx src/tests/cdn-url-constituents.test.ts`.
- `packages/img-gen` `ProviderValidation`: `isPureImageGenModel`, `isPureImageGenModelHistoric`
  (+4 retired), `pureImageGenDisplayNameMap` (getter, 18 keys). Narrowing idiom:
  `if (imgCtx.isPureImageGenModelHistoric(m)) { if (!imgCtx.isPureImageGenModel(m)) {/* the 4 retired */} }`.

## 6. The media-viewing plan — what's NEXT (nothing of it coded yet)

Ported by Andrew so far: `src/playback/store.ts` (v0 playback store, CTR/RTC-typed), `src/lib/lyrics.ts`,
`src/ui/chat/lightbox/{lyrics-panel,document-embed}.tsx`, `src/ui/chat/waveform/index.tsx`
(scrubber; local `WAVEFORM_PEAK_SCALE = 100`), `src/ui/chat/download-button/`, `src/utils/audio-metadata.ts`
(scratch; writes to ignored `src/utils/__out__/`).
v0 reference: `/home/dopaminedriven/examples/inline/` (do NOT modify) — `lib/asset-view.ts`,
`components/{playback-provider,audio-player,lightbox,inline-audio-gen,attachment-page-view,attachment-chips,asset-meta}.tsx`.

Landing order (plan §10):
1. **Playback foundation**: `src/playback/provider.tsx` (one `<audio>`, `usePlaybackStore` /
   `usePlaybackValue` / `useTrackPlayback`); `ui/chat/playback/audio-player.tsx` with PARITY to the
   existing per-bubble `ui/chat/audio-player/index.tsx` (compiling state when `track` undefined, stop,
   volume+mute on the store, blob-first download via `lib/download.ts`); **`PlaybackTrack.id = cdnUrl`**
   (stable across the stream envelope → committed row); `lib/format.ts` (`formatBytes`, `formatDate`,
   `formatDateTime`, `truncateMiddle`; `formatDuration` exists in helpers); constants
   `WAVEFORM_PEAK_COUNT`/`WAVEFORM_PEAK_SCALE` → `@slipstream/types` `contract/audio.ts`; mount
   `PlaybackProvider` in `(chat)/layout.tsx` around `{children}{modal}`.
2. **`lib/asset-view.ts`** adapter (`toAssetView(row: AttachmentSingleton<true>)` → Image|Audio|Document
   asset; `engine` from relations; `content` from `row.audioGenOutput.content`; LyricsPanel only when
   engine is lyria or `parseLyrics` finds a marker).
3. **Feed**: `InlineAudioGen` replaces the per-bubble player at `message-bubble/index.tsx` ~L719 (keep
   the compiling window); AUDIO_GEN bubble renders `message.content` via `LyricsPanel` not markdown;
   `AttachmentChips` on USER messages; delete old `ui/chat/audio-player` when unreferenced.
4. **Lightbox + page** (Andrew): asset-model bodies, `asset-meta`, downloads. The five icons
   (`Clipboard`, `ShieldCheck`, `TriangleAlert`, `Upload`, `AudioLines`) landed 2026-10-02.
5. ~~Run `backfill-waveform-peaks.ts`~~ done dev + prod 2026-10-02. Prod still owes, in order:
   deploy → prod `migrate` (lineage columns `20260929230533` + `20261002024519`) →
   `backfill-imagegen-models.ts` → `backfill-audiogen-models.ts` (both ran on dev). Andrew runs
   migrations and backfills himself — never prisma CLI from here.
   2026-10-02 state: `WAVEFORM_PEAK_COUNT` / `WAVEFORM_PEAK_SCALE` live in `@slipstream/types`
   `contract/audio.ts`; playback store has parity (`stop`/`setVolume`/`toggleMute`, `volume`+`muted`),
   `useTrackPlayback(string | undefined)`, `PlaybackProvider` mounted inside `AIChatProvider`,
   `ui/chat/playback/audio-player.tsx` written on `BaseButton` + native volume range — unreferenced
   until step 3 swaps the bubble; `engine` dropped from the asset model (lineage columns do it).
6. Later: bucket-level LRU on the client mirror (user-driven admission ≠ bounded growth).

Out of scope: TTS in the registry/lightbox (own `<audio>` in `tts-context.tsx`), video, eviction.
Two waveforms stay separate (plan §8a): `ui/chat/stt/speech-waveform.tsx` = live RMS decoration.

## 7. Memories minted this stretch (auto-loaded; verify before citing)

`feedback_sole_developer_no_team_constraints` (protected default; helpers only for shared-state rules;
linear processes stay ONE method), `project_conversations_permeable_not_walled` (bucket = index key,
not a wall), `project_client_mutation_surface` (only auth/API keys/convo delete+rename; no attachment
deletes; `asset_deleted` dead; 7-day decoupled rule is the only delete), `feedback_map_get_or_insert`
(`getOrInsertComputed` idiom), `project_is_prod_local_marker`, `feedback_pnpm_typecheck` (updated:
`pnpm typecheck` / `pnpm lint` from the package root; `__out__` no-loss-of-precision noise),
`project_image_gen_tooling_providers` (updated: two lanes/two facilitator sets),
`project_attachment_compat_pipeline` (updated: compat is for MODELS; client shows the original, compat
copy is a secondary artifact a gallery may show alongside).

## 8. Rules that bit, beyond CLAUDE.md

- Andrew interrupts with "wait" / "hold up" mid-tool — STOP, discuss, no code until he says go.
- Evidence before code: pull the DB (read-only pg via `node --env-file=.env` in `apps/ws-server`, or
  `pnpm tsx src/test/*.ts --env dev --target gen-rows` from `packages/db`) before asserting data facts.
  My own query escaping ate every `s` once — if data looks corrupted, suspect the query first.
- He runs migrations, writes, and backfill `exe` himself; I write the scripts (pattern:
  `packages/db/src/test/backfill-*.ts` — `Backfill*Workup` class, `Fs`, `resolveDbUrl`, `genRows`
  report to `__out__`, `backfill` in one tx guarded on IS NULL, `exe`, `crossCheck`, `--env … --target …`).
- Don't re-verify his rebuilds; typecheck/lint only my edits (`pnpm typecheck`, `pnpm lint` in the
  package dir; `pnpm exec eslint <file>` for one file).
- Keep scope tight ("keep it tight, keep it light"); he dislikes new knobs/edge-case bullets; flag
  deletions of his lines explicitly; propose edits to his in-flight files, don't apply unasked.
- Contract files stay terse; acks are one field set; `userId` never on acks; events named in his
  tokens (`hydrate_attachment_by_id`).
- `IS_PROD` set ⇒ dev. `trimBase`/`cdnUrlHandler` take `isProd?` explicitly.
- `@d0paminedriven/audiodown`: `browser` field → wasm (`wasm32-wasip1-threads`) build; needs
  cross-origin isolation (COOP/COEP) in the browser — server path stays primary; web imports type-only.
