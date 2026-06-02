/**
 * `ChatStore` — the per-conversation chat state machine. React-free (the `useSyncExternalStore` binding lives in
 * `hooks/use-chat-store-selector.ts`); `extends ChatMessageWorkup` for the pure helpers (base = helpers,
 * subclass = reducers/state), mirroring `GrokWorkupService → GrokCollectionsService`.
 *
 * Split-snapshot surfaces — each its own listener `Set` + cached snapshot, so a reducer notifies ONLY the
 * surfaces it touched:
 *   - `committed`    → the normalized, sorted timeline (`MessageSingleton<true>[]`). Rebuilt only on
 *                      hydrate / send / commit / reaction — NEVER per chunk, so it stays referentially stable
 *                      while streaming (the perf invariant).
 *   - `draft`        → the raw `AIChatChunk[]` frames (the in-flight assistant message). Changes per chunk.
 *   - `status`       → derived control flags + live identity (`ChatStatus`). Changes on flag/title/id flips.
 *   - `conversation` → the authoritative envelope (`ChatConversation`).
 *   - `error`        → the current error string.
 *
 * The composed `feed` (committed + the draft's synthetic `streaming-<id>` bubble) is assembled in the Phase-3
 * hook via `draft-to-message`, NOT here — keeping the model-agnostic chunk→message derivation a render concern.
 *
 * Attachments are never the store's concern (separate asset pipeline; joined to the message server-side via
 * `batchId`). `ChatStreamPhase` is private internal — consumers see only the derived `ChatStatus`.
 */

import type {
  ChatStatus,
  ChatStreamPhase,
  CommittedSnapshot,
  ConversationSnapshot,
  DraftSnapshot,
  ErrorSnapshot,
  StatusSnapshot
} from "@/state/chat/store-types";
import { ChatMessageWorkup } from "@/state/chat/message-workup";
import { EMPTY_MESSAGES, EMPTY_STATUS } from "@/state/chat/store-types";
import type {
  AIChatChunk,
  AIChatError,
  AIChatRequest,
  AIChatResponse,
  ConversationSingleton,
  MessageSingleton
} from "@slipstream/types";

type Listener = () => void;

export class ChatStore extends ChatMessageWorkup {
  private conversationId: string;

  private byId = new Map<string, MessageSingleton<true>>();
  private committedSnapshot: CommittedSnapshot = EMPTY_MESSAGES;
  private draftSnapshot: DraftSnapshot = null;
  private conversationSnapshot: ConversationSnapshot = null;

  private errorSnapshot: ErrorSnapshot = null;

  private statusSnapshot: StatusSnapshot;
  private title: string | null = null;
  private isStreaming = false;
  private isInterrupted = false;
  private isNewChat = false;
  private urlTransitionInFlight = false;
  private phase: ChatStreamPhase = "idle";
  private pendingOptimisticUserId: string | null = null;
  private readonly committedListeners = new Set<Listener>();
  private readonly draftListeners = new Set<Listener>();
  private readonly statusListeners = new Set<Listener>();
  private readonly conversationListeners = new Set<Listener>();
  private readonly errorListeners = new Set<Listener>();

  constructor(conversationId: string) {
    super();
    this.conversationId = conversationId;
    this.statusSnapshot = this.buildStatus();
  }

  public readonly subscribeCommitted = (listener: Listener) => {
    this.committedListeners.add(listener);
    return () => void this.committedListeners.delete(listener);
  };
  public readonly getCommittedSnapshot = () => this.committedSnapshot;
  public readonly getCommittedServerSnapshot = () => EMPTY_MESSAGES;

  public readonly subscribeDraft = (listener: Listener) => {
    this.draftListeners.add(listener);
    return () => void this.draftListeners.delete(listener);
  };
  public readonly getDraftSnapshot = () => this.draftSnapshot;
  public readonly getDraftServerSnapshot = (): DraftSnapshot => null;

  public readonly subscribeStatus = (listener: Listener) => {
    this.statusListeners.add(listener);
    return () => void this.statusListeners.delete(listener);
  };
  public readonly getStatusSnapshot = () => this.statusSnapshot;
  public readonly getStatusServerSnapshot = () => EMPTY_STATUS;

  public readonly subscribeConversation = (listener: Listener) => {
    this.conversationListeners.add(listener);
    return () => void this.conversationListeners.delete(listener);
  };
  public readonly getConversationSnapshot = () => this.conversationSnapshot;
  public readonly getConversationServerSnapshot = (): ConversationSnapshot =>
    null;

  public readonly subscribeError = (listener: Listener) => {
    this.errorListeners.add(listener);
    return () => void this.errorListeners.delete(listener);
  };
  public readonly getErrorSnapshot = () => this.errorSnapshot;
  public readonly getErrorServerSnapshot = (): ErrorSnapshot => null;

  private notify(listeners: Set<Listener>) {
    for (const listener of listeners) listener();
  }

  /** Rebuild the sorted committed list from `byId` and notify. Cheap, and only ever called off the hot path. */
  private rebuildCommitted() {
    this.committedSnapshot = Array.from(this.byId.values()).sort(
      (left, right) => this.messageComparator(left, right)
    );
    this.notify(this.committedListeners);
  }

  private buildStatus() {
    return {
      conversationId: this.conversationId,
      title: this.title,
      isStreaming: this.isStreaming,
      isInterrupted: this.isInterrupted,
      isNewChat: this.isNewChat,
      urlTransitionInFlight: this.urlTransitionInFlight
    } satisfies ChatStatus;
  }

  private statusEqual(left: ChatStatus, right: ChatStatus) {
    return (
      left.conversationId === right.conversationId &&
      left.title === right.title &&
      left.isStreaming === right.isStreaming &&
      left.isInterrupted === right.isInterrupted &&
      left.isNewChat === right.isNewChat &&
      left.urlTransitionInFlight === right.urlTransitionInFlight
    );
  }

  /** Rebuild the status snapshot; notify only if a field actually changed (so `getStatusSnapshot` stays stable). */
  private commitStatus() {
    const next = this.buildStatus();
    if (this.statusEqual(this.statusSnapshot, next)) return;
    this.statusSnapshot = next;
    this.notify(this.statusListeners);
  }

  /**
   * Ingest a whole `ConversationSingleton<true>` — used identically by `hydratePage` (SWR cold history) and
   * `applyResponse` (the live `[AI, user]` commit). Splits the envelope from the messages, stores the envelope,
   * and upserts every message by id (the server row is authoritative — it wins over any optimistic/older copy).
   * Order is owned by `messageComparator` (the server `ordinal`), so payloads may arrive in any order.
   */
  public ingestConversation(convo: ConversationSingleton<true>) {
    const { envelope, messages } = this.splitConversation(convo);

    this.conversationSnapshot = envelope;
    this.notify(this.conversationListeners);

    if (envelope.title !== this.title) {
      this.title = envelope.title;
    }
    for (const message of messages) {
      this.byId.set(message.id, message);
    }
    this.rebuildCommitted();
    this.commitStatus();
  }

  /** SWR cold-history page → ingest its `convo`. (Pagination cursor/hasMore are the loader's concern, not the store.) */
  public hydratePage(page: { readonly convo: ConversationSingleton<true> }) {
    this.ingestConversation(page.convo);
  }
  /**
   * Begin a send: drop in the optimistic user bubble and enter streaming. `isNewChat` is derived from the
   * request. The optimistic message's temp id is remembered so `applyResponse` can swap it for the authoritative
   * server user message. Attachments on `optimisticUser` are already real (asset pipeline) — carried as-is.
   */
  public beginSend(
    request: AIChatRequest,
    optimisticUser: MessageSingleton<true>
  ) {
    this.isNewChat = request.conversationId === "new-chat";
    this.phase = this.isNewChat ? "awaiting-id" : "streaming";
    this.isStreaming = true;
    this.isInterrupted = false;
    this.pendingOptimisticUserId = optimisticUser.id;

    // The optimistic message has no server ordinal yet; place it last (matches the server's next assignment;
    // `applyResponse` replaces it with the real row regardless).
    const lastOrdinal = this.committedSnapshot.at(-1)?.ordinal ?? -1;
    this.byId.set(optimisticUser.id, {
      ...optimisticUser,
      ordinal: lastOrdinal + 1
    });
    this.rebuildCommitted();

    if (this.draftSnapshot !== null) {
      this.draftSnapshot = null;
      this.notify(this.draftListeners);
    }
    if (this.errorSnapshot !== null) {
      this.errorSnapshot = null;
      this.notify(this.errorListeners);
    }
    this.commitStatus();
  }

  /**
   * Fold a chunk frame into the draft (the only per-token mutation). Touches `draft` (+ `status` when the live
   * `title` first arrives / streaming flips). `committed` is deliberately untouched — the perf invariant.
   * `imgGenEnabled` / `imgGenFields` / `imgGenAttachmentId` ride along on the frame for the Phase-3 derivation.
   */
  public applyChunk(evt: AIChatChunk) {
    this.draftSnapshot =
      this.draftSnapshot !== null ? [...this.draftSnapshot, evt] : [evt];
    this.notify(this.draftListeners);

    if (this.phase === "awaiting-id") this.phase = "streaming";
    if (!this.isStreaming) this.isStreaming = true;
    if (typeof evt.title === "string") this.title = evt.title;
    this.commitStatus();
  }

  /**
   * Commit the authoritative result. `evt.convo` carries `[AI, user]` (both server-persisted); `ingestConversation`
   * commits BOTH — the AI message AND the real user message — by id in one pass. The draft is dropped; the
   * committed AI message renders the final content. We only drop the optimistic temp when the server's real user
   * row is present to replace it, so a degenerate payload can never orphan the user message. The store never
   * fabricates an error — `applyError` fires only from a real server `ai_chat_error`. `evt.aiMsgId` is a
   * convenience mirror of `convo.messages[0].id`.
   */
  public applyResponse(evt: AIChatResponse) {
    const { user } = this.extractResponseMessages(evt);
    if (user && this.pendingOptimisticUserId !== null) {
      this.byId.delete(this.pendingOptimisticUserId);
      this.pendingOptimisticUserId = null;
    }

    this.ingestConversation(evt.convo);

    if (this.draftSnapshot !== null) {
      this.draftSnapshot = null;
      this.notify(this.draftListeners);
    }
    this.phase = evt.done ? "complete" : "streaming";
    this.isStreaming = !evt.done;
    this.isInterrupted = false;
    if (typeof evt.title === "string") this.title = evt.title;
    this.commitStatus();
  }

  /** Stop the stream on a server error — preserve committed history + the optimistic user message. */
  public applyError(evt: AIChatError) {
    if (this.draftSnapshot !== null) {
      this.draftSnapshot = null;
      this.notify(this.draftListeners);
    }
    this.phase = "error";
    this.isStreaming = false;
    this.isInterrupted = false;
    this.errorSnapshot = evt.message;
    this.notify(this.errorListeners);
    this.commitStatus();
  }

  /**
   * Mark an in-flight stream interrupted (socket dropped mid-stream). Keep the partial draft visible so the UI
   * can offer Retry; stop "streaming". The actual resume (re-send `ai_chat_request`) is the send path's job.
   */
  public markInterrupted() {
    if (!this.isStreaming && !this.draftSnapshot) return;
    this.phase = "interrupted";
    this.isStreaming = false;
    this.isInterrupted = true;
    this.commitStatus();
  }

  /** Re-commit a message by id from the `rxnAction` server-action result (reactions live on the committed row). */
  public patchMessageReaction(message: MessageSingleton<true>) {
    if (!this.byId.has(message.id)) return;
    this.byId.set(message.id, message);
    this.rebuildCommitted();
  }

  public clearError() {
    if (this.errorSnapshot === null) return;
    this.errorSnapshot = null;
    this.notify(this.errorListeners);
    if (this.phase === "error") {
      this.phase = "idle";
      this.commitStatus();
    }
  }

  /** Reset transient stream state (draft + flags); committed history is preserved. */
  public resetStreamingState() {
    if (this.draftSnapshot !== null) {
      this.draftSnapshot = null;
      this.notify(this.draftListeners);
    }
    this.phase = "idle";
    this.isStreaming = false;
    this.isInterrupted = false;
    this.commitStatus();
  }

  // ── registry-facing orchestration (the registry owns rekey + the router) ──

  /** Re-point the store to the real conversation id (new-chat → realId rekey). */
  public setConversationId(conversationId: string) {
    if (this.conversationId === conversationId) return;
    this.conversationId = conversationId;
    this.commitStatus();
  }

  /** The registry sets this true on the shallow `replaceState` (mid-stream) and false at completion. */
  public setUrlTransitionInFlight(value: boolean) {
    if (this.urlTransitionInFlight === value) return;
    this.urlTransitionInFlight = value;
    this.commitStatus();
  }

  public isAwaitingRealId() {
    return this.phase === "awaiting-id" && this.isNewChat;
  }

  /**
   * Whether the registry's LRU may reclaim this store under memory pressure. False if anything would notice the
   * loss: a live React subscriber on any surface, a non-null draft (mid-stream content the UI is showing), or an
   * in-flight phase (`streaming` / `awaiting-id` / `interrupted`). Committed history alone is re-hydratable from
   * the API, so a quiescent, unsubscribed store is safe to drop — see `ChatStoreRegistry.evictIfNeeded`.
   */
  public isEvictable() {
    const hasSubscribers =
      this.committedListeners.size > 0 ||
      this.draftListeners.size > 0 ||
      this.statusListeners.size > 0 ||
      this.conversationListeners.size > 0 ||
      this.errorListeners.size > 0;
    if (hasSubscribers) return false;
    if (this.draftSnapshot !== null) return false;
    return (
      this.phase !== "streaming" &&
      this.phase !== "awaiting-id" &&
      this.phase !== "interrupted"
    );
  }

  // ── dev-only introspection (for `window.__chatStoreSnapshot`) ─────────────

  public debugSnapshot() {
    return {
      conversationId: this.conversationId,
      phase: this.phase,
      status: this.statusSnapshot,
      committed: this.committedSnapshot,
      draft: this.draftSnapshot,
      conversation: this.conversationSnapshot,
      error: this.errorSnapshot
    } as const;
  }
}
