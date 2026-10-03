"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { AttachmentRegistryStore } from "@/state/attachments/store";
import type { ChatWsEvent } from "@slipstream/types";

interface AttachmentRegistryContextValue {
  readonly store: AttachmentRegistryStore;
  /** navigation-driven: fill the key if not held or stale (TTL) */
  readonly warm: (conversationKey: string) => void;
  /** the hard-load lightbox: ask by id with the believed key when the row is absent */
  readonly warmAttachment: (attachmentId: string) => void;
}

/** how long a held bucket is trusted before a navigation into it re-asks */
const WARM_TTL_MS = 5 * 60_000;
const NEW_CHAT = "new-chat";

const AttachmentRegistryContext = createContext<
  AttachmentRegistryContextValue | undefined
>(undefined);

/**
 * Holds the client mirror of the server's attachment registry for the
 * session. User-driven, like conversation hydration: nothing loads on
 * connect. NavigationSync calls `warm` on every transition start and on the
 * committed route, which sends `hydrate_attachments_by_conversation_id` for a
 * key that is not held or is past its TTL; `warmAttachment` covers a hard load
 * of /attachment/[id]. Finalize, the new-chat rekey and ai_chat_response keep
 * the mirror current between asks.
 */
export function AttachmentRegistryProvider({
  children
}: Readonly<{ children: ReactNode }>) {
  const { client, sendEvent, isConnected } = useChatWebSocketContext();
  const [store] = useState(() => new AttachmentRegistryStore());
  const warmedAt = useRef(new Map<string, number>());
  /** the last conversation key warmed — the believed key for a by-id ask */
  const lastConversationKey = useRef(NEW_CHAT);

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
        case "ai_chat_response":
          // the AI message's generated rows arrive inside convo — the server
          // registry got them at persist, the mirror gets them here; no frame
          for (const attachment of event.convo.messages[0]?.attachments ?? []) {
            store.setOne(event.convo.id, attachment);
          }
          return;
        default:
          return;
      }
    };
    client.addListener(onEvent);
    return () => client.removeListener(onEvent);
  }, [client, store]);

  const warm = useCallback(
    (conversationKey: string) => {
      const key = conversationKey === "home" ? NEW_CHAT : conversationKey;
      lastConversationKey.current = key;
      // a navigation before the socket is up is re-warmed by the committed
      // leaf once useParams settles; sendEvent would only queue it anyway
      if (!isConnected) return;
      const last = warmedAt.current.get(key);
      if (last !== undefined && Date.now() - last < WARM_TTL_MS) return;
      warmedAt.current.set(key, Date.now());
      sendEvent("hydrate_attachments_by_conversation_id", {
        type: "hydrate_attachments_by_conversation_id",
        conversationId: key
      });
    },
    [isConnected, sendEvent]
  );

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

export function useAttachmentRegistryCtx() {
  const context = useContext(AttachmentRegistryContext);
  if (!context) {
    throw new Error(
      "useAttachmentRegistryCtx must be used within AttachmentRegistryProvider"
    );
  }
  return context;
}
