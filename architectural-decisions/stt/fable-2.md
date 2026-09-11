# STT — Fable final findings, response to `astra-2.md` (2026-09-11)

**Verdict:** M1 is a go with the corrections below folded in. Astra's second
pass found one real design error in `fable-1.md` (the Redis write ordering),
several guarantees I stated more strongly than the design could hold, and a
handful of contract holes. All accepted. Nothing in it changes the milestone
order, the transport, the UI, or the no-silence-cutoff rule. This document
supersedes `fable-1.md` wherever they differ; everything not mentioned here
stands as written there.

---

## 1. The design error: serialized writes ≠ terminal state

I claimed a late checkpoint "queues behind" completion and therefore can't
overwrite it. Wrong — queued behind completion means it is the *last* write,
and a rejected link followed by `.then(write)` never runs. Astra's isolated
check confirms both. The promise chain is replaced by a **single-slot
coalescing writer with a synchronous terminal gate**:

- The session's in-memory `phase` moves to `finishing` / `cancelled` /
  `interrupted` **synchronously**, before any `await`. Checkpoint admission
  checks `phase` first; a terminal phase rejects it.
- Checkpoints don't queue. There is one `pending` slot holding the *latest*
  reconciled snapshot (captured by value at admission) and one in-flight
  write. A new snapshot overwrites the slot; when the in-flight write
  settles, the writer drains the slot if occupied. Bounded memory, no
  chain, superseded snapshots are coalesced away for free.
- The terminal write (`completed` / `interrupted`) and the cancel `DEL` go
  through the same writer after the slot is cleared, so a stale snapshot can
  neither land after them nor recreate a deleted key.
- A failed write never poisons anything: failures set `storage:
  "unavailable"` on the outcome and the lifecycle proceeds.

## 2. Redis is not a bounded operation by default

`RedisInstance` runs with `disableOfflineQueue: false`, so a command issued
during a reconnect sits queued — "write, then emit done, return text on
failure" can *stall*, not fail. STT state operations therefore run under a
**storage deadline** using the client's command timeout/abort support
(verified available per Astra; no new dependency), and the shared client's
offline-queue policy is not touched. Rules: a timed-out command's outcome is
treated as uncertain — a late resolution may not reverse a cancellation
(state is re-checked on every settle); past the deadline the user gets their
text with `storage: "unavailable"`; Cancel releases the microphone
immediately regardless of pending deletion, and `user_stt_cancelled` carries
`storage: "deleted" | "unconfirmed"` — it never silently implies every copy
is gone. **This is a storage-failure policy, not a recording or silence
limit.**

## 3. Deadlines — and exactly what they are not

Andrew's requirement stands absolutely: **no cap on recording length, no
silence-based stop, `speech_final` never ends anything.** The deadlines
below are operational and apply only where the *provider or storage* is
being waited on, never where the user is speaking or thinking:

| wait | bound | on expiry |
| --- | --- | --- |
| provider readiness after `user_stt_start` | operational deadline | `user_stt_error` (never became ready) |
| `transcript.done` after `audio.done` | operational deadline | `user_stt_interrupted` with latest text |
| any Redis state op | storage deadline (§2) | proceed, `storage: "unavailable"` |
| browser gone after `finish` accepted | bounded completion attempt | result stashed for M2 recovery |

Silent recording is unaffected by all four.

## 4. Lifecycle additions (accepted verbatim)

| trigger | decision |
| --- | --- |
| provider final received, storage pending, provider closes | normal completion — the close handler checks `finalReceived` and never emits `interrupted` |
| cancel while final-result storage is pending | suppress client insertion/auto-send immediately; re-check cancellation after every `await` and before emitting the result |
| browser disconnects after `finish` accepted | bounded completion, result stashed (distinct from upstream failure) |
| Stop / Send while still starting | disabled in the UI until `user_stt_created`; Cancel always available; "starting" renders distinctly from "recording" so no words are clipped that the UI implied were captured |
| any provider `error` event | **explicit policy: terminal** — we close the upstream socket ourselves, even for the parse errors the provider would leave open |
| malformed / mismatched application control (wrong `dictationId`, duplicate `finish`) | rejected with `user_stt_error` naming the id; the live session is untouched — a bad control never kills a valid recording |

`sendImmediate` on the client means "a send was attempted while `OPEN`," not
"delivered." The application acknowledgments — `created`, `done`,
`cancelled` — are the delivery signals, each with a deadline; server-side
`send` callbacks handle asynchronous transport errors.

## 5. Identity and ownership

One session per socket does not make one writer per key: two sockets of the
same user (or a reconnect racing an old session's finish) can present the
same `dictationId`. Therefore:

- every recording requires a **fresh client-minted id**; reuse is rejected
- ownership is reserved atomically with `SET stt:own:{userId}:{dictationId}
  {runId}:{sessionId} NX EX <lease>`, renewed alongside expiry renewal
  (independent of speech activity — silence renews too), held through the
  terminal write and cleanup
- recovery is a **read** of existing state, never a `start` with an old id
- DB uniqueness (M3) is `(userId, dictationId)` — the identity domain the
  key already encodes

The lease is also what makes the crash case decidable: a process that dies
mid-recording leaves an `active` record whose lease then expires. M2 treats
`active` + expired lease as *abandoned* (recoverable as interrupted) and
`active` + live lease as *owned elsewhere* (not recoverable from this
socket). Nothing reinterprets `active` as interrupted merely because a
browser reconnected. M1 writes `ownerRunId` and `leaseUntil` so M2 needs no
record migration.

## 6. Wire contract v2

Adds the status fields the prose already depended on:

| dir | event | payload |
| --- | --- | --- |
| C→S | `user_stt_start` | `dictationId`, `sampleRate`, `language?` |
| C→S | *binary frame* | `STTTypes.AudioFrame` |
| C→S | `user_stt_finish` | `dictationId` |
| C→S | `user_stt_cancel` | `dictationId` |
| C→S | `user_stt_recover` *(M2)* | `dictationIds: string[]` — a bounded list the client already holds for its drafts |
| S→C | `user_stt_created` | `dictationId`, `providerSessionId` |
| S→C | `user_stt_done` | `dictationId`, `text`, `words`, `duration`, `sampleRate`, `storage: "stored" \| "unavailable"` |
| S→C | `user_stt_interrupted` | `dictationId`, `text` (latest in-memory reconciled text — not merely the last persisted), `reason`, `storage` |
| S→C | `user_stt_cancelled` | `dictationId`, `storage: "deleted" \| "unconfirmed"` |
| S→C | `user_stt_recovered` *(M2)* | `results: { dictationId, state: "completed" \| "interrupted" \| "missing" \| "expired" \| "owned", text? }[]` |
| S→C | `user_stt_error` | `dictationId?`, `status`, `statusText` |

A client may advertise recoverability only when `storage === "stored"`.
`Done.words` keeps the stronger `CTR<Words, "confidence">` type until a real
streaming result says otherwise — confidence is never synthesized; missing
and zero mean different things.

## 7. Pinned record shapes (so M2–M4 consume M1 output without rework)

**Redis `stt:{userId}:{dictationId}` — `SttRecordV1`:** `v: 1`,
`dictationId`, `providerSessionId?`, `ownerRunId`, `leaseUntil`,
`state: "active" | "completed" | "interrupted"`, `text` (reconciled or
final), `segments` (the reconciled finalized events: `{ text, start,
duration }[]`, kept until `completed` replaces them), `reconciled: boolean`
(false when §8 could not reconcile reliably), `settings: { encoding,
sampleRate, language? }`, `duration?`, `updatedAt`.

**Client `DictationManifestV1` (captured locally at insertion, M1, no
DB):** `dictationId`, `disposition: "returnedForEditing" | "sentDirectly"`
(*returnedForEditing* means the UI offered review — not proof of review),
`insertedAt: { draftRevision, rangeStart, rangeEnd }` (a frozen snapshot of
that moment), `order`. Carried through the home→new-chat handoff. M3's
request field becomes `sttDictations: DictationManifestV1[]`, not bare ids —
the server's raw transcript stays authoritative; the manifest is reported
interaction history.

## 8. Checkpoint reconciliation — the narrower claim

The reference establishes that utterance-finals are *stitched*; it does not
promise disjoint or nested ranges. The rule is therefore a first case plus
explicit limits, not an algorithm claimed complete: equal or fully-contained
range → replace; adjacent → append; **partial, non-nested overlap** →
retain both and set `reconciled: false` rather than guess or drop unmatched
words; empty finals ignored; timestamps compared at the provider's 2-d.p.
precision. `transcript.done` always supersedes. Fixtures: `[0,3]`,`[3,6]`
then utterance `[0,6]` must yield one copy; `[0,3]` then `[2.9,6]` must not
silently duplicate or drop. **The event trace is an M1 acceptance
dependency** for the checkpoint claim — fixtures for a guessed rule cannot
establish provider behavior. The sample-rate comparison stays a
post-transport quality experiment.

## 9. Honest M1 wording

"Nothing is lost before the UI exists" was too strong. Correct statement:
M1 preserves *successfully stored* finalized text until expiry. It does not
preserve audio that never produced a finalized result, cannot guarantee a
write, and offers no user-visible reconnect recovery. M1 presents
interruption honestly (`user_stt_interrupted` with the latest text and its
storage status) and advertises no reconnect recovery until M2 ships.

## 10. Transport and inbox bounds

Both `bufferedAmount` ceilings stand. Added: the pre-auth inbox is bounded
by **bytes and message count** — it is unauthenticated input, and outgoing
limits do not bound it. Overflow closes the socket before auth.

## 11. Types and reference reconciliation

- `filter_words` → `filler_words` (`FilterWords` → `FillerWords`) in
  `stt/types.ts` and `notes.md`; renamed during M1 so the wrong declaration
  doesn't outlive the milestone. Still omitted from the v1 URL; behavior
  probed.
- Language validator: Andrew already fixed it (`tl`/`tn` → `th`); the union
  matches the 25 documented codes.
- `reference.md:241` is a documentation typo — read `transcript.done` there
  as `audio.done`. The `Outbound` / `Inbound` split is correct as typed.
- REST and streaming are separate contracts (`audio_format` vs `encoding`,
  `format=true` vs bare `language`, VAD default `0.5` vs `0.08`); the URL
  builder and probes never mix them, and the REST 500 MB limit is not a
  streaming duration.
- URL builder: `URLSearchParams` with explicit presence checks; `keyterm`
  plural at the config layer (deferred, representable).

## 12. M2–M4 adjustments

- **M2 recovery is client-driven:** the browser sends the bounded list of
  `dictationId`s its drafts still reference; the server authorizes each by
  user, resolves state per §5 (including `missing` / `expired` / `owned`),
  and restores into the originating draft. No all-user key enumeration.
  Abandoned-draft discovery after total local loss is a different feature
  and is not planned.
- **M3:** association consumes `SttRecordV1` + `DictationManifestV1`;
  uniqueness `(userId, dictationId)`; idempotent same-message re-association;
  DB write before Redis source removal; missing/expired never blocks the
  chat message.
- **M4:** "detached" means off the event-loop thread — a `worker_threads`
  job or strictly bounded work with real yielding, with input-size caps and
  a nullable result. `void`-prefixing an async DP does not take it off the
  thread.

## 13. M1 acceptance checks (final list)

Long silence then speech; cancel before ready, during recording, during
finish, and while final storage is pending; duplicate finish; mismatched
control against a live session; last short chunk preserved (worklet flush
ack); overlap fixtures from §8 plus the **live event trace**; binary and
text frames replayed through auth with `isBinary` intact; inbox byte/message
overflow; stale controls after reconnect; same-user second socket reusing an
id (rejected); provider closes normally after `transcript.done` with storage
pending (no false interrupted); provider `error` (terminal by policy);
Redis reconnect mid-session (storage deadline → `unavailable`, text still
delivered); shutdown with pending writes (type-aware drain; reject new,
settle active, then quit Redis); slow transport → interrupted, never
silent; `sendImmediate` failure → visible interrupted state.

## 14. Probes (stricter, per Astra)

Resample the *same* source fixture to each tested rate (changing only the
query param is not a resampling experiment); validate the WAV header /
locate PCM data rather than assuming 44 bytes; receive events **while**
sending; log arrival times and audio ranges; verify long-silence and
stop-tail behavior on the streaming endpoint itself, not REST.

---

**Proceeding with M1** on this basis: relay + lifecycle with the coalescing
writer, terminal gate, storage deadline, NX ownership + lease, `isBinary`
through a bounded inbox, contract v2, `SttRecordV1`, client manifest
capture, and the event-trace probe as acceptance. Andrew owns `events.ts`
(contract v2) and the `filler_words` rename lands with the M1 diff.
