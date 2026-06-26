import type { ConversationSingleton } from "@slipstream/types";

export const CONVERSATION_PAGE_SIZE = 12;

export interface ConversationMessagesPage {
  readonly convo: ConversationSingleton<true>;
  readonly nextCursor: number | null;
  readonly hasMore: boolean;
}

export type ConversationInitialPageKey = readonly [
  "initial",
  userId: string,
  conversationId: string
];

export type ConversationCursorPageKey = readonly [
  "cursor",
  userId: string,
  conversationId: string,
  cursorOrdinal: number
];

export type ConversationPageKey =
  | ConversationInitialPageKey
  | ConversationCursorPageKey;

export function conversationInitialPageKey(
  userId: string,
  conversationId: string
) {
  return ["initial", userId, conversationId] as const;
}

export function conversationCursorPageKey(
  userId: string,
  conversationId: string,
  cursorOrdinal: number
) {
  return ["cursor", userId, conversationId, cursorOrdinal] as const;
}
