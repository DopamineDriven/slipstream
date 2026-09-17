Fable — the milestone order in `fable-1.md` is reasonable. The relay and manual dictation UI can be built before provenance persistence and comparison. My remaining concerns are about making the guarantees assigned to each milestone hold. In particular, serializing Redis writes does not enforce terminal state, and writing checkpoints without a recovery path does not yet deliver recovery to the user.

I read the complete copied `reference.md`, your complete update, and the revised STT service/types. I also checked the existing Redis configuration and installed client implementation. These are additional findings as of September 11, 2026; I have not run a live transcription or browser capture probe.

The language union now matches all 25 codes in [the copied language table](/home/dopaminedriven/cloneathon/t3-chat-clone/architectural-decisions/stt/reference.md:76). The runtime validator still has a small transcription error:

| Definition | Result against the reference |
| --- | --- |
| `QueryParameters.Language` | Exact match: 25 codes. |
| `isValidLanguage` JSDoc | Matches the intended list. |
| `isValidLanguage` implementation | Accepts 26 codes: incorrectly includes `tl` and `tn`, and omits `th`. |
| Andrew's note | fixed. |

The concrete correction is to replace the `tl` / `tn` branches with `th` in [the validator](/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/stt/index.ts:79). `fil` is already correct in both definitions. I verified the sets mechanically against the Markdown table. An unused validator can pass a project typecheck while its inferred predicate disagrees with the provider type; checking these sets is useful independently of compilation. Keep the compiler-inferred predicate rather than annotating it as a boolean.

The copied reference settles several documentation questions, but it also contains a typo and mixes two endpoint contracts:

- Both parameter tables use `filler_words`. The local type/property still says `FilterWords` / `filter_words`. The documented spelling is settled; a probe can verify actual behavior. Omitting the option in M1 is fine, but leaving the incorrect declaration indefinitely would preserve a future integration bug.
- The sentence at [reference.md:241](/home/dopaminedriven/cloneathon/t3-chat-clone/architectural-decisions/stt/reference.md:241) says `transcript.done` tells the server to flush and close. That conflicts with the adjacent client-message list and both examples. Read that sentence as `audio.done`: the client sends `audio.done`, and the provider responds with `transcript.done`. The existing `Outbound` / `Inbound` separation is correct.
- The REST body uses `audio_format`, requires `format=true` with `language` for formatting, and lists a default VAD threshold of `0.5`. The streaming query uses `encoding`, describes `language` as the formatting hint, and lists `0.08`. Keep these contracts separate in the URL builder and probes. The REST file-size limit is not a documented maximum duration for a WebSocket session.
- The REST response example omits word confidence. That alone does not invalidate the stronger streaming `Done.words` type, because this is a different response. Verify a real streaming result before changing that guarantee or synthesizing missing confidence values. Missing confidence and confidence zero have different meanings.

The highest-priority correction to your implementation plan is in [the Redis section](/home/dopaminedriven/cloneathon/t3-chat-clone/architectural-decisions/stt/fable-1.md:148). It says a late checkpoint cannot overwrite completion because it queues behind completion. Queuing it behind completion would make the checkpoint the last write. A promise chain guarantees execution order; it does not decide which writes remain valid.

A small isolated JavaScript check confirmed both relevant behaviors: enqueueing `completed` followed by `active` leaves `active` stored, and a rejected chain followed only by `.then(write)` never runs that later write. The implementation needs these rules in addition to serialization:

1. Change the in-memory lifecycle state synchronously when accepting a final result or cancellation, before awaiting Redis. Reject subsequent checkpoint admission for that terminal outcome.
2. Capture the checkpoint payload at admission time. Queued writes must not read a mutable session object that has since changed meaning.
3. Handle write failures so they do not permanently poison the queue. Final-result delivery and cancellation cleanup must still execute; the failure should affect reported storage availability.
4. Stop admitting writes before cancellation deletion is queued. Otherwise a newly admitted write can recreate the key after deletion.
5. Bound pending checkpoint work. Coalesce superseded snapshots if storage falls behind; an unlimited promise chain can retain an unlimited number of transcript copies.

There is also an existing configuration that makes the fallback more consequential than a catch block. [RedisInstance](/home/dopaminedriven/cloneathon/t3-chat-clone/packages/redis-service/src/service/index.ts:25) sets `disableOfflineQueue: false`. I checked the installed client's queue handling: commands can remain queued during reconnection. Consequently, “write completed record, then emit done; return text if the write fails” can stall while waiting for a command that has not failed yet.

Give STT state operations a bounded wait, including time spent behind earlier writes. The installed client exposes command timeout/abort support, so this need does not require a new dependency. A `Promise.race` timeout alone only stops waiting; it does not cancel the queued command. Account for commands already sent whose outcome is uncertain, and prevent late results from reversing cancellation. Do not change the shared client's offline-queue policy globally to solve an STT-specific latency requirement.

Once that storage deadline passes, return the available final text with storage availability explicitly represented. Likewise, release the microphone immediately on Cancel even if checkpoint deletion is still pending. A cancellation acknowledgment must have a defined meaning when durable deletion could not be confirmed; it must not silently imply that every stored copy was removed. This is a storage failure policy, not a recording-duration or silence cutoff.

The terminal-event sequence needs one more distinction: receiving the provider's final result and delivering the application result are separate moments. The provider can send `transcript.done`, then close normally while the Redis write is still pending. The close handler must see that the provider result was already received and avoid emitting `user_stt_interrupted` during that normal completion.

I would make these additional state-machine cases explicit:

| Trigger | Required decision |
| --- | --- |
| Provider final received, Redis pending, provider closes | Continue delivering the captured final result; do not classify the close as an interrupted transcription. |
| Cancel while final-result storage is pending | Immediately suppress client insertion/auto-send; check cancellation again after each await and before sending the result; serialize cleanup after admitted writes. |
| Browser disconnects after Finish was accepted | Allow a bounded completion attempt and save its result for later recovery. This differs from an upstream failure. |
| Stop or Send while still starting | Define the UI behavior. My preference is to allow Cancel, with Stop/Send enabled only after recording becomes ready. |
| Provider never becomes ready, or never finishes after Stop | Reach a typed failure/interruption after a bounded operational deadline. Keep ordinary silent recording unaffected. |

The original reference says some provider parse errors leave the connection open, while your table treats every upstream error as terminal. An application can intentionally close its STT session on every provider error; just make that an explicit policy and close the upstream socket as part of it. Separately distinguish rejected application controls from terminal session failures: a malformed or mismatched Finish should not accidentally kill another valid recording on the same socket.

The proposed event table also omits information that later paragraphs rely on. In [the wire contract](/home/dopaminedriven/cloneathon/t3-chat-clone/architectural-decisions/stt/fable-1.md:96), `user_stt_done` has no field for the promised “provenance unavailable” outcome. Add a consistent storage/recovery status to final and interrupted results, or another explicit typed notification. A client must not advertise recoverability merely because it received text.

Also define whether `user_stt_interrupted.text` is the latest reconciled in-memory text or the last successfully persisted text. I recommend returning the latest available text while separately reporting whether it is recoverable from Redis. Otherwise, a Redis outage could discard good text already available in the process.

For `sendImmediate`, `OPEN` means that a send can be attempted; it does not prove that the server received or acted on the control. Use Created, Done, and Cancelled as application acknowledgments, with failure/deadline handling for commands that never produce them. Server-side send callbacks must account for asynchronous transport errors. This is especially relevant when the socket fails immediately after `send()` returns.

A single session per socket does not prove one writer per Redis key. Two sockets belonging to the same user can submit the same client-minted `dictationId`, creating independent chains that write `stt:{userId}:{dictationId}` even within one process. A reconnect can encounter the same issue while the old session is finishing.

Require a fresh ID for every new recording, reject an already-owned ID across sockets, and treat recovery as a read of existing state rather than another Start using the old ID. Where concurrent server processes can accept starts, the reservation must be atomic across those processes. Keep ownership through terminal writes and cleanup. These are distinct from the existing socket reservation, and sharing a Redis key naming scheme does not enforce them.

The recovery design has an unresolved crash case too. If the process dies while recording, its last checkpoint remains `active`; no callback gets to write `interrupted`. Your recovered-result union only exposes completed or interrupted records. Specify how an orphaned active record becomes recoverable. Preserve an owner/run identifier and a liveness/lease signal independent of speech activity, then distinguish a still-owned session from an abandoned one. Do not reinterpret every active record as interrupted just because the requesting browser reconnected; a different socket or process may still own it. This matters after a restart even if the normal deployment has one server task.

For M2, I would simplify the proposed all-user lookup. Let the client request a bounded list of pending dictation IDs already associated with its drafts. Authorize each using the authenticated user, and return explicit missing/expired results as well as recoverable ones. This avoids needing to discover every matching Redis key, avoids returning already-consumed dictations from unrelated tabs, and gives each recovered result an existing draft destination.

If the intended feature is instead to discover abandoned drafts after the browser loses all local identifiers, that is a different recovery capability: it requires an enumeration strategy and enough draft metadata for the user to choose what to restore. The current key format alone does not provide either. Neither recovery mode should automatically submit restored text.

The range-reconciliation rule also needs a narrower claim. [The reference](/home/dopaminedriven/cloneathon/t3-chat-clone/architectural-decisions/stt/reference.md:227) establishes that utterance-final text can be stitched; it does not promise that every pair of event ranges is disjoint or perfectly nested. “A later range contains an earlier one, so replace it” is a reasonable first case, not a complete algorithm.

At minimum, cover equal ranges, adjacent ranges, full containment, partial overlap, empty final events, and the precision of reported timestamps. A useful fixture is chunks `[0, 3]` and `[3, 6]`, followed by an utterance final `[0, 6]`: the recovered text should contain one copy of the utterance. Then exercise a non-nested overlap such as `[0, 3]` followed by `[2.9, 6]`. Do not silently concatenate both or drop an entire range if that loses unmatched words. If a result cannot be reconciled reliably, preserve the recovery limitation explicitly. A complete `transcript.done` still supersedes these interim recovery structures.

The event trace can run alongside implementation, but it is an acceptance dependency for M1's claimed checkpoint correctness. That is different from the sample-rate comparison, which can remain an optimization/quality experiment after the transport operates correctly. Unit fixtures for a guessed overlap rule alone cannot establish the provider's actual behavior.

Your M1/M2 split should also change the wording “nothing is lost before the UI exists.” Checkpoints preserve successfully stored finalized text until expiry. They do not preserve audio that has not produced a finalized result, guarantee a successful write, or provide a user-visible way to recover a lost socket in M1. It is reasonable to defer recovery UI, provided M1 presents interruption honestly and does not advertise reconnect recovery before M2.

For M3, the proposed request field `sttDictationIds` cannot carry all the provenance you intend to store. The server can obtain raw provider text and capture settings from its own record. Only the client knows insertion order/range/revision and whether a particular dictation was returned for editing or sent directly. Define a typed per-dictation submission manifest carrying that client-owned metadata alongside the ID. Keep the server's raw transcript authoritative, and regard client metadata as reported interaction history rather than proof of human review.

Capture that manifest locally when insertion happens, including before the home-to-new-chat handoff. It does not require a database in M1. Without such capture, M3 cannot reconstruct past editor actions merely by reading M1's Redis record. Pin a small versioned Redis record shape now if later milestones will consume it, including effective settings and provider/session identity; “no rework” should not depend on an unspecified record layout.

Database uniqueness should match the identity domain: a user-scoped Redis key naturally pairs with uniqueness on `(userId, dictationId)`, unless the server explicitly guarantees globally unique application IDs. For metrics, `returnedForEditing` means the UI offered review, not that the user actually reviewed or corrected the result.

Finally, “detached computation” needs an execution meaning. Calling an async alignment function with `void`, or putting its CPU loop in a promise callback, still runs that loop on the server's JavaScript thread. For sufficiently large inputs, use a worker/offline analysis process, or strictly bounded work with real yielding. M4 can stay deferred and nullable without choosing its complete execution machinery in M1.

The copied examples are helpful illustrations, but the probes should be stricter:

- Start from a known source fixture and actually convert its samples for each tested rate. Changing only `sample_rate` is not a resampling experiment. Hold other parameters fixed for the rate comparison.
- Both examples assume a 44-byte WAV header. Enforce that fixture assumption, or locate and validate the PCM data and format before streaming. Do not send header bytes as audio or benchmark a mislabeled file.
- Receive events while sending audio. The Python example begins consuming subsequent events after it sends `audio.done`; that is unsuitable for measuring when checkpoints become available during recording.
- Capture event arrival times and audio ranges. Verify long silence and stop-tail behavior on the same streaming endpoint used in production; a REST transcript is not a substitute.
- Bound the pre-authentication inbox by both bytes and messages. Its current `preAuthInbox.push(raw)` is unbounded, and outgoing `bufferedAmount` limits do not bound incoming unauthenticated data.

I would proceed with M1 once the runtime language typo, terminal-state/write ordering, bounded Redis fallback, per-ID ownership, and result-status contract are reflected in the implementation plan. Recovery discovery and orphan handling belong to M2, with the needed identity metadata established in M1. Provenance association and comparison can retain your M3/M4 order.
