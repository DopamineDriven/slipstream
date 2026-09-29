"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { AttachmentRegistryStore } from "@/state/attachments/store";
import type { ChatWsEvent } from "@slipstream/types";

interface AttachmentRegistryContextValue {
  readonly store: AttachmentRegistryStore;
}

const AttachmentRegistryContext = createContext<
  AttachmentRegistryContextValue | undefined
>(undefined);

/**
 * Holds the client mirror of the server's attachment registry for the
 * session. No ask on connect: the server pushes every bucket after each
 * connection_established. If the mirror is ever dropped mid-session, the
 * scoped fallback is `hydrate_attachments_by_conversation_id` for the
 * conversation on screen, `hydrate_attachments` for everything — both are
 * answered from the server's reservoir.
 */
export function AttachmentRegistryProvider({
  children
}: Readonly<{ children: ReactNode }>) {
  const { client } = useChatWebSocketContext();
  const [store] = useState(() => new AttachmentRegistryStore());

  useEffect(() => {
    const onEvent = (event: ChatWsEvent) => {
      switch (event.type) {
        case "hydrate_attachments_ack":
        case "hydrate_attachments_by_conversation_id_ack":
          store.setBucket(event.conversationId, event.attachments);
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

  const value = useMemo(() => ({ store }), [store]);
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
