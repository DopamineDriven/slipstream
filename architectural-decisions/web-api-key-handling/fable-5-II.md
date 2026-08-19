# Web API-Key Handling — Part II: Response to the gpt-daybreak-blue review

Date: 2026-08-17

Status: ANALYSIS — revised recommendation. Supersedes §4 (transport) and
§5 (wire contract) of `fable-5.md`; §1 (inventory), §2 (friction root
cause), §3 (bugs) and §6 (React state model) stand, with the amendments
listed in §4 below. Every claim in the review that could be checked against
the code was checked; verdicts and evidence are in §1.

## 0. Ruling summary

**Conceded, verified in code:**

- Plaintext API key logged to the browser console after every successful
  save (`index.tsx:409-414`). I read past it. CRITICAL, Phase 0.
- `parseEvent` is type-only (`dispatch.ts:243-254`: `type` ∈ allow-list,
  then `return msg as AnyEvent`). My "the parser guarantees `provider` ∈
  roster for free" was wrong. Domain validation must be explicit — and the
  house place for it is the prisma-chain method, not a new parser layer
  (the `cli_config_update` precedent: "the chain's roster validation is the
  backstop for hand-crafted frames").
- **Option E's "requires no auth work" was overstated.** Ciphertext
  protects confidentiality; it does not authorize a durable vault mutation.
  Key replacement at the current handshake bar (`?id=` + any live session)
  redirects a victim's future provider traffic through an attacker's
  account and outlives the attacker's socket. "Within the existing
  exposure" was the wrong frame — the existing exposure is the thing to
  fix, not the ceiling to build up to. **E is withdrawn.**
- E's browser bounce also decouples validation from persistence: the
  envelope has no AAD, so a blob validated as `openai` can be persisted as
  `anthropic`. Self-inflicted today, but it breaks the "server validated
  this key for this provider" guarantee. Withdrawn for that reason too.
- `upsertApiKey` calls the provider validator before checking `userId`
  (`api-key.ts:31-35`). Authenticate first.
- Hard delete vs. provenance: I called `onDelete: SetNull` "safe" while
  requiring upsert to preserve provenance — contradictory. Worse, it is
  functionally wrong: `countFallbackUserMessages` (`user-meta.ts:34-47`)
  counts `userKeyId: null` as free-tier usage, so a hard delete's
  `SetNull` retroactively turns a BYOK user's history into "free-tier"
  messages and can trip the 25/24h guard the next time they use the
  server key. **Revoke, not delete.**
- Transaction alone does not guarantee one default under READ COMMITTED.
  Correct. Fix below without a partial index (§1.7).
- Free-tier guard trusts `event.hasProviderConfigured` and is fired
  un-awaited (`resolver/chat.ts:71-84`; `handleFreeMsgQuota` returns from
  itself, the caller neither awaits nor branches). Adjacent, real.
- `trustedOrigins` derives from the request's own URL (`auth.ts:16-20`).
  Tautological as a policy source; do not reuse it for an allowlist.
- No `maxPayload` / `verifyClient` on `new WebSocketServer({ server })`
  (`ws-server/index.ts:108`). Hardening.
- Validator: no timeout, 429 treated as valid, raw upstream text relayed.
  Hardening; belongs in the ws-server-owned validator contract.
- Cookie cache is 24h; reveal / ticket-mint should use a fresh session.
- `mutationId` echoed in acks: cheap, harmless, add it. (An idempotency
  store is not warranted — upsert is idempotent for identical payloads
  and the frame is never queued.)

**Held, with reasoning (§2):** the transport. The review proposes a Next
BFF route → authenticated *internal HTTP command endpoint* on the
ws-server (S2S signing / mTLS), and says WS mutations are "not required for
ws-server DB ownership." True, but that builds a second auth mechanism the
app does not otherwise need, adds an HTTP command plane to a WS-first
server, and leaves the WS boundary — which already exposes chat
impersonation and conversation reads for every user — exactly as weak as
it is. The fix the app needs regardless is **proof-of-possession on the
handshake**, and it is already designed for the CLI (config-planning §6-B:
`CliSession` token, `?id=` "survives only as the dev-mode lane until Phase
B ships, then dies"). The `via: "web"` half of that — a short-TTL,
single-use, hashed **WS ticket** minted by a cookie-authenticated route —
is the sibling of the CLI's one-time authorize code (same table shape,
same discipline). Once the socket proves identity, dedicated frames + acks
are the house-native transport, fan-out rides the per-user Redis channel
that already exists (`redisChannels.user(userId)`, used by the quota
guard), and no S2S plane is needed.

**Net recommendation:**

```
now      A + Phase-0 hotfixes: DB writes stay on the cookie-authenticated
         Next side, moved to a route handler; console.log gone; caches gone;
         auth-before-validate; provider parsed; default set under
         Serializable; delete hidden.
gate     WS ticket for via:"web" (the web half of config-planning Phase B).
then     B over the authenticated socket: ws-server validates + encrypts +
         persists + derives providerContext atomically; user_key_set /
         user_key_revoke frames, uniform acks, per-user Redis fan-out.
         Web sheds the action, ENCRYPTION_KEY, encryption, validator.
then     React stupid (fable-5 §6, unchanged) on those frames.
```

On Andrew's stated preference that encryption stay in Next: under B it
moves to the ws-server, which already decrypts and is the natural home.
If it must stay in Next, the only sound E-variant is Next → ws-server
**server-to-server** (no browser bounce, no AAD gap) — i.e. the review's
BFF topology, with its S2S auth cost. That preference is therefore not
free; §5 asks for the ruling.

## 1. Item-by-item

Verdict key: **C** conceded / **P** partially / **H** held.

### 1.1 Plaintext console.log — C, CRITICAL

`index.tsx:409-414` logs `{ apiKey, provider, asDefault, id }` on success.
Remove in Phase 0. Log nothing key-shaped anywhere on the client. This is
the highest-severity item in either document that is a one-line fix.

### 1.2 WS handshake does not prove possession — C (elevated)

I documented it (fable-5 §1, §4.3) as accepted single-operator posture;
the review is right that it should not be the floor for new authority.
Verified: `authenticateConnection` (`ws-server/index.ts:440-477`) →
`getAndValidateUserSessionById` (`user-meta.ts:139-157`) checks only that
*some* session for the claimed id is unexpired. No token compared.

Fix (aligned with config-planning §6-B, not new): a `WsTicket` (or reuse
the §6-B "short-TTL code table") — opaque 32-byte random, sha-256 hash
stored, 60 s TTL, single use, bound to `userId` (+ `via`), minted by
`POST /api/ws/ticket` under a **fresh** better-auth session
(`disableCookieCache: true`), consumed atomically in the handshake, socket
bound to the row's `userId`. The client fetches a ticket per `connect()`
(reconnects included — single-use). Cross-subdomain cookies: dropped in
favor of the ticket (the review's point that it widens cookie exposure to
the subdomain boundary is fair). Origin allowlist becomes moot for auth
once no cookie is involved, but `verifyClient` with an explicit
environment allowlist and a conservative `maxPayload` are cheap and should
land with the ticket. Revocation of already-open sockets: same answer as
§6-B open question (2) — die on next handshake for v1.

### 1.3 `parseEvent` is type-only — C

Verified (`dispatch.ts:243-254`). Consequence for the new frames: the
prisma-chain method (`PrismaUserKeyService.setUserKey` etc.) validates
`provider` ∈ roster, `typeof isDefault === "boolean"`, key byte length
(≤ 256 — `apiKey VarChar(512)` hex ceiling), `mutationId` shape — **before
any I/O** — and returns a discriminated result the resolver flattens to
the uniform ack. This is exactly how `updateCliConfig` backstops
hand-crafted frames today. A separate schema-parser layer is not house
style and not needed; the review's list of what to validate is adopted,
its "reject unknown properties" is not (additive frames are the norm here
and the parser is shared).

### 1.4 E's envelope not bound to user/provider (no AAD) — C

Verified: `EncryptionService.encryptText` sets no AAD; payload is
`{ iv, authTag, data }`. Under E a user could relabel their own validated
`openai` ciphertext as `anthropic` (validation bypass, self-harm) and — at
the current handshake bar — replay it under another user. E is withdrawn
(§0), which removes the browser bounce entirely; AAD (`userId`, `provider`,
purpose, version) + `cipherVersion` remain a **hardening backlog item for
at-rest rows** (they also unblock master-key rotation, which the current
envelope cannot support). Not required for B.

### 1.5 Authenticate before validation — C

`api-key.ts:31-33` runs `KeyValidator` before the `userId` check at `:35`.
Phase 0. Same rule on the ws-server method: session/principal → shape →
network.

### 1.6 Validator contract — C (hardening)

Adopt: `AbortSignal.timeout` on every call; timeouts/network errors →
`verification_unavailable`, not `invalid_key`; 429 → indeterminate unless
the provider's documented behavior makes it authoritative (x.ai's
`/v1/api-key` inspects the key itself; the `/models` probes do not);
`default → grok` arm becomes a rejected reason; never relay raw upstream
body text — return the stable `__`-delimited breadcrumb the package
already produces. Rate limiting per user: cheap with the ws-server's
Redis, but a single-operator app has no abuse pressure yet — schedule
with the ticket, not before.

### 1.7 One-default invariant — P

Conceded: `updateMany(false)` + upsert under READ COMMITTED can interleave
two "make X default" / "make Y default" transactions and commit two
defaults. Held: a partial unique index is not the first tool here —
Prisma cannot express `WHERE isDefault = true`, so it lives only in a
hand-edited migration and its survival across `migrate dev` diffs has to
be checked, not assumed. Two Prisma-expressible fixes, in order of
preference:

1. **Now (Phase 0):** run the clear + upsert in
   `$transaction([...], { isolationLevel: "Serializable" })` and retry once
   on `P2034`. One line, no schema change, closes the race.
2. **Clean model (later, Andrew's call):** the default is a per-user
   attribute, not a per-key flag — `User.defaultProvider Provider?` — a
   scalar holds one value by construction; `isDefault` on `UserKey`
   becomes derived and can be dropped. Note this coexists with the CLI
   identity plane's own `defaultProvider` (`CliConfig`), which is a
   *different* setting by Andrew's separation ruling; naming should say
   so (`defaultByokProvider`?).

### 1.8 Revoke vs. hard delete — C, with a stronger reason

The review's provenance argument stands, and §0 adds the concrete
failure: `countFallbackUserMessages` treats `userKeyId: null` as
free-tier usage. Hard delete → `SetNull` → a heavy BYOK user who removes a
key can trip the 25/24h guard on their next server-key message. So:
`UserKey.revokedAt DateTime?`; revoke = set `revokedAt`, `isDefault =
false`, overwrite `apiKey`/`iv`/`authTag` with empty strings (columns are
non-null; empty ciphertext fails decrypt, and `handleApiKeyLookup` /
`injectClientApiKeyProps` filter `revokedAt: null` anyway); re-adding
reuses the row via the existing `@@unique([userId, provider])` upsert, so
`Message.userKeyId` history stays attached. Frame name follows:
`user_key_revoke` / `_ack`, not `_delete`.

### 1.9 Credential version / `keyFingerprint` on rotation — P

Real, MEDIUM correctness rather than HIGH security: `AttachmentProvider.
keyFingerprint` = `userKeyId` drives provider-file affinity
(`gemini/workup.ts:151-369`); rotating to a key on a *different* provider
account leaves cached file handles that the new account cannot see.
Same-account rotation (the common case) is unaffected. Do **not** derive a
version from `updatedAt` — it bumps on `isDefault` toggles and would
invalidate affinity on every save. If addressed: a `UserKey.
credentialVersion Int @default(1)` incremented only when ciphertext
changes, or a peppered HMAC of the plaintext computed at set-time. Backlog;
not blocking.

### 1.10 Quota guard trusts the client and is advisory — C (adjacent)

Verified `resolver/chat.ts:71-84` + `chat-utils.ts:246-300`. The server
already resolves the key authoritatively per turn (`chat-request.ts:689`);
`hasProviderConfigured` from the client should be a hint at most. Awaiting
and branching on the guard is a small hot-path change — flagged for
Andrew's additive-lanes discipline rather than prescribed here. It belongs
in Phase 0.5, independent of this feature.

### 1.11 `trustedOrigins` — C (MEDIUM/LOW)

`auth.ts:16-20` returns `[new URL(req.url).origin]`. Because Vercel routes
by Host, this behaves like "Origin must equal Host" in practice — not a
gaping hole, but not a policy either. Replace with an explicit
environment allowlist when the ticket route lands; do not reuse it for the
route's Origin check.

### 1.12 `mutationId`, fan-out, multi-instance — P

Conceded: echo a client-generated `mutationId` in every ack — cheap
insurance. Held: the single-editor invariant is still what makes the
*current* design correct without it (one in-flight per socket, ack carries
`provider`, frame never queued). Fan-out: publish the fresh
`providerContext` on `redisChannels.user(userId)` after commit — the
primitive exists and is already user-scoped across replicas.

### 1.13 Encryption package hardening — C (backlog)

`getMasterKey` `< 64` → `=== 64` hex, fail closed at startup; add
`cipherVersion`/`keyId` + AAD to at-rest rows behind a migration that
reads legacy and writes current. Not required for B; required before any
master-key rotation.

### 1.14 Route vs. action — agreed

Both documents land on a route handler. Deriving `userId` solely from the
session (`/api/me/...`) removes the IDOR check rather than repeating it;
the existing `/api/users/[userId]/...` convention with the
`session.user.id !== userId` guard is equivalent in effect — Andrew's
style call. `Cache-Control: no-store, private`, POST for reveal, explicit
body limit, discriminated JSON responses, never throw for expected
failures.

### 1.15 "The clean target is not writes-over-WebSocket" — H

The review's target — "the ws-server owns the credential domain, while
every ingress proves identity and authority before it can invoke that
domain" — is correct and I adopt the sentence. Where we differ is only in
*which* ingress proves identity and how: the review reaches for a new S2S
plane so the web can act before the socket is trustworthy; I reach for the
ticket because the socket has to become trustworthy anyway (chat
impersonation and conversation reads are exposed today at the same bar,
which no S2S plane fixes), it is already on the roadmap for `via: "cli"`,
and once it exists the frame lane is smaller than the S2S lane. §2.

## 2. Transport, revisited

| | BFF → internal HTTP (S2S) | WS ticket → frame lane |
|---|---|---|
| Fixes chat impersonation / convo reads at the same bar | no | yes |
| New auth mechanism | S2S signing or mTLS + replay protection | ticket table + mint route + handshake branch (sibling of §6-B code table) |
| New surface on ws-server | HTTP command plane on a WS-first server | two `case` arms + chain link |
| Fan-out to other tabs / CLI | Redis user channel (exists) | same |
| Canonical response path | HTTP for the acting tab, WS push for others | one path: ack to sender, push to others |
| Works before the socket is trustworthy | yes | no — that is the point |
| CLI reuse | CLI would need its own HTTP client + auth | same frames, `CliSession` handshake |
| Encryption location | Next (if seal-in-BFF) or ws-server | ws-server |

If Andrew wants key mutations shipped **before** the ticket exists, the
review's stopgap and mine coincide: keep DB writes on the
cookie-authenticated Next side (route handler), hotfixed. The S2S plane is
only worth building if the ticket is far off *and* the web must stop
holding `UserKey` Prisma access sooner — §5 asks.

## 3. Revised phasing

**Phase 0 — hotfix, now, both web apps + ws-server, no contract change**

- Remove the console.log (`index.tsx:409-414`).
- Delete `decryptMapper` and `userProviderKeyMap` (decrypt per lookup).
- Authenticate before validation in the action; parse `provider` against
  the roster before `toPrismaFormat`; runtime-check `isDefault`.
- Default set under `Serializable` + retry.
- Delete the invalidation trio; hide the trash until revoke exists.
- Move the two Next endpoints to route handlers (seal/upsert stays
  DB-writing for now; reveal minus cache, POST, no-store, fresh session).
- (0.5, hot path, additive discipline) await + branch the quota guard;
  treat client `hasProviderConfigured` as a hint.

**Phase 1 — WS ticket for `via: "web"`** (the web half of config-planning
Phase B; ships with `verifyClient` allowlist + `maxPayload`).

**Phase 2 — ws-server owns the credential domain**

- `PrismaUserKeyService` in the chain: `setUserKey` (validate shape →
  validator w/ timeout → encrypt → Serializable transaction upsert +
  default clear), `revokeUserKey`, `getProviderContext(userId)`; no
  plaintext cache; orchestration handler owns `userDataMap` write-back and
  Redis fan-out (never the CRUD method).
- Frames: `user_key_set` / `_ack`, `user_key_revoke` / `_ack` (`mutationId`
  echoed; uniform ack; `providerContext` always). Volatile send only.
- `revokedAt` migration. `@slipstream/key-validator` added to ws-server.

**Phase 3 — web on the frames + React stupid** (fable-5 §6 unchanged):
delete the action / `orm/user-key-service.ts` / dead route; drop
`ENCRYPTION_KEY`, encryption, validator from `apps/web`;
`ApiKeysProvider` grows `setKey` / `revokeKey` / `pending` / `lastAck`;
`provider_context_update` leaves the web send path.

**Phase 4 — reveal ruling** (write-only + hint preferred; if kept, over the
authenticated socket, fresh-session ticket, audit log line, plaintext only
in the open editor).

**Backlog (not gating):** AAD + `cipherVersion` at rest; `credentialVersion`
for provider-file affinity; validator rate limits; explicit
`trustedOrigins` allowlist; `User.defaultProvider` structural model.

## 4. Amendments to `fable-5.md`

- §3: add **3.0 console.log plaintext leak (CRITICAL)** ahead of 3.1; 3.3
  becomes "no revoke lane" with the `countFallbackUserMessages` reason;
  3.4's fix is Serializable + retry, structural model optional; 3.5's
  "parser does this for free" is retracted — validation lives in the chain
  method.
- §4: E withdrawn; recommendation is A-now → ticket → B; §4.3 rewritten
  as §1.2 above; §4.4's "no correlation needed" softened to "add
  `mutationId`, cheap."
- §5: `user_key_persist` dropped; `user_key_set` / `user_key_revoke` with
  `mutationId`; server flow gains authenticate-first, timeout, Serializable,
  revoke semantics, Redis fan-out.
- §6: unchanged. §7: replaced by §3 above.

## 5. Open questions for Andrew (superseding fable-5 §8)

1. **Encryption location under B** moves to the ws-server. If it must stay
   in Next, the sound shape is Next → ws-server S2S (the review's BFF), not
   a browser bounce — accept the S2S auth cost, or let it move?
2. **Ticket before frames?** Agree that key mutations over the socket wait
   for the `via: "web"` ticket, with the hotfixed Next route as the interim
   — or is the S2S plane wanted so `apps/web` drops `UserKey` Prisma access
   sooner?
3. **Revoke semantics** (`revokedAt`, zeroed material, row retained) —
   confirmed over hard delete given the quota-guard interaction?
4. **One-default:** Serializable transaction now; is `User.defaultProvider`
   (structural) wanted later, and how should it be named alongside the CLI
   plane's `CliConfig.defaultProvider`?
5. **Reveal:** write-only + hint, or keep behind the ticketed socket?
6. **Quota guard** (await + branch, server-derived BYOK state) — Phase 0.5
   on the hot path, or hold for its own pass?
