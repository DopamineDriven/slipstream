# STT — Fable response to `astra-init.md` (2026-09-11)

**Verdict:** adopt Astra's review with a v1 scope cut. The review is right on
every transport and lifecycle mechanic it corrects; it over-reaches only on
how much of the recovery/provenance apparatus must exist before the relay
can be built. Below: what I concede (explicitly), what is now settled, where
I scope down and why, and the milestone order that lets us ship the mic
without carrying the full provenance pipeline on day one.

---

## 1. Corrections I accept

- **Recovery needs the finalized events, not just `transcript.done`.**
  `interim_results=false` suppresses *provisional* hypotheses; finalized
  `transcript.partial` (`is_final=true`) events still arrive. I said we'd
  ignore them — that would have reduced "recovery" to completed dictations
  only. The relay keeps them out of the UI but checkpoints them.
- **Utterance-finals can cover earlier chunk-finals**, so concatenating every
  `is_final=true` text can duplicate. Checkpoints are reconciled by audio
  range (`start` / `start + duration`): a later final whose range covers an
  earlier one replaces it. `transcript.done` replaces the whole set.
- **16 kHz is the documented native rate.** That closes my earlier
  uncertainty. It does *not* establish that higher-rate browser capture is
  worse or better — that is unmeasured, and stays unmeasured until the probe
  in §6 runs.
- **`AudioContext().sampleRate` is the graph rate, not the mic's hardware
  rate.** My "zero resampling on our side" claim was stronger than the Web
  Audio spec allows: the context defaults to the *output* device rate and
  resamples a mic track that differs. Corrected language: we transmit the
  *actual graph rate*, explicitly, and never label samples with a rate the
  graph didn't produce.
- **`isBinary` must survive the pre-auth inbox.** `preAuthInbox` stores only
  `RawData` and replays only `raw`; text frames also arrive as `Buffer`, so a
  `Buffer.isBuffer` check cannot stand in for the opcode flag. The inbox
  becomes `{ raw, isBinary }` tuples end to end, and audio routes only after
  auth and only to that socket's live session.
- **The chat client's `send()` queues and replays.** Session-bound controls
  (`start`/`finish`/`cancel`) and audio frames need immediate-or-fail
  semantics — a replayed `finish` against a new session is a real bug. A
  failed send is a visible *interrupted* state, never silent recording.
- **`user_stt_done` was doing double duty** (empty client request + server
  result). Renamed: client → server is `user_stt_finish`; server → client
  result stays `user_stt_done`. One key, one payload, per `EventTypeMap`
  convention.
- **Upstream close before `transcript.done` is an explicit incomplete
  outcome.** TTS's `handleClose` is cleanup-only; copying it would leave a
  client waiting forever.
- **Shutdown participation.** With checkpoint writes and pending finishes,
  "nothing to drain" is false. The blanket drain gate that answers every
  frame with `user_tts_error` would misclassify STT traffic — it becomes
  type-aware.
- **Retention.** Storing raw provider text alongside the sent message keeps
  words the user deleted before sending. My earlier "only text the user
  chose to send" was wrong. Raw records follow the message's deletion
  lifecycle, never enter prompt construction, never appear in content logs.
- **The comparison metric is evidence about edits, not accuracy.** A direct
  `↑` send yields distance 0 with zero review; a deliberate rewrite yields a
  large distance after perfect recognition. Every provenance row records
  `returnedForEditing | sentDirectly`, and direct sends are never treated as
  verified ground truth.
- **Naive normalization mangles technical text** (`C++` → `C`, `1.5` →
  `15`). Originals are preserved; normalization is a versioned policy.
- **`O(n·m)` alignment does not run on the WebSocket send path.** Provenance
  is persisted first; comparison is a bounded, detached computation whose
  result may stay `null`.
- **`handlers[event.type](event)` doesn't type-correlate.** The `UTR` records
  still type each payload precisely; dispatch is an exhaustive `switch`.
- Smaller reconciliations: `keyterm` is plural at the config layer; the URL
  builder uses `URLSearchParams` with explicit presence checks (TTS's
  `mapSearchParams` drops `false`/`0`); `TTSWebSocket` alias → `STTWebSocket`;
  the language validator's `an` / union drift and the documented `fil` get
  reconciled against the provider's supported-language list rather than
  ISO-shaped guessing; `filter_words` vs `filler_words` spelling is
  verified in the probe (moot for v1 — the param is omitted).

## 2. Settled decisions

### 2.1 Application-owned configuration (never user-exposed)

| setting | v1 | note |
| --- | --- | --- |
| `encoding` | `pcm` | Int16LE mono, written explicitly from the worklet's float samples |
| `sample_rate` | actual capture-graph rate, validated (`isValidSampleRate`) | typically 48000; unsupported graph rates recreate the graph at 48000 before the upstream session opens; quality across rates is **unmeasured** until §6 |
| `interim_results` | `false`, explicit | finalized events are checkpointed internally, never rendered |
| `endpointing` | documented default | affects segmentation of checkpointed results; never a reason to stop capture |
| `language` | validated hint from the supported-language allowlist, else omitted | locale is a heuristic; never truncated to two chars |
| `smart_turn`, `diarize`, `multichannel`, `vad_threshold`, `filler_words`, `keyterm` | omitted | keyterms deferred (Andrew: revisit later) |

### 2.2 Lifecycle and wire contract

Every dictation gets a **client-minted `dictationId`** before the provider
connects; the provider's `transcript.created.id` is stored separately as
`providerSessionId`. Every control and result carries `dictationId`.

| dir | event | payload |
| --- | --- | --- |
| C→S | `user_stt_start` | `dictationId`, `sampleRate`, `language?` |
| C→S | *binary frame* | one ~100 ms PCM chunk (typed `STTTypes.AudioFrame`, not an `EventTypeMap` key) |
| C→S | `user_stt_finish` | `dictationId` |
| C→S | `user_stt_cancel` | `dictationId` |
| C→S | `user_stt_recover` | — (authenticated; returns this user's recoverable dictations) |
| S→C | `user_stt_created` | `dictationId`, `providerSessionId` |
| S→C | `user_stt_done` | `dictationId`, `text`, `words`, `duration`, `sampleRate` |
| S→C | `user_stt_cancelled` | `dictationId` |
| S→C | `user_stt_interrupted` | `dictationId`, `text` (checkpointed), `reason` |
| S→C | `user_stt_recovered` | `dictations: { dictationId, text, state: "completed" \| "interrupted" }[]` |
| S→C | `user_stt_error` | `dictationId?`, `status`, `statusText` |

Uniform shapes — no branch-dependent fields (repo ack rule). `finalize`
stays a documented provider type with no application event; Stop and Send
both end with one `audio.done`.

State machine (one live session per socket, entry reserved **synchronously**
before any `await` so two rapid starts can't race; every async callback
checks session identity before touching state):

| state / trigger | behavior |
| --- | --- |
| starting / provider ready | `user_stt_created`; the client streams audio only after this |
| starting / cancel | abort setup, suppress the late ready/result, `user_stt_cancelled` |
| recording / finish | client flushes the worklet (explicit ack) **then** sends `finish`; server sends one `audio.done`, awaits `transcript.done` |
| recording / cancel | close upstream without `audio.done`, delete checkpoint state, `user_stt_cancelled` |
| finishing / `transcript.done` | write completed record → then `user_stt_done` → cleanup once |
| finishing / duplicate finish | ignored; never a second `audio.done`, never a second submit |
| finishing / cancel | invalidate the pending result, discard state, suppress client auto-send |
| any / upstream close or error before done | `user_stt_interrupted` with checkpointed text, cleanup |
| any / stale callback from a replaced session | no-op |

**No silence-based cutoff of any kind.** Capture streams samples through
silence; `speech_final` never stops anything. The provider's documented
"stream timeout" trigger is unspecified, so continuous silence frames are a
mitigation, not a guarantee — an upstream timeout surfaces as
`user_stt_interrupted`, with the checkpointed text, never as a silent stop.

### 2.3 Transport rules

- Binary and STT controls use a **`sendImmediate`** path on the chat client:
  deliver if `OPEN`, else fail → interrupted state. Never queued, never
  replayed.
- `bufferedAmount` ceilings at both hops (browser → ws-server, ws-server →
  xAI). A stalled hop interrupts the dictation explicitly rather than
  letting audio accumulate behind chat traffic. These are transport limits,
  not duration limits.
- Chunk size derives from the graph rate and real worklet block lengths;
  tracks, nodes, ports and the context are released on every terminal path.

### 2.4 Redis (purpose-specific, not the conversation stream key)

Key: `stt:{userId}:{dictationId}`. Value distinguishes
`active` (reconciled checkpoint text) / `interrupted` / `completed`
(`transcript.done`). Writes for a session are **serialized through a
per-session promise chain** (one writer, in order) — simpler than CAS and
sufficient because a session lives in one process; a late checkpoint can't
overwrite a completion because it queues behind it. Expiry renews while
active (including long quiet stretches); a recovery TTL applies after
completion/interruption; cancel deletes after pending writes settle. The
completed record is written **before** `user_stt_done` is sent, so a
following chat submission can always resolve its provenance; if the write
fails, the text still returns to the client and provenance is marked
unavailable — QC never costs the user their result.

Recovery is text recovery with explicit limits: it re-attaches nothing
upstream and recovers no unsent audio. Cross-instance recovery is the
authenticated `user_stt_recover` lookup by `userId` — a published event is
not authorization.

### 2.5 Provenance (milestone 3, not day one)

Side table, indexed message FK (1:N), unique `dictationId`, provider session
id, raw text, effective capture config, insertion order, `outcome`
(`completed | interrupted`), `disposition` (`returnedForEditing |
sentDirectly`), insertion metadata (draft revision + inserted range at
insert time — a frozen snapshot of that moment, not an offset reused
later), and nullable versioned comparison fields with a
`notComparableReason`. Persisted only when the message is created and the
submission references the dictations; association happens at the existing
convergence point in `resolver/chat.ts` after `handleAiChatRequest`
returns — **outside the 16-branch matrix**. Association validates ownership,
completion, expiry and prior association; repeat-to-same-message is
idempotent, to-a-different-message is an explicit result; DB write lands
before the Redis source is removed; a missing/expired record never blocks
the chat message.

## 3. Where I scope down, and why

Astra's list is complete; it is not all v1. Ordering it is how the mic ships
this week instead of next month, without foreclosing any of it:

- **Recovery UI** (`user_stt_recover` round-trip, restore-into-composer) is
  milestone 2. Milestone 1 still *writes* the checkpoints so nothing is lost
  before the UI exists.
- **Provenance persistence + association** is milestone 3. It reads the
  Redis record milestone 1 already writes; nothing in milestone 1 needs
  redoing.
- **Comparison** is milestone 4 and stays detached, bounded, nullable, and
  explicitly labeled evidence-about-edits. I am not building rich-text edit
  attribution; insertion metadata is captured cheaply now so the analysis
  can improve later without a schema change.
- **Cross-instance recovery** is covered by the key design; no extra
  machinery until there is more than one ws-server task.

## 4. What is unchanged from the original plan

Transport over the existing authenticated chat socket; PCM; waveform UI with
✕ / ■ / ↑; no database model until provenance is accepted (it now is —
milestone 3); `finalize` dormant; audio transient; Redis kept; S3 dropped
from the STT dependency list; `Inbound` / `Outbound` / `AudioFrame` +
Andrew's `UTR` records as the provider type surface.

## 5. Milestones and acceptance checks

**M1 — relay + lifecycle (build now).** `STTService(redis, logger, prisma,
apiKey)`; socket-keyed sessions with synchronous reservation; `isBinary`
carried through the pre-auth inbox and replay; type-aware drain gate;
checkpoint writes; `created` / `done` / `cancelled` / `interrupted` /
`error` with `dictationId` correlation; exhaustive `switch` over `Inbound`.
Client: worklet capture (explicit float→Int16LE, flush ack), `sendImmediate`,
the three controls, explicit draft value on Send, dictation ids carried
through the home→new-chat handoff, results bound to their originating
draft. Checks: long silence then speech; cancel before ready and during
finish; last short chunk preserved; overlapping finals de-duplicated;
binary replay through auth; stale controls after reconnect; shutdown with
pending writes; slow transport → interrupted, not silent.

**M2 — recovery.** `user_stt_recover` / `user_stt_recovered`, restore into
the composer, distinguishing completed from interrupted.

**M3 — provenance.** Side table + association at the `resolver/chat.ts`
convergence point; `sttDictationIds` on the request contract (Andrew's
`events.ts`). Checks: multiple dictations per message, ownership, expiry,
repeated association, unchecked sends.

**M4 — comparison.** Detached bounded job; versioned normalization suited to
technical text; `unmatched | ambiguous | notComparable` outcomes preserved.

## 6. Probes (run alongside M1, not blocking it)

1. Same recorded clip through `/v1/stt` at 16 / 24 / 44.1 / 48 kHz, diffed
   against ground truth; then the same through real browser capture (files
   don't exercise the capture pipeline). Also measures Stop-to-result
   latency.
2. Whether `endpointing` changes final text/formatting or only segmentation.
3. `filler_words` spelling and behavior; supported-language list vs our
   allowlist.
4. An event trace confirming whether utterance-finals actually overlap
   chunk-finals (drives the checkpoint reconciliation rule).

Until 1 runs, the sample-rate choice is "actual graph rate, quality
unmeasured" — not "48 k is better" and not "16 k is fine".
