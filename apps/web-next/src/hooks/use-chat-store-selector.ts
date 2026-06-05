"use client";

/**
 * The only React module that touches the chat store. One hook per store surface, each a thin wrapper over
 * React-core `useSyncExternalStore` (no render-phase memo, no selector shim) — the store already publishes
 * referentially-stable, per-concern snapshots, so a subscriber re-renders ONLY when its own slice changes:
 *   - `useChatCommitted` → the sorted timeline (stable across chunks — the perf invariant).
 *   - `useChatDraft`     → the in-flight `AIChatChunk[]` (changes per token; isolated to the draft bubble).
 *   - `useChatStatus`    → derived control flags + live identity (flag/title/id flips only).
 *   - `useChatConversation` / `useChatError` → the envelope / current error string.
 *
 * The store's `subscribe*` / `get*Snapshot` / `get*ServerSnapshot` are stable instance arrow props, so they're
 * passed straight through. `getServerSnapshot` returns frozen empties (SSR-safe; React throws on fresh identities).
 */

import { useSyncExternalStore } from "react";
import type { ChatStore } from "@/state/chat/store";

export function useChatCommitted(store: ChatStore) {
  return useSyncExternalStore(
    store.subscribeCommitted,
    store.getCommittedSnapshot,
    store.getCommittedServerSnapshot
  );
}

export function useChatDraft(store: ChatStore) {
  return useSyncExternalStore(
    store.subscribeDraft,
    store.getDraftSnapshot,
    store.getDraftServerSnapshot
  );
}

export function useChatStatus(store: ChatStore) {
  return useSyncExternalStore(
    store.subscribeStatus,
    store.getStatusSnapshot,
    store.getStatusServerSnapshot
  );
}

export function useChatConversation(store: ChatStore) {
  return useSyncExternalStore(
    store.subscribeConversation,
    store.getConversationSnapshot,
    store.getConversationServerSnapshot
  );
}

export function useChatError(store: ChatStore) {
  return useSyncExternalStore(
    store.subscribeError,
    store.getErrorSnapshot,
    store.getErrorServerSnapshot
  );
}
