# Video generation and viewing — plan of attack (2026-10-14)

**Status: plan. Nothing here is built.** Written against the tree at `6d8555a`. The audio lane
(lyria through the Interactions API, `AudioGenJob` / `AudioGenOutput` / `AudioMetadata`, the shared
player and lightbox) is the template; wherever this plan says "mirror the audio lane" the audio
code is the spec, not this document.

Two decisions sit at the top, answered first so the rest reads in context:

- **A `videodown` crate is warranted.** Same reasons audiodown was: the work is byte-level, CPU
  bound, belongs off the event loop, and should ship as one prebuilt `.node` per target with the
  same wasm escape hatch. Scope is **demux and metadata, never decoding video**. §6.
- **Frames come from a feature-gated superset, the pdfdown-ocr pattern.** Decoding H.264 / HEVC /
  VP9 / AV1 in pure Rust is not viable, and linking libav into the base crate would break the
  fourteen-target matrix and the wasm build. So the base stays pure and ships everywhere, and a
  second package built from the same crate with `--features frames` links libav and ships for the
  four server targets only, the way `@d0paminedriven/pdfdown-ocr` links tesseract. Posters, frame
  strips and the faststart remux live behind that feature as typed, in-process calls. No ffmpeg
  binary, no process spawn. §5.4, §6.6.

---

## 0. What already exists

A surprising amount. The lane was anticipated.

| layer | present | notes |
|---|---|---|
| schema | `VideoMetadata` (format, width, height, aspectRatio, duration ms, frameRate, bitrate, codec, hasAudio, resolution, orientation, rotation, thumbnailCount, keyframeTimes `Int[]`) | 1:1 on `Attachment`, same shape as `AudioMetadata` |
| schema | `AssetType.VIDEO`, `MessageType.VIDEO_GEN`, `Attachment.thumbnailKey` | the poster has a column already |
| types | `VideoGenModels`, `providerModelVideoGenApi` (gemini omni ×2, veo ×3, grok imagine video ×3), `videoModelSets`, the codegen video maps | ids and display names are done |
| ws-server | `isGrokVideoModel`, `isVeoModel`, `isOmniModel`, `isValidVideoMime`, the video mime tables in `models/workup.ts` | identity only, nothing routes |
| ws-server | `interactions-sse.ts` `case "video"` | logs "lane not wired yet" and moves on; this is the hook point |
| ws-server | xAI `enable_video_understanding` | video as **input** to grok; no generation lane |
| web | `cdnUrlHandler`, `toAssetView`, the chat input | no video branch: a generated `.mp4` url would classify as a document and the adapter returns `null` for `VIDEO` |
| image | `Dockerfile` | python3 and openssl; **no ffmpeg** |

Missing, by layer: a job table and an output table, the request flag and the envelope, both
provider lanes, metadata extraction, posters, the client context, the feed card, the adapter kind,
the lightbox body, and the parser branch.

Standing decisions that shape this (from memory):

- Veo is slated for retirement and stays untouched; **gemini-omni is the Google video lane**, via
  the Interactions API's native `generation_config.video_config`, not a separate service.
- Grok video is a separate xAI product; the Responses stream does not carry it.
- Items, not blocks; wire fields are what the renderer consumes plus one join key; singletons
  mirror the DB; the client never processes media bytes.

---

## 1. The shape, in one picture

```
request (videoGenEnabled, videoGenFields)
   │
   ├─ chat-request.ts: persist user message + VideoGenJob (QUEUED)       ← mirror audio
   │
   ├─ provider lane
   │     gemini omni: interactions stream, delta type "video" (data | uri)
   │     grok video:  POST job → poll → fetch result url                  ← new client in xai/
   │
   ├─ bytes → s3.uploadGenerated(generated/:userId/:ms-:jobId.mp4)
   ├─ videodown.analyze → VideoMetadata columns (+ keyframes, + audio peaks?)
   ├─ videodown-frames.poster (one keyframe, RGBA) → sharp webp → thumbnailKey
   ├─ chat-response.ts: Attachment + VideoGenOutput + VideoMetadata in one transaction
   └─ registry set + ai_chat_response.convo (videoGenFields envelope rides chunk + response)

client
   VideoGenProvider (per-turn milestones) → bubble gate (VIDEO_GEN) → InlineVideoGen card
   toAssetView → VideoAsset → lightbox VideoBody / page Hero / chips
```

Every box on the server side has an audio twin. The two that do not — the xAI polling client and
the frame extraction — are the only genuinely new mechanisms.

---

## 2. Providers and their wire

### 2.1 Gemini omni through the Interactions API

Memory records that the Interactions API carries `generation_config.video_config` with modes
`text_to_video`, `image_to_video`, `reference_to_video`, `edit`, `extend`. The stream's `video`
delta reaches `interactions-sse.ts` today and is logged. The audio case directly above it handles
two deliveries, inline `delta.data` and `delta.uri`; video needs the same pair.

**Probe before building** (the repo's habit, settled with Meta and STT): one text-to-video call,
capturing the full event trace, to answer:

- inline bytes or a uri, and the mime
- one delta or several, and whether a `partial` kind exists
- what `video_config` accepts for duration, aspect ratio, resolution, fps, and audio
- whether a thumbnail or poster is returned, which would spare this lane the frame step
- the token accounting on `usage`

Veo participates in nothing here. `isVeoModel` stays, excluded from `isVideoGenModel` (§5.1).

### 2.2 Grok Imagine Video through xAI

The three grok video ids are identified but no lane exists. xAI's video generation is an async job
API, separate from Responses: submit a generation, poll its status, fetch the result url. The
exact paths, status vocabulary, option names (duration, aspect ratio, resolution), and the shape
of image-to-video input are **to be probed and recorded** in a reference file beside the xAI
Responses reference already in `grok-img-tool/reference/`. Do not guess them into the contract.

This lane gets its own file in `xai/`, say `videos.ts`, in the chain's composition-root style. The
Responses stream workup is not touched. The job's status and ETA map onto `VideoGenJob.stage` /
`progress` / `etaSeconds`, which `AudioGenJob` already models for the same reason (a sixty-second
wait with a synthetic progress bar).

### 2.3 Common tail

From "bytes or url in hand" onward, both lanes run the same steps: fetch if a url, upload to the
generated prefix, analyze, poster, persist, envelope. That tail should be one method on the prisma
chain, called by both lanes, the way `handleAiChatResponse` already serves every provider.

---

## 3. Schema (additive, no existing column changes)

```prisma
model VideoGenJob {
  id                 String        @id @default(cuid(2))
  requestMessageId   String        @unique
  provider           Provider
  model              String
  userId             String
  userKeyId          String?
  keyFingerprint     String?
  prompt             String
  systemPrompt       String?
  mode               VideoGenMode  @default(TEXT_TO_VIDEO)
  sourceAttachmentId String?       // image_to_video / reference / edit / extend input
  durationSeconds    Int?
  aspectRatio        String?
  resolution         String?
  stage              VideoGenStage @default(QUEUED)
  progress           Int           @default(0)
  etaSeconds         Int?
  durationMs         Int?          // wall clock
  usage              Int?
  error              String?
  providerJobId      String?       // xAI's request id, for polling + reconciliation
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
}

model VideoGenOutput {
  id                String             @id @default(cuid(2))
  jobId             String             @unique   // n=1, 1:1 with the job
  attachmentId      String             @unique
  kind              VideoGenOutputKind @default(FINAL)
  mime              String?
  ext               String?
  content           String?            // the model's text beside the video, if any
  provider          Provider?
  generatingModel   String?
  facilitatingModel String?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
}
```

Plus the relations (`Message.videoGenJob`, `Attachment.videoGenOutput`, `UserKey.videoGenJobs`)
and the enums `VideoGenStage` (the audio stage set), `VideoGenOutputKind` (PARTIAL, FINAL),
`VideoGenMode`.

`VideoMetadata` already holds what videodown will produce. Two candidates to add, decided in §9:

- `waveformPeaks Int[]` for the audio track, same 1024 × 0..100 contract as `AudioMetadata`, so
  the lightbox can draw the sound under the frame.
- `moovAtStart Boolean?`, whether the container is laid out for progressive playback. Cheap to
  detect, decides whether the frames package also remuxes.

Lineage columns from day one, so no backfill like the image and audio ones is ever needed.

---

## 4. Contract

Mirror `contract/audio.ts` field for field. Bare lines, no prose, per the contract-file rule.

- `AIChatRequest`: `videoGenEnabled?: boolean`, `videoGenFields?: AIChatRequestVideoGenFields`
  (`duration`, `aspect_ratio`, `resolution`, `mode`, `source_attachment_id`). The commented
  `enableVideoGen` line in `ai-chat-events.ts` is this.
- `AIChatResponseVideoGenFields`: `outputMime`, `duration` (wall clock), `size`, `stage`,
  `progress`, `etaSeconds`, `video?: AIChatResponseVideoGenSubFields`.
- `AIChatResponseVideoGenSubFields`: the attachment row sans id, with `video:
  Rm<VideoSingleton, …>`, `videoGenOutput: Rm<VideoGenOutputSingleton, …>`, `jobId`,
  `generationGroupId`, exactly as the audio sub-fields are built.
- `videoGenFields` rides `ai_chat_chunk` and `ai_chat_response`, as `audioGenFields` does.
- `types.ts`: `VideoSingleton extends VideoMetadata`, `VideoGenJobSingleton`,
  `VideoGenOutputSingleton`; `AttachmentSingleton` gains `video` and `videoGenOutput`.

Progress rides the chunk envelope rather than a dedicated frame. The uniform-ack rule prefers small
dedicated frames, but the audio lane set the precedent of milestones on the chunk, and the client's
per-turn context reads them from there. Keep parity; revisit if a second consumer appears.

---

## 5. Server

### 5.1 Identity and routing

- `models/index.ts`: `isVideoGenModel` = `isOmniModel || isGrokVideoModel` (veo excluded on
  purpose), `isVideoGenCapable(provider)` for gemini and grok.
- `resolver/chat.ts` and `prisma/chat-request.ts`: a `videoGenEnabled && isVideoGenModel(model)`
  block ahead of the image-gen-capable block, mirroring the audio block exactly: create with and
  without attachments, update with and without. That is four more branches on the sixteen,
  reaching the same create and update methods with a `videoGenJob: { create }` nested on the
  request message.
- The web derives `videoGenEnabled` from the targeted model the way `audioGenEnabled` derives from
  lyria: targeting the model is the intent, no toggle.

### 5.2 Persist

`chat-response.ts` gains the video twin of the audio arm: `videoGenOutput` nested create
(`satisfies VideoGenOutputCreateNestedOneWithoutAttachmentInput`) and the `video` metadata create,
in the same transaction as the message and attachment. The registry write-through at the end of
`handleAiChatResponse` needs no change; the filter in `attachment-hydration.ts` gains the
`videoGenOutput.kind FINAL` arm and the `video` + `videoGenOutput` includes.

### 5.3 Extraction

`ExtractService` takes the videodown service beside the audiodown one (composition root in
`index.ts`) and gains `analyzeVideoBuffer` / `analyzeVideoRemote`, plus a `videoMetadataColumns`
mapper that turns `VideoSpecs` into the `VideoMetadata` create shape, the way
`waveformPeaksColumn` quantises peaks.

Headers first. The extractor already fetches a bounded prefix for documents and images; mp4
metadata lives in the `moov` box, which a well-formed generated file puts first. videodown reports
when it is not there (`moov` after `mdat`), and the extractor then fetches the whole object. For a
ten-second clip that is tens of megabytes at most.

### 5.4 Posters and progressive layout (the frames superset)

The ws-server depends on `@d0paminedriven/videodown-frames` (§6.6), the feature-gated build that
links libav. One in-process call per video:

```ts
const frame = await frames.posterAsync(bytes, { atMs: firstKeyframeAtOrAfter(1000), maxWidth: 1280 });
// { width, height, rgba: Uint8Array } → sharp → webp → generated/:userId/:ms-:jobId-poster.webp
```

The seek time comes from the base package's keyframe index, so the decode lands on a sync sample
and costs one frame. The crate returns raw RGBA; sharp, already in the chain, encodes the webp.
The key is stored on `Attachment.thumbnailKey`. When the base package reports `moov` after
`mdat`, `remuxFaststartAsync` rewrites the container before upload, so CloudFront range requests
give the `<video>` element a seekable file from the first byte.

Why a superset and not a binary: the call is typed, runs off the event loop like everything else
in the crate, needs no tmp-file plumbing or process management, and the base package stays pure
Rust and wasm-capable because the feature is off there. The image needs the libav runtime
libraries, not the ffmpeg CLI, exactly as pdfdown-ocr needs tesseract on the host.

Alternatives considered: the ffmpeg binary spawned from TypeScript (works, but moves the one
heavy step outside the crate's API and adds process plumbing for no gain); a provider-supplied
thumbnail (unknown until the probes; if omni returns one, that lane skips the step); client-side
capture through a `<video>` and a canvas, which works for uploads but not for generated files the
client has never loaded.

---

## 6. videodown

`@d0paminedriven/videodown`, a sibling of audiodown in `~/rust/`, same napi 3 + `tokio_rt`
setup, same fourteen targets including `wasm32-wasip1-threads`, same `browser.js` entry with the
same COOP/COEP caveat: the server path is primary and web imports stay type-only. One crate, two
published packages: the base, and the `frames` superset described in §6.6.

### 6.1 Scope

The base package: demux and metadata, no video decoding. The three things it produces:

1. **Specs** from the container: container, video codec, audio codec, width, height, the display
   dimensions after the rotation matrix, rotation, frame rate, duration, bitrate, has audio, audio
   channels and sample rate, creation time, major brand, and whether `moov` precedes `mdat`.
2. **Keyframes**: the sync-sample timestamps in milliseconds, from the `stss` table in mp4 and the
   cues in WebM. No decoding; this is the index the container already carries. It feeds
   `VideoMetadata.keyframeTimes`, the poster seek, and a scrub strip later.
3. **Audio-track peaks**: the same 1024-bucket envelope audiodown produces, by handing the demuxed
   audio track to the same waveform core. Symphonia carries the `isomp4` and `mkv` demuxers and the
   AAC and Vorbis decoders, so this reuses the existing core rather than duplicating it; Opus
   depends on what the symphonia version offers and may be skipped for WebM.

### 6.2 Crates

- `mp4parse` (Mozilla, pure Rust, what Firefox uses) for mp4 and mov: tracks, codecs,
  dimensions, the transformation matrix, timescales and sample tables. `mp4` is the alternative if
  its API reads better.
- `matroska` for WebM track metadata, or symphonia's `mkv` demuxer alone if it exposes enough.
- `symphonia` for the audio track, features `isomp4`, `mkv`, `aac`, `vorbis`, `pcm`.
- `rayon` as audiodown uses it.

The waveform core should move to a shared crate both packages depend on. audiodown already has an
`audio-metadata-rs` directory beside `src`; that is the natural home.

### 6.3 API surface, mirroring audiodown

```ts
export declare class VideoService {
  constructor(defaults?: VideoAnalyzeOptions | undefined | null)
  sniffVideo(data: Uint8Array): VideoKind | null
  parseVideo(data: Uint8Array, source?: string | null): VideoSpecs
  parseVideoAsync(data: Uint8Array, source?: string | null): Promise<VideoSpecs>
  keyframes(data: Uint8Array): KeyframeIndex
  keyframesAsync(data: Uint8Array): Promise<KeyframeIndex>
  audioPeaks(data: Uint8Array, options?: WaveformOptions | null): WaveformPeaks | null
  audioPeaksAsync(data: Uint8Array, options?: WaveformOptions | null): Promise<WaveformPeaks | null>
  analyzeVideo(data: Uint8Array, options?: VideoAnalyzeOptions | null): VideoAnalysis
  analyzeVideoAsync(data: Uint8Array, options?: VideoAnalyzeOptions | null): Promise<VideoAnalysis>
  open(data: Uint8Array, source?: string | null): VideoDown
}
```

`VideoSpecs.complete` is false when the buffer was a prefix and `moov` was not found in it; the
extractor reads that flag to decide on the full fetch. That one bit is what makes header-first
analysis safe.

### 6.4 Fixtures and tests

Generate with ffmpeg locally through a `scripts/fixtures.py` like audiodown's: H.264 + AAC mp4
with `moov` first and with `moov` last, HEVC mp4, VP9 + Opus WebM, AV1 mp4, a rotated phone
clip, a silent clip, and a clip with multiple audio tracks. Assert specs against ffprobe output,
keyframe lists against `ffprobe -skip_frame nokey`, and peaks against the audiodown result for the
extracted track. Benchmark parity with audiodown's bench.

### 6.5 Packaging in this repo

`dd` catalog entries for both packages; the base is a devDependency in `packages/db` for backfills
and a dependency in `apps/ws-server`; the frames superset is an `optionalDependency` of
`apps/ws-server` only, restricted by its `os` field so a Windows dev install still succeeds, and
resolved lazily at the composition root the way `@slipstream/credentials` is, so a missing package
means "no poster" rather than a boot failure; nothing in `apps/web` beyond types. The two
constants, if peaks are adopted, come from the same `contract/audio.ts` so the scrubber needs no
second pair.

### 6.6 The `frames` superset, after pdfdown-ocr

pdfdown ships `@d0paminedriven/pdfdown` for fourteen targets and `@d0paminedriven/pdfdown-ocr`
for four, built from one crate with `--features ocr,render --package-json-path ocr/package.json
--output-dir ocr`, with the superset declaring `os: ["darwin", "linux"]` and "requires system
tesseract". videodown copies that exactly.

| | base `videodown` | superset `videodown-frames` |
|---|---|---|
| Cargo feature | default | `frames = ["dep:ffmpeg-the-third"]` |
| links | nothing | libavformat, libavcodec, libswscale |
| targets | the fourteen, incl. wasm | linux x64 + arm64, darwin x64 + arm64 |
| build | `napi build --platform --release --no-const-enum` | `… --features frames --package-json-path frames/package.json --output-dir frames` |
| host requirement | none | the libav runtime libraries (FFmpeg 7 on Debian trixie) |
| adds to the API | | `VideoFrames` class / `posterAsync`, `framesAsync` (a list of times → RGBA frames), `remuxFaststartAsync`, later `transcodeAsync` if WebM→mp4 is ever wanted |

The feature-gated exports carry `#[cfg(feature = "frames")]`, so the base `index.d.ts` never
mentions them and the superset's generated `index.d.ts` does; same `dtsHeaderFile` approach for
the shared types. The binding crate: `ffmpeg-the-third` is the maintained fork tracking FFmpeg 7;
`ffmpeg-next` is the older name. Verify the pairing against the libav version the image ships
before pinning.

Frames come back as raw RGBA with dimensions, not encoded images, so the crate carries no image
encoder and the server's existing sharp step does the webp. The CI recipe for four native targets
with a system library already exists in the pdfdown repo and transfers as-is.

What the superset does not do: decode on the client. The wasm build is base-only, by
construction.

---

## 7. Client

Mirror the audio lane piece for piece.

- **`context/video-gen-context.tsx`**: `videoGenEnabled` derived from the targeted model, per-turn
  milestones (`hasJob`, `progress`, `hasVideo`), reset on send. `useVideoGenCtx`.
- **Bubble**: `VIDEO_GEN` AI messages claim `w-[85%]` from the first frame, the same rule audio and
  image gen use, so nothing shifts at commit. The gate mirrors the audio gate: the card mounts once
  the job exists and morphs in place when the file lands.
- **`ui/chat/video-gen/inline-video-gen.tsx`**: while generating, a frame at the requested aspect
  ratio holding the stage, progress and ETA (the frameStyle rule from the image canvases, so the
  footprint is reserved before the first byte); on landing, a native `<video controls
  preload="metadata" poster>` in that frame, plus the Eye into the lightbox and a download.
- **`lib/asset-view.ts`**: a `VideoAsset` kind (width, height, duration, fps, codec, hasAudio,
  poster url, keyframes, content), and the `VIDEO` branch of `toAssetView` stops returning null.
  Provenance comes from the output's lineage columns like audio, no `engine`.
- **Lightbox and page**: a `VideoBody` sized by the image frame rule from `VideoMetadata`
  dimensions, the spec sheet gains fps, codec and audio rows, downloads unchanged.
- **`lib/helpers.ts`**: `isVideo(ext)` and a `VideoGenOutput` branch in `toCdnUrlConstituents` for
  the generated `.mp4`/`.webm` with the 24-character job id, and the user-upload aliased shape, so
  a video url never reads as a document.
- **Chips**: a `VIDEO` arm with the video icon, dormant until uploads widen, like the audio arm.
- **Settings**: `hooks/use-video-gen.ts` modelled on `use-gemini-img-gen.ts`: duration, aspect
  ratio, resolution, mode, source image, keyed by model with per-model options and defaults.

**Playback handoff is the one place video differs from audio.** The audio lane has one shared
`<audio>` element, so the feed and the lightbox are views of one timeline. A `<video>` element
must sit where it is painted, so the same trick needs a portal that moves the element between
surfaces. Not for the first cut: the feed card pauses when the lightbox opens and the lightbox
starts at the card's `currentTime`, which the playback store can carry as "last position by src".
Seamless handoff is a later refinement, if it is wanted at all for clips this short.

---

## 8. Backfill and operations

- A `backfill-video-metadata.ts` in the established `packages/db/src/test` pattern, for any
  `VIDEO` rows that exist before the extractor does. The current census is zero generated videos,
  so this may never run; the pattern costs nothing to keep.
- The image gains the libav runtime libraries for the frames superset (the FFmpeg 7 set on
  Debian trixie: libavformat, libavcodec, libswscale and their dependencies), not the ffmpeg CLI.
  Tens of megabytes, less than the CLI package, which pulls the same libraries plus the binary.
- Fargate CPU: one decoded frame and, at worst, one remux per generation. Not a sizing concern.
- Storage: clips of ten to fifteen seconds at 720p or 1080p land in the single-digit to low tens
  of megabytes; the generated prefix and CloudFront need nothing new.

---

## 9. Decisions and open questions

1. **Probe results first.** Both provider lanes have field names this plan deliberately does not
   invent. The two probes in §2 come before any contract line.
2. **Audio-track peaks on `VideoMetadata`**: adopt the column and the lightbox envelope, or skip
   and keep video silent in the spec sheet. Recommend adopting; the core is shared and the column
   is one line.
3. **Poster source per lane**: the frames superset always, or a provider thumbnail where
   offered. Decide after the omni probe.
4. **Progress transport**: chunk-ride (audio parity) versus a dedicated frame. Parity for now.
5. **Veo**: excluded from `isVideoGenModel`, code untouched, per the standing decision.
6. **Per-model limits**: duration, resolution and aspect options differ per model and per mode;
   they live in the validation package beside the image options once probed.
7. **User video uploads**: out of scope here. The chat input accepts images and documents only.
   When it widens, the `[0]`-style placeholder lesson from audio applies: finalize runs
   `analyzeVideoRemote` and the poster step; nothing is faked client-side.
8. **The `handleAiChatRequest` branch count** goes from sixteen to twenty with the video block. If
   the client-minted id work lands first, the create decision is already hoisted and the block
   adds two reachable creates and two updates, not four fresh predicates.

---

## 10. Landing order

1. **Probes**: omni text-to-video through Interactions; grok submit, poll, fetch. Record both as
   reference files beside the xAI Responses reference. Everything downstream reads them.
2. **videodown 0.1**: the base (specs, keyframes, the `complete` flag, fixtures and tests; the
   shared waveform core if peaks are adopted) and the `frames` superset (poster, frames, faststart
   remux) in one crate, two packages. Publish like pdfdown; add both to the `dd` catalog.
3. **Schema + contract**: the two tables, the enums and relations, the singletons, the request
   flag and fields, the two envelope types, the two constants if peaks are adopted. Migrate on dev.
4. **ws-server**: `isVideoGenModel`, the chat-request block, the `ExtractService` video arm, the
   poster step on the frames superset and the libav runtime in the image, the omni `case "video"`
   lane, the xAI videos client and its poll loop, the chat-response arm, the registry filter arm.
5. **Client**: context, bubble gate and width claim, card, adapter kind, lightbox and page
   bodies, parser branch, settings hook.
6. **Backfill script**, run on dev, then prod after deploy and migrate, in that order, if any rows
   exist.
7. **Later**: seamless playback handoff by portal, user video uploads, HLS if clips ever exceed a
   minute, the chips' video arm going live.

Verify live at the end of step 5: generate with omni and with grok, watch the frame hold its size
from the first progress tick to the poster to the playing video, open the lightbox mid-clip and
land at the same time, hard-load the attachment page and get the player, the spec sheet and both
downloads.
