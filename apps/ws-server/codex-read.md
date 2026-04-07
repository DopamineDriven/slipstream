# Implementation Plan: Detached In-Flight Work Completion

## Context

When a client disconnects mid-stream (mobile sleep, network drop, page reload, hardware mute → backgrounded tab), in-flight server work should run to completion server-side rather than being aborted. The user's principle: "rather let the agent continue until completion if it's already in flight than deal with resumability — at least that way when they navigate back or reconnect to the internet the full response is already there."

**Concrete bugs this fixes:**

1. **TTS COUPLED→FAILED overwrite** (`apps/ws-server/src/tts/index.ts:329-490`). `finalize()` wraps persist + notify in one try/catch. When the client socket dies before the trailing `ws.send(user_tts_response)`, the throw cascades into `handleStreamError`, which calls `updateTTSJobStatus(..., "FAILED")` — overwriting the COUPLED status that was just written one block earlier. S3 file and `Attachment` row persist successfully but the `TTSJob` row says FAILED. Next request deletes the FAILED job and re-generates → orphaned S3 object + double charge.

2. **TTS chunk send unguarded** (`apps/ws-server/src/tts/index.ts:616`). `handleMessage` calls `ws.send(user_tts_chunk)` per PCM frame with no try/catch. After client disconnect, every subsequent chunk throws and propagates up through `xaiWs.emit('message', ...)`, killing the streaming loop before `audio.done`.

3. **Server graceful shutdown drops in-flight work** (`apps/ws-server/src/ws-server/index.ts:266-274, 449-454`). `ws.on("close")` carries a TODO about awaiting in-flight processes; `WSServer.stop()` calls `wss.close()` immediately with no drain. `kill -SIGTERM` mid-TTS-finalize cuts the job off.

4. **Generalization to AI chat / image gen.** Every provider service (`anthropic`, `openai`, `gemini`, `meta`, `mistral`, `cohere`, `xai`, `vercel`, `kimi`, `deepseek`, `zai`) and image-gen service has the same `ws.send`-throws-on-dead-socket pattern. **Important finding from codex's plan, verified during exploration:** AI chat has *partial* detach infrastructure — it dual-writes (`ws.send` + `redis.publishTypedEvent(streamChannel, ...)` at anthropic/index.ts lines 731, 796, 915) and has an existing replay mechanism (`anthropic/index.ts:118` "replay check"). The Redis path is already the authoritative delivery mechanism for chat. **However, this is partial infrastructure, not full detach safety** — many providers still mix direct socket sends into the hot path with no `ws.readyState` guard, so a dead socket throw still aborts the streaming loop before persist. Phase 2 for chat/img-gen is an *audit + best-effort wrap*, not a persistence rebuild — but the audit must be thorough because the existing dual-write doesn't immunize against the throws.

5. **Resolver-layer sends.** `ws.send` is not confined to provider services. It exists in 8 resolver files (`resolver/tts.ts`, `resolver/chat.ts`, `resolver/connection.ts`, `resolver/dispatch.ts`, `resolver/asset-complete.ts`, `resolver/asset-fetch.ts`, `resolver/asset-attach-or-paste.ts`, `resolver/chat-utils.ts`), including replay paths and error responders. The `trySend` rollout in Phase 2 must cover the resolver layer, not just providers.

6. **Asset-upload boundary clarification.** Server-side post-upload processing (PDF conversion, image compat, vector embedding) is detach-safe and belongs in the Phase 2 generalization. The *client-to-server byte stream itself* cannot survive disconnect — if a mobile user is uploading a 50MB PDF and their network drops mid-stream, those bytes are lost. There is no "let it complete" semantics for in-flight uploads from the client side. The detach pattern only applies once the bytes are server-side and processing has begun.

**Intended outcome:** socket delivery becomes best-effort across the entire ws-server. Server-side work completion is authoritative for every workload type. Reconnecting clients re-fetch durable state (DB row for chat, `user_tts_response_preexisting` for TTS, `Attachment` row for image gen) — no resumability protocol, no chunk numbering, no offset tracking.

---

## Phase 1: TTS detach + drain (the immediate bug)

Scope: TTS only. Fixes the COUPLED→FAILED overwrite, makes TTS streaming dead-socket safe, adds drain for graceful shutdown.

### Step 1.1 — `trySend` helper + split `finalize` (the bug fix)

Edit `apps/ws-server/src/tts/index.ts`:

- Add `protected trySend<T extends keyof EventTypeMap>(ws, type, data): boolean` on `TTSService`. Checks `ws.readyState !== ws.OPEN`, wraps `ws.send(JSON.stringify({ ...data, type }))` in try/catch, logs `debug` on failure, returns boolean.
- Split `finalize()` into two failure domains:
  1. **Persist phase** (try): `s3.uploadGenerated`, `prisma.createAttachment`, `prisma.updateTTSJobStatus → COUPLED`, `ttsJobCache.set`. Failure → `handleStreamError` (marks FAILED).
  2. **Notify phase** (separate, best-effort): `this.trySend(ws, "user_tts_response", {...})`. Failure must NOT mutate the COUPLED job — log and move on.
- Replace direct `ws.send` in `handleMessage`'s chunk path (line 616) with `this.trySend(ws, "user_tts_chunk", {...})`. Same in `handleStreamError`'s `user_tts_error` send.
- Add a single `clearInflight(messageId)` cleanup helper that replaces all scattered `this.inflight.delete(messageId)` calls (currently lines 484, 486, 499). One call site, no drift.

**Files:** `apps/ws-server/src/tts/index.ts`

### Step 1.2 — TTS in-flight registry (drain primitive)

Edit `apps/ws-server/src/tts/index.ts`:

- Keep existing `inflight: Set<string>` for duplicate-request prevention (used in `resolver/tts.ts:88`).
- Add a purpose-specific TTS registry:
  ```ts
  private inflightByUser = new Map<string, Map<string, () => void>>();
  private inflightPromises = new Map<string, Promise<void>>();
  ```
- In `streamToClient` (line 528) immediately after `this.inflight.add(messageId)`, create a `Promise.withResolvers<void>()`, store the resolver in `inflightByUser`/`inflightPromises`.
- Extend `clearInflight` from Step 1.1 to also resolve the per-job promise and prune both maps.
- Public APIs:
  ```ts
  public async awaitUserInflight(userId: string, timeoutMs?: number): Promise<void>
  public async awaitAllInflight(timeoutMs?: number): Promise<void>
  ```
  Both resolve immediately when no jobs are active. Both must NOT throw on timeout — they return after either completion or timeout.

**Drain implementation: `Promise.withResolvers` + while loop with re-snapshot.** A one-shot `Promise.race([Promise.all(snapshot), timeout])` has a snapshot-freshness bug — between calling `awaitAllInflight()` and the snapshot resolving, existing connected clients can fire new `user_tts_request` events (the drain runs *before* `wss.close()`, so message listeners are still attached). New jobs registered after the snapshot are invisible to the await, the drain returns prematurely, and `wss.close()` cuts off the brand-new in-flight job. The while loop re-snapshots on each iteration so new arrivals are caught.

```ts
public async awaitAllInflight(
  timeoutMs = Number(process.env.INFLIGHT_DRAIN_TIMEOUT_MS) || 90_000
): Promise<void> {
  if (this.inflightPromises.size === 0) return;

  const { promise: drainComplete, resolve: resolveDrain } =
    Promise.withResolvers<void>();
  const deadline = Date.now() + timeoutMs;
  const POLL_INTERVAL_MS = 5_000;

  const tick = async () => {
    if (this.inflightPromises.size === 0) {
      this.logger.info("Drain complete: all in-flight TTS work finished");
      resolveDrain();
      return;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      this.logger.warn(
        { remaining: this.inflightPromises.size },
        "Drain deadline exceeded, abandoning in-flight work"
      );
      resolveDrain();
      return;
    }

    this.logger.info(
      { remaining: this.inflightPromises.size, msUntilDeadline: remainingMs },
      "Draining in-flight TTS work"
    );

    // Re-snapshot on each iteration so newly registered jobs are awaited.
    // Promise.race with a poll interval gives us event-driven completion in the
    // common case (snapshot resolves) and a polling fallback for re-snapshotting
    // (max 5s latency between new job arrival and being awaited).
    const snapshot = Array.from(this.inflightPromises.values());
    await Promise.race([
      Promise.all(snapshot),
      new Promise<void>(r =>
        setTimeout(r, Math.min(remainingMs, POLL_INTERVAL_MS))
      )
    ]);

    void tick();
  };

  void tick();
  return drainComplete;
}
```

`awaitUserInflight` follows the same shape but iterates `inflightByUser.get(userId)` instead of the global map.

**Default timeout: 90 seconds (env-overridable via `INFLIGHT_DRAIN_TIMEOUT_MS`).**

Rationale: this codebase deploys to **ECS Fargate** (`infra/deploy-ws-server-full.sh:63` → `--launch-type FARGATE`), which has a hard-capped `stopTimeout` of **120 seconds**. There is no escape hatch — Fargate sends SIGKILL at SIGTERM + 120s regardless of application configuration. The 90s drain default leaves ~30s of headroom for `redis.quit()` + `wss.close()` + container teardown, all fitting inside Fargate's 120s ceiling.

- TTS jobs: ~5-30s typical → safely fits.
- AI chat streams (Phase 2): typically 10-60s → fits.
- Image generation (Phase 2): typically 10-60s → fits.
- Worst case (long Anthropic stream finishing + TTS finalize ≈ 60-90s) → fits at the edge.

The env var (`INFLIGHT_DRAIN_TIMEOUT_MS`) lets you raise this without a code change if you ever migrate off Fargate (k8s on EKS, EC2-launched ECS, or bare metal — none of which have Fargate's 120s cap).

**Files:** `apps/ws-server/src/tts/index.ts`

### Step 1.3 — WSServer integration with shutdown admission control

Edit `apps/ws-server/src/ws-server/index.ts`:

- Add `private isDraining = false;` instance field. This is the **shutdown admission gate** — once `stop()` flips it true, no new long-running work can be admitted. Re-snapshot loops alone are insufficient because they only catch *late registrations*; the admission gate prevents new clients (or existing clients) from creating fresh in-flight jobs during the drain window.

- Add a setter for TTSService (matches existing `setResolver` pattern at line 293):
  ```ts
  public setTTSService(ttsService: TTSService) {
    this.ttsService = ttsService;
  }
  ```
  Setter injection is a **deliberate workaround for construction order**, not a stylistic preference. `WSServer` is currently instantiated at `apps/ws-server/src/index.ts:147` but `TTSService` not until line 267. Constructor injection would force a broader reordering of the entire service-construction sequence in `index.ts`. The `setResolver` precedent at line 293 already establishes setter-injection as the codebase pattern for "service constructed after WSServer." We follow it.

- `ws.on("close", (code, reasonBuf) => { ... })` (currently lines 275-285):
  - Decode `reasonBuf.toString("utf-8")` once.
  - `this.logger.debug({ userId, code, reason: reason || undefined }, "ws close — in-flight server work continues")`.
  - Delete `userMap`/`userDataMap` immediately (safe — userId is closure-captured into all in-flight TTS frames per `streamToClient` parameter passing).
  - **Remove the TODO comment.** The drain responsibility moves to `stop()`, not the per-socket handler.
  - Do NOT cancel in-flight TTS jobs.

- **Message admission gate** in `ws.on("message", raw => ...)` (currently lines 267-274). Pseudocode:
  ```ts
  ws.on("message", raw => {
    if (this.isDraining) {
      // Reject new long-running work during shutdown drain.
      // Use a typed shutdown/draining event matching an EXISTING contract in
      // EventTypeMap — do NOT invent a new event shape inline. Inspect
      // @slipstream/types EventTypeMap before implementing; the closest
      // existing match is likely one of the per-feature error events
      // (e.g. user_tts_error / ai_chat_error) — confirm the actual fields
      // (status / statusText / message / code / etc.) before wiring this up.
      this.trySend(ws, /* existing event type */, /* matching payload */);
      return;
    }
    if (this.resolver) {
      const uid = this.userMap.get(ws) ?? "";
      this.resolver.handleRawMessage(ws, uid, raw, userData);
    } else {
      ws.send(JSON.stringify({ error: "No resolver configured" }));
    }
  });
  ```
  Rejecting *all* new messages during drain is the simplest correct behavior for Phase 1 since TTS is the only registered drain consumer. Phase 2 may refine this to only reject *long-running* work types (TTS request, AI chat request, image gen request) while still accepting cheap events like `ping` / `provider_context_pong` so connected clients don't see false-positive errors. For now, simplicity wins.

- `stop()` (line 449) — full shutdown sequence in order:
  ```ts
  public async stop(): Promise<void> {
    this.logger.info("Shutdown initiated, entering drain mode");
    this.isDraining = true;  // 1. Stop admitting new long-running work
    await this.teardownPubSub();
    if (this.ttsService) {
      await this.ttsService.awaitAllInflight();  // 2. Drain in-flight work
    }
    await this.redis.quit();  // 3. Tear down Redis
    this.wss.close();  // 4. Close listening socket + existing client sockets
    this.logger.info("Server shut down");
  }
  ```
  **Critical ordering:**
  1. Set `isDraining = true` *first* — message admission gate now blocks new work.
  2. `teardownPubSub()` — stop receiving cross-instance Redis events.
  3. `await ttsService.awaitAllInflight()` — wait for currently-running jobs to finish (re-snapshot loop catches anything that slipped in between flag flip and message-handler check; `Promise.race` against the env-configurable 90s ceiling caps the wait).
  4. `await redis.quit()` — Redis goes away only after all consumers are done with it.
  5. `this.wss.close()` — close the listening socket *and* all existing client sockets. **This must be last.** Closing the WSS earlier would force-close client sockets while in-flight finalizations were still trying to `trySend` to them (harmless because of `trySend`, but log-noisy). Letting clients see the natural close at the end is cleaner.

  Phase 1 blocks for up to 90s on TTS drain. Fargate's `stopTimeout: 120` (see Deployment-Side Changes section) gives the remaining 30s for Redis quit + wss.close + container teardown.

Edit `apps/ws-server/src/index.ts`:

- After `wsServer.setResolver(resolver)` at line 293, add `wsServer.setTTSService(ttsService)`. The existing construction order (`WSServer` at 147, `TTSService` at 267) is preserved — no reordering needed.

**Files:** `apps/ws-server/src/ws-server/index.ts`, `apps/ws-server/src/index.ts`

### Step 1.4 — Type check + manual verification

- `pnpm typecheck` from repo root.
- Manual: start a TTS request, kill the client tab mid-stream, verify in DB that the TTSJob ends in COUPLED (not FAILED), the Attachment row exists, the S3 object is reachable, and a subsequent request from a fresh session emits `user_tts_response_preexisting` from the cache.
- Manual: send `kill -SIGTERM` to the ws-server process while a TTS job is in flight. Verify the process waits for `audio.done` + persist + cache write before exiting.

---

## Phase 2: best-effort sends everywhere + per-service drain

Scope: generalize the Phase 1 pattern across all streaming workloads. Done as a follow-up after Phase 1 is in production and the bug is confirmed fixed.

**Architectural decision (from convergent review with codex):** Per-service in-flight registries with `ProviderService.awaitAllInflight()` fan-in. NOT a shared cross-cutting registry. Reasoning: the codebase has strong service ownership; each service already encapsulates its own state, dependencies, and lifecycle; a premature shared registry risks becoming a weak abstraction that has to be designed around 11 different consumers. Per-service registries match the existing architecture style. If a unified view becomes valuable later (e.g., for metrics or admin tooling), it can be added as a thin aggregation layer over the per-service primitives without disturbing the producers.

**Sequencing within Phase 2:** safe send first, drain second. The disconnect-throws-kill-persistence bug is bigger than the graceful-shutdown bug for chat/img-gen, so `trySend` rollout (Step 2.2) ships before per-service drain (Step 2.4).

### Step 2.1 — Shared `trySend` helper

Promote `trySend` from `TTSService` to a shared location. Two viable locations:

- **Static on `ResolverChatUtilsService`** (`apps/ws-server/src/resolver/chat-utils.ts`) — the base class that the resolver layer already extends. Makes `this.trySend(...)` available across all resolvers without an import.
- **Freestanding util** (`apps/ws-server/src/util/try-send.ts`) — better if provider services don't share a base class with resolvers.

Inspect the inheritance graph and pick whichever requires the fewest imports across the rollout sites. Signature unchanged from Step 1.1:
```ts
trySend<T extends keyof EventTypeMap>(
  ws: WebSocket,
  type: T,
  data: EventTypeMap[T]
): boolean
```

### Step 2.2 — Audit and replace `ws.send` across providers AND resolvers

Two layers, both required:

**Provider services (11 chat + 3 image-gen):**
- `apps/ws-server/src/anthropic/index.ts` (lines 710, 774, 891 + paired Redis publishes 731, 796, 915)
- `apps/ws-server/src/openai/responses-chat.ts`
- `apps/ws-server/src/gemini/chat.ts`
- `apps/ws-server/src/meta/index.ts`
- `apps/ws-server/src/mistral/index.ts`
- `apps/ws-server/src/cohere/index.ts`
- `apps/ws-server/src/xai/responses-api.ts`
- `apps/ws-server/src/vercel/index.ts`
- `apps/ws-server/src/kimi/index.ts`
- `apps/ws-server/src/deepseek/index.ts`
- `apps/ws-server/src/zai/index.ts`
- `apps/ws-server/src/xai/img-gen.ts`
- `apps/ws-server/src/openai/gpt-image.ts`
- `apps/ws-server/src/openai/responses-img-gen.ts`

For each: replace direct `ws.send(JSON.stringify({type: "ai_chat_chunk", ...}))` with `this.trySend(ws, "ai_chat_chunk", {...})`. Verify the adjacent `redis.publishTypedEvent(streamChannel, "ai_chat_chunk", ...)` is preserved — Redis remains the authoritative delivery path. Split any try/catch geometry that conflates persist failures with notify failures (same surgery as TTS Step 1.1).

**Resolver layer (8 files, codex's catch):**
- `apps/ws-server/src/resolver/tts.ts` (already touched in Phase 1, verify)
- `apps/ws-server/src/resolver/chat.ts` — replay/error sends
- `apps/ws-server/src/resolver/connection.ts` — `connection_established` and connection-state sends
- `apps/ws-server/src/resolver/dispatch.ts` — error responders
- `apps/ws-server/src/resolver/asset-complete.ts`
- `apps/ws-server/src/resolver/asset-fetch.ts`
- `apps/ws-server/src/resolver/asset-attach-or-paste.ts`
- `apps/ws-server/src/resolver/chat-utils.ts`

Same substitution. The replay path in `resolver/chat.ts` is the most sensitive — it's the existing reconnect-and-receive-accumulated-stream-state mechanism. Verify Phase 2 doesn't regress it: clients reconnecting mid-generation should continue to receive accumulated stream state via the Redis replay path.

### Step 2.3 — Per-service in-flight registries

Each provider service gets the same registry shape as TTS in Step 1.2:
- `inflightByUser: Map<userId, Map<jobId, () => void>>`
- `inflightPromises: Map<jobId, Promise<void>>`
- `clearInflight(jobId)` cleanup helper
- `awaitAllInflight(timeoutMs?)` and `awaitUserInflight(userId, timeoutMs?)` public APIs

The drain implementation (`Promise.withResolvers` + while loop with re-snapshot + Fargate-safe default of 90s via `INFLIGHT_DRAIN_TIMEOUT_MS`) is identical to TTS — extract to a small **shared helper for the drain mechanics only** (not a registry, just the loop primitive) so the 11+ producer services don't each copy-paste the while loop. Each service still owns its own `inflightByUser`/`inflightPromises` Maps; the helper just takes a `() => Map<string, Promise<void>>` accessor and runs the drain loop against it.

For image-gen services, the "job" is a single image generation request, identified by `requestId` or `messageId` depending on the path.

### Step 2.4 — `ProviderService.awaitAllInflight()` fan-in

`ProviderService` (`apps/ws-server/src/providers/index.ts`) already holds references to all 11 chat providers. Add:

```ts
public async awaitAllInflight(timeoutMs?: number): Promise<void> {
  await Promise.all([
    this.anthropic.awaitAllInflight(timeoutMs),
    this.openai.awaitAllInflight(timeoutMs),
    this.gemini.awaitAllInflight(timeoutMs),
    this.meta.awaitAllInflight(timeoutMs),
    this.mistral.awaitAllInflight(timeoutMs),
    this.cohere.awaitAllInflight(timeoutMs),
    this.grok.awaitAllInflight(timeoutMs),
    this.vercel.awaitAllInflight(timeoutMs),
    this.kimi.awaitAllInflight(timeoutMs),
    this.deepseek.awaitAllInflight(timeoutMs),
    this.zai.awaitAllInflight(timeoutMs)
  ]);
}
```

One method, one fan-in point, one place to add new providers. `WSServer` doesn't need to know about individual providers.

### Step 2.5 — Wire per-service drains into `WSServer.stop()`

Replace the TTS-only `stop()` body from Step 1.3 with parallel drain across all sources:

```ts
public async stop(): Promise<void> {
  this.logger.info("Shutdown initiated, entering drain mode");
  this.isDraining = true;  // Phase 1 admission gate — PRESERVED, not removed
  await this.teardownPubSub();
  this.logger.info("Draining all in-flight server work before shutdown...");
  await Promise.all([
    this.ttsService.awaitAllInflight(),
    this.providers.awaitAllInflight(),
    this.imgCompatService.awaitAllInflight()  // post-upload processing only
  ]);
  await this.redis.quit();
  this.wss.close();
  this.logger.info("Server shut down.");
}
```

**Phase 2 extends — does not replace — the Phase 1 admission gate.** `isDraining = true` must still be the first thing `stop()` does, so the message handler keeps rejecting new long-running work for the entire drain window. Phase 2 only widens the set of services being drained; the gating behavior is unchanged.

`Promise.all` because all three drains share the same Fargate-safe 90s deadline (configurable via `INFLIGHT_DRAIN_TIMEOUT_MS`). If any one trips, the others continue until their own deadline. The whole `stop()` will return when the slowest one finishes (or trips). Log per-service entry/exit for shutdown observability.

**Out of scope for the in-flight drain:** in-flight client-to-server byte streams (asset uploads). The detach pattern only applies once bytes are server-side and processing has begun. If a 50MB PDF upload is mid-flight from a mobile client when the server starts shutting down, those bytes are lost — there's no "let it complete" semantics because the data source itself is the dying connection. Document this explicitly so nobody overgeneralizes the pattern.

### Step 2.6 — Type check + verification

- `pnpm typecheck`.
- Manual: start an AI chat stream, drop the client mid-generation, verify the full `Message` row persists with the complete response and that a fresh session loading the conversation sees the completed message.
- Manual: reconnect mid-generation and verify the existing replay-from-Redis path still delivers accumulated state.
- Manual: same but for image generation.
- Manual: SIGTERM with TTS + AI chat + image gen all in flight — all three complete before exit, drain log shows per-service progress.

---

## Critical Files

**Phase 1:**
- `apps/ws-server/src/tts/index.ts` — `trySend`, split `finalize`, registry, drain APIs (lines 329-490, 528-658)
- `apps/ws-server/src/ws-server/index.ts` — close handler simplification, `stop()` drain, `setTTSService` setter (lines 266-285, 449-454)
- `apps/ws-server/src/index.ts` — wire `setTTSService` after construction (line 293 region)

**Phase 2:**
- `apps/ws-server/src/util/drain-loop.ts` — shared drain helper (new file). Takes a `() => Iterable<Promise<void>>` accessor and runs the `Promise.withResolvers` + while-loop + re-snapshot mechanics. Each producer service owns its own registry Maps and exposes `awaitAllInflight`/`awaitUserInflight` that delegate to this helper. **No shared registry — only shared loop mechanics.**
- `apps/ws-server/src/util/try-send.ts` — promoted shared helper (new file, optional — could also live as a static on `ResolverChatUtilsService`)
- `apps/ws-server/src/anthropic/index.ts` — audit (lines 710, 774, 891 + paired Redis publishes 731, 796, 915)
- `apps/ws-server/src/openai/responses-chat.ts` — audit
- `apps/ws-server/src/gemini/chat.ts` — audit
- `apps/ws-server/src/meta/index.ts` — audit
- `apps/ws-server/src/mistral/index.ts` — audit
- `apps/ws-server/src/cohere/index.ts` — audit
- `apps/ws-server/src/xai/responses-api.ts` — audit
- `apps/ws-server/src/vercel/index.ts` — audit
- `apps/ws-server/src/kimi/index.ts` — audit
- `apps/ws-server/src/deepseek/index.ts` — audit
- `apps/ws-server/src/zai/index.ts` — audit
- `apps/ws-server/src/xai/img-gen.ts`, `apps/ws-server/src/openai/gpt-image.ts`, `apps/ws-server/src/openai/responses-img-gen.ts` — image-gen audit
- `apps/ws-server/src/resolver/chat.ts` — verify replay-on-reconnect path is preserved

## Deployment-Side Changes (Required for Phase 1)

The application changes alone are not sufficient on Fargate — the task definition must set an explicit `stopTimeout`, and the existing ALB target group can be tuned for free to dramatically extend in-flight work runway. Both changes are zero-downtime and require no infra rebuild.

**Existing infrastructure (verified during planning):**
- ALB: `ws-alb` (`arn:aws:elasticloadbalancing:us-east-1:782904577755:loadbalancer/app/ws-alb/239013fc4272cac9`), internet-facing, HTTPS via ACM cert.
- Target group: `ws-tg-ip` (`arn:aws:elasticloadbalancing:us-east-1:782904577755:targetgroup/ws-tg-ip/fa5ac314b9a9d424`), HTTP:4000, target type `ip`, health check `/health`. **Currently `deregistration_delay.timeout_seconds = 300` (AWS default).**
- Task definition: `ws-server:14` (current revision), `requiresCompatibilities: ["FARGATE"]`. **No `stopTimeout` set → defaults to Fargate's 30 seconds.**
- ECS service: standard rolling deploy.

### Step A — Bump ALB target group deregistration delay to 600s

Single AWS CLI call, instant effect, no service restart needed:

```bash
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:782904577755:targetgroup/ws-tg-ip/fa5ac314b9a9d424 \
  --attributes Key=deregistration_delay.timeout_seconds,Value=600 \
  --region us-east-1
```

Effect: on any future ECS service update / task replacement, ALB stops routing **new** connections to the old task immediately upon deregistration, but existing in-flight work continues for up to 600 seconds before SIGTERM is sent. This is steady-state runway for jobs that started before deregistration — the application doesn't observe the deregistration window directly; it just sees fewer new requests arriving until eventually SIGTERM hits. Pure "give clients more breathing room" lever, no code coupling.

### Step B — Add `stopTimeout: 120` to `infra/ws-server-taskdef.json` ✅ DONE

The user has already added the field to `infra/ws-server-taskdef.json`'s `ws-server` container definition:

```json
{
  "essential": true,
  "name": "ws-server",
  "stopTimeout": 120,
  "image": "...",
  ...
}
```

Re-register and update the service:

```bash
aws ecs register-task-definition --cli-input-json file://infra/ws-server-taskdef.json --region us-east-1
aws ecs update-service \
  --cluster <cluster-arn> \
  --service ws-server \
  --task-definition ws-server \
  --region us-east-1
```

(Current revision is `ws-server:14`; AWS auto-bumps to `ws-server:15` on next register.) The service update triggers a rolling deployment, which is the natural moment for the new `stopTimeout` to take effect. **Until the new revision is registered AND the service is updated, the running task is still on rev 14 with Fargate's default 30s ceiling — so the application drain code should NOT be relied on in production until this re-register has happened.**

### Step C — Optional: explicit env var documentation

Set `INFLIGHT_DRAIN_TIMEOUT_MS=90000` in the task definition's `environment` block. The application default is the same value, so this is documentation rather than functional — but it makes the deployment-topology coupling visible at the infra layer.

### Total in-flight work runway after Steps A + B

- **Steady-state** (between target deregistration and SIGTERM): **600 seconds** (10 min)
- **Explicit drain window** (after SIGTERM, in `WSServer.stop()`): **90 seconds**
- **Cleanup buffer** (Redis quit + wss.close + container teardown): **~30 seconds**
- **Hard ceiling** (Fargate SIGKILL): **120 seconds after SIGTERM**

**Effective worst-case runway: ~11.5 minutes per container shutdown.** This is dramatically more than the application drain alone could provide on Fargate, achieved with two config changes instead of code, platform migration, or architectural decoupling.

### Future scaling escape hatches

If 11.5 minutes ever proves insufficient (signal: drain timeout warnings appearing in production logs), four options in order of operational cost:

1. **Bump ALB deregistration delay further** — max is 3600s (1 hour). Free, no code change.
2. **Decouple finalize via SQS + Lambda** — push the persist phase (S3 upload + Prisma write + Redis publish) to a separate worker that doesn't share the WSS shutdown signal. WSS becomes "stream + accumulate + push to SQS + done." Best architectural answer at scale; more moving parts.
3. **Move off Fargate** — EC2-launched ECS (`ECS_CONTAINER_STOP_TIMEOUT` configurable) or EKS (`terminationGracePeriodSeconds` configurable). Operationally heavier — you manage the underlying compute.
4. **Bound worst-case generation client-side** — enforce 90s max on AI chat streams, 60s max on TTS. TTS already finalizes in 5-10s typical; chat streams >90s are extreme outliers.

For current scale, Steps A + B alone are sufficient. Don't pre-build options 2 or 3 until metrics actually show pressure.

## Existing Patterns to Reuse

- `redis.publishTypedEvent(streamChannel, eventType, payload)` — already authoritative for AI chat. Phase 2 keeps this; do not replace.
- `Promise.withResolvers<void>()` — used elsewhere in the codebase, matches the registry pattern.
- `setResolver(resolver)` (`ws-server/index.ts:293`) — model for the new `setTTSService` setter.
- `EventTypeMap` from `@slipstream/types` — `trySend` generic parameter source.
- `ws.readyState === ws.OPEN` guard — already used in `chat-ws-client.ts:495` on the client side, mirror it on the server.
- `user_tts_response_preexisting` event (already wired) — the cache-hit replay path that makes "let it complete + reconnect re-fetches" work for TTS. The same pattern conceptually applies to AI chat via Redis replay.

## Verification

**Phase 1:**
1. `pnpm typecheck` passes.
2. Start TTS, kill client tab mid-stream → DB shows `TTSJob.status = COUPLED`, `Attachment` row exists, S3 file reachable.
3. Reload page → tap Read Aloud on the same message → server emits `user_tts_response_preexisting` → client plays from CDN.
4. `kill -SIGTERM` mid-TTS-finalize → process exits cleanly after the job persists, not before.
5. Duplicate TTS request while same `messageId` is in flight → second request is silently ignored (existing `inflight.has` guard at `resolver/tts.ts:88` still works).
6. Provider error from xAI mid-stream → job marked FAILED, registry promise resolves, no leaked entries.

**Phase 2:**
7. Start AI chat, kill client mid-generation → full `Message` row persists with complete response → fresh session loads the conversation and sees the completed message.
8. Same for image generation → `Attachment` row persists with the generated PNG.
9. SIGTERM with TTS + AI chat + image gen all in flight → all three complete before exit.
10. `pnpm typecheck` passes.


● Clean typecheck. Let me save the user's preference about typecheck scoping.                                                                                                                                                               
                                                                                                                                                                                                                                          
  Recalled 1 memory, wrote 1 memory (ctrl+o to expand)                                                                                                                                                                                      
                                                                                                                                                                                                                                            
● Phase 1 complete and typechecks clean. Summary of what shipped:                                                                                                                                                                           
                                                                                                                                                                                                                                            
  apps/ws-server/src/tts/index.ts                                                                                                                                                                                                 ♥  ♥   ♥  
  - trySend<T>(ws, type, data) — readyState guard + try/catch wrapping ws.send.                                                                                                                                                             
  - registerInflight(userId, messageId) — Promise.withResolvers + dual map registration.                                                                                                                                                    
  - clearInflight(userId, messageId) — single cleanup point, replaces all scattered inflight.delete calls.                                                                                                                                  
  - awaitAllInflight(timeoutMs?) / awaitUserInflight(userId, timeoutMs?) — drain primitives delegating to drainSnapshot.                                                                                                                    
  - drainSnapshot(accessor, timeoutMs) — re-snapshotting tick loop, default 90s via INFLIGHT_DRAIN_TIMEOUT_MS, never throws.                                                                                                                
  - finalize() split: persist phase in try/catch (failure → handleStreamError + clearInflight), notify phase outside as trySend(user_tts_response) — fixes the COUPLED→FAILED overwrite.                                                    
  - Per-chunk ws.send(user_tts_chunk) replaced with trySend.                                                                                                                                                                                
  - handleStreamError switched to trySend(user_tts_error); cleanup moved to .finally(clearInflight) at the call sites that have userId.                                                                                                     
                                                                                                                                                                                                                                            
  apps/ws-server/src/ws-server/index.ts                                                                                                                                                                                                     
  - ttsService? field, setTTSService(...) setter mirroring setResolver.                                                                                                                                                                     
  - isDraining admission gate field.                                                                                                                                                                                                        
  - Local trySend mirroring TTS's helper.                                                                                                                                                                                                   
  - ws.on("message") early-returns with a user_tts_error (placeholder; Phase 2 will refine per-event-type) when isDraining.                                                                                                                 
  - ws.on("close") TODO removed; comment now states in-flight server work continues.                                                                                                                                                        
  - stop() rewritten with documented 5-step ordering: gate → pubsub teardown → TTS drain → redis quit → wss close.

  apps/ws-server/src/index.ts
  - wsServer.setTTSService(ttsService) wired right after setResolver.

  pnpm --filter=@slipstream/ws-server typecheck passes clean.

  Phase 1 verification still TODO (manual): kill client mid-stream → DB shows COUPLED, then kill -SIGTERM mid-finalize → process waits for persist before exiting. Want to run those manual checks now, or move to the deployment-side
  changes (ALB dereg bump + taskdef re-register)?

✻ Crunched for 1m 24s

  12 tasks (10 done, 2 open)
  ◻ Step 7: Mount mini-player in ChatInput
  ◻ Step 8: Type check and verify
  ✔ Step 1: AudioSession type declaration in index.d.ts
  ✔ Step 2: Create audio-session.ts utility module
  ✔ Step 3: PCMStreamPlayer silent mode bypass
  ✔ Step 4: TTSProvider silent mode bypass
  ✔ Step 5: Actions dialog TTS support
  ✔ Step 6: TTS mini-player component
  ✔ Phase 1.1: trySend + split finalize
  ✔ Phase 1.2: TTS in-flight registry + drain primitive
   … +2 completed                                                                                                                                                                                                                   ,>      
                                    