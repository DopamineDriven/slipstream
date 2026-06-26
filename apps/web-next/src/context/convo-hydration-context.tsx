"use client";

import type { ConversationMessagesPage } from "@/lib/conversation-pages";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef
} from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import {
  CONVERSATION_PAGE_SIZE,
  conversationCursorPageKey
} from "@/lib/conversation-pages";
import { useSWRConfig } from "swr";
import type { ChatWsEvent } from "@slipstream/types";

interface RequestConversationHydrationParams {
  readonly conversationId: string;
  readonly lowestLoadedOrdinal: number;
  readonly take?: number;
}

interface ConversationHydrationContextValue {
  readonly requestConversationHydration: (
    params: RequestConversationHydrationParams
  ) => void;
}

const ConversationHydrationContext = createContext<
  ConversationHydrationContextValue | undefined
>(undefined);

function conversationHydrationRegistryKey(
  userId: string,
  conversationId: string
) {
  return JSON.stringify([userId, conversationId]);
}

function conversationCursorRegistryKey(
  userId: string,
  conversationId: string,
  cursorOrdinal: number
) {
  return JSON.stringify(
    conversationCursorPageKey(userId, conversationId, cursorOrdinal)
  );
}

export function ConversationHydrationProvider({
  children,
  userId
}: Readonly<{
  children: ReactNode;
  userId: string;
}>) {
  const { client, sendEvent } = useChatWebSocketContext();
  const { mutate } = useSWRConfig();
  const warmedCursorKeysRef = useRef(new Set<string>());
  const requestedCursorKeysRef = useRef(new Set<string>());
  const inFlightConversationKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const handleHydrationAck = (event: ChatWsEvent) => {
      if (event.type !== "hydrate_conversation_ack") return;

      const hydrationKey = conversationHydrationRegistryKey(
        event.userId,
        event.conversationId
      );
      inFlightConversationKeysRef.current.delete(hydrationKey);
      if (event.userId !== userId) return;

      for (const page of event.pages) {
        const pageKey = conversationCursorPageKey(
          event.userId,
          event.conversationId,
          page.cursor
        );
        const registryKey = conversationCursorRegistryKey(
          event.userId,
          event.conversationId,
          page.cursor
        );
        const cachedPage = {
          convo: page.convo,
          nextCursor: page.hasMore ? page.lastOrdinal : null,
          hasMore: page.hasMore
        } satisfies ConversationMessagesPage;

        warmedCursorKeysRef.current.add(registryKey);
        void mutate<ConversationMessagesPage>(pageKey, cachedPage, {
          populateCache: true,
          revalidate: false
        });
      }
    };

    client.addListener(handleHydrationAck);
    return () => client.removeListener(handleHydrationAck);
  }, [client, mutate, userId]);

  const requestConversationHydration = useCallback(
    ({
      conversationId,
      lowestLoadedOrdinal,
      take = CONVERSATION_PAGE_SIZE
    }: RequestConversationHydrationParams) => {
      if (!Number.isInteger(lowestLoadedOrdinal) || lowestLoadedOrdinal <= 0) {
        return;
      }

      const cursorKey = conversationCursorRegistryKey(
        userId,
        conversationId,
        lowestLoadedOrdinal
      );
      if (
        warmedCursorKeysRef.current.has(cursorKey) ||
        requestedCursorKeysRef.current.has(cursorKey)
      ) {
        return;
      }

      const hydrationKey = conversationHydrationRegistryKey(
        userId,
        conversationId
      );
      if (inFlightConversationKeysRef.current.has(hydrationKey)) return;

      requestedCursorKeysRef.current.add(cursorKey);
      inFlightConversationKeysRef.current.add(hydrationKey);
      sendEvent("hydrate_conversation", {
        type: "hydrate_conversation",
        conversationId,
        lowestLoadedOrdinal,
        take
      });
    },
    [sendEvent, userId]
  );

  const contextValue = useMemo(
    () => ({ requestConversationHydration }),
    [requestConversationHydration]
  );

  return (
    <ConversationHydrationContext.Provider value={contextValue}>
      {children}
    </ConversationHydrationContext.Provider>
  );
}

export function useConversationHydration() {
  const context = useContext(ConversationHydrationContext);
  if (!context) {
    throw new Error(
      "useConversationHydration must be used within ConversationHydrationProvider"
    );
  }
  return context;
}
