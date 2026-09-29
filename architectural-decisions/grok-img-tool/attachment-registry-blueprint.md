# Attachment registry — blueprint (2026-09-29)

Code-first companion to `lightbox.md`. Everything here is a proposal to read against; nothing is
implemented except what is marked **landed**. Types are the real ones from `@slipstream/types`,
`@slipstream/db`, and the contract in `packages/types/src/contract/hydrate-attachments.ts`.

---

## 0. The shape, both sides

```
SERVER  ResolverAttachmentHydrationService.attachmentRegistry
        Map<userId, Map<bucketKey, Map<attachmentId, AttachmentSingleton<true>>>>
                        │
                        └─ bucketKey = attachment.conversationId ?? "new-chat"

CLIENT  AttachmentRegistryStore (one per user, lives in AttachmentRegistryProvider)
        buckets   Map<bucketKey, Map<attachmentId, AttachmentSingleton<true>>>
        bucketOf  Map<attachmentId, bucketKey>          ← O(1) by-id + knows where a row was on rekey
        snapshots Map<bucketKey, readonly AttachmentSingleton<true>[]>   ← stable arrays for useSyncExternalStore
```

The two are the same registry minus the user level.

**"Bucket" is an index key, not a wall (Andrew, 2026-09-29).** Conversations in Slipstream are
fluid and permeable by design — conversation memory search exists precisely to dissolve the hard
context-window boundary, and the goal is inter-conversational continuity. The registry keys by
conversation for delivery order and O(1) reads, nothing more: the by-id lane falls through every
key (§1, answer 2), a row moves between keys on rekey, and a future gallery or "attach this older
asset here" flow reads across keys without the registry changing shape. Nothing here should ever
assume an attachment is reachable only from the conversation it was born in.

Server → client sync is exactly three frames:

| frame | when | client action |
|---|---|---|
| `hydrate_attachments_ack` `{ userId, conversationId, attachments[] }` | **pushed unprompted right after `connection_established`**, one per bucket, the whole bucket — the client never asks (Andrew, 2026-09-29) | `setBucket` (replace wholesale) |
| `hydrate_attachments_by_conversation_id_ack` (same shape) | answer to a bucket ask — **the scoped fallback**: a client whose mirror was dropped asks for the conversation it is on, not the whole registry; the whole-registry ask is the last resort (Andrew, 2026-09-29) | `setBucket` |
| `hydrate_attachment_by_id_ack` `{ userId, conversationId, attachment?, reason? }` | answer to a one-off ask **and** the push after every server-side write | `setOne` (set; if the id sat under another key, drop it there — that is a rekey arriving) |

The client merges nothing. The server owns the registry; the client mirrors frames as they come.

**No delete lane.** Users cannot delete individual attachments or messages (the client's only
mutations are auth, API keys, and conversation delete / rename); `asset_deleted` is in the contract
but nothing on the server emits it. Conversation delete runs through the web API route, not
ws-server — see §6.

---

## 1. Server — `apps/ws-server/src/resolver/attachment-hydration.ts`

The link already exists with three stubbed handlers (`80e8071`). This is the filled version. The
registry is `protected` on the link; every resolver above it in the ladder reaches it directly.

```ts
import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverAssetCompatService } from "@/resolver/asset-compat.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { AttachmentSingleton, EventTypeMap } from "@slipstream/types";

export class ResolverAttachmentHydrationService extends ResolverAssetCompatService {
  constructor(/* unchanged */) {
    super(/* unchanged */);
  }

  /**
   * userId → (conversationId | "new-chat") → attachmentId → row.
   * Lives for the process: never evicted on disconnect, so a brief drop
   * reconnects onto the warm reservoir (Andrew, 2026-09-29). Bounded by
   * users-connected-since-boot; a task restart clears it.
   */
  protected attachmentRegistry = new Map<
    string,
    Map<string, Map<string, AttachmentSingleton<true>>>
  >();
  protected NEW_CHAT_BUCKET = "new-chat" as const;

  // ── population (post-connection only; no client ask, so nothing to race) ─

  /**
   * Populate-if-absent from the prisma generator (one yield per bucket,
   * new-chat first, then conversations most-recently-active first). A user
   * already in the map — a reconnect — is a no-op: the reservoir is reused.
   * Writes land in the live map, so a finalize that completes mid-populate
   * is not lost; a later generator page re-setting the same id is a no-op.
   */
  protected async populateAttachmentRegistry(userId: string) {
    if (this.attachmentRegistry.has(userId)) return;
    const user = new Map<string, Map<string, AttachmentSingleton<true>>>();
    this.attachmentRegistry.set(userId, user);
    for await (const {
      conversationId,
      attachments
    } of this.wsServer.prisma.attachmentHydrationGenerator(userId)) {
      // Map.prototype.getOrInsertComputed — Node 26 + TS 6 lib.esnext.collection;
      // the thunk allocates only on a miss (getOrInsert would allocate on every call)
      const bucket = user.getOrInsertComputed(
        conversationId,
        () => new Map<string, AttachmentSingleton<true>>()
      );
      for (const att of attachments) bucket.set(att.id, att);
    }
  }

  // ── write-through (map only — the write site sends the singleton frame
  //    inline on the ws it already holds; every socket is an authenticated user) ──

  /**
   * Bucket = row.conversationId ?? "new-chat". Returns the key so the site can
   * send `hydrate_attachment_by_id_ack { conversationId: key, attachment }`.
   * Used at finalize (asset-complete), at the post-provider persist (chat),
   * and by rekey.
   */
  protected setRegistryAttachment(
    userId: string,
    attachment: AttachmentSingleton<true>
  ) {
    const key = attachment.conversationId ?? this.NEW_CHAT_BUCKET;
    this.attachmentRegistry
      .getOrInsertComputed(
        userId,
        () => new Map<string, Map<string, AttachmentSingleton<true>>>()
      )
      .getOrInsertComputed(
        key,
        () => new Map<string, AttachmentSingleton<true>>()
      )
      .set(attachment.id, attachment);
    return key;
  }

  /**
   * The new-chat rekey. `rows` are the persisted user-message attachments
   * from HandleAiChatRequestRT — DB truth, conversationId already set by the
   * request-side connect — so this is delete-from-sentinel + set. The site
   * then sends one by-id ack per row; the real conversationId on it is what
   * makes the client move the row.
   */
  protected rekeyRegistryAttachments(
    userId: string,
    rows: AttachmentSingleton<true>[]
  ) {
    const user = this.attachmentRegistry.get(userId);
    const unbound = user?.get(this.NEW_CHAT_BUCKET);
    for (const att of rows) {
      unbound?.delete(att.id);
      this.setRegistryAttachment(userId, att);
    }
    if (unbound?.size === 0) user?.delete(this.NEW_CHAT_BUCKET);
  }

  // ── reads ───────────────────────────────────────────────────────────────

  protected registryAttachmentById(userId: string, attachmentId: string) {
    const user = this.attachmentRegistry.get(userId);
    if (!user) return undefined;
    for (const [conversationId, bucket] of user) {
      const attachment = bucket.get(attachmentId);
      if (attachment) return { conversationId, attachment } as const;
    }
    return undefined;
  }

  // ── handlers (the three stubs) ──────────────────────────────────────────

  /**
   * The comprehensive push: one ack per bucket, the whole bucket; new-chat
   * first (Map insertion order = generator order). The client replaces the
   * bucket wholesale — no merging on that side. Called by the post-connection
   * job (§1.2) every connection; a client whose mirror was dropped (a Next
   * global-context reset, say) may send `hydrate_attachments` and gets the
   * same push — from the reservoir, never a repopulate (Andrew, 2026-09-29).
   */
  protected async hydrateAttachments(
    _event: EventTypeMap["hydrate_attachments"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    await this.populateAttachmentRegistry(userId);
    const user = this.attachmentRegistry.get(userId);
    if (!user) return;
    for (const [conversationId, bucket] of user) {
      ws.send(
        JSON.stringify({
          type: "hydrate_attachments_ack",
          userId,
          conversationId,
          attachments: Array.from(bucket.values())
        } satisfies EventTypeMap["hydrate_attachments_ack"])
      );
    }
  }

  /** one bucket; the sentinel is a valid key; an unknown id answers with an empty array */
  protected async hydrateAttachmentByConversationId(
    event: EventTypeMap["hydrate_attachments_by_conversation_id"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    await this.populateAttachmentRegistry(userId);
    const bucket = this.attachmentRegistry
      .get(userId)
      ?.get(event.conversationId);
    ws.send(
      JSON.stringify({
        type: "hydrate_attachments_by_conversation_id_ack",
        userId,
        conversationId: event.conversationId,
        attachments: bucket ? Array.from(bucket.values()) : []
      } satisfies EventTypeMap["hydrate_attachments_by_conversation_id_ack"])
    );
  }

  /**
   * The request carries the client's belief about the bucket. Three answers:
   *   1. found in the requested bucket → as-is
   *   2. found in another bucket → the real conversationId (the client moves
   *      the row; this is how a stale belief self-corrects)
   *   3. found nowhere → INVALID_ID, the requested conversationId echoed back
   *      so the field is never empty
   */
  protected async hydrateAttachmentById(
    event: EventTypeMap["hydrate_attachment_by_id"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    await this.populateAttachmentRegistry(userId);
    const user = this.attachmentRegistry.get(userId);
    const inRequested = user
      ?.get(event.conversationId)
      ?.get(event.attachmentId);
    const hit = inRequested
      ? { conversationId: event.conversationId, attachment: inRequested }
      : this.registryAttachmentById(userId, event.attachmentId);
    ws.send(
      JSON.stringify(
        hit
          ? ({
              type: "hydrate_attachment_by_id_ack",
              userId,
              conversationId: hit.conversationId,
              attachment: hit.attachment
            } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
          : ({
              type: "hydrate_attachment_by_id_ack",
              userId,
              conversationId: event.conversationId,
              reason: "INVALID_ID"
            } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
      )
    );
  }
}
```

Contract change this needs (Andrew's file, one line): `HydrateAttachmentById` gains
`conversationId: string` — the bucket the client currently holds the id under, or the sentinel.

### 1.1 Decisions folded in

**No `sendToUser` (Andrew, 2026-09-29).** The handshake only completes for a valid session, so
every socket is a user and every send is a send-to-user; each write site already holds the `ws`.
The push is an inline `ws.send` after the map write (§1.2). A second tab or the CLI as the same user
does not see the write live; if that is ever wanted, the lane is the redis user channel the way
`conversation:created` is published — not a socket-map walk.

**The by-id miss `conversationId` — resolved (Andrew, 2026-09-29; contract updated).** The request carries the
client's believed bucket; a hit elsewhere answers with the real one, a total miss echoes the
requested one with `reason: "INVALID_ID"`. The ack field stays required and always true.

### 1.2 Write-through sites, in place

**`resolver/connection.ts` — `postHandleConnectionEstablishedJob`**: the push, every connection,
exactly the `sendInitialConversationList` posture one line above it. Populate-if-absent is inside
the handler, so a fresh user pays one DB pass and a reconnect pays nothing but the frames:

```ts
    void this.sendInitialConversationList(ws, userId);
    void this.hydrateAttachments({ type: "hydrate_attachments" }, ws, userId).catch(err => {
      this.wsServer.prisma.safeErrMsg(err);
    });
```

**`ws-server/index.ts` — `ws.on("close")`**: nothing. The registry is not evicted; the reservoir
survives the disconnect and the next connection reuses it.

**`resolver/asset-complete.ts` — after `finalize()` + the READY update**, beside the `asset_ready`
send. One adaptation: the update that writes READY must `include` the same relations the generator
does (image, document, audio, both gen outputs, inlineImageGenOutput, messageBlock) and map
`size` → `Number`, `?? undefined` on the optional relations, so what lands in the registry is an
`AttachmentSingleton<true>`, the same row the client already receives inside `convo`:

```ts
    const ready = await this.wsServer.prisma.finalizeAttachment(/* … include … */);
    const conversationId = this.setRegistryAttachment(userId, ready);   // conversationId ?? "new-chat"
    const registryFrame = {
      type: "hydrate_attachment_by_id_ack",
      userId,
      conversationId,
      attachment: ready
    } satisfies EventTypeMap["hydrate_attachment_by_id_ack"];
    ws.send(JSON.stringify(registryFrame));
    ws.send(JSON.stringify({ type: "asset_ready", /* … */ } satisfies EventTypeMap["asset_ready"]));
```

**`resolver/chat.ts` — `handleAIChat`**, two spots:

```ts
    // right after `res` (L153 today): the new-chat rekey, batch-matched by construction —
    // the user message's attachments ARE the batch; one by-id ack per row carries the real id
    if (isNewChat && typeof batchId !== "undefined") {
      const rekeyed = res.messages.at(-1)?.attachments ?? [];
      this.rekeyRegistryAttachments(userId, rekeyed);
      for (const attachment of rekeyed) {
        ws.send(
          JSON.stringify({
            type: "hydrate_attachment_by_id_ack",
            userId,
            conversationId,
            attachment
          } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
        );
      }
    }

    // after the awaited provider switch (L319–L389 today), once handlers return the persisted convo:
    const convo = await svc.routeXai(commonProps);
    for (const attachment of convo?.messages[0]?.attachments ?? []) {
      this.setRegistryAttachment(userId, attachment);     // generated rows: born with the real conversationId
      ws.send(
        JSON.stringify({
          type: "hydrate_attachment_by_id_ack",
          userId,
          conversationId,
          attachment
        } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
      );
    }
```

**Compat completion** (image compat / Adobe webhook → `compatStatus` flips, `compatCdnUrl` written):
**registry only, no frame** (Andrew, 2026-09-29). Compat is for models, not users — the converted
object exists because providers cannot view the variety of assets a user can upload; the client
shows originals. `setRegistryAttachment(userId, updatedRow)` where the update happens today keeps
the registry equal to the DB row for the next hydrate; nothing is pushed.

---

## 2. Client — `apps/web/src/state/attachments/store.ts`

Mirrors `ChatStore`'s idiom: private Maps, immutable snapshots rebuilt only for the bucket that
changed, stable `subscribe` / `get*` arrow props, one listener set. **Per-id subscriptions are free**:
the snapshot for `useAttachment(id)` is the row object itself, so `useSyncExternalStore`'s `Object.is`
only re-renders the consumer when *that* row's reference changes. The registry changes on acks only,
never per token.

```ts
import type { AttachmentSingleton } from "@slipstream/types";

type Listener = () => void;
const EMPTY_BUCKET: readonly AttachmentSingleton<true>[] = [];

export class AttachmentRegistryStore {
  private buckets = new Map<string, Map<string, AttachmentSingleton<true>>>();
  private snapshots = new Map<string, readonly AttachmentSingleton<true>[]>();
  private bucketOf = new Map<string, string>();
  private readonly listeners = new Set<Listener>();

  public readonly subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /** the row object — referentially stable until the server pushes a new one for this id */
  public readonly getAttachment = (attachmentId: string) => {
    const key = this.bucketOf.get(attachmentId);
    return key ? this.buckets.get(key)?.get(attachmentId) : undefined;
  };

  /** a stable array for the bucket — rebuilt only when that bucket changes */
  public readonly getBucket = (bucketKey: string) =>
    this.snapshots.get(bucketKey) ?? EMPTY_BUCKET;

  public readonly getServerAttachment = () => undefined;
  public readonly getServerBucket = () => EMPTY_BUCKET;

  /** hydrate_attachments_ack / _by_conversation_id_ack — the whole bucket, replaced wholesale */
  public setBucket(bucketKey: string, rows: AttachmentSingleton<true>[]) {
    for (const id of this.buckets.get(bucketKey)?.keys() ?? []) {
      this.bucketOf.delete(id);
    }
    const bucket = new Map<string, AttachmentSingleton<true>>();
    for (const row of rows) {
      bucket.set(row.id, row);
      this.bucketOf.set(row.id, bucketKey);
    }
    this.buckets.set(bucketKey, bucket);
    this.rebuild(bucketKey);
    this.notify();
  }

  /** hydrate_attachment_by_id_ack — one row; a different bucketKey than we hold = the rekey arriving */
  public setOne(bucketKey: string, row: AttachmentSingleton<true>) {
    const prev = this.bucketOf.get(row.id);
    if (prev && prev !== bucketKey) this.dropFrom(prev, row.id);
    // getOrInsertComputed types under the web lib (ESNext) too; confirm browser
    // baseline before it ships client-side — Next does not polyfill builtins
    this.buckets
      .getOrInsertComputed(
        bucketKey,
        () => new Map<string, AttachmentSingleton<true>>()
      )
      .set(row.id, row);
    this.bucketOf.set(row.id, bucketKey);
    this.rebuild(bucketKey);
    this.notify();
  }

  /** userId changed / sign-out */
  public reset() {
    this.buckets.clear();
    this.snapshots.clear();
    this.bucketOf.clear();
    this.notify();
  }

  private dropFrom(bucketKey: string, attachmentId: string) {
    const bucket = this.buckets.get(bucketKey);
    bucket?.delete(attachmentId);
    this.bucketOf.delete(attachmentId);
    if (bucket && bucket.size === 0) {
      this.buckets.delete(bucketKey);
      this.snapshots.delete(bucketKey);
    } else this.rebuild(bucketKey);
  }

  /** createdAt asc, matching the server's within-bucket order */
  private rebuild(bucketKey: string) {
    const bucket = this.buckets.get(bucketKey);
    if (!bucket) return;
    this.snapshots.set(
      bucketKey,
      Array.from(bucket.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    );
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
```

---

## 3. Client — `apps/web/src/context/attachment-registry-context.tsx`

Mounted in `app/(chat)/layout.tsx` beside the others, inside `ChatWebSocketProvider` (it needs the
client), anywhere above `AIChatProvider` so `{modal}` and the hard page both sit under it.

```tsx
"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore
} from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { AttachmentRegistryStore } from "@/state/attachments/store";
import type { ChatWsEvent } from "@slipstream/types";

interface AttachmentRegistryContextValue {
  readonly store: AttachmentRegistryStore;
}

const AttachmentRegistryContext = createContext<
  AttachmentRegistryContextValue | undefined
>(undefined);

export function AttachmentRegistryProvider({
  children,
  userId
}: Readonly<{ children: ReactNode; userId: string }>) {
  const { client } = useChatWebSocketContext();
  const [store] = useState(() => new AttachmentRegistryStore());

  // no ask on connect: the server pushes the registry after every
  // connection_established. If this mirror is ever dropped mid-session, the
  // scoped fallback is hydrate_attachments_by_conversation_id for the
  // conversation on screen; hydrate_attachments (everything) is the last
  // resort. Both answer from the server's reservoir. ingest via addListener
  // (multi-subscriber), never client.on (single slot per event type)
  useEffect(() => {
    const onEvent = (event: ChatWsEvent) => {
      switch (event.type) {
        case "hydrate_attachments_ack":
        case "hydrate_attachments_by_conversation_id_ack":
          if (event.userId !== userId) return;
          store.setBucket(event.conversationId, event.attachments);
          return;
        case "hydrate_attachment_by_id_ack":
          if (event.userId !== userId || !event.attachment) return;
          store.setOne(event.conversationId, event.attachment);
          return;
        default:
          return;
      }
    };
    client.addListener(onEvent);
    return () => client.removeListener(onEvent);
  }, [client, store, userId]);

  const value = useMemo(() => ({ store }), [store]);
  return (
    <AttachmentRegistryContext.Provider value={value}>
      {children}
    </AttachmentRegistryContext.Provider>
  );
}

export function useAttachmentRegistry() {
  const ctx = useContext(AttachmentRegistryContext);
  if (!ctx) {
    throw new Error(
      "useAttachmentRegistry must be used within AttachmentRegistryProvider"
    );
  }
  return ctx;
}

/** the row or undefined (not landed yet, or not this user's) — re-renders only when THIS row changes */
export function useAttachment(attachmentId: string) {
  const { store } = useAttachmentRegistry();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getAttachment(attachmentId),
    store.getServerAttachment
  );
}

/** a bucket, createdAt asc; "new-chat" is a valid key (unsent uploads) */
export function useConversationAttachments(bucketKey: string) {
  const { store } = useAttachmentRegistry();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getBucket(bucketKey),
    store.getServerBucket
  );
}
```

---

## 4. Client — the lightbox reads the mirror

`ui/chat/inline-image-gen/shallow-lightbox.tsx` (the stub from `80e8071`), used by **both** pages.
No params, no I/O. The lightbox shows the **original** `cdnUrl` — compat is for models, not users
(Andrew, 2026-09-29). `compatCdnUrl` is a secondary artifact on the client: a gallery would show the
user both what they uploaded and the AI-compat form when one exists. Not this pass.

```tsx
"use client";

import { useParams } from "next/navigation";
import { useAttachment } from "@/context/attachment-registry-context";
import { LightboxRoute } from "@/ui/chat/inline-image-gen/lightbox-route";

export function ShallowLightbox() {
  const { id } = useParams<{ id: string }>();
  const row = useAttachment(id);
  if (!row) return null;                                  // mirror not landed yet → skeleton

  const out = row.inlineImageGenOutput ?? row.imageGenOutput;
  const width = out?.width ?? row.image?.width;
  const height = out?.height ?? row.image?.height;
  if (!row.cdnUrl || !width || !height) return null;

  return (
    <LightboxRoute
      image={{
        src: row.cdnUrl,
        width,
        height,
        alt: out?.revisedPrompt ?? row.filename ?? "",
        caption: out?.revisedPrompt ?? undefined,
        format: out?.ext ?? row.ext ?? undefined
      }}
    />
  );
}
```

```tsx
// app/(chat)/@modal/(.)attachment/[id]/page.tsx  — and the same one line for the hard page,
// which wraps the existing full-page figure instead of LightboxRoute
export default function Page() {
  return <ShallowLightbox />;
}
```

---

## 5. Sequences

**Connect → mirror warm** (no client ask, ever)

```
client                        server
──────                        ──────
socket open ──────────────▶   auth → connection_established ──▶
                              postHandleConnectionEstablishedJob:
                                hydrateAttachments(ws, u):
                                  populateAttachmentRegistry(u)   ← fresh user: one generator pass
                                                                    reconnect: no-op, reservoir reused
                          ◀──  hydrate_attachments_ack × buckets (whole buckets), new-chat first
store.setBucket …             (a reconnect gets the same push from the warm map — replace, no merge)
```

**Upload in an existing conversation → thumbnail → full size**

```
asset_upload_complete ─────▶  finalize → READY row (include …)
                              setRegistryAttachment(u, row)  → bucket = row.conversationId
                          ◀──  hydrate_attachment_by_id_ack { conversationId, attachment }
                          ◀──  asset_ready
store.ingestOne → thumbnail <Link href="/attachment/[id]"> → intercept → useAttachment(id) → hit
```

**Upload in a new chat → send → rekey**

```
asset_upload_complete ─────▶  finalize → row.conversationId = null
                              setRegistryAttachment(u, row)  → bucket = "new-chat"
                          ◀──  hydrate_attachment_by_id_ack { conversationId: "new-chat", … }
ai_chat_request ───────────▶  handleAiChatRequest → res.id (real), connect(attachments)
                              isNewChat → rekeyRegistryAttachments(u, res.messages.at(-1).attachments)
                                 delete from "new-chat", set under res.id
                          ◀──  hydrate_attachment_by_id_ack { conversationId: res.id, … }  per row
store.ingestOne → bucketOf disagrees → dropFrom("new-chat") + set under res.id
```

**Hard load of `/attachment/[id]`**

```
page shell (static) → layout providers mount → socket → connection_established → server pushes
→ acks land → useAttachment(id) flips from undefined to the row → LightboxRoute renders
(no Prisma on the page, no ask of any kind)
```

---

## 6. Knobs left open

- Registry lifetime is the process (no evict). If memory ever matters, a TTL sweep on
  last-seen — not this pass.
- Handlers returning the persisted `convo` so `handleAIChat` can `set` the generated rows.
- Finalize update `include` + bigint mapping so `asset-complete` hands `set` a singleton.
- Conversation delete (web API route → Prisma cascade) never reaches ws-server, so the registry keeps
  a stale key until the process restarts. Harmless at this scope; the only path to it is a shared
  `/attachment/[id]` link into a deleted conversation. Likewise the one server-side delete that
  exists anywhere — nothing is removed unless it has been decoupled (unbound) for 7+ days, the
  orphan sweep — runs out of band, so an unbound upload sits in the `new-chat` key for up to a week
  and its eventual sweep is invisible to the registry. Not this pass.
