# Web API-key handling: security and architecture review

Date: 2026-08-17

Status: REVIEW / REVISED RECOMMENDATION

Reviewed:

- `architectural-decisions/web-api-key-handling/fable-5.md`
- `apps/web/src/ui/api-key-settings/{index.tsx,types.ts,constants.ts}`
- `apps/web/src/app/actions/api-key.ts`
- `apps/web/src/context/api-keys-context.tsx`
- `apps/ws-server/src/prisma/user-meta.ts`
- the surrounding websocket handshake, dispatch, resolver, Prisma schema,
  `@slipstream/encryption`, and `@slipstream/key-validator` implementations

## Ruling

Fable's UI diagnosis, cache findings, and "make React stupid" state model are
excellent and should be retained. Its security conclusion around Option E is
not ready to ship, however. In particular, this sentence should be reversed:
**Option E does require auth work.** Ciphertext protects confidentiality; it
does not authorize a durable mutation to a user's credential vault.

My recommendation is:

1. **The ws-server should become the sole owner of `UserKey` persistence,
   revocation, default-provider invariants, encryption, and provider-key
   validation.** This is directionally consistent with `sweet-summer-child`
   and eliminates split domain logic.
2. **Do not move writes onto the existing browser WebSocket.** Put a narrow,
   authenticated internal command endpoint on the ws-server's existing HTTP
   server. Let a Next Route Handler act as the browser-facing BFF: authenticate
   the Better Auth session, enforce browser-origin protections, and proxy the
   command server-to-server. The browser receives one canonical response.
3. **Keep the current web-side DB write only as a short-lived stopgap** while
   that backend boundary is built. It is safer than adding credential-vault
   mutations to the current websocket identity model.
4. **Use a Route Handler instead of a Server Action for the lasting web
   ingress**, because it matches the repository's existing web API style and
   is easier to rate-limit, integration-test, observe, and proxy. This is an
   architectural/operational choice, not an inherent security upgrade. A route
   must explicitly replace the Origin protection that Next applies to Server
   Actions.
5. **Do not retain DB access in a reveal action** if the desired boundary is
   truly "all `UserKey` DB operations live on ws-server." Either make keys
   write-only (preferred security posture) or proxy a tightly protected reveal
   command through the same BFF/internal endpoint.

The preferred flow is therefore:

```text
React editor
   -> POST /api/me/api-keys                 (same-origin Next route)
      -> authenticate + authorize first
      -> validate request shape/size + rate limit
      -> authenticated internal HTTPS command
         -> ws-server validates provider key with timeout
         -> ws-server encrypts and persists transactionally
         -> ws-server returns canonical providerContext
      <- one discriminated response
   <- update ApiKeysContext from canonical response

ws-server -> user-scoped push to the user's other live sockets after commit
```

This preserves a stupid React client, puts database and secret-domain logic in
one backend, avoids bouncing an encrypted capability through browser state,
and removes the POST-result / websocket-nudge / timer race without weakening
identity assurance.

## What Fable got right (confirmed)

### Critical cache isolation defects

Both findings are confirmed:

- `apps/ws-server/src/prisma/user-meta.ts:16-20,224-235` caches decrypted keys
  by provider in a process-wide service. If both users have a row for that
  provider, user B can receive user A's cached plaintext, and rotations stay
  stale.
- `apps/web/src/app/actions/api-key.ts:82,101-112` repeats the same defect for
  reveal. A warm Next process can reveal another user's key or a stale key.

Delete both plaintext caches immediately. Decryption is cheap and the current
ws-server cache does not even avoid the preceding DB query. If a measured need
for caching later appears, cache a per-user ciphertext record and decrypt only
at use; never retain plaintext in a registry.

### React state bug and completion race

Fable's root-cause trace is accurate:

- `providerObj` is asserted mutable and then mutated during synchronization.
- the sync effect inserts all unset providers into `apiKeys`;
- those rows render controlled inputs whose value is forced to `""` unless
  `editingKey` matches;
- the available-provider path never sets `editingKey`;
- Cancel happens to return the provider to the only path that does set it;
- deletion is local-only and is resurrected by server truth;
- the 1.5-second timer races the websocket acknowledgement.

Fable's proposed UI shape is the right one: immutable provider roster,
`providerContext` as canonical truth, and one ephemeral editor draft. React
should not mirror server booleans into a mutable roster.

### Other confirmed findings

- No real delete/revoke persistence path exists.
- Provider input is trusted through a type assertion at a runtime boundary.
- `handleAsDefault` treats every string other than exact `"false"` as true.
- Multiple defaults are possible.
- The cache invalidation calls do not support a meaningful current read path.
- Browser-side symmetric encryption with `@slipstream/encryption` is rejected:
  the package is Node-only and distributing a shared vault key to clients
  would destroy the security model.

## Security findings missing or understated in Fable

### CRITICAL: plaintext API keys are logged in the browser

`apps/web/src/ui/api-key-settings/index.tsx:409-414` logs `apiKey`, provider,
default status, and DB row ID after a successful save. This is credential
disclosure to DevTools, browser log collectors, screenshots, support tooling,
and any script with console instrumentation.

This log must be removed in the first hotfix. Do not replace it with masked
key material, ciphertext, or a reversible payload. Log only a mutation ID,
provider, outcome, latency, and a pseudonymous/appropriately handled user ID
on the trusted server.

### CRITICAL: the current WebSocket does not authenticate the connecting user

`apps/ws-server/src/ws-server/index.ts:440-467` accepts a user ID from `?id=`.
`getAndValidateUserSessionById` then proves only that the named user has some
unexpired session row. It does not prove the connecting browser possesses that
session token. A caller who knows a victim's user ID can act as that victim
while any victim session is alive.

The server also creates `WebSocketServer({ server })` without an Origin
allowlist. A browser websocket is not made safe merely because it uses WSS.

Therefore Option E's claim that the worst new outcome is tolerable "tamper,
not extraction" is not a sufficient security argument. Persistent key
replacement and deletion are credential-vault compromise, can redirect spend
or provider data through an attacker-controlled account, and survive the
attacker's socket disconnect. Existing chat impersonation is a reason to fix
the boundary, not a reason to add more authority to it.

Before any browser websocket mutation is allowed, require all of:

- proof of possession of a session bound to the claimed user;
- a fixed Origin allowlist on browser handshakes;
- per-message authorization for the authenticated principal;
- session expiry/revocation behavior for already-open sockets;
- message-size and rate limits.

A short-lived, single-use websocket ticket minted by the authenticated web app
is preferable to putting a reusable session token in a query string. It can be
stored as a hash in Redis, bound to `sub`, `aud`, Origin, expiry, and nonce, and
atomically consumed during the handshake. CLI sessions remain a separate
credential type. Enabling cross-subdomain cookies is possible, but it expands
cookie exposure to the subdomain trust boundary and should not be the default.

### CRITICAL: websocket parsing is type-only, not runtime validation

Fable says the parser will guarantee a valid provider and correctly sized hex
fields. The current parser does not. `dispatch.ts:186-255` checks only that JSON
is an object and its `type` is on a list, then asserts the entire object to
`AnyEvent`. The web client parser does the same.

The new command needs a real runtime parser that rejects unknown properties
and validates:

- exact event/command version;
- provider membership in the canonical roster;
- strict booleans;
- key byte length before provider calls;
- ciphertext as even-length lowercase/uppercase hex, with exact IV/tag sizes;
- request/mutation ID shape;
- total message/body size.

TypeScript event types remain useful after parsing, but they are not a security
boundary. The websocket server also needs a conservative `maxPayload`; the
current constructor does not set one.

### HIGH: Fable's sealed envelope is not bound to user or provider

`@slipstream/encryption` uses AES-256-GCM correctly for basic authenticated
encryption, but it authenticates only the plaintext. It does not use additional
authenticated data (AAD), and its payload has only `{ iv, authTag, data }`.

Under Option E, a ciphertext returned for one provider can be relabeled as a
different provider. With the broken websocket identity boundary, it can also
be replayed against another user. Test-decrypt proves only that someone with
access to the shared encryption service produced the blob; it does not prove
the surrounding `userId`, `provider`, purpose, freshness, or authorization.

If a sealed-browser lane is ever retained, use a versioned envelope bound to at
least `userId`, `provider`, purpose, and schema version through AAD, or issue a
short-lived signed mutation capability containing those claims. Include expiry
and a one-time identifier if replay matters. Do not reuse `ENCRYPTION_KEY` as
the command-signing key.

For the recommended server-to-server flow, the browser does not need an
envelope at all: the ws-server receives the plaintext over authenticated TLS,
validates it, encrypts immediately, and never returns it.

### HIGH: authentication currently occurs too late for validation

`upsertApiKey` obtains the session but calls the external provider validator
before checking that `userId` exists. An unauthenticated invocation can consume
outbound network work. Authenticate and authorize before parsing secret data
beyond the minimum necessary, and before every provider call.

For sensitive routes, use a dedicated session helper that bypasses Better
Auth's cookie cache (`disableCookieCache: true`) or otherwise checks the actual
session token in storage. The current cookie cache is configured for 24 hours;
Better Auth documents that revoked sessions can remain usable until that cache
expires. This matters especially for reveal, replace, and revoke.

### HIGH: validator behavior needs a security contract

`@slipstream/key-validator` has fixed destination URLs, which is good for SSRF
resistance, but it currently has no timeout/cancellation and generally treats
HTTP 429 as proof that a key is valid. A 429 can be an infrastructure or
unauthenticated rate limit and is not reliable credential proof. Several error
messages include raw third-party response text.

The backend validator contract should:

- enforce auth, provider, and byte-length limits before network I/O;
- use a short `AbortSignal` timeout and map timeouts/network errors to
  `verification_unavailable`, not `invalid_key`;
- rate-limit by user, IP/session, and provider;
- treat 429 as indeterminate unless that provider's documented behavior makes
  authentication certain;
- return a stable internal reason code and never relay raw upstream text;
- never log request headers, URL query strings containing keys, or response
  bodies that might echo secret material.

### HIGH: a transaction alone does not guarantee one default

Fable proposes `updateMany(false)` followed by upsert in a transaction. At the
default PostgreSQL isolation level, concurrent transactions can still race and
commit two different default rows.

Enforce the invariant in the database with a partial unique index created by a
SQL migration, after deterministically repairing existing duplicates:

```sql
CREATE UNIQUE INDEX "UserApiKey_one_default_per_user"
ON "UserApiKey" ("userId")
WHERE "isDefault" = true;
```

Keep the transaction for the state transition and handle the unique-conflict
path. If the deployment cannot use the partial index, use a serializable
transaction with retry or a per-user database lock; an in-process mutex is not
sufficient across replicas.

### HIGH: credential rotation needs a versioned cache identity

Fable is right that an upsert should preserve the `UserKey` row ID for
historical relations. But this row ID is also used as `keyFingerprint` for
provider-file/cache affinity. Rotating a key in place can therefore make
resources created under the old provider account look reusable under the new
credential.

Preserve the row ID, but add a credential version or keyed fingerprint that
changes when the secret changes. Provider-scoped artifacts must use that
versioned identity. A raw hash is unnecessary; use a keyed HMAC with a distinct
pepper or an opaque monotonically increasing credential version.

### HIGH: hard delete and provenance goals conflict

Fable calls hard delete safe because relations use `onDelete: SetNull`, while
also requiring upsert to preserve historical provenance. Setting historical
`userKeyId` values to null is precisely provenance loss.

Prefer revoke semantics:

- atomically make the secret unusable and clear `isDefault`;
- remove/null encrypted key material (subject to backup-retention policy);
- retain non-secret row metadata and relations with `revokedAt`;
- allow a later save to reactivate the row with a new credential version.

If product semantics truly require hard deletion, document the intentional
loss of historical attribution and test all `SetNull` effects.

### HIGH (adjacent): the ws-server trusts client BYOK flags for quota decisions

`resolver/chat.ts:71-84` explicitly trusts `hasProviderConfigured` from the
client to decide whether to run the free-tier guard. The guard is also async,
is not awaited, and its return cannot stop the chat flow. A handcrafted frame
can claim BYOK and bypass the check; even the honest-client path does not gate
processing reliably.

The ws-server already performs the authoritative key lookup. Derive BYOK and
default status there, and make quota admission an awaited discriminated result
before persistence/provider dispatch. This is directly aligned with making
React stupid and prevents stale `providerContext` from becoming a billing or
authorization input.

### MEDIUM: correlation, replay, fan-out, and multi-instance truth

The "single editor means no request ID" conclusion is too narrow. Multiple
tabs, a CLI, reconnects, retries, and user-scoped server pushes can overlap.
Every mutation needs a client-generated `mutationId` echoed in its response.
The server should make retries idempotent for a bounded window. Decide and
document whether concurrent edits are last-write-wins or use an expected
credential version.

After commit, return canonical `providerContext` in the mutation response and
fan the same versioned context to the user's other sockets. This must be
user-scoped across ws-server replicas; do not use a global raw broadcast.
Client-provided context is presentation data only.

### MEDIUM: encryption package hardening and rotation are absent

`EncryptionService.getMasterKey()` checks only that the source string length is
at least 64 before `Buffer.from(hex)`. Require exactly 64 hexadecimal
characters for AES-256 and fail closed at process startup. The stored envelope
also lacks a cipher/key version, which makes master-key rotation and gradual
migration unsafe.

Add versioned ciphertext metadata (`cipherVersion`, `keyId`) and a migration
plan: read legacy rows, write the current format, and re-encrypt deliberately.
AAD should bind at-rest ciphertext to stable row metadata such as user,
provider, and envelope purpose. Node's crypto API supports GCM AAD directly.

### MEDIUM: current auth origin configuration is not an allowlist

`apps/web/src/utils/auth.ts:16-20` derives `trustedOrigins` from the incoming
request URL itself. That is tautological rather than a fixed trust policy and
should not be reused for the API-key route's Origin check. Resolve an explicit
environment-specific allowlist, taking trusted proxy behavior into account.

## Server Action versus Route Handler

The mechanism does matter at the edges, but not because one can safely hold a
secret and the other cannot. Both execute server-side and both can authenticate
the same session.

Use a Route Handler for the durable BFF because it gives this subsystem a
stable, explicit protocol and matches the web app's prevailing style. Suggested
browser-facing endpoints:

- `POST /api/me/api-keys` — validate and upsert
- `DELETE /api/me/api-keys/:provider` — revoke
- `POST /api/me/api-keys/:provider/reveal` — only if reveal is retained

Do not put `userId` in the route or body. Derive it exclusively from the
verified session. This removes an IDOR parameter instead of repeatedly checking
that it matches.

Route requirements:

- exact same-origin/Origin and Fetch Metadata checks;
- authentication before body/provider network work;
- fresh/revalidated session for sensitive operations;
- small explicit body limit and strict JSON parser;
- rate limiting and provider-validation timeout;
- `Cache-Control: no-store, private` on every response; reveal must be POST;
- safe discriminated response codes, never raw exceptions/provider bodies;
- no secret, ciphertext, session token, or full request-body logging.

Next.js currently gives Server Actions an Origin-versus-Host CSRF check and a
default 1 MB body limit. Moving to a route means deliberately replacing those
protections with tighter API-key-specific limits. POST Route Handlers are not
cached by default, but explicit no-store headers are still appropriate for
secret-bearing responses and intermediaries.

If the BFF route merely forwards to ws-server, authenticate the internal hop as
a service-to-service request. Use mTLS, workload identity, or a dedicated
request-signing secret with timestamp, body digest, audience, and replay
protection. A private network or an unsigned `X-User-Id` header alone is not an
authorization boundary.

If keeping validation and encryption in Next is an intentional constraint,
that can still use the recommended topology: authenticate and seal in the BFF,
then send the envelope directly to the authenticated internal ws-server
endpoint. Do not return the envelope to the browser. Bind it to user, provider,
purpose, and version with AAD, and have ws-server authenticate/decrypt before
persisting. This is acceptable, but it leaves the vault master key and secret
packages deployed in two runtimes and is less clean than making ws-server own
the whole credential domain.

Moving the current direct-Prisma action to a direct-Prisma Route Handler is a
reasonable staging step if it immediately adds strict parsing, rate limiting,
and tests. If the backend migration is imminent, avoid a route-only rewrite;
make the route the final BFF from the outset.

## Target ws-server service boundary

Create a purpose-specific `PrismaUserKeyService` in the ws-server chain. Keep
transport parsing/responses in a resolver or HTTP command handler and secret
domain rules in this service. Suggested operations:

```ts
validateAndUpsertUserKey(params)
revokeUserKey(params)
getUserProviderContext(userId)
revealUserKey(params) // only if the product retains reveal
```

Required behavior:

1. Parse and authorize the authenticated principal.
2. Validate provider, strict boolean, secret byte length, and mutation ID.
3. Validate the provider credential with bounded I/O.
4. Encrypt immediately on ws-server using a versioned, metadata-bound envelope.
5. Transactionally clear/set default and upsert/revoke.
6. Return provider context from authoritative post-commit state.
7. Invalidate any ciphertext registry for the exact user/provider.
8. Emit a user-scoped context-changed event only after commit.

Do not hide registry writes inside low-level CRUD. The orchestration handler
owns post-commit invalidation and fan-out. Do not cache plaintext.

## React and context contract

Retain Fable's §6 state model with one change: the canonical mutation response
can be HTTP rather than a websocket ack.

React holds only:

- the immutable provider roster;
- canonical `providerContext` supplied by the backend;
- one editor draft;
- one pending mutation ID and a safe result code.

It does not hold a second `apiKeys` truth mirror, mutate `providerObj`, wait on a
fixed timer, or send `hasProviderConfigured` as an authoritative backend fact.
On a successful response, the context adopts returned canonical state. A
user-scoped websocket push updates other tabs/CLI. On failure, the editor stays
open and renders mapped copy for the safe reason code.

If reveal remains, keep plaintext only in the active editor, clear it on close,
unmount, navigation, and account change, and never place it in a module cache,
websocket queue, persistence store, analytics event, error object, or console.

## Revised phasing

### Phase 0 — immediate security hotfix

- Remove the plaintext browser `console.log`.
- Delete `decryptMapper` and `userProviderKeyMap`.
- Authenticate before provider validation.
- Runtime-validate provider, boolean, and key byte length.
- Add validator timeout, bounded error mapping, and rate limiting.
- Hide the delete control until real revoke exists.
- Stop trusting client BYOK/default flags for quota or authorization.
- Fix/await quota admission independently of this feature migration.
- Repair duplicate defaults and add the partial unique index.

### Phase 1 — centralize the domain on ws-server

- Add `PrismaUserKeyService` with upsert/revoke/context and no plaintext cache.
- Add credential version/fingerprint semantics.
- Add versioned encryption metadata/AAD or explicitly schedule it as the next
  migration before any sealed-browser lane.
- Add the authenticated internal command endpoint.
- Add safe audit events and focused unit/integration tests.

### Phase 2 — web BFF and stupid React

- Replace the action with same-origin `/api/me/api-keys` Route Handlers.
- Remove direct `UserKey` Prisma access from `apps/web`.
- Rewrite the settings component as a projection of `providerContext` plus one
  editor.
- Return canonical context in the HTTP response; remove the nudge and timer.
- Add user-scoped cross-tab/CLI context push after commit.

### Phase 3 — reveal decision

- Prefer write-only keys with a non-secret hint/fingerprint.
- If reveal remains, proxy it through the same boundary with fresh-session
  validation, stricter rate limit, no-store response, audit event, and optional
  recent reauthentication.

### Phase 4 — only if browser websocket writes are still desired

- Implement identity-bound websocket tickets or validated session tokens.
- Add Origin allowlisting, session expiry/revocation, runtime message schemas,
  `maxPayload`, rate limits, mutation correlation/idempotency, and replay tests.
- Then decide whether a dedicated websocket mutation lane adds value over the
  already-correct BFF command path. It is not required for ws-server DB
  ownership.

## Minimum verification matrix

- Two users with the same provider never share decrypted values.
- Rotation is visible immediately and changes credential cache identity.
- Ciphertext/AAD copied across user/provider fails to decrypt.
- Invalid, oversized, malformed, unknown-property, and non-hex payloads fail
  before DB or provider I/O.
- Unauthenticated, revoked-session, wrong-Origin, and wrong-user attempts fail.
- Provider timeout and 429 produce indeterminate safe errors, not stored keys.
- Concurrent `isDefault: true` writes leave at most one default.
- Retried mutation IDs are idempotent; stale-version behavior is deterministic.
- Revoke makes the key unusable immediately and preserves the chosen provenance
  semantics.
- Other tabs/CLI receive only their own post-commit provider context.
- Secret-bearing values are absent from client/server logs and error telemetry.
- Free-tier admission is based on server-resolved key state and actually gates
  provider dispatch.

## Bottom line on Fable's plan

Keep §2's UI diagnosis, most of §3's hotfixes, and §6's React simplification.
Replace §4's recommendation and strengthen §5's contract. The clean target is
not "database writes happen over WebSocket"; it is **"the ws-server owns the
credential domain, while every ingress proves identity and authority before it
can invoke that domain."**

Until that boundary exists, keep persistence in the authenticated web server.
Once it exists, move persistence, validation, encryption, reveal/revoke, and
canonical context calculation behind it, and let the Next route be a thin
session-aware BFF.

## External references checked

- [Next.js Server Action security and allowed origins](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
- [Next.js Route Handler behavior](https://nextjs.org/docs/app/getting-started/route-handlers)
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
- [Better Auth session management and cookie-cache revocation caveat](https://better-auth.com/docs/concepts/session-management)
- [Better Auth cross-subdomain cookie guidance](https://better-auth.com/docs/concepts/cookies)
- [Node.js authenticated encryption and AAD](https://nodejs.org/api/crypto.html)
