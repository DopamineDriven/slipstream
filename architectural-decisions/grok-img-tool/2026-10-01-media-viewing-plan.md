# Media viewing on the client — plan of attack (2026-10-01)

The last piece of the cake. Server side is done: `@d0paminedriven/audiodown` (the Rust port of
`packages/audio-metadata`, napi bindings) decodes lyria's mp3 to a 1024-bucket envelope inside
`handleGeminiInteractionsRequest` (`gemini/interactions-sse.ts` L998), `waveformPeaksColumn` quantises
it to `0..100` ints (`extract/index.ts` L204), and the row lands on `AudioMetadata.waveformPeaks Int[]`.
The attachment singleton carries `audio`, `audioGenOutput`, `image`, `document` and both image
lineages to the client through the registry mirror and `ai_chat_response.convo`. v0's `examples/inline`
is the reference; its source is not modified, only what is brought over.

Three viewing surfaces, one asset model, one audio element:

```
AttachmentSingleton<true> ──toAssetView──▶ ImageAsset | AudioAsset | DocumentAsset
                                                 │
            ┌────────────────────────────────────┼──────────────────────────────────┐
            ▼                                    ▼                                  ▼
   feed card (bubble)                   lightbox (@modal intercept)         full page (/attachment/[id])
   InlineAudioGen · AttachmentChips     ImageBody · AudioBody · DocumentEmbed   Hero · SpecSheet · downloads
            └──────────── every AudioPlayer is a VIEW onto PlaybackProvider's one <audio> ────────────┘
```

---

## 1. What is already in, what comes over, what stays behind

| v0 file | status | lands at |
|---|---|---|
| `lib/playback-store.ts` | **in** (typed with `CTR`/`RTC`) | `src/playback/store.ts` |
| `lib/lyrics.ts` | **in** | `src/lib/lyrics.ts` |
| `components/lyrics-panel.tsx` | **in** | `src/ui/chat/lightbox/lyrics-panel.tsx` |
| `components/document-embed.tsx` | **in** | `src/ui/chat/lightbox/document-embed.tsx` |
| `components/playback-provider.tsx` | **in** | `src/context/playback-context.tsx` — `PlaybackProvider` mounts the one `<audio>`, `usePlaybackContext`; the two hooks split out to `src/hooks/use-playback-value.ts` (`useSyncExternalStore` selector) and `src/hooks/use-track-playback.ts` (one track's view) |
| `components/waveform-scrubber.tsx` | **in** | `src/ui/chat/waveform/index.tsx` — `WaveformScrubber`, local `WAVEFORM_PEAK_SCALE = 100` until §4 hoists it |
| `components/audio-player.tsx` | port **+ parity** (§3) | `src/ui/chat/playback/audio-player.tsx` |
| `lib/asset-view.ts` | port **+ adapt** (§2) | `src/lib/asset-view.ts` |
| `components/asset-meta.tsx` | port (needs 5 icons, §7) | `src/ui/chat/lightbox/asset-meta.tsx` |
| `components/inline-audio-gen.tsx` | port | `src/ui/chat/audio-gen/inline-audio-gen.tsx` — the feed card |
| `components/attachment-chips.tsx` | port | `src/ui/chat/message-bubble/attachment-chips.tsx` — USER message assets |
| `components/download-button.tsx`, `lib/download.ts` | port | `src/ui/chat/lightbox/download-button.tsx`, `src/lib/download.ts` |
| `lib/format.ts` | port the four we lack | `src/lib/format.ts` — `formatBytes`, `formatDate`, `formatDateTime`, `truncateMiddle` (`formatDuration` already in `lib/helpers.ts`, same signature) |
| `components/lightbox.tsx`, `attachment-page-view.tsx` | **Andrew's** — extend ours to the asset model (§5) | `ui/chat/inline-image-gen/lightbox.tsx`, `attachment-page-view.tsx` |
| `lib/audio-extract.ts` | **not ported** — Node-only; superseded by `prisma.extractor.analyzeBuffer` on the Rust addon in ws-server | — |
| `lib/audio-ingest.ts` | **not ported** — `quantizePeaks` already lives server-side in `waveformPeaksColumn`; only the two constants matter (§4) | — |
| `lib/cdn-url.ts`, `img-ctx.ts`, `models.ts`, `db.ts`, `demo-*`, `generated/*`, `stream-demo.tsx`, `inline-image-gen.tsx` | **not ported** — ours exist or demo-only | — |

`@d0paminedriven/audiodown` is in `apps/web/package.json` already. Its `browser` field points at
`browser.js`, the `wasm32-wasip1-threads` build via emnapi, so a value import in client code resolves
to wasm, not the native addon (corrected 2026-10-01). The catch is `-threads`: it needs
`SharedArrayBuffer`, which browsers expose only under cross-origin isolation (COOP `same-origin` +
COEP `require-corp` / `credentialless`), and `require-corp` then wants CORP headers or `crossorigin`
on every CDN image and track the app paints. So client-side decode is a deliberate opt-in, not a
default: the server path (`analyzeBuffer` at persist, the peaks backfill for history) is the path, and
there is no client-side case to make — users cannot upload audio today (the chat input accepts
images and documents only), and when they can, finalize decodes the object server-side (§4). Keep the
web imports type-only.

---

## 2. `toAssetView` — the one adapter (adaptations from v0)

v0's `asset-view.ts` is the right shape: one function from the row to a discriminated
`ImageAsset | AudioAsset | DocumentAsset`, provenance (sender, origin, compat, series, generatedBy,
facilitatedBy) computed once, `original` and `compatCopy` as two `FileRef`s, and the
"preview the compat copy only when the browser cannot render the original" rule — Office docs as
PDF, HEIC/TIFF as PNG/JPEG. That rule is the client-side expression of "a gallery shows both".

Adaptations to our types:

- Input is `AttachmentSingleton<true>` only — `size` is already `number | null`, so `toBytes`'s
  bigint branch goes.
- `tryCdnUrlHandler` → our `cdnUrlHandler`. It classifies `AudioGenOutput` / `TTSJob` urls now, and
  the lyria object is named by `AudioGenJob.id`, so `series` for audio is `{ id: sId }` with no ordinal
  — the same provenance slot images fill.
- **`engine` is not ported.** It was v0's stand-in for lineage on audio rows that had none: a label
  ("Lyria", "Grok TTS") keyed on which relation or url type was present — a table name dressed up as a
  credit. `AudioGenOutput` carries `generatingModel` / `facilitatingModel` / `provider` since
  `20261002024519`, so audio resolves `generatedBy` through the same `modelIdToDisplayName` path as
  images ("Lyria 3.5", "Lyria 3 Pro Preview"). `modelLine` becomes `generatedBy ?? facilitatedBy`,
  the audio title fallback and `audioSubtitle` read it, and `asset-meta`'s "Engine" term goes. TTS is
  out of the registry (§9); if it ever comes in, `TTSJob` has provider, model and voice of its own.
- `getModelDisplayName(PROVIDER_SLUG[provider], model)` → ours takes the lowercase provider the same
  way; `imgCtx.pureImageGenDisplayNameMap` is a getter now (no call parentheses).
- **`row.audioGenOutput?.lyrics` does not exist.** See §6 — it becomes `audioGenOutput.content`,
  the one schema decision in the plan. Until it lands, `toAssetView(row, { content })` takes the text
  from the caller: the bubble has `message.content`, the hard-load page has nothing.

---

## 3. The shared player replaces the per-bubble one

**The app has an audio player today**: `ui/chat/audio-player/index.tsx`, mounted per AUDIO_GEN
bubble (`message-bubble/index.tsx` L719) with its own `<audio>`. That is the thing v0's design
removes. With a per-bubble element, opening the lightbox on a playing track creates a second element
and a second timeline. With `PlaybackProvider` the feed card and the lightbox are two views of one
element, so the handoff is seamless by construction, and the sound survives every route change in
`(chat)` including the intercept opening and closing.

What the existing player has that v0's lacks, to carry over so nothing regresses:

| feature | existing player | v0 player | plan |
|---|---|---|---|
| compiling state (`src` undefined: lyrics landed, audio still uploading) | shimmer over the seek lane, `pendingLabel` | — | `track?: PlaybackTrack` optional; undefined renders the pending row |
| stop | `Stop` | — | ~~`stop(track)` on the store~~ dropped 2026-10-03: play and pause only, as media controls are expected to be; rewinding is the scrubber's job |
| volume + mute cluster | hover-expanding slider | — | `volume` / `muted` on the snapshot, `setVolume` / `toggleMute` on the store — element-level, so they belong to the one element |
| download | blob-first, anchor fallback | `downloadAsset` in `lib/download.ts` (same strategy) | port `lib/download.ts`, drop the inline copy |
| waveform scrubber | plain `Slider` | SVG envelope over a transparent range input | v0's, fed by `audio.waveformPeaks` |
| entrance | `motion.div` fade | — | keep the fade on the card, not the player |

**Track identity.** v0 keys `PlaybackTrack.id` on the attachment id. During a lyria stream the audio
arrives as `audioGenFields.audio` (an `AIChatResponseAudioGenSubFields` envelope, not a singleton)
before the attachment row exists; the id is minted at persist. If the card plays from the envelope
and the committed bubble then keys by attachment id, the loaded track stops matching and every view
shows idle while sound continues. **Key tracks by `cdnUrl`.** It is the identity of the CDN object,
stable from envelope to committed row, and unique per sound. One line in `playback/store.ts`.

Mobile: `toggle` → `play()` is synchronous inside the click handler, which is what iOS gating
requires. The cassette primer in `message-icons.tsx` is the TTS lane's concern and stays.

---

## 4. The waveform contract, in one place

Server writes `peakCount: 1024` and quantises to `0..100`; the scrubber divides by the scale and
reduces 1024 buckets to one bar per 3px. Both numbers live in `@slipstream/types` as
`WAVEFORM_PEAK_COUNT = 1024` / `WAVEFORM_PEAK_SCALE = 100` (`contract/audio.ts`, 2026-10-02), imported
at the extractor, the lyria call site and the scrubber; the finished waveform backfill keeps its own
literal since it will not run again. The scrubber's only fallback is `peaks.length === 0`
(no envelope → plain range input); it does not special-case placeholders. The `AUDIO` arm of
`asset-complete.ts` finalize (the `waveformPeaks: [0]`, `duration: 0` branch) is unreachable today —
users upload images and documents only — and when audio uploads open up, that arm calls
`this.wsServer.prisma.extractor.analyzeRemote(cdnUrl, { peakCount })` (the extractor is already on that
chain — finalize reaches `extractRemote` through it today) and writes `waveformPeaksColumn(waveform)` plus the
decoded specs, the same way the lyria lane does at persist. The envelope is the server's to write,
never the client's to paper over.

---

## 5. The three surfaces

**Feed card** — `InlineAudioGen` for the AI bubble: the small player, the subtitle (credit or
model line), and the Eye to `/attachment/[id]`. It replaces the current `<AudioPlayer src durationMs>`
at `message-bubble/index.tsx` L719 and keeps the compiling window: `track` undefined while
`liveHasLyrics && !audioGenPlayback`, defined from the envelope's `cdnUrl` the moment it lands,
unchanged at commit because the key is the url. Because a lyria turn's text is the lyric sheet and
nothing else (§6), the AUDIO_GEN bubble renders `message.content` through `LyricsPanel` instead of
the markdown path, which today paints the raw `[[A0]]` / `[:]` markers. Streaming text still lands
line by line, so the panel parses whatever has arrived.

**User message assets** — `AttachmentChips` replaces `AttachmentDisplay` on USER messages
(`ui/chat/attachment-display/index.tsx`, the thing the bubble mounts under the "Attachment" label
today: a 256px-tall full-width image frame with an Eye/Download overlay, or a `Card` row per document,
each with its own in-component preview path and a plain-anchor download). The chips are the small
form of the same thing: an 80px image chip, or a 240px card with `AudioLines` / `FileText`, format
and bytes; every chip is a `Link scroll={false}` to `/attachment/[id]`, so the intercept opens the
shared lightbox and the page is one hard load away. The audio arm stays in place — it is a kind
switch, the way `getFileIcon` already carries an `AUDIO` case — even though users upload images and
documents only today. `AttachmentDisplay` goes once the bubble stops referencing it;
`AttachmentPreviewComponent` in the chat input is the pre-send preview and is untouched. This is "viewing
for user assets" — the same lightbox and page, fed by the same registry mirror.

**Lightbox** (Andrew's `lightbox.tsx`): prop becomes `asset: AssetView`; the header gains
`ProvenanceGlyph` + `ProvenanceLine` + `specLine`; the body switches on `asset.kind` — the existing
image frame with Fit/100%, `DocumentEmbed` at `h-[calc(100dvh-8rem)]`, and `AudioBody` with the
player pinned and lyrics scrolling beneath it. `ShallowLightbox` becomes `toAssetView(useAttachment(id))`.

**Full page** (Andrew's `attachment-page-view.tsx`): v0's `Hero` switch + `SpecSheet` + the action
row — "Open original", a `Compat <FORMAT>` download when a compat copy exists, and the original
download. The two downloads side by side are the gallery rule honoured on the page.

---

## 6. The audio turn's text needs a home on the row (`AudioGenOutput.content`)

Lyria's lyric sheet is the AI message's text content, in exactly the `[[A0]]` / `[:]` form
`lib/lyrics.ts` parses (dev rows `zmzq242g…`, `hxdvcyet…` verified 2026-10-01). **Lyrics are the
only text lyria responds with** (Andrew, 2026-10-01): when `audioGenEnabled` is true the model's whole
text output IS the lyric sheet, so there is nothing to split or detect — `geminiAgg` is the value.
The feed card has `message.content`. The hard-load lightbox has only the attachment row from the
mirror — no message, no lyrics.

Options: (a) `content String?` on `AudioGenOutput`, written at persist from the accumulated text
(`geminiAgg`, one field beside `kind` in the envelope at `interactions-sse.ts` L1087) and backfilled
from `Message.content` for the existing rows (two in dev) in the `backfill-*` pattern; (b) the page
asks for the message. (a) is the `revisedPrompt`-on-the-lineage-row pattern already used for images,
costs one nullable column, and makes `toAssetView` complete from the row alone. **Recommend (a).**

**Named `content`, not `lyrics`** (Andrew, 2026-10-01): it is the model's text output alongside the
audio — the same vocabulary as `Message.content` / `MessageBlock.content` — so a future speech model
whose text is a transcript or script fits the column without renaming it. The interpretation is the
reader's: `toAssetView` hands it to `LyricsPanel` only when `generatingModel` is a lyria id (`isAudioGenModel`) or
`parseLyrics` finds a section marker, so prose from a speech model is never sliced into verses.

---

## 7. Five icons the ui package does not have

~~`Clipboard`~~, ~~`ShieldCheck`~~, ~~`TriangleAlert`~~, ~~`Upload`~~, ~~`AudioLines`~~ — used by `asset-meta.tsx` and
`attachment-chips.tsx`. Present already: `Eye`, `Download`, `X`, `Pause`, `Play`, `FileText`,
`ExternalLink`, `Sparkles`, `ArrowLeft`. Add the five to `packages/ui/src/icons/` or substitute;
`CompatibilityBadge` (ShieldCheck / TriangleAlert) is the only one that is more than decoration.

---

~~## 8. Backfill: waveform peaks for rows that predate the addon~~

Both dev lyria tracks (2026-09-07, 2026-09-29) have `waveformPeaks = []`; they were persisted before
the Rust extractor. Prod's legacy audio census is 145 `.wav` + 13 `.mp3` generated rows, mostly TTS.
A `backfill-waveform-peaks` in the established pattern: select audio rows with `cardinality
(waveformPeaks) <= 1`, fetch the CDN object, `analyzeBuffer` on the addon, update `waveformPeaks`
(and `duration` where it is `0`). The addon is a ws-server dependency, so the script lives in
`apps/ws-server/src/test/` beside `bulk-attachments.ts`, dry-run by default, `apply` to write.
Lyria rows first; TTS is a separate call.

**Done 2026-10-02**: `packages/db/src/test/backfill-waveform-peaks.ts` ran on dev and prod.

---

## 8a. Two waveforms, on purpose

`ui/chat/stt/speech-waveform.tsx` already draws bars during dictation: live RMS from the
`PcmCapture` AudioWorklet (`onLevel`), a scrolling 48ms history, motion-value `scaleY` per bar at
7px slots, a primary→foreground `color-mix` across the track, reduced-motion fallback,
`aria-hidden`. The scrubber (`ui/chat/waveform/index.tsx`) is the other thing: a persisted 1024-bucket
envelope reduced to one SVG bar per 3px, with a transparent native range input on top as the real
control and the played portion clipped in `primary`. Live signal vs stored envelope, decoration vs
seek control — they do not merge. What should match is the vocabulary: rounded bar caps, the
`muted-foreground` rest tone, `primary` for the active part, so a user reads both as "sound".

## 9. Out of scope, named

- **TTS** rows: not in the registry (no FINAL arm), own `<audio>` in `tts-context.tsx`, own cache.
  The shared element is for tracks; the two elements coexist.
- **Video**: `interactions-sse.ts` logs the delta and moves on; `VideoMetadata` exists; no lane.
- **Eviction** on the mirror (still later, per `navigation-warmed-registry.md`).

---

## 10. Landing order

1. **Playback foundation**: `ui/chat/playback/audio-player.tsx` with the parity items from §3,
   composing the ported `ui/chat/waveform/index.tsx` scrubber and the `context/playback-context.tsx` hooks; `lib/format.ts` (`lib/download.ts` is
   already covered by `downloadAsset` / `fileDownloadName` in `lib/helpers.ts`). Done: the two
   constants in `@slipstream/types`, `track.id = cdnUrl`, `PlaybackProvider` mounted inside
   `AIChatProvider` around `{children}{modal}`, store parity (`stop` / `setVolume` / `toggleMute`,
   `volume` + `muted` on the snapshot), `useTrackPlayback(string | undefined)`, and the player itself
   on `BaseButton` with a native volume range (no Radix).
2. **Adapter**: `lib/asset-view.ts` with the §2 adaptations.
3. **Feed**: `InlineAudioGen` replaces the per-bubble player at L719; `AttachmentChips` replaces
   `AttachmentDisplay` on USER messages; the old `ui/chat/audio-player/index.tsx` and
   `ui/chat/attachment-display/index.tsx` go once unreferenced.
4. **Lightbox + page** (Andrew): asset-model bodies, `asset-meta`, the five icons, downloads.
5. **`AudioGenOutput.content`** (Andrew): schema, persist line, backfill from `Message.content`.
6. ~~**Peaks backfill**~~ — done on dev and prod (2026-10-02). Still pending on prod, in order: deploy → prod
   `migrate` (the lineage columns `20260929230533` + `20261002024519` must exist first) →
   `backfill-imagegen-models.ts` → `backfill-audiogen-models.ts` (both ran on dev).

Verify live: start a track in the feed, open the lightbox mid-song — same position, no restart;
close it — still playing; navigate to another conversation and back — still playing; hard load
`/attachment/[id]` on a lyria row — player + lyrics; open a user PDF chip — embed; open a user `.docx`
chip — the compat PDF renders, both downloads offered.
