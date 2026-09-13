import type { ConversationSingleton } from "@/types.ts";

export type HydrateConversation = {
  type: "hydrate_conversation";
  conversationId: string;
  lowestLoadedOrdinal: number;
  /** clamped server-side; defaults to CONVERSATION_PAGE_SIZE */
  take?: number;
};

export type HydrateConversationPage = {
  /**
   * Exclusive upper bound / SWR page key cursor.
   * This page was fetched with: ordinal < cursor.
   */
  cursor: number;
  /**
   * First ordinal in lookup order.
   * Because messages are ordinal-desc, this is the newest/highest ordinal in the page.
   */
  firstOrdinal: number;
  /**
   * Last ordinal in lookup order.
   * Because messages are ordinal-desc, this is the oldest/lowest ordinal in the page.
   * The next older page uses cursor = lastOrdinal.
   */
  lastOrdinal: number;
  convo: ConversationSingleton<true>;
  hasMore: boolean;
};

export type HydrateConversationAck = {
  type: "hydrate_conversation_ack";
  userId: string;
  pages: HydrateConversationPage[];
  conversationId: string;
};
