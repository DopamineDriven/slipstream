/**
 * Chat store — type contracts.
 *
 * Guiding principle: the store is REFLEXIVE to the wire protocol. It does NOT invent reshaped, one-off domain
 * types for the data it receives — it strictly honors the `@slipstream/types` contracts and accumulates in
 * place:
 *
 *   - persisted data           → the singletons (`ConversationSingleton<true>` / `MessageSingleton<true>` …),
 *                                imported and used directly, never redefined.
 *   - the live assistant draft → the `ai_chat_chunk` payload itself (`ChatDraft`), accumulated field-for-field.
 *   - reducer / command inputs → the real `events.ts` wire types (`AIChatChunk` / `AIChatResponse` /
 *                                `AIChatError` / `AIChatRequest`) and the singletons, consumed verbatim in
 *                                `store.ts` — no bespoke param bags.
 *
 * The only genuinely hand-written types are the ones with NO event/singleton analog — derived stream-machine
 * control state (`ChatStreamPhase`, `ChatStatus`) — plus the singleton with two fields' optionality flipped via
 * `RTC` (`ChatConversation`). Everything else is the contract, honored.
 *
 * `T` is always `true` in the Next.js realm: the API layer (`bigintToInt` / `bigIntToIntMsg`) and the ws-server
 * both serialize every `bigint` → `number` before data reaches the client, so the store never sees a `<false>`
 * (bigint) shape — hence no `<T>` generic here, everything instantiates at `<true>`.
 */

import type {
  AIChatChunk,
  ConversationSingleton,
  DX,
  MessageSingleton,
  RTC
} from "@slipstream/types";

/**
 * INTERNAL ONLY — the store's derived stream lifecycle. This must NEVER appear on a public surface or leave the
 * store/registry (consumers see the derived `ChatStatus` flags instead). `"awaiting-id"` is the transient
 * window between `ai_chat_request` and the first `ai_chat_chunk`; because the first chunk always carries the
 * real `conversationId` + `title`, the new-chat→real-id rekey fires deterministically there.
 */
export type ChatStreamPhase =
  | "idle"
  | "awaiting-id"
  | "streaming"
  | "interrupted"
  | "complete"
  | "error";

/**
 * The in-flight assistant message: simply the sequence of `ai_chat_chunk` payloads received so far — pure,
 * reflexive, zero reshaping (an `AIChatChunk` stays an `AIChatChunk`). The draft is throwaway: on
 * `ai_chat_response` it is dropped and `convo.messages[0]` (the authoritative persisted message) is committed
 * wholesale.
 *
 * The live bubble is DERIVED from these frames at the render boundary (`draft-to-message.ts`), never stored:
 *   - `text`   → concat the per-chunk `chunk` deltas (and any TEXT-block content)
 *   - `blocks` → fold each chunk's SINGLE `messageBlocks` into an ordinal-keyed merge (last-wins, sorted) — the
 *                block array materializes only here, from single blocks; the chunk type is never widened to one
 *   - thinking / scalars (`provider`/`model`/`imgGenFields`/ids) → latest-wins from the chunks (`imgGenFields`
 *                folded to preserve partial images)
 *
 * `ordinal` is the server's source of truth for block order. Deriving from the raw array is O(n) per render
 * (memoizable in the store / adapter if a very long stream ever janks).
 */
export type ChatDraft = readonly AIChatChunk[];

/**
 * Derived, public stream/session status — the only stream-machine state consumers ever read. NOT a reshaping of
 * received event data: `isStreaming` / `isInterrupted` / `urlTransitionInFlight` / `isNewChat` are computed
 * control flags with no event analog. Carries the honored conversation identity — the active `conversationId`
 * *key* (which can be `"new-chat"` before a real id exists) and the live `title` (`string | null`, mirroring the
 * nullable `Conversation.title` column; from `evt.title` mid-stream, then `convo.title` on commit). Does NOT
 * expose `ChatStreamPhase`. Re-renders only on flag/identity/title flips, never per token.
 */
export interface ChatStatus {
  readonly conversationId: string;
  readonly title: string | null;
  readonly isStreaming: boolean;
  readonly isInterrupted: boolean;
  readonly isNewChat: boolean;
  readonly urlTransitionInFlight: boolean;
}

/**
 * Authoritative conversation envelope, honored from the singleton: `ConversationSingleton<true>` with `messages`
 * and `conversationSettings` surgically flipped required → optional via `RTC` (the other relations —
 * `user` / `attachments` / `conversationContextState` — are already optional), so a raw `convo` stays
 * assignable here without stripping fields.
 *
 * Store discipline (not a type wall): the store never populates `messages` on the envelope — the normalized
 * `committed` / `feed` surfaces own the timeline — so `splitConversation` destructures `messages` out and this
 * surface stays referentially stable across message mutations. Populated by `ingestConversation` (SWR page or
 * `ai_chat_response.convo`); `undefined` until the first ingest (e.g. a brand-new chat before its first response).
 */
export type ChatConversation = DX<
  RTC<ConversationSingleton<true>, "messages" | "conversationSettings">
>;

/** Per-surface snapshot shapes (referentially stable when their slice is unchanged). */
export type CommittedSnapshot = readonly MessageSingleton<true>[];
export type FeedSnapshot = readonly MessageSingleton<true>[];
export type DraftSnapshot = ChatDraft | undefined;
export type StatusSnapshot = ChatStatus;
export type ConversationSnapshot = ChatConversation | undefined;
export type ErrorSnapshot = string | undefined;

/**
 * SWR cold-history page. `convo` is the SAME `ConversationSingleton<true>` the API and `ai_chat_response.convo`
 * return — one object language for both ingestion paths.
 */
export interface ConversationMessagesPage {
  readonly convo: ConversationSingleton<true>;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * Store command surface (signatures live on the `ChatStore` class in `store.ts`) — all reflexive, no param bags:
 *   - `beginSend(request: AIChatRequest, optimisticUser: MessageSingleton<true>)` — the send event + the
 *     optimistic user bubble; `isNewChat` (`conversationId === "new-chat"`) is derived inside the store.
 *   - `applyChunk(AIChatChunk)` / `applyResponse(AIChatResponse)` / `applyError(AIChatError)` — verbatim events.
 *   - `hydratePage(ConversationMessagesPage)` / `prependHistory(ConversationMessagesPage)` — the singleton page.
 *   - `patchMessageReaction(message: MessageSingleton<true>)` — re-commit the `rxnAction` server-action result.
 *   - `markInterrupted(conversationId: string, reason?: string)` — inline control args.
 *
 * Attachments are NOT the store's concern: the asset pipeline uploads + reconciles them on demand (pre-send),
 * and the ws-server formally joins them to the message during `ai_chat_request` via the request's `batchId`, so
 * `convo.messages[1]` already arrives with real attachments. The store just carries them and commits.
 */

/** Frozen empties for `getServerSnapshot` — stable identities (React throws on fresh ones). */
export const EMPTY_MESSAGES = Object.freeze(Array.of<MessageSingleton<true>>());

export const EMPTY_STATUS = Object.freeze({
  conversationId: "new-chat",
  title: null,
  isStreaming: false,
  isInterrupted: false,
  isNewChat: false,
  urlTransitionInFlight: false
}) satisfies ChatStatus;
