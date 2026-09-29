# Navigation-warmed attachment registry — snippets (2026-09-29)

Supersedes the eager parts of `attachment-registry-blueprint.md` (the post-connection push, the
unpaired connection frame). The model is `2026-06-26/conversation-hydration.md`: **the cache is
user-driven** — nothing is loaded that the user did not navigate toward — and the ack is written into
the cache by a top-level context via `addListener`. The navigation source is v0's verified pattern:
`onRouterTransitionStart` from `instrumentation-client.ts` (pre-commit, global, fires for `push` /
`replace` / `traverse`) plus `useParams()` in a leaf for committed truth.

```
navigation start ──▶ warm(key) ──▶ hydrate_attachments_by_conversation_id ──▶ server: registry hit?
   (pre-commit)        │ TTL dedupe                                              │ miss → one findMany for that key
                       │ skip if bucket present & fresh                          ▼
                       ◀──────────────────────── hydrate_attachments_by_conversation_id_ack (whole bucket)
                                                 client: store.setBucket(key, rows)
```

Lanes after the flip:

| lane | status | job |
|---|---|---|
| `hydrate_attachments_by_conversation_id` / `_ack` | **primary** | navigation warms through it; the only frame that fills a bucket |
| `hydrate_attachment_by_id` / `_ack` | **required** | (a) push-on-write frame at finalize / rekey; (b) a hard load of `/attachment/[id]` has an empty mirror and no conversation in the url |
| `hydrate_attachments` / `_ack` | dormant | whole-user; kept for a future gallery (which would paginate anyway) |

Not in this pass, recorded for later: **eviction**. User-driven admission slows growth, it does not
bound it (GPT's point). Client: a bucket-level LRU on the store, touched on `setBucket` and every
read, evicting past a cap — composes with the TTL (TTL = when to refresh a held bucket, LRU = when to
stop holding it); once eviction exists, presence in the mirror is no longer a guarantee, and `warm` on
navigation is what keeps the two safe together. Server: the same per user, or the last-seen sweep.

---

## 1. Server

### 1.1 `prisma/attachment-hydration.ts` — two on-demand reads beside the generator

Same filter, same include, same order as the generator. `null` selects the unbound rows (the
`"new-chat"` key). The whole-user generator stays for the dormant lane.

```ts
  /** one key on demand — `conversationId: null` is the new-chat bucket */
  public async attachmentsByConversation(
    userId: string,
    conversationId: string | null
  ) {
    const rows = await this.prismaClient.attachment.findMany({
      where: { userId, conversationId, ...this.attachmentFilter },
      orderBy: { createdAt: "asc" },
      include: {
        image: true,
        audioGenOutput: true,
        document: true,
        audio: true,
        imageGenOutput: true,
        inlineImageGenOutput: true,
        messageBlock: true
      }
    });
    return rows.map(
      ({ inlineImageGenOutput, messageBlock, size, ...rest }) =>
        ({
          ...rest,
          size: size ? Number(size) : null,
          inlineImageGenOutput: inlineImageGenOutput ?? undefined,
          messageBlock: messageBlock ?? undefined
        }) satisfies AttachmentSingleton<true>
    );
  }

  /** one row on demand — the by-id miss path; scoped to the user, filter applied */
  public async attachmentById(userId: string, attachmentId: string) {
    const row = await this.prismaClient.attachment.findFirst({
      where: { id: attachmentId, userId, ...this.attachmentFilter },
      include: {
        image: true,
        audioGenOutput: true,
        document: true,
        audio: true,
        imageGenOutput: true,
        inlineImageGenOutput: true,
        messageBlock: true
      }
    });
    if (!row) return undefined;
    const { inlineImageGenOutput, messageBlock, size, ...rest } = row;
    return {
      ...rest,
      size: size ? Number(size) : null,
      inlineImageGenOutput: inlineImageGenOutput ?? undefined,
      messageBlock: messageBlock ?? undefined
    } satisfies AttachmentSingleton<true>;
  }
```

### 1.2 `resolver/attachment-hydration.ts` — the two live handlers fill on a miss

`populateAttachmentRegistry` (whole user) and `hydrateAttachments` stay as they are behind the dormant
lane. `setRegistryAttachment` / `rekeyRegistryAttachments` / `registryAttachmentById` unchanged.

```ts
  /**
   * The primary lane. Registry hit → answer from memory. Miss → one query for
   * exactly this key, set into the registry, answer. Nothing else is read.
   * `"new-chat"` selects the unbound rows (conversationId null).
   */
  protected async hydrateAttachmentByConversationId(
    event: EventTypeMap["hydrate_attachments_by_conversation_id"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const user = this.attachmentRegistry.getOrInsertComputed(
      userId,
      () => new Map<string, Map<string, AttachmentSingleton<true>>>()
    );
    let bucket = user.get(event.conversationId);
    if (!bucket) {
      const rows = await this.wsServer.prisma.attachmentsByConversation(
        userId,
        event.conversationId === this.NEW_CHAT ? null : event.conversationId
      );
      bucket = new Map<string, AttachmentSingleton<true>>();
      for (const att of rows) bucket.set(att.id, att);
      user.set(event.conversationId, bucket);
    }
    ws.send(
      JSON.stringify({
        type: "hydrate_attachments_by_conversation_id_ack",
        conversationId: event.conversationId,
        attachments: Array.from(bucket.values())
      } satisfies EventTypeMap["hydrate_attachments_by_conversation_id_ack"])
    );
  }

  /**
   * requested key → real key elsewhere → one findFirst (set under its real key)
   * → INVALID_ID echoing the requested key. Also the frame every write site sends.
   */
  protected async hydrateAttachmentById(
    event: EventTypeMap["hydrate_attachment_by_id"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const inRequested = this.attachmentRegistry
      .get(userId)
      ?.get(event.conversationId)
      ?.get(event.attachmentId);
    let hit = inRequested
      ? { conversationId: event.conversationId, attachment: inRequested }
      : this.registryAttachmentById(userId, event.attachmentId);
    if (!hit) {
      const row = await this.wsServer.prisma.attachmentById(
        userId,
        event.attachmentId
      );
      if (row) {
        const conversationId = this.setRegistryAttachment(userId, row);
        hit = { conversationId, attachment: row };
      }
    }
    ws.send(
      JSON.stringify(
        hit
          ? ({
              type: "hydrate_attachment_by_id_ack",
              conversationId: hit.conversationId,
              attachment: hit.attachment
            } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
          : ({
              type: "hydrate_attachment_by_id_ack",
              conversationId: event.conversationId,
              reason: "INVALID_ID"
            } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
      )
    );
  }
```

(`userId` is off every ack per 2026-09-29 — the socket is the user. The three `ws.send` sites at
finalize / rekey lose the field the same way once the contract is trimmed.)

### 1.3 `resolver/connection.ts` — remove the push

Delete the `void this.hydrateAttachments(...)` block added 2026-09-29. Nothing replaces it.

---

## 2. Client

### 2.1 `src/instrumentation-client.ts` — the one global pre-commit hook

```ts
import type { RouterTransitionStartEvent, RouterTransitionType } from "next";
import { publishRouterTransitionStart } from "@/lib/navigation/transition-store";

export function onRouterTransitionStart(
  url: string,
  navigationType: RouterTransitionType,
  event: RouterTransitionStartEvent | null
) {
  publishRouterTransitionStart(url, navigationType, event);
}
```

`event` is `null` without `experimental.instrumentationClientRouterTransitionEvents`; the mapper
needs only the url and type, so `next.config` stays as it is.

### 2.2 `src/lib/navigation/transition-store.ts` — framework-free singleton (v0's, kept whole)

```ts
import type {
  RouterTransitionPrefetchIntent,
  RouterTransitionStartEvent,
  RouterTransitionType
} from "next";

export type RouterTransition = {
  readonly id: string;
  readonly url: URL;
  readonly type: RouterTransitionType;
  readonly startedAt: number;
  readonly fromRoutes: readonly string[];
  readonly prefetchIntent: RouterTransitionPrefetchIntent | null;
};

type TransitionListener = (transition: RouterTransition) => void;

const listeners = new Set<TransitionListener>();
let latest: RouterTransition | undefined;
let fallbackSequence = 0;

export function publishRouterTransitionStart(
  url: string,
  type: RouterTransitionType,
  event: RouterTransitionStartEvent | null
) {
  // push/replace hand over the raw href ("/chat/abc"); traverse hands over an
  // absolute location.href — resolving against the document normalizes both
  const transition = {
    id: event?.id ?? `local-${(++fallbackSequence).toString(36)}`,
    url: new URL(url, window.location.href),
    type,
    startedAt: event?.timestamp ?? Date.now(),
    fromRoutes: event?.fromRoutes ?? [],
    prefetchIntent: event?.prefetchIntent ?? null
  } satisfies RouterTransition;
  latest = transition;
  for (const listener of listeners) listener(transition);
}

export function subscribeRouterTransitionStart(listener: TransitionListener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function getLatestRouterTransition() {
  return latest;
}
```

### 2.3 `src/lib/navigation/attachment-routes.ts` — two mappers, discriminated by function

The pre-commit hook only sees the url, so the `/` → `/chat/home` rewrite is mirrored here. Our home
key is the registry sentinel, not `"home"`. Separate functions, no union with null fields.

```ts
const CONVERSATION_PATH = /^\/chat\/([^/]+)\/?$/;
const ATTACHMENT_PATH = /^\/attachment\/([^/]+)\/?$/;

/** "/" and "/chat/home" → "new-chat"; "/chat/[id]" → id; anything else → undefined */
export function conversationKeyFromUrl(url: URL) {
  if (url.pathname === "/") return "new-chat";
  const id = CONVERSATION_PATH.exec(url.pathname)?.[1];
  if (id === undefined) return undefined;
  const decoded = decodeURIComponent(id);
  return decoded === "home" ? "new-chat" : decoded;
}

/** "/attachment/[id]" → id; anything else → undefined */
export function attachmentIdFromUrl(url: URL) {
  const id = ATTACHMENT_PATH.exec(url.pathname)?.[1];
  return id === undefined ? undefined : decodeURIComponent(id);
}
```

### 2.4 `src/context/attachment-registry-context.tsx` — `warm` + `warmAttachment`

The store is unchanged (`setBucket`, `setOne`, per-row / per-bucket snapshots). The provider gains
the two warmers and the ack listener loses its `userId` guards.

```tsx
const WARM_TTL_MS = 5 * 60_000;

export function AttachmentRegistryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, sendEvent, isConnected } = useChatWebSocketContext();
  const [store] = useState(() => new AttachmentRegistryStore());
  const warmedAt = useRef(new Map<string, number>());
  /** the last conversation key we warmed — the believed key for a by-id ask */
  const lastConversationKey = useRef<string>("new-chat");

  useEffect(() => {
    const onEvent = (event: ChatWsEvent) => {
      switch (event.type) {
        case "hydrate_attachments_ack":
        case "hydrate_attachments_by_conversation_id_ack":
          store.setBucket(event.conversationId, event.attachments);
          warmedAt.current.set(event.conversationId, Date.now());
          return;
        case "hydrate_attachment_by_id_ack":
          if (!event.attachment) return;
          store.setOne(event.conversationId, event.attachment);
          return;
        default:
          return;
      }
    };
    client.addListener(onEvent);
    return () => client.removeListener(onEvent);
  }, [client, store]);

  /**
   * Skip when the bucket is held and fresh. Dropped while disconnected — a
   * navigation before the socket is up will be re-warmed by the committed leaf
   * once useParams settles, and sendEvent would only queue it anyway.
   */
  const warm = useCallback(
    (conversationId: string) => {
      lastConversationKey.current = conversationId;
      if (!isConnected) return;
      const last = warmedAt.current.get(conversationId);
      const held = store.getBucket(conversationId).length > 0 || last !== undefined;
      if (held && last !== undefined && Date.now() - last < WARM_TTL_MS) return;
      warmedAt.current.set(conversationId, Date.now());
      sendEvent("hydrate_attachments_by_conversation_id", {
        type: "hydrate_attachments_by_conversation_id",
        conversationId
      });
    },
    [isConnected, sendEvent, store]
  );

  /** the hard-load lightbox: row absent → ask by id with the believed key; the server falls through */
  const warmAttachment = useCallback(
    (attachmentId: string) => {
      if (!isConnected || store.getAttachment(attachmentId)) return;
      sendEvent("hydrate_attachment_by_id", {
        type: "hydrate_attachment_by_id",
        attachmentId,
        conversationId: lastConversationKey.current
      });
    },
    [isConnected, sendEvent, store]
  );

  const value = useMemo(
    () => ({ store, warm, warmAttachment }),
    [store, warm, warmAttachment]
  );
  return (
    <AttachmentRegistryContext.Provider value={value}>
      {children}
    </AttachmentRegistryContext.Provider>
  );
}
```

`useAttachment(id)` / `useConversationAttachments(key)` unchanged (per-row / per-bucket
`useSyncExternalStore`). The `userId` prop goes; the layout mount loses it.

### 2.5 `src/ui/navigation-sync/index.tsx` — two childless leaves (v0's split)

Route hooks live in the leaves, never in the provider, so the provider's context value never
changes on navigation. The transition leaf has no route hooks → never suspends → mounts with the
shell and is live before any route data streams in.

```tsx
"use client";

import { Suspense, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAttachmentRegistryCtx } from "@/context/attachment-registry-context";
import {
  attachmentIdFromUrl,
  conversationKeyFromUrl
} from "@/lib/navigation/attachment-routes";
import {
  getLatestRouterTransition,
  subscribeRouterTransitionStart
} from "@/lib/navigation/transition-store";
import type { RouterTransition } from "@/lib/navigation/transition-store";

export function NavigationSync() {
  return (
    <>
      <TransitionWarmer />
      <Suspense fallback={null}>
        <CommittedRouteWarmer />
      </Suspense>
    </>
  );
}

/** pre-commit: warms on transition start; replays the latest one it may have missed */
function TransitionWarmer() {
  const { warm, warmAttachment } = useAttachmentRegistryCtx();
  useEffect(() => {
    const onTransition = (t: RouterTransition) => {
      const key = conversationKeyFromUrl(t.url);
      if (key !== undefined) warm(key);
      const attachmentId = attachmentIdFromUrl(t.url);
      if (attachmentId !== undefined) warmAttachment(attachmentId);
    };
    const latest = getLatestRouterTransition();
    if (latest !== undefined) onTransition(latest);
    return subscribeRouterTransitionStart(onTransition);
  }, [warm, warmAttachment]);
  return null;
}

/** committed truth: useParams already reflects the rewrite ("/" → conversationId "home") */
function CommittedRouteWarmer() {
  const { warm, warmAttachment } = useAttachmentRegistryCtx();
  const params = useParams<{ conversationId?: string; id?: string }>();
  const conversationId = params.conversationId;
  const attachmentId = params.id;
  useEffect(() => {
    if (conversationId !== undefined) {
      warm(conversationId === "home" ? "new-chat" : conversationId);
    }
  }, [conversationId, warm]);
  useEffect(() => {
    if (attachmentId !== undefined) warmAttachment(attachmentId);
  }, [attachmentId, warmAttachment]);
  return null;
}
```

Mount, in `app/(chat)/layout.tsx`:

```tsx
<AttachmentRegistryProvider>
  <NavigationSync />
  <AIChatProvider userId={session.user.id}>
    {children}
    {modal}
  </AIChatProvider>
</AttachmentRegistryProvider>
```

### 2.6 What the lightbox (Andrew's files) reads

Unchanged from the blueprint §4: `useAttachment(id)` → the row or `undefined` → skeleton until the
by-id ack lands; original `cdnUrl` as `src`; dims from `inlineImageGenOutput ?? imageGenOutput ??
image`.

---

## 3. Sequences

**Soft nav into a conversation**

```
click <Link href="/chat/abc">
  → onRouterTransitionStart("/chat/abc", "push")            pre-commit, before the RSC fetch
  → TransitionWarmer: warm("abc")                           bucket absent → send by_conversation_id
  → server: registry miss → attachmentsByConversation → set → ack (whole bucket)
  → store.setBucket("abc", rows)                            ~150ms after the click (v0's timing)
  → commit: CommittedRouteWarmer: warm("abc")               fresh → skipped
```

**Hard load of `/attachment/[id]`**

```
shell renders → providers mount → socket → connection_established (isConnected)
  → CommittedRouteWarmer: warmAttachment(id)                mirror empty → by_id with believed key "new-chat"
  → server: registry miss → attachmentById → set under its real key → ack { conversationId: real, attachment }
  → store.setOne(real, row) → useAttachment(id) flips → LightboxRoute renders
(TransitionWarmer replays nothing here — a hard load has no transition; the committed leaf carries it)
```

**New-chat upload → send** (unchanged): finalize `set` + by-id ack under `"new-chat"`; request
persist `rekey` + by-id acks under the real id; `setOne` moves the row.

**Cross-socket write** (second tab / CLI): invisible until this tab next navigates into that
conversation after the TTL, when `warm` re-asks and `setBucket` replaces the bucket.

**Mid-stream new-chat → real id**: a raw `history.replaceState`, which does not fire
`onRouterTransitionStart` (Next patches it into `ACTION_RESTORE`); the `router.replace` at stream
completion does, and the registry already has the rows from the rekey. No conflict with the router
deception.

---

## 4. Landing order

1. Contract: drop `userId` from the three acks (Andrew).
2. `prisma/attachment-hydration.ts`: `attachmentsByConversation`, `attachmentById`.
3. `resolver/attachment-hydration.ts`: the two handlers fill on a miss; `connection.ts`: remove the push; finalize / rekey sends drop `userId`.
4. Web: `instrumentation-client.ts`, `transition-store.ts`, `attachment-routes.ts`, provider `warm` / `warmAttachment`, `NavigationSync` leaves, layout mount.
5. Verify the `RouterTransition*` type exports from the installed `next` (16.3.6) — first thing, since the store imports them.
6. Later: bucket-level LRU on the client store; server per-user eviction.

---

## 5. Your side — the three lightbox files (sketch, 2026-09-29)

Everything below reads `useAttachment(id)` from `@/hooks/use-attachment`. `NavigationSync` already
fires the by-id ask for `/attachment/[id]` on both the transition and the committed leaf, so these
components only render what lands. **Restart the dev server once** — `src/instrumentation-client.ts`
is picked up at boot, not by HMR.

### 5.1 `ui/chat/inline-image-gen/shallow-lightbox.tsx` — replace the stub

```tsx
"use client";

import { useParams } from "next/navigation";
import { useAttachment } from "@/hooks/use-attachment";
import { LightboxRoute } from "@/ui/chat/inline-image-gen/lightbox-route";

export function ShallowLightbox() {
  const { id } = useParams<{ id: string }>();
  const row = useAttachment(id);
  if (!row) return null; // by-id ack not landed yet

  // images only this pass: inline / job lineage first, then a user upload's ImageMetadata
  const out = row.inlineImageGenOutput ?? row.imageGenOutput;
  const width = out?.width ?? row.image?.width;
  const height = out?.height ?? row.image?.height;
  if (!row.cdnUrl || !width || !height) return null;

  return (
    <LightboxRoute
      image={{
        src: row.cdnUrl, // the original — compat is for models, not users
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

### 5.2 `app/(chat)/@modal/(.)attachment/[id]/page.tsx` — no params, no I/O

```tsx
import { ShallowLightbox } from "@/ui/chat/inline-image-gen/shallow-lightbox";

export default function InterceptedAttachmentPage() {
  return <ShallowLightbox />;
}
```

(delete the `prismaClient` / `ormHandler` / `notFound` imports and the `params` prop.)

### 5.3 `app/(chat)/attachment/[id]/page.tsx` — the hard load, same source

Drop `generateMetadata` and the Prisma calls; the page becomes a one-line shell around a client
view that keeps your existing figure + back link:

```tsx
// page.tsx
import { AttachmentPageView } from "@/ui/chat/inline-image-gen/attachment-page-view";

export default function AttachmentPage() {
  return <AttachmentPageView />;
}
```

```tsx
// ui/chat/inline-image-gen/attachment-page-view.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAttachment } from "@/hooks/use-attachment";

export function AttachmentPageView() {
  const { id } = useParams<{ id: string }>();
  const row = useAttachment(id);
  if (!row) return null;
  const out = row.inlineImageGenOutput ?? row.imageGenOutput;
  const width = out?.width ?? row.image?.width;
  const height = out?.height ?? row.image?.height;
  if (!row.cdnUrl || !width || !height) return null;
  const caption = out?.revisedPrompt ?? row.filename ?? "";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Link
        href={row.conversationId ? `/chat/${row.conversationId}` : "/"}
        className="text-muted-foreground hover:text-foreground w-fit text-sm transition-colors">
        &larr; Back to conversation
      </Link>
      <figure className="flex flex-col gap-3">
        <div
          className="bg-muted relative overflow-hidden rounded-2xl"
          style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, ${width}px)` }}>
          <Image src={row.cdnUrl} alt={caption} fill sizes="(min-width: 64rem) 64rem, 100vw" className="object-cover" priority />
        </div>
        <figcaption className="flex flex-col gap-1">
          <span className="text-muted-foreground font-mono text-xs">
            {width} × {height} · {out?.ext ?? row.ext}
          </span>
          <span className="text-muted-foreground max-w-3xl text-sm leading-relaxed text-pretty">{caption}</span>
        </figcaption>
      </figure>
    </main>
  );
}
```

OG metadata goes with `generateMetadata` (decided: drop now, `opengraph-image` route later if shared
links matter).

### 5.4 Then delete

`inlineImageGenSpecsByAttachmentId` in `orm/user-message-service.ts` — nothing calls it once 5.2 and
5.3 are in.

### 5.5 Test pass

1. `pnpm -C apps/web typecheck`, restart the dev server (instrumentation-client), ws-server up.
2. Open a conversation with an inline image. Devtools WS frames: one `hydrate_attachments_by_conversation_id` at the click, one ack with the bucket. Click the Eye → modal opens, **no** Prisma, no further frames.
3. Reload on `/attachment/[id]`: `hydrate_attachment_by_id` with `conversationId: "new-chat"` (the believed key on a cold mirror) → ack carries the real key → full page renders. Back → conversation; forward → modal again (traverse fires the transition).
4. Upload an image in an existing conversation: `hydrate_attachment_by_id_ack` beside `asset_ready`; the Eye on the thumbnail opens it before send.
5. New chat: upload, send. Rekey acks arrive before the first chunk with the real `conversationId`; the Eye still opens the same row after the url flips at completion.
6. A second navigation into the same conversation inside five minutes sends nothing (TTL); after five minutes it re-asks and the bucket is replaced wholesale.
