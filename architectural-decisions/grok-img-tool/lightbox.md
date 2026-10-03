# Lightbox — finalizing the client (regroup, 2026-09-28)

Tree at `aec9b79`, clean. Lightbox v0 shipped in `83afe1b`; as-built in `overview.md` §9.1; v0's review in `notes.md`.

## Goal (Andrew)

**Both paths are client-side. React renders, it does not fetch.** The branch name is the thesis: make
React a sweet summer child again. No Prisma in either `page.tsx`; no RSC data dependency.

The client keeps a **hydrated attachment registry on standby** — a provider under
`app/(chat)/layout.tsx` (so it survives route changes and wraps the `{modal}` slot and the hard page
alike) mirroring a **per-user, in-memory registry the resolver builds post-handshake**. The client
asks once per connection with a no-args frame and the server answers in kind, the `conversation_list`
posture. Neither path asks for a specific attachment; both read the mirror.

```ts
// resolver-side, mirrored 1:1 on the client
Map<userId, Map<conversationId, Map<attachmentId, AttachmentSingleton<true>>>>
```

Prisma is touched once per user per connection (populate), never per open.

## Decisions taken 2026-09-28

1. **Scope: attachments as a whole, not lightbox-only.** The write-through sites are shared by every
   attachment kind (finalize, persist, delete, compat completion); a lightbox-only registry would
   install the same plumbing and get re-plumbed for the next viewer. Keying by conversation means
   `asset_complete` writes through at the same moment it fires `asset_ready`.
2. **Value: the full `AttachmentSingleton<true>`** (`packages/types/src/types.ts` L220). It is what
   methods across the monorepo already narrow on; every write-through site already holds one; the
   row is shape-identical to what `ai_chat_response.convo` delivers. No projection type, no second
   vocabulary — USER vs AI, inline vs job vs audio, is read-time narrowing on fields already present
   (`draftId`/`batchId` only ever set for user uploads; `seriesId` + exactly one of
   `inlineImageGenOutput` / `imageGenOutput` / `audioGenOutput` for generated; `ttsJob` for TTS).
3. **Populate predicate — the direct `Attachment → User` relation.** As landed 2026-09-28
   (`prisma/attachment-hydration.ts`): `status != FAILED`, and `OR` of: any non-GENERATED row
   (user uploads of every type — audio included, providers take mp3/wav natively); GENERATED with
   `imageGenOutput.kind = FINAL`; GENERATED with `inlineImageGenOutput.kind = FINAL`; GENERATED with
   `audioGenOutput.kind = FINAL` (new `AudioGenOutputKind` enum + column, `@default(FINAL)`, so the
   migration backfilled every lyria row). PARTIALs of any lane never enter the registry until the
   partial replay lane exists; TTS rides its own job lane and stays out. Originally drafted as
   `status: "READY"`; Andrew widened it to `!= FAILED`.
   `attachment.prisma`: `userId String` (required) + `user User @relation(… onDelete: Cascade)` L61/L116,
   so the outer key IS the FK and populate is one query with no join through conversations or
   messages. `conversationId String?` (L56/L111, cascade) supplies the inner key. **Conversation scope
   is the granularity; message coupling is irrelevant to the registry** — `messageId` is never read.
   READY is the gate ("successfully uploaded" = finalize ran, `cdnUrl` written), which is what makes
   a fresh thumbnail viewable full-size before it is ever sent. No `deletedAt` filter — the loaders
   have none; `asset_deleted` write-through is the removal path. TTS rows and job-lane PARTIALs ride
   along; the lightbox narrows to FINAL at read time.
4. **`"new-chat"` is a first-class inner key.** A new-chat upload stores `conversationId: null`
   (`convoId()` in `prisma/utils.ts` L90) but its `draftId` still encodes the sentinel
   (`${userId}~${conversationId}~${batchId}~${ordinal}`, `attachment.prisma` L57). Inner key =
   `row.conversationId ?? "new-chat"`. Precedent: `sttUserRehydrate` (`resolver/stt.ts` L246) takes
   the client's `conversationId`, sentinel included, and restores dictations not yet bound to a chat.
   **Rekey = the `HandleAiChatRequestRT` result, associated by `batchId`:** in `resolver/chat.ts`
   right after `handleAiChatRequest` returns (L119/L125), `res.id` is the real id and every user
   asset in the request carries its `batchId`; when `isNewChat` (L165) the rows in the `new-chat`
   bucket with that `batchId` move to `res.id`. Other unsent new-chat uploads stay put. In an existing
   conversation the request persist touches nothing — the rows were bucketed under the real id at
   finalize. Pre-READY previews stay in the client's `AssetProvider`.
5. **One include.** Populate reuses the loaders' `includeGamma` (image, document, audio, both gen
   outputs, `inlineImageGenOutput`, `messageBlock`) and the same `messageBlock: v.messageBlock ??
   undefined` mapping, so the registry and provider history agree on the row.
6. **Three lanes, no per-id ask for the pages** (contract landed 2026-09-28,
   `packages/types/src/contract/hydrate-attachments.ts`). `hydrate_attachments` is a no-args frame →
   the server streams the user's whole registry back, one ack per conversation bucket.
   `hydrate_attachments_by_conversation_id` returns one bucket (sentinel accepted — the gallery and
   unsent-uploads-restore read). `hydrate_attachment_by_id` is the one-off singleton lane, and its
   ack doubles as the **push-on-write** frame: every server-side `set` (finalize, persist, rekey,
   compat completion) emits it to the user's sockets so the client mirror never drifts. The pages
   read only the mirror.

## As built (what changes)

| file | today | after |
|---|---|---|
| `app/(chat)/@modal/(.)attachment/[id]/page.tsx` | server, Prisma | no-params client render |
| `app/(chat)/attachment/[id]/page.tsx` | server, Prisma ×2 (`generateMetadata` + page) | no-params client render; **OG metadata dropped** (see Open) |
| `orm/user-message-service.ts` `inlineImageGenSpecsByAttachmentId` | the temp query | unused → delete (Andrew's line, needs his nod) |
| `ui/chat/inline-image-gen/lightbox.tsx`, `lightbox-route.tsx`, Eye `<Link>` in `index.tsx` | — | **unchanged** |

## What each layout provider holds (checked 2026-09-28)

The `{modal}` slot sits beside `{children}` inside every provider in `app/(chat)/layout.tsx`.

| provider | indexed by attachment id? | holds |
|---|---|---|
| **`AttachmentRegistryProvider` (new)** | **yes** — the mirror of the server registry, keyed conversation → attachment, sentinel bucket included | every READY attachment of the user, standby across routes |
| `AIChatProvider` → `store: ChatStore` | yes, for the active conversation only | committed timeline |
| `ConversationHydrationProvider` | no — precedent for the ack-ingest shape and requested/in-flight dedupe refs | page pre-warm |
| `AssetProvider` | no — upload tasks by draft id (user assets in flight, pre-READY) | composer |
| `ImageGenProvider` | no | job-lane settings |

## Server — the registry

**Where it lives (Andrew, 2026-09-28): on `ResolverAttachmentHydrationService` itself.** The link
sits at the bottom of the resolver ladder (`resolver/index.ts` JSDoc: `utils.ts` is the base,
`asset-compat.ts` above it, then `attachment-hydration.ts`, and everything else stacks on top), so a
`protected` registry there is reachable by every link that writes through — `asset-complete.ts`
(finalize), `chat.ts` (rekey), `connection.ts` (populate / evict) — and by its own three handlers.
No separate service, no composition-root injection. It is still not on the Prisma service: a CRUD
class must not hide a cache (CLAUDE.md, registry pattern).

```ts
class ResolverAttachmentHydrationService extends ResolverAssetCompatService {
  protected attachmentRegistry = new Map<string, Map<string, Map<string, AttachmentSingleton<true>>>>();
  // populate(userId)                      — consumes prisma.attachmentHydrationGenerator(userId): one yield per bucket,
  //                                          new-chat first, then conversations most-recently-active first (landed 2026-09-28,
  //                                          prisma/attachment-hydration.ts — metadata query for ordered ids + counts up front,
  //                                          then known-count offset slices per bucket; predicate status != FAILED)
  // *buckets(userId)                      — iterate the inner Maps for the hydrate_attachments ack stream
  // byAttachment(userId, attachmentId)     — scan the user's inner maps (small) → the row
  // set(userId, row)                       — write-through; inner key = row.conversationId ?? "new-chat"
  // rekey(userId, batchId, conversationId) — move the batch's rows out of the "new-chat" bucket
  // delete(userId, attachmentId)
  // evict(userId)                          — last socket gone
}
```

**Populate.** `postHandleConnectionEstablishedJob` in `resolver/connection.ts` is the post-handshake
hook (it already resets `userStoreDocStatus` and pushes the conversation list). Add `evict(userId)`
then `populate(userId)` to its `Promise.all`. Eager per user now; the key structure already supports
lazy per-conversation populate if a user ever outgrows one `findMany`.

**Write-through sites** (orchestration layer, each already holding the singleton; each followed by a
`hydrate_att_by_id_ack` push to the user's sockets):

| site | event | write |
|---|---|---|
| `resolver/asset-complete.ts`, after `finalize()` | alongside `asset_ready` | `set` — always; bucket = `conversationId ?? "new-chat"` (the thumbnail → full-size UX) |
| `resolver/chat.ts`, after `handleAiChatRequest` returns `res: HandleAiChatRequestRT` (L119/L125) | before the first `ai_chat_chunk` | `isNewChat` only → `rekey(userId, batchId, res.id)`; an existing conversation needs nothing |
| `resolver/chat.ts` `handleAIChat`, after the awaited provider call (`await svc.routeXai(commonProps)` etc., L319–L389) | after the handler has sent `ai_chat_response` | `set` the generated rows — born at persist with the real `conversationId`, never pass through finalize. The provider services sit outside the chain, so the handlers **return the persisted `convo`** they already hold (additive `return`, 14 signatures, void today) and the resolver writes once. Alternative: a redis subscriber on the published `ai_chat_response` — nothing observes it today (`dispatch.ts` allow-list only), heavier |
| the compat completion path (image compat / Adobe webhook) | — | `set` the row with its new `compatStatus` / `compatCdnUrl` |
| asset delete | `asset_deleted` | `delete` (the client drops it on the existing `asset_deleted` frame — no new push needed) |

**Evict.** The `ws.on("close")` hook in `ws-server/index.ts` already computes `stillConnected` and
deletes `userDataMap` only when the last socket for the user drops — call `evict(userId)` in the same
branch. The connect-time reset covers reconnect.

**Race.** The client's no-args ask can land before the populate job finishes: serve from the registry
if the user is present, else await `populate` then stream — the `getOrCreateCliConfig` posture.

## Wire

**Landed** (`aec9b79` → this commit): `packages/types/src/contract/hydrate-attachments.ts` — six
frames, three lanes:

| request | ack | answers with |
|---|---|---|
| `hydrate_attachments` `{}` | `hydrate_attachments_ack` `{ userId, conversationId, attachments[] }` | one ack per conversation bucket, streamed; `conversationId: "new-chat"` for the unbound bucket |
| `hydrate_attachments_by_conversation_id` `{ conversationId }` | `hydrate_attachments_by_conversation_id_ack` (same shape) | one bucket; sentinel accepted |
| `hydrate_attachment_by_id` `{ attachmentId }` | `hydrate_attachment_by_id_ack` `{ userId, conversationId, attachment?, reason? }` | one row; also the push-on-write frame. Miss = `attachment` absent + `reason: "INVALID_ID"`, one field set either way |

`conversationId` on the singleton push is what lets the client move a rekeyed row between buckets.

Wired (Andrew, 2026-09-28): `contract/index.ts` `AnyEvent` union, `src/index.ts` re-exports,
`tsdown.config.ts` entry; `resolver/attachment-hydration.ts` (`ResolverAttachmentHydrationService`,
between `asset-compat.ts` and `asset-attach-or-paste.ts` in the chain, `resolver/index.ts` ladder
updated) with the three handlers **stubbed**; `dispatch.ts` cases + allow-list + `registerAll`;
`apps/web/src/utils/chat-ws-client.ts` and `packages/cli/src/chat-ws-client.ts` allow-lists +
dispatcher slots. **Next: the registry service the stubs read from (Server section above).**

## Client — one mirror, two thin pages

**`AttachmentRegistryProvider`** (`context/attachment-registry-context.tsx`), mounted in
`app/(chat)/layout.tsx` beside the others. It owns a small external store — a `Map<conversationId,
Map<attachmentId, AttachmentSingleton<true>>>` plus an `id → conversationId` index in refs — with the
same `subscribe` / `getSnapshot` surface `ChatStore` exposes, so consumers subscribe per id via
`useSyncExternalStore` and a bucket landing re-renders only the rows that changed. The provider:

- sends `hydrate_attachments` once `connection_established` lands, once per connection, and again on
  reconnect (the `rehydrateKeyRef` posture in `stt-context.tsx` L1072–1083);
- ingests `hydrate_attachments_ack` (the whole bucket, **replaced wholesale** — the client merges
  nothing) and `hydrate_attachment_by_id_ack` (set one row; if the id was under another key, drop it
  there — that is the rekey arriving); see `attachment-registry-blueprint.md` for the code;
- drops a row on `asset_deleted`.

Hooks: `useAttachment(attachmentId)` → the row or `undefined`; `useConversationAttachments(conversationId)`
→ the bucket (sentinel accepted — this is the future unsent-uploads restore and gallery read).

**Lookup for the lightbox is one step:** `useAttachment(id)`. No store selector, no SWR, no per-id
ask. `undefined` means the mirror has not landed yet (hard load, first few hundred ms) → skeleton.
`hydrate_att_by_id` is reserved for a genuinely one-off need (a link to an attachment the user does
not own is a miss either way).

The lightbox component maps the row to `LightboxImage` itself, narrowing on what is present:
`inlineImageGenOutput` / `imageGenOutput` for generated images, `image` for user uploads (`width`,
`height`, `format`), so an uploaded photo's thumbnail opens in the same dialog. `Lightbox` /
`LightboxRoute` stay as they are.

**Pages.** Both become `export default function Page() { return <… /> }` with no params and no I/O
— `useParams<{ id: string }>()` inside the client component. The intercept renders `LightboxRoute`;
the hard page renders the existing full-page figure + back link (`/chat/${row.conversationId}`) as a
client component. No dynamic API in either segment → static shells, `<Link>` prefetches the modal.

## Open (Andrew's calls)

- **Response-persist write-through** — handlers `return` the persisted `convo` and `handleAIChat`
  sets once (recommended; follows from the chain placement), or a redis subscriber on
  `ai_chat_response`.
- **OG metadata** — the only thing the client path cannot do. Drop now; an `opengraph-image` route
  later if shared links matter.
- **Delete `inlineImageGenSpecsByAttachmentId`** once both pages are off it.
- **Index size** — eager whole-registry hydrate per connection is right for today's counts (dev 739
  urls across all users, prod 2913); the per-conversation ack stream is the lever if a user ever
  outgrows it (page the generator, or hydrate the sentinel + the on-screen conversation first).

## Landing order

1. ~~Contract file + union + re-exports; rebuild types.~~ **landed** `80e8071` (+ `conversationId` on the by-id request, `3e27eb0`).
2. ~~Registry Map + methods on `ResolverAttachmentHydrationService`; three handlers.~~ **landed** `3e27eb0`. No evict anywhere — the registry lives for the process (Andrew, 2026-09-29).
3. Write-through: ~~post-connection push (`connection.ts`)~~, ~~finalize set + inline by-id ack (`asset-complete.ts`)~~, ~~new-chat rekey + per-row ack (`chat.ts`)~~ **landed 2026-09-29**. Still open: the post-provider `set` of generated rows (needs handlers to return the persisted `convo`), and compat completion's registry refresh (the DB update lives inside `imgCompatService` / `pdfService`, outside the resolver chain — registry-only, no frame).
4. Web: ~~`AttachmentRegistryStore` + `AttachmentRegistryProvider` + `useAttachment` / `useConversationAttachments`, mounted in `(chat)/layout.tsx` inside `ConversationHydrationProvider`, wrapping `AIChatProvider`~~ **landed 2026-09-29**. Open: `ShallowLightbox` + the two pages — **Andrew's** (his lightbox files).
5. Delete the ORM temp method once both pages are off it.

Typecheck `pnpm -C apps/ws-server typecheck` and `pnpm -C apps/web typecheck`. Live: open an inline
image from a conversation (modal, no network); reload on `/attachment/[id]` (full page from the
mirror, no Prisma); back/forward reopen and dismiss; a second tab as the same user must not evict the
first tab's registry; upload an image in an existing conversation and click its thumbnail at
`asset_ready`; upload in a new chat, send, and confirm the row moved out of the `new-chat` bucket.
