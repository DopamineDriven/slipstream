/**
 * `ChatStoreRegistry` — the module-singleton that owns the `Map<conversationId, ChatStore>` (the warm
 * per-conversation tier in front of the DB) and is the single, React-free bridge between the WebSocket transport
 * and the per-conversation stores.
 *
 * It binds ONE fan-out `addListener` to the live `ChatWebSocketClient` (never `client.on` — that registry is
 * single-handler-per-event and is already owned by the asset / tts / api-key providers for their disjoint event
 * families), routes every `ai_chat_chunk` / `ai_chat_response` / `ai_chat_error` to its conversation's store by
 * `conversationId`, and owns the React-free half of the new-chat → real-id router-deception protocol (the raw
 * `history.replaceState` + the store-key migration). The façade supplies the two React-bound halves via
 * `setRekeyHandler` (active-id re-point on `"decoupled"`, the mandatory `router.replace` on `"recoupled"`).
 *
 * The data path is pure JS: network → `client.onmessage` → this listener → `store.applyX(evt)`. React touches it
 * at exactly two seams — the façade's `useEffect(() => registry.bindClient(client), [client])` handshake (input
 * setup) and each surface's `useSyncExternalStore` (output) — and never sits in the event path, so a re-render /
 * remount / StrictMode double-invoke cannot drop a chunk or wipe state.
 *
 * SSR: never call `getOrCreate` during server render — a module-global, cross-request `Map` mutated server-side
 * leaks stores across users (v3 §6). The façade resolves stores client-only; `getServerSnapshot` returns frozen
 * empties and never reaches here.
 */

import { ChatStore } from "@/state/chat/store";
import type {
  ChatEventListener,
  ChatWebSocketClient
} from "@/utils/chat-ws-client";
import type { ChatWsEvent } from "@slipstream/types";

/** The registry binds only the client's listener add/remove surface — not the full transport (keeps WS routing testable). */
type WsListenerHost = Pick<ChatWebSocketClient, "addListener" | "removeListener">;

/**
 * Discriminant for the rekey seam — names the resulting relationship between the browser `history` state (which
 * the registry drives directly via `replaceState`) and Next's React Router (which only learns the real id at the
 * end). The façade `switch`es on it:
 *   - `"decoupled"` — mid-stream, the registry shallow-`replaceState`d the real id into the URL WITHOUT notifying
 *                     the router (the deception). The URL leads; `usePathname()` trails. The façade re-points its
 *                     active conversationId off this event (the SAME store instance, now under its real key), NOT
 *                     the stale pathname — so subscribers never miss a chunk.
 *   - `"recoupled"` — on `ai_chat_response`(done) / `ai_chat_error`, the façade runs the MANDATORY
 *                     `router.replace("/chat/"+conversationId, { scroll: false })`, bringing the router back in
 *                     sync with the URL the user has seen since `"decoupled"` (then the passive path effect resumes).
 * See memory `project_newchat_router_deception`.
 */
export type ChatRekeyPhase = "decoupled" | "recoupled";

/**
 * The new-chat → real-id rekey seam payload — ONE consistent shape for both phases. `previousId` is the
 * `"new-chat"` key the store migrated FROM; it is only meaningful on `"decoupled"`, so it is optional —
 * `undefined` (never `null`, matching the contract style) on `"recoupled"`.
 */
export interface ChatRekeyEvent {
  readonly phase: ChatRekeyPhase;
  readonly conversationId: string;
  readonly previousId?: string;
}

export type ChatRekeyHandler = (event: ChatRekeyEvent) => void;

export class ChatStoreRegistry {
  /** Bounded retention — mobile target; unbounded would OOM a long session. Never evicts a live store (§eviction). */
  private static readonly MAX_STORES = 12;

  private readonly stores = new Map<string, ChatStore>();
  /** Monotonic per-store access stamp powering the LRU — a counter, not `Date.now()` (deterministic for tests). */
  private readonly lastAccess = new Map<string, number>();
  private clock = 0;

  private boundClient: WsListenerHost | null = null;
  private boundListener: ChatEventListener | null = null;
  private rekeyHandler: ChatRekeyHandler | null = null;

  // ── store lifecycle ───────────────────────────────────────────────────────

  /**
   * Resolve (or lazily create) the store for a conversation, refreshing its LRU stamp. CLIENT-ONLY: never call
   * during server render (see the SSR note in the file header). Creating a store is cheap (empty maps); history is
   * hydrated separately via `store.hydratePage` (SWR) or committed live via `store.applyResponse`.
   */
  public getOrCreate(conversationId: string) {
    const existing = this.stores.get(conversationId);
    if (existing) {
      this.touch(conversationId);
      return existing;
    }
    const store = new ChatStore(conversationId);
    this.stores.set(conversationId, store);
    this.touch(conversationId);
    this.evictIfNeeded();
    return store;
  }

  private touch(conversationId: string) {
    this.clock += 1;
    this.lastAccess.set(conversationId, this.clock);
  }

  // ── WS binding (the addListener wire) ──────────────────────────────────────

  /**
   * Attach the registry's single fan-out listener to the live client; returns an unbind closure for the façade's
   * `useEffect(() => registry.bindClient(client), [client])` cleanup. Idempotent under StrictMode (same client →
   * no-op re-add); on a client identity change (reconnect / user switch — the client is `useMemo`'d per `wsUrl`,
   * and `close()` clears all listeners) the prior binding is dropped first, so there is never a duplicate or
   * orphaned listener. The stores themselves are client-agnostic and survive reconnects untouched.
   */
  public bindClient(client: WsListenerHost) {
    if (this.boundClient === client && this.boundListener !== null) {
      return () => this.unbindClient(client);
    }
    if (this.boundClient !== null && this.boundListener !== null) {
      this.boundClient.removeListener(this.boundListener);
    }
    const listener: ChatEventListener = evt => this.route(evt);
    client.addListener(listener);
    this.boundClient = client;
    this.boundListener = listener;
    return () => this.unbindClient(client);
  }

  public unbindClient(client: WsListenerHost) {
    if (this.boundClient !== client || this.boundListener === null) return;
    client.removeListener(this.boundListener);
    this.boundClient = null;
    this.boundListener = null;
  }

  // ── event routing + the new-chat rekey ─────────────────────────────────────

  /**
   * The single fan-out listener. Ignores every non-transcript event (asset / tts / provider-context / ping flow
   * through the same `addListener` Set but belong to their own providers' `on` slots), then routes the three chat
   * events to the owning store, firing the rekey "commit" seam on terminal frames for a store mid-transition.
   */
  private route(evt: ChatWsEvent) {
    switch (evt.type) {
      case "ai_chat_chunk":
        this.resolveStore(evt.conversationId)?.applyChunk(evt);
        break;
      case "ai_chat_response": {
        const store = this.resolveStore(evt.conversationId);
        if (store === null) break;
        store.applyResponse(evt);
        if (evt.done) this.recoupleIfInFlight(store, evt.conversationId);
        break;
      }
      case "ai_chat_error": {
        const store = this.resolveStore(evt.conversationId);
        if (store === null) break;
        store.applyError(evt);
        this.recoupleIfInFlight(store, evt.conversationId);
        break;
      }
      default:
        // Out-of-scope on the shared bus (asset / tts / provider-context / ping) — a sibling provider's `on` owns it.
        break;
    }
  }

  /**
   * Find the store an inbound transcript event belongs to, by conversationId. An already-known conversation always
   * wins (supporting concurrent multi-conversation streams). Only when the id is otherwise unknown AND a
   * `"new-chat"` store is parked awaiting its id do we treat this as that new chat's first real id and rekey it
   * (router deception "begin"). Returns `null` otherwise (an evicted / never-opened conversation) so it's ignored.
   */
  private resolveStore(conversationId: string) {
    const existing = this.stores.get(conversationId);
    if (existing) {
      this.touch(conversationId);
      return existing;
    }
    const pending = this.stores.get("new-chat");
    if (
      pending !== undefined &&
      conversationId !== "new-chat" &&
      pending.isAwaitingRealId()
    ) {
      this.rekeyBegin(pending, conversationId);
      return pending;
    }
    return null;
  }

  /**
   * Router deception — STEP 2 (decouple), the React-free half. Migrate the SAME store instance from the
   * `"new-chat"` key to its real id (no transplant — subscribers keep their `subscribe*` refs and never miss a
   * chunk), re-point the store's own id, then shallow-`replaceState` so the URL reads `/chat/<realId>` WITHOUT
   * notifying Next's router (the deception; guarded for SSR/tests), and flag the transition. The `"decoupled"`
   * event re-points the façade's active id off `usePathname()` (which still reports the stale `new-chat`).
   */
  private rekeyBegin(store: ChatStore, conversationId: string) {
    this.stores.delete("new-chat");
    this.lastAccess.delete("new-chat");
    this.stores.set(conversationId, store);
    this.touch(conversationId);

    store.setConversationId(conversationId);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/chat/${conversationId}`);
    }
    store.setUrlTransitionInFlight(true);
    this.rekeyHandler?.({
      phase: "decoupled",
      previousId: "new-chat",
      conversationId
    });
  }

  /**
   * Router deception — STEP 3 (recouple), fired on `applyResponse(done)` / `applyError` for a store mid-transition.
   * Clears the flag and emits `"recoupled"` so the façade runs the MANDATORY `router.replace` that finally
   * reconciles Next's router to the real id. No-op for an ordinary existing-conversation completion (flag false).
   */
  private recoupleIfInFlight(store: ChatStore, conversationId: string) {
    if (!store.getStatusSnapshot().urlTransitionInFlight) return;
    store.setUrlTransitionInFlight(false);
    this.rekeyHandler?.({ phase: "recoupled", conversationId });
  }

  /** The façade registers the React-bound half of the rekey (active-id re-point + `router.replace`); `null` clears. */
  public setRekeyHandler(handler: ChatRekeyHandler | null) {
    this.rekeyHandler = handler;
  }

  // ── eviction (bounded LRU) ─────────────────────────────────────────────────

  /**
   * Drop the least-recently-accessed *evictable* stores once over cap. `store.isEvictable()` shields any store
   * with live subscribers, a non-null draft, or an in-flight phase — so an on-screen or streaming conversation is
   * never reclaimed. Committed history is re-hydratable from the API, so a quiescent, unsubscribed store is safe.
   */
  private evictIfNeeded() {
    if (this.stores.size <= ChatStoreRegistry.MAX_STORES) return;
    const evictable = Array.from(this.stores.keys())
      .filter(id => this.stores.get(id)?.isEvictable() === true)
      .sort(
        (left, right) =>
          (this.lastAccess.get(left) ?? 0) - (this.lastAccess.get(right) ?? 0)
      );
    for (const id of evictable) {
      if (this.stores.size <= ChatStoreRegistry.MAX_STORES) break;
      this.stores.delete(id);
      this.lastAccess.delete(id);
    }
  }

  // ── dev-only introspection (backs `window.__chatStoreSnapshot`) ────────────

  public debugSnapshot(conversationId: string) {
    return this.stores.get(conversationId)?.debugSnapshot() ?? null;
  }

  public debugSnapshotAll() {
    const all = Array.of<ReturnType<ChatStore["debugSnapshot"]>>();
    for (const store of this.stores.values()) all.push(store.debugSnapshot());
    return all;
  }
}

/** Module singleton — one registry per client runtime (mirrors `WebSocketManager`). Empty until a client binds. */
export const chatStoreRegistry = new ChatStoreRegistry();
