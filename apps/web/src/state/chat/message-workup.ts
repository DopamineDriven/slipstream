/**
 * Chat store — pure, React-free message helpers, as the store's workup BASE CLASS. No state, no side effects:
 * just transforms over the `@slipstream/types` contracts. `ChatStore` `extends ChatMessageWorkup` (base =
 * helpers, subclass = reducers/state), mirroring the `GrokWorkupService → GrokCollectionsService` layering.
 * Helpers are `protected`; they're exercised through `ChatStore`'s public reducers under `node:test`.
 */

import type { ChatConversation } from "@/state/chat/store-types";
import type {
  AIChatResponse,
  ConversationSingleton,
  MessageSingleton
} from "@slipstream/types";

export class ChatMessageWorkup {
  /**
   * Canonical timeline ordering via the server-authoritative `ordinal` (per-conversation 0,1,2,… in `createdAt`
   * order, with a DB `@@unique([conversationId, ordinal])` guarantee — required, gapless). The store is
   * per-conversation, so ordinals are unique here: `ordinal` is the explicit, unambiguous source of truth — no
   * `Date` parsing, no ties. Th
   * e store accumulates messages across payloads that arrive in varying orders (SWR
   * pages desc, the response `convo` which is `[AI, user]` desc), so it sorts the merged set by `ordinal` to
   * produce one ascending timeline — no fragile positional bookkeeping. The client-built optimistic user message
   * gets its placeholder ordinal from the store at `beginSend` (last committed + 1), self-corrected on commit.
   */
  protected messageComparator(
    left: MessageSingleton<true>,
    right: MessageSingleton<true>
  ) {
    return left.ordinal - right.ordinal;
  }

  /**
   * Split a `ConversationSingleton<true>` (a SWR page's `convo` or `ai_chat_response.convo` — same object
   * language) into the envelope the `conversation` surface holds and the raw messages the normalized timeline
   * ingests. The envelope drops `messages` (the `committed`/`feed` surfaces own them) so the conversation
   * surface stays referentially stable across message mutations — see `ChatConversation`.
   */
  protected splitConversation(convo: ConversationSingleton<true>) {
    const { messages, ...envelope } = convo;
    return { envelope, messages } satisfies {
      envelope: ChatConversation;
      messages: MessageSingleton<true>[];
    };
  }

  /**
   * The two messages `ai_chat_response.convo` carries (server-side `apps/ws-server/src/prisma/chat-response.ts`:
   * `take: 2`, `orderBy { createdAt: "desc" }`): `messages[0]` = the AI response, `messages[1]` = the user
   * message — both fully server-persisted, with authoritative DB `createdAt` + attachments. `applyResponse`
   * ingests the whole `convo` (both land via `ingestConversation`); this surfaces them explicitly for the
   * presence check (`ai` `undefined` → a typed protocol error, never a throw) and the optimistic-id
   * reconciliation. `evt.aiMsgId` is a convenience mirror of `ai.id`.
   */
  protected extractResponseMessages(evt: AIChatResponse) {
    return {
      ai: evt.convo.messages.at(0),
      user: evt.convo.messages.at(1)
    };
  }
}
