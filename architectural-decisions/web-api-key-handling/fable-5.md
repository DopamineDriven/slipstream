# Web API-Key Handling — Targeted Analysis

Date: 2026-08-16

Status: ANALYSIS — no code changes. Recommendation for Andrew's ruling.
Companion to `sovereign-cli/config-planning/fable-5.md` §6.5 (which ruled
on browser/CLI-side encryption and the CLI input lane, 2026-07-28) and to
the `sweet-summer-child` thesis: React is a sweet summer child — it renders
the truth it is handed and holds as little as possible.

Andrew's framing (2026-08-16, mid-analysis): validation + encryption +
decryption staying in the Next server action is fine; the open question is
*database persistence* — and the settings UI must become snappy, reliable,
and free of weird behavior. This doc answers exactly that.

## Summary

1. **Should DB persistence leave the Next.js side?** Yes — and the cut
   Andrew described (validate + seal in the action, persist over the
   socket) is the right one for now. Option **E** in §4: the action
   returns the sealed `{ iv, authTag, data }`; the browser sends
   `user_key_persist`; the ws-server upserts, evicts its decrypted-key
   memo, refreshes `userDataMap`, and acks with fresh `providerContext`.
   Today's save is a three-phase dance across two transports and two clocks
   (§1); E makes it two strictly sequential hops with **one completion
   signal** — the ack — which is what lets the UI stop guessing. The
   decisive property, given today's WS handshake trusts `?id=` plus "some
   session exists" (§4.3): **plaintext never rides the socket in either
   direction.** Reveal stays a session-cookie server action, untouched.
   Option **B** (ws-server validates + encrypts plaintext) is the
   convergence point when the CLI input lane lands (config-planning §6.5)
   and the handshake verifies a token; both frames land on the same prisma
   method, so E is a step toward B, not away from it.
2. **Encrypting in the *browser* with `@slipstream/encryption`** stays
   rejected (§6.5) and is mechanically impossible: `node:crypto`,
   `Buffer`, AWS Secrets Manager client in the constructor, no `browser`
   export. Encrypting in the *server action* — what E keeps — is fine; the
   ciphertext is inert on the wire and the master key stays server-side.
3. **Why the friction?** A specific, traceable client-state bug (§2), not
   a transport problem. After the first server sync, every unconfigured
   provider renders an always-open form whose input is *dead* — a
   controlled `<input value="">` that never reflects keystrokes — because
   `getDisplayValue` only echoes the draft when `editingKey === provider`,
   and those forms never set `editingKey`. "Click remove first" works
   because Cancel drops the row into the grid, and the grid's `addProvider`
   path is the one that sets `editingKey`. Zero-key users never see it,
   which is the "sometimes."
4. **Found along the way — fix regardless (§3):** the decrypted-key caches
   in BOTH the web action (`decryptMapper`) and the ws-server
   (`userProviderKeyMap`) are keyed by provider only in process-singleton
   scope. In the ws-server this is the chat hot path: the first user to
   decrypt a given provider's key becomes the key every other user with a
   row for that provider calls with. Cross-user BYOK bleed plus
   stale-after-rotation. Also: no delete path exists anywhere (the trash
   button is a no-op), default-uniqueness is not enforced server-side, and
   the action's cache-invalidation trio is dead ceremony.

Recommendation: ship the §3 hotfixes immediately (tiny, no contract
change), build the ws-server persist lane additively (§5), then rewrite the
settings tab as a projection of `providerContext` with one editor and one
completion signal (§6).

## 1. What exists today (inventory)

**Save path (web):** `apps/web/src/ui/api-key-settings/index.tsx` →
`upsertApiKey` server action (`apps/web/src/app/actions/api-key.ts:19-70`)
→ `KeyValidator.validateProvider()` (network call to the provider) →
`EncryptionService.encryptText` → `prismaClient.userKey.upsert` → three
invalidations (`$accelerate.invalidate`, `updateTag`, `refresh()`,
`:61-66`) → returns `{ success, id }` (on failure `id` carries the
validator message, `:69`).

Then, client-side (`index.tsx:403-404`): `sendProviderContextUpdate(true)`
→ WS `provider_context_update` (an empty nudge,
`api-keys-context.tsx:133-144`) → ws-server re-reads `UserKey` and answers
`provider_context_update_ack { providerContext }`
(`apps/ws-server/src/resolver/connection.ts:124-144`). Meanwhile a
**1500 ms `setTimeout`** (`index.tsx:418-460`) mutates the local `apiKeys`
mirror on its own clock.

```
settings tab ──HTTPS POST (server action)──▶ Next: validate → encrypt → upsert
     │◀── { success, id }                        (+ dead invalidations)
     ├──WS provider_context_update (empty)──▶ ws-server: findMany → workup
     │◀──WS provider_context_update_ack { providerContext }
     └── 1500 ms local timer → patch `apiKeys` mirror, close editor
```

Three phases, two transports, two clocks. The ack and the timer race to
update the same component state; the effect at `index.tsx:227-258`
arbitrates by rebuilding the mirror from server truth whenever they
disagree.

**Read side (already server-owned):** `connection_established` carries
`providerContext` post-handshake (`connection.ts:67-101`);
`provider_context_ping/pong` (`:103-122`); the CLI consumes the same three
frames read-only (`packages/cli/src/provider-context.ts:21-31`).
`use-send-chat.ts:178-187` stamps `hasProviderConfigured` /
`isDefaultProvider` from `providerContext` onto every `ai_chat_request`, so
freshness matters to chat, not just to the settings tab.

**Consume side (server):** `PrismaUserMetaService.handleApiKeyLookup`
(`apps/ws-server/src/prisma/user-meta.ts:203-244`) decrypts per request
with the `EncryptionService` constructed at `:27`; `resolveApiKey`
(`:49-69`) falls back to the server key. Called from
`chat-request.ts:689`, `chat-response.ts:83`, `anthropic/workup.ts:67`,
`gemini/fss.ts:751`, `xai/sync.ts:348`.

**Reveal (web):** `getDecryptedApiKeyOnEdit` (`api-key.ts:83-119`) —
session-cookie authenticated (`getSession()` via `headers()`,
`utils/auth.ts:119-123`), decrypts, returns plaintext to the client for the
edit field / eye toggle.

**Web-side pieces that exist only for this feature:** `ENCRYPTION_KEY` in
the Next runtime; `@slipstream/encryption`; `@slipstream/key-validator`;
`apps/web/src/orm/user-key-service.ts` (a copy of the ws-server workup,
consumed only by `app/api/users/[userId]/api-keys/route.ts`, which has no
callers); `apiKeysCacheTag` (unused). `apps/web-next` mirrors the action
and the component byte-for-byte. Under E the first three stay (Andrew's
call); the last three go.

**Prisma:** `UserKey` (`packages/db/prisma/schema/userapikey.prisma`) —
`@@unique([userId, provider])`, `apiKey VarChar(512)` (hex ciphertext ⇒
≤256-byte plaintext), `iv`/`authTag VarChar(32)`, `isDefault Boolean` with
no uniqueness constraint, `label String?` unused. Back-relations from
`Message`, `ImageGenJob`, `AttachmentProvider` are all `onDelete: SetNull`
— hard delete is safe, and an *upsert* (same row id) preserves
`Message.userKeyId` provenance, which the new write lane must keep. **No
delete/deleteMany of `UserKey` exists anywhere in the repo.**

**Handshake auth (ws-server):** `?id=<userId>` on the upgrade URL
(`ws-server/index.ts:545-560`) → `getAndValidateUserSessionById`
(`user-meta.ts:139-157`): the user must have *any* unexpired `Session` row.
No token is verified. Cookies on the upgrade are telemetry only
(`parsedCookies`, `:479-543`); the better-auth session cookie is host-only
(`chat.aicoalesce.com`) while the telemetry cookies are
`Domain=.aicoalesce.com` (`apps/web/src/lib/server-cookies.ts:68`), so the
ws-server never sees the session cookie. Documented and accepted for the
single-operator era (config-planning §1, §6) — it becomes load-bearing for
§4.3.

## 2. Root cause of the friction (traced statically, not run)

`apiKeys` (`index.tsx:162`) plays three roles at once: mirror of server
truth (`isSet`/`isDefault`), the list of *which rows render*, and per-row
draft (`value`). That conflation is the bug.

1. The sync effect (`index.tsx:227-258`) rebuilds `apiKeys` from
   `providerObj` whenever the mirror disagrees with `providerContext`. Both
   branches `arr.push(p)` — configured or not — so after the first sync the
   mirror holds all fourteen providers. It also *mutates the module-level
   constant* (`p.isSet = true`, `:235-245`; `providerObj` is
   `as ApiKeyData[]` at `constants.ts:132`), so the "roster" carries state
   across renders and HMR.
2. Every provider with `isSet === false` now renders in the "Available
   Providers" section (`:843-958`) as an always-open form ("no
   intermediate state", `:869`). Nothing in that section sets `editingKey`
   — only `startEditing` does (`:288-344`), reached from the grid's
   `addProvider` (`:558-567`) or a configured row's edit button.
3. `getDisplayValue` (`:518-538`) returns the draft only when
   `editingKey === keyData.provider`; otherwise, for `!isSet`, it returns
   `""`. `Input` is a pure passthrough to a native `<input>`
   (`packages/ui/src/ui/input.tsx`), so the field is a controlled input
   pinned to `""`. Each keystroke calls `updateTempValue`, the ref updates,
   the trigger re-renders, and React restores the DOM value to `""`. The
   field is dead. `required` then blocks `requestSubmit()`. `submitError`
   is gated on `editingKey === provider` too (`:948`), so no error text can
   ever appear there either.
4. **Why "sometimes":** with zero keys, `toProviderContext([])` equals an
   all-false `providerContext`, the effect no-ops, `apiKeys` stays `[]`,
   the grid shows all fourteen, and the `addProvider → startEditing →
   editingKey` path works. The moment one key exists the effect fires,
   the always-open dead forms appear, and every subsequent add hits it.
5. **Why "click remove first" works:** the row's Cancel (X) calls
   `cancelEditing` (`:364-391`), which drops an unset row from `apiKeys`;
   the provider re-enters `getAvailableProviders()` (`:551-556`), the grid
   button appears, and `addProvider` sets `editingKey`. The workaround is
   the only path that reaches the live-input branch.

Compounding, same root: `deleteKey` (`:489-516`) is local-only; the effect
resurrects the row on the next tick (mirror says unset, server says set ⇒
rebuild). The trash button is a no-op with an exit animation. The 1500 ms
timer (`:418-460`) races the ack for ownership of `editingKey`,
`tempValuesRef`, `visibleKeys`, `originalValues`, `submissionStates` — five
pieces of state that all describe "one editor is open."

The fix is not a patch to `getDisplayValue`. It is to stop mirroring
(§6): derive from `providerContext`, hold exactly one editor's draft, and
let the ack — not a timer — close it.

## 3. Bugs found along the way (severity-ordered; fix regardless of lane)

1. **Cross-user decrypted-key bleed + stale-after-rotation, ws-server
   (CRITICAL, chat hot path).** `userProviderKeyMap` is
   `Map<Lowercase<Provider>, string>` (`user-meta.ts:17-20`), read at
   `:224-226`, written at `:235`, cleared only in the `!userId` branch
   (`:208`). `PrismaService` is a process singleton (`apps/ws-server/src/
   index.ts:80`) and `PrismaUserMetaService` is in its chain. Once user A's
   `openai` key is decrypted, any user B with their own `openai` row
   (`rec` non-null) gets A's plaintext with B's `keyId` — B's calls run on
   A's account while provenance says B's key. Users without a row for that
   provider early-return and are unaffected. Rotation is never picked up
   until process restart. The JSDoc at `:197-201` documents the intended
   `${userId}_${provider}` key — the implementation drifted.

   **Shape of the fix (Andrew, 2026-08-16: nested `Map<userId, Map<Provider,
   …>>` rather than a composite string key — yes, and it exposes a better
   option).** Nested beats `${userId}_${provider}`: it is the registry
   pattern as CLAUDE.md states it (one key type per level, typed value, no
   stringly template keys), and it gives O(1) per-user eviction
   (`registry.delete(userId)` on last-socket close, mirroring
   `userDataMap`'s eviction at `ws-server/index.ts:426-429`) plus O(1)
   per-pair eviction (`registry.get(userId)?.delete(provider)` on
   persist / delete / `provider_context_update`) — write-through
   discipline instead of a prefix scan. Two notes on the *value*:

   - It cannot be `boolean` for this memo — `handleApiKeyLookup:226`
     returns the cached value *as the plaintext key* to the provider call.
     A `boolean` "has key" flag would be a third copy of `providerContext.
     isSet`, which `userDataMap` already holds per user.
   - What the memo saves today is only the AES-GCM open — the
     `findUnique` at `:211-218` runs *before* the cache check at `:224`, so
     the DB round-trip is never skipped. Decrypt is microseconds. So the
     memo buys nothing and costs correctness: **the cleanest Phase-0 fix is
     to delete it** and decrypt per lookup. If a cache is wanted later for
     the part that is actually expensive (the DB read), cache the
     *ciphertext record* — `Map<userId, Map<Provider, Pick<UserKey, "id" |
     "apiKey" | "iv" | "authTag" | "isDefault">>>` — decrypt at use,
     discard. Plaintext then never lives in a long-lived structure, which
     is the §6.5 discipline ("the raw key never enters a cache, registry,
     or log line"), and invalidation is identical to the memo's.

   Either way: evict on every write for that pair, and have
   `provider_context_update` evict too until the persist lane exists.
2. **Same defect in the web action (HIGH).** `decryptMapper` at
   `api-key.ts:82`, hit at `:101-103`, keyed by provider, module scope in a
   long-lived Node process (Vercel warm instances, or a Node server). User
   B's "reveal" can return user A's plaintext; a user's own reveal returns
   the pre-rotation key after an update (upsert never touches the map),
   which reads as "my save didn't take." Mirrored in `apps/web-next`. Fix:
   delete the cache outright.
3. **No delete lane (HIGH, functional).** No server action, route, or
   event deletes a `UserKey`; the UI's `deleteKey` is local and the effect
   resurrects. Users cannot revoke a key. Fix: `user_key_delete` under §5
   (a stopgap server action if the lane is not imminent).
4. **`isDefault` uniqueness not enforced (MEDIUM).** `upsertApiKey` sets
   `isDefault` on the target row only (`:44,52`); the UI locally clears
   others (`index.tsx:429-431`) but the ack's `providerContext` overwrites
   that, so two providers can be default. Chat reads
   `isDefaultProvider` from this map. Fix: `$transaction([updateMany
   {userId, isDefault:true} → false, upsert])` when `isDefault` is
   requested; the schema cannot express it declaratively.
5. **Unvalidated provider string (MEDIUM).** `getProvider as Providers`
   (`api-key.ts:31,45,56`) from `FormData` → `toPrismaFormat` uppercases →
   Prisma enum error → uncaught throw → 500 for garbage input; and
   `KeyValidator.validateProvider()`'s `default` arm validates unknown
   providers against x.ai (`packages/key-validator/src/http/index.ts:
   393-453`). Fix: parse against the roster before use. The WS event
   parser (`dispatch.ts:187-261`, `satisfies EventTypeMap`) does this for
   free on the persist frame.
6. **Dead invalidation ceremony (LOW).** Nothing reads a
   `user_api_keys_${userId}`-tagged Accelerate query (`getClientApiKeys`
   uses no `cacheStrategy`; the route is `force-no-store` and has no
   callers); `cacheComponents` is off in `apps/web/next.config.ts`; there
   are no RSC consumers to `refresh()`. Remove `:61-66`. Under E the action
   no longer writes to the DB, so this disappears naturally.
7. **Wire-shape smell (LOW).** `{ success:false, id: message }` overloads
   `id`; the UI discards the validator breadcrumb and shows a generic
   string (`index.tsx:463`). Discriminated `as const` return for the
   action, uniform ack shape (`success`, `reason?`) for the frame.
8. **Hygiene (LOW):** `handleAsDefault`'s `as` cast; `providerObj as
   ApiKeyData[]`; badge label "Encrypting…" during a phase that is mostly
   provider-side network validation.

## 4. The transport question — options

### 4.1 Options

**A. Keep everything in the Next action; fix §3; rewrite the component.**
Persistence stays on Next; the nudge event and the two-clock reconciliation
survive in a tidier form. Nothing wrong with it; it leaves the seam where
it is and the CLI still needs its own lane.

**E. Action validates + seals; socket persists. RECOMMENDED (now).**
`sealApiKey(formData)` runs `KeyValidator` then `encryptText` and returns
`{ success: true, provider, sealed: { iv, authTag, data } } | { success:
false, reason }` — no DB write. The browser sends `user_key_persist
{ provider, sealed, isDefault }`; the ws-server test-decrypts to reject a
malformed blob (it holds the key and does this on every chat request
anyway), upserts inside a default-clearing transaction, evicts its
decrypted-key memo for that `(userId, provider)`, refreshes
`userDataMap[userId].providerContext` unconditionally, and acks with the
fresh context. Properties: one completion signal; **no plaintext on the
socket in either direction**; reveal stays cookie-authenticated on Next
with no auth prerequisite; the ws-server change is a persist-only handler
(no validator dep, no encrypt); the web keeps encryption + validator +
`ENCRYPTION_KEY` as Andrew prefers. Cost: still two hops per save (both
sequential; the action's result is inert if the second hop never fires —
no partial state), and when the CLI needs a plaintext-in frame later the
ws-server gains a second request shape (`user_key_set`, option B) that
converges on the same prisma method.

**B. ws-server validates + encrypts plaintext; single frame for web and
CLI.** One ingestion front, one place that does everything; the web sheds
the action, encryption, validator, `ENCRYPTION_KEY`. Cost: plaintext on
the socket (inside TLS — fine in transit, but it inherits the handshake
auth posture, §4.3), the ws-server takes on validation, and reveal-over-
socket becomes an extraction surface until the handshake verifies a token.
This is where the CLI lane lands regardless (§6.5), so E and B coexist as
two request frames over one persist method — acceptable under "each event
does one incredibly specific thing."

**C. B + sealed-box.** Server publishes a public key via its own
request/ack pair; browser encrypts with WebCrypto; server opens and
re-seals under the master key. Buys defense against plaintext at
TLS-terminating hops and upstream frame logging. Costs a second
key-management story and a WebCrypto implementation from scratch. E already
delivers "no plaintext on the socket" for the web without any of that —
park C.

**D. Browser-side symmetric with `@slipstream/encryption`. REJECTED.**
Ruled 2026-07-28 for the CLI; strictly worse for a public browser bundle;
mechanically impossible as packaged.

### 4.2 Comparison

| | A: Next only | E: seal on Next, persist on socket | B: socket owns all | C: B + sealed-box |
|---|---|---|---|---|
| Completion signals per save | 2 (POST result + WS ack) + timer | 1 (ack) | 1 (ack) | 1 |
| Clocks the UI reconciles | 2 | 1 | 1 | 1 |
| Plaintext on the socket | no | **no** | yes (in TLS) | no |
| Reveal auth | session cookie | session cookie | WS handshake (4.3) | WS handshake |
| ws-server change | none | persist handler + delete | + validator + encrypt | + keypair |
| Web keeps encryption/validator | yes | yes (by choice) | no | no |
| CLI lane | separate (§6.5) | later, B-shaped, same persist method | same frame | same |
| Works while socket is down | yes | no (4.4) | no | no |

### 4.3 The auth caveat (why E is the safe first step)

Today's WS handshake trusts `?id=` plus "some session exists." Today's
reveal requires the better-auth session cookie. Under **B**, moving reveal
to the socket lowers the bar for plaintext extraction from "holds the
victim's session cookie" to "knows the victim's userId while they have any
live session." Under **E** nothing plaintext ever crosses the socket:
`user_key_persist` carries ciphertext the sender obtained from *their own*
cookie-authenticated action; the worst an attacker at the handshake bar
can do is persist a blob (their key) under a victim's userId — tamper, not
extraction, and within the exposure that already exists (that attacker
can drive the victim's BYOK chat today). Delete is likewise tamper-only.

So E requires no auth work. When the handshake verifies a token (web:
better-auth `advanced.crossSubDomainCookies` on `.aicoalesce.com` — the
telemetry cookies already ride that domain to the ws host — plus
ws-server validation of the cookie's token against `Session.token`; CLI:
`CliSession` per config-planning §6), B becomes safe for reveal too. Not a
prerequisite for anything in this doc.

Aside, for the ruling: write-only keys (no reveal; a stored `keyHint`
last-four shown as `••••1234`) would remove the decrypt-to-client surface
entirely and simplify the editor further. Andrew's comment in the action
defends reveal (cross-referencing another tab); E keeps it working as-is,
so this is a UX preference, not a security requirement.

### 4.4 What E gives up

The action's DB write worked over plain HTTPS regardless of socket state;
the persist frame needs an open socket. Mitigation: the editor's submit is
disabled while `readyState !== OPEN` with a visible "reconnecting" state,
and the frame is **never queued** (`chat-ws-client.ts:568-590` queues when
closed — the persist path should gate on OPEN rather than enqueue, so a
stale frame can't replay after a reconnect over a newer save from another
tab). Acceptable — the app is socket-bound already (chat cannot send
either), and reconnect (`:542-560`, exponential backoff) is mature.

No request/response correlation exists on the client (acks are
subscription-style, `use-chat-ws.ts:79-85`). Not needed: the UI holds a
single-editor invariant (one in-flight submission at a time) and every ack
carries `provider`, so a stray ack is attributable. No `requestId`.

### 4.5 Server action vs. route handler for the two Next-side endpoints

(Andrew, 2026-08-16: "should I be using an api route instead of a server
action, or does it not matter here?")

For security and for the design above: **it does not matter.** Both run
in Node, both authenticate through the same `getSession()` / cookie path,
and under E both surviving endpoints — seal (validate + encrypt) and
reveal (decrypt) — are non-mutating transforms. Nothing in §5–§7 changes
either way.

Practically it tilts to **route handlers**, for four reasons:

1. **House style.** The client already talks to
   `app/api/users/[userId]/...` route handlers (`use-conversations.ts:
   99,127`); `api-key.ts` and `message-actions.ts` are the only two
   `"use server"` files in `apps/web`. Routes are the boring explicit
   primitive — URL, JSON in/out, status codes, `res.json<T>()` via the
   existing augmentation — which is the sweet-summer-child posture applied
   to the server side.
2. **Prod error masking.** Errors *thrown* from a server action are
   redacted in production; the client sees a generic message.
   `getDecryptedApiKeyOnEdit` throws `"unauthorized"` / `"No API key
   configured…"` today, so prod users get no reason. Returning
   `{ success:false, reason }` fixes this in either mechanism, but a route
   makes status + reason the default shape rather than a discipline.
3. **Deploy skew.** Server actions are addressed by build-specific IDs; a
   long-lived tab that predates a deploy gets "Failed to find Server
   Action" on Save (Vercel skew protection mitigates, if enabled). A chat
   app is exactly the long-lived-tab case. Route URLs are stable. Distinct
   from the §2 root cause, but a plausible extra source of "sometimes."
4. **Operability.** A route is curl-able and integration-testable without
   the React runtime, and rate-limitable by path — relevant because seal
   burns one outbound provider-validation call per hit.

What routes cost: hand-declared response types (export the type, consume
with `res.json<SealResult>()`); `Cache-Control: no-store` on reveal — or
make reveal a POST, which sidesteps GET caching entirely; and no automatic
Origin check (server actions have one). With better-auth's default
`SameSite=Lax` cookie and non-mutating endpoints, a cross-site fetch cannot
carry the session cookie, so that last point is low-stakes.

Shape: `POST /api/users/[userId]/api-keys/seal` and `POST
/api/users/[userId]/api-keys/reveal`, with the existing
`session.user.id !== userId` guard from the (otherwise dead) sibling GET
route, which is deleted. If the end-to-end inference of calling a typed
function is worth more to Andrew than 1–4, staying on the action is fine
— just return, don't throw.

## 5. Wire contract sketch (proposal — `events.ts` is Andrew's territory)

Names are via-agnostic because the persist method is shared; bare
verb-request → `_ack`; uniform ack shape (`success: boolean`, `reason?:
string` undefined exactly when success, canonical DTO always attached), per
the ratified convention and the `cli_config_update_ack` precedent
(`apps/ws-server/src/resolver/cli-config-update.ts:42-65` — the wire uses
`success`, not `ok`).

```ts
// E — web today
type UserKeyPersist = {
  type: "user_key_persist";
  provider: Provider;                                  // lowercase wire form
  sealed: { iv: string; authTag: string; data: string }; // hex, from the action
  isDefault: boolean;
};
type UserKeyPersistAck = {
  type: "user_key_persist_ack";
  success: boolean;
  reason?: string;                                     // undefined iff success
  provider: Provider;
  providerContext: ClientContextWorkupProps;           // ALWAYS — rejected write snaps client to truth
};

type UserKeyDelete = { type: "user_key_delete"; provider: Provider };
type UserKeyDeleteAck = {
  type: "user_key_delete_ack";
  success: boolean;
  reason?: string;
  provider: Provider;
  providerContext: ClientContextWorkupProps;
};

// B — CLI later (server validates + seals); same prisma method as persist
type UserKeySet = {
  type: "user_key_set";
  provider: Provider;
  apiKey: string;                                      // plaintext inside TLS; volatile send only
  isDefault: boolean;
};
type UserKeySetAck = { /* identical shape to UserKeyPersistAck */ };
```

**Action, slimmed (`api-key.ts`):** `sealApiKey(formData)` → parse
provider against the roster → `KeyValidator` → `encryptText` → return
`{ success: true, provider, sealed } as const` or `{ success: false,
reason } as const`. No Prisma, no invalidations. `getDecryptedApiKeyOnEdit`
stays, minus `decryptMapper`.

**Server flow, `user_key_persist`** (resolver method on the chain, a
`case` in `dispatch.ts:routeEvent` + both literals in `EVENT_TYPES`
`dispatch.ts:131-184`; no `exe()` change for the handler itself):

1. Parse guarantees `provider` ∈ roster and `sealed` is three hex strings
   of the right lengths (`iv`/`authTag` 32 hex, `data` ≤ 512).
2. Test-decrypt via the `EncryptionService` already on
   `PrismaUserMetaService`; discard the plaintext; on failure ack
   `success:false, reason:"malformed_ciphertext"`.
3. New prisma chain link (`PrismaUserKeyService`, or methods on
   `user-meta.ts`): `upsertUserKey(userId, provider, sealed, isDefault)`
   inside `$transaction` with the default-clear (`updateMany` where
   `{userId, isDefault:true}` → `false`) when `isDefault`; **upsert, never
   delete+create** (preserves `Message.userKeyId` provenance).
   `deleteUserKey(userId, provider)`.
4. Post-write, in the same handler: evict the `(userId, provider)` entry
   from whatever §3.1 leaves standing (`registry.get(userId)?.delete(
   provider)` — nothing, if the memo is deleted); recompute
   `injectClientApiKeyProps(userId)`; write it into
   `userDataMap.get(userId).providerContext` **unconditionally** — today's
   `handleProviderContextUpdate` only writes back if an entry already
   exists (`connection.ts:139-143`) and `stashUserData` bails on a
   cookie-less upgrade (`ws-server/index.ts:190-191`); the lane must not
   inherit that gap (`WSServer.refreshUserProviderConfig`, `:257-278`,
   exists unused and is the natural hook).
5. Ack. Log `{ provider, success }` — never the frame.

`provider_context_update/_ack` becomes redundant for the web (the persist
ack *is* the fresh context). Keep it as the generic "re-read" nudge for
now; retire once nothing sends it.

Open: fan-out of the fresh `providerContext` to the user's *other* open
sockets (second tab, CLI). Today they learn only via reconnect or ping.
Not new to this lane, but the lane is where it would be cheap to add if a
per-user socket set exists.

## 6. What React holds (the sweet summer child) — snappy, reliable, no weird behavior

Truth comes from `useApiKeys().providerContext`. Everything the tab
renders is derived from it, plus one editor's ephemeral draft.

```ts
// derived, no state
configured  = roster.filter(p => providerContext.isSet[p])
available   = roster.filter(p => !providerContext.isSet[p])
isDefault   = (p) => providerContext.isDefault[p]

// ephemeral, one editor at a time
editor: {
  provider: Provider;
  value: string;              // draft; for edits, seeded by one reveal round-trip
  isDefault: boolean;
  masked: boolean;            // eye toggle, local only
} | null
pending: Provider | null      // set on submit, cleared by the matching ack
lastAck: { provider; success; reason? } | null   // badge flourish + inline reason
```

Gone: the `apiKeys` mirror, the sync effect, `providerObj` mutation
(`providerObj` becomes a readonly `as const satisfies` roster of icon /
label / placeholder only), `tempValuesRef` + trigger counter,
`originalValues`, `tempDefaults`, `visibleKeys`, `submissionStates`,
`decryptingKey`, the 1500 ms timer, and the third "Available Providers
with open forms" section. Two sections: **Configured** (from `isSet`) and
**Add a provider** (grid of the rest). Clicking either opens the *one*
editor inline.

**Submit sequence:** `sealApiKey(formData)` (button reads "Validating with
Anthropic…" — the only unavoidable latency is the provider round-trip) →
on `success:false` show `reason` under the field, editor stays open with
the draft → on success `pending = provider`, send `user_key_persist` (gated
on socket OPEN, never queued) → `user_key_persist_ack` arrives → the
context's existing handler pattern updates `providerContext` → the row
re-derives into **Configured** → editor closes → badge flourish plays on
the now-configured row, keyed on `lastAck`, not a timer. Total perceived
latency = validation RTT + one socket RTT. Delete: confirm →
`user_key_delete` → ack → row re-derives out.

**Each weird behavior today → what kills it:**

| Today | Cause (§2/§3) | Under §5 + §6 |
|---|---|---|
| Typing into an "Available Provider" field does nothing | dead controlled input, `editingKey` gate | one editor, draft in `editor.value`; no gate |
| Must Cancel then re-add from the grid | third section of always-open forms | section removed; grid → editor directly |
| Trash removes the row, it comes back | local-only delete + resurrecting effect | real `user_key_delete`, row derives out on ack |
| Re-edit shows the *old* key after a save | `decryptMapper` never invalidated | cache deleted |
| Two providers marked default | no server-side default clear | transaction in the persist method |
| Row list flickers / rebuilds after save | full `apiKeys` rebuild from `providerObj` | derived rows keyed by provider; only the changed row re-renders |
| 1.5 s pause before the editor closes | timer racing the ack | ack closes it |
| Generic "Failed to save" | validator reason discarded | `reason` inline (`invalid_api_key__anthropic__401` → mapped copy) |
| Error text sometimes never appears | `submitError` gated on `editingKey` | one editor owns its own `lastAck` |
| Save silently accepted while offline, context stale | POST succeeded, nudge queued | submit disabled until OPEN; "reconnecting" state |

`ApiKeysProvider` grows `persistKey(provider, sealed, isDefault)`,
`deleteKey(provider)`, `pending`, `lastAck`, and listens for the two new
acks alongside the three it already handles; `sendProviderContextUpdate`
leaves the web once the lane is live. The reveal round-trip
(`getDecryptedApiKeyOnEdit`) runs once when an edit editor opens and seeds
`editor.value`; the standalone eye on a non-editing configured row goes
away — "open the editor" *is* "view the key," which is what the action's
own comment describes users doing.

`hasChanges` collapses to "`editor.value` differs from the revealed
value, or `editor.isDefault` differs from `isDefault(p)`" for edits and
"non-empty" for adds.

## 7. Phasing (each ships alone, green, useful)

0. **Hotfix, now, on today's lanes** — no contract change, both web apps
   and the ws-server: delete `userProviderKeyMap` (or, if kept, nest it
   `Map<userId, Map<Provider, …>>` per §3.1 with last-socket-close
   eviction) and evict on `provider_context_update`; delete
   `decryptMapper`; `$transaction` for default-uniqueness; parse the
   provider before `toPrismaFormat`; delete the invalidation trio; hide the
   trash until delete exists. §3.1 alone justifies touching `apps/web`
   directly rather than proving out on `web-next`.
1. **ws-server persist lane (additive):** `events.ts` members (Andrew);
   prisma chain link with the transaction; resolver methods + `case` arms
   + `EVENT_TYPES` entries; memo eviction; unconditional `userDataMap`
   write-back. Nothing on the web changes.
2. **Web on the lane:** action slimmed to seal + reveal; `ApiKeysProvider`
   grows the two intents; the §6 component; drop `provider_context_update`
   from the web send path; delete `orm/user-key-service.ts` and the dead
   route. Web keeps `ENCRYPTION_KEY`, `@slipstream/encryption`,
   `@slipstream/key-validator`. `web-next` follows or is left behind.
3. **CLI input lane:** `user_key_set` (plaintext-in; ws-server gains
   validator + encrypt) → same persist method (config-planning §6.5,
   renamed via-agnostic).
4. **Optional:** handshake token verification; then B for the web too if
   shedding the action ever becomes worth it. Sealed-box parked.

## 8. Open questions for Andrew

1. Frame names — `user_key_persist` (ciphertext-in, web) and `user_key_set`
   (plaintext-in, CLI later) as two events over one method; or one name
   for both? My lean: two events, `user_key_*` prefix, no `cli_`.
2. Test-decrypt on persist (server rejects malformed blobs) — yes? Costs
   one AES-GCM open per save; the plaintext is discarded immediately.
3. Reveal: keep as the cookie-authenticated action (E keeps it working,
   my lean), or drop it for write-only + a `keyHint` column? Pure UX call.
4. `provider_context_update/_ack` after the lane lands: retire, or keep
   as the generic "re-read" nudge?
5. Should `user_key_persist_ack` fan `providerContext` out to the user's
   other sockets, and does a per-user socket set already exist to do it?
6. Phase 0 hotfix — land it on `apps/web` + `apps/ws-server` directly
   (the §3.1 bleed is live), yes?
