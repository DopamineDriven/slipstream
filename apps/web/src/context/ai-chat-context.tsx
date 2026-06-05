"use client";

/**
 * `AIChatProvider` — the thin, store-fed façade. It owns NO chat state: the per-conversation `ChatStore`
 * (resolved from `chatStoreRegistry`) is the single source of truth, fed React-free by the registry's WS
 * listener. The façade's whole job is the React seam:
 *   - resolve the active store CLIENT-ONLY (the registry's module-global Map must never be mutated server-side),
 *   - bind the registry's fan-out listener to the live client (`bindClient`),
 *   - own the React-bound half of the new-chat → real-id router deception (`setRekeyHandler`: re-point the active
 *     id on `decoupled`, the MANDATORY `router.replace` on `recoupled`),
 *   - derive the live draft ONCE and assemble the legacy `AIChatContextValue` so existing consumers
 *     (`dynamic`, `sidebar`) keep their `useAIChatContext()` ergonomics unchanged.
 *
 * Everything the old conductor did with ~20 `useState` + ~14 ref mirrors + a ~300-line WS handler now lives in
 * `ChatStore`. `currentStreamingMessage` is now the real synthetic `streaming-<id>` `MessageSingleton<true>`
 * (single-derived here, consumed by `dynamic`); the active `store` is exposed so `dynamic` reads the committed
 * timeline via `useChatCommitted(store)`.
 */

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { useModelSelection } from "@/context/model-selection-context";
import {
  useChatDraft,
  useChatError,
  useChatStatus
} from "@/hooks/use-chat-store-selector";
import type { SendChatPayload } from "@/hooks/use-send-chat";
import { useSendChat } from "@/hooks/use-send-chat";
import {
  deriveDraft,
  streamingMessageFromDerived
} from "@/lib/draft-to-message";
import { pathParser } from "@/lib/path-parser";
import { ChatStore } from "@/state/chat/store";
import { chatStoreRegistry } from "@/state/chat/store-registry";
import type {
  AIChatResponseImgGenFieldsFinal,
  ChatChunkAndResMsgBlock,
  MessageSingleton
} from "@slipstream/types";

interface AIChatContextValue {
  // Core state — sourced from the active store's surfaces (no local mirrors).
  activeConversationId: string | null;
  title: string | null;
  streamedText: string;
  isStreaming: boolean;
  isComplete: boolean;
  isNewChat: boolean;
  error: string | null;

  // Thinking state (derived from the live draft).
  thinkingText: string;
  isThinking: boolean;
  thinkingDuration: number | null;

  // Live message tracking. `currentStreamingMessage` is the synthetic `streaming-<id>` bubble the feed renders.
  currentStreamingMessage: MessageSingleton<true> | null;
  streamingMessageBlocks: readonly ChatChunkAndResMsgBlock[];
  currentUserMsgId: string | null;
  currentAiMsgId: string | null;
  currentImgGenAttachmentId: string | null;

  // Actions.
  sendChat: (payload: SendChatPayload) => void;
  setActiveConversationId: (id: string | null) => void;
  clearError: () => void;
  resetStreamingState: () => void;

  // Status flags.
  isWaitingForRealId: boolean;
  isConnected: boolean;

  // Live image generation (progressive) state.
  imgGenEnabled: boolean;
  imgGenFields: AIChatResponseImgGenFieldsFinal | undefined;

  /** The active per-conversation store — `dynamic` reads the committed timeline via `useChatCommitted(store)`. */
  store: ChatStore;
}

const AIChatContext = createContext<AIChatContextValue | undefined>(undefined);

/**
 * SSR placeholder. The façade is a client component, so its body still runs during server pre-render; resolving
 * from the registry there would mutate its module-global, cross-request `Map`. This single empty store satisfies
 * the surface hooks server-side (every `getServerSnapshot` returns frozen empties regardless of instance) and is
 * never bound or mutated, so sharing it across requests is safe. The real store resolves client-only.
 */
const ssrPlaceholderStore = new ChatStore("new-chat");

const EMPTY_BLOCKS = Object.freeze(Array.of<ChatChunkAndResMsgBlock>());

export function AIChatProvider({
  children,
  userId
}: {
  children: ReactNode;
  userId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { client, isConnected } = useChatWebSocketContext();
  const { selectedModel } = useModelSelection();

  // Active conversation id — seeded from the path, then driven by the rekey `decoupled` seam (new-chat → realId,
  // where the path LAGS the deceived URL) and the passive path-sync effect (ordinary navigation).
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => pathParser(pathname).conversationId ?? null);

  const resolvedId = activeConversationId ?? "new-chat";

  // Client-only store resolution (see `ssrPlaceholderStore`). The lazy initializer runs once; the effect
  // re-resolves when the active id changes — a no-op when the registry hands back the same (incl. migrated)
  // instance, so subscribers never miss a chunk across the new-chat rekey.
  const [store, setStore] = useState<ChatStore>(() =>
    typeof window === "undefined" ?
      ssrPlaceholderStore
    : chatStoreRegistry.getOrCreate(resolvedId)
  );
  useEffect(() => {
    const next = chatStoreRegistry.getOrCreate(resolvedId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStore(prev => (prev === next ? prev : next));
  }, [resolvedId]);

  // Bind the registry's single fan-out listener to the live client; `bindClient` returns the unbind cleanup.
  // Rebinds on client identity change (reconnect / user switch); idempotent under StrictMode.
  useEffect(() => chatStoreRegistry.bindClient(client), [client]);

  // The React-bound half of the router deception: re-point the active id on the shallow rekey (`decoupled`), and
  // run the MANDATORY router reconcile at completion (`recoupled`). See memory `project_newchat_router_deception`.
  useEffect(() => {
    chatStoreRegistry.setRekeyHandler(event => {
      if (event.phase === "decoupled") {
        setActiveConversationId(event.conversationId);
      } else {
        router.replace(`/chat/${event.conversationId}`, { scroll: false });
      }
    });
    return () => chatStoreRegistry.setRekeyHandler(null);
  }, [router]);

  const status = useChatStatus(store);
  const draft = useChatDraft(store);
  const error = useChatError(store) ?? null;

  // Passive path-sync: adopt the URL's conversation id when idle — never while streaming or mid-deception (there
  // the URL leads React, so reading the path would fight the rekey). Mirrors the legacy effect's bail condition.
  useEffect(() => {
    if (status.isStreaming || status.urlTransitionInFlight) return;
    const pathId = pathParser(pathname).conversationId ?? null;
    if (pathId && pathId !== activeConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveConversationId(pathId);
    }
  }, [
    pathname,
    activeConversationId,
    status.isStreaming,
    status.urlTransitionInFlight
  ]);

  // Reflect the live title into the document (set mid-stream from `evt.title`, then `convo.title` on commit).
  useEffect(() => {
    if (!status.title) return;
    if (typeof window !== "undefined") window.document.title = status.title;
  }, [status.title]);

  // ONE draft fold per token — drives BOTH the legacy scalar fields and the synthetic streaming bubble.
  const derived = useMemo(
    () => (draft && draft.length > 0 ? deriveDraft(draft) : null),
    [draft]
  );

  const renderContext = useMemo(
    () => ({
      conversationId: resolvedId,
      provider: selectedModel.provider,
      model: selectedModel.modelId,
      userId: userId ?? ""
    }),
    [resolvedId, selectedModel.provider, selectedModel.modelId, userId]
  );

  const currentStreamingMessage = useMemo(
    () =>
      derived ? streamingMessageFromDerived(derived, renderContext) : null,
    [derived, renderContext]
  );

  const sendChat = useSendChat(store, userId);
  const clearError = useCallback(() => store.clearError(), [store]);
  const resetStreamingState = useCallback(
    () => store.resetStreamingState(),
    [store]
  );

  return (
    <AIChatContext.Provider
      value={{
        activeConversationId,
        title: status.title,
        streamedText: derived?.text ?? "",
        isStreaming: status.isStreaming,
        isComplete: !status.isStreaming,
        isNewChat: status.urlTransitionInFlight,
        error,
        thinkingText: derived?.thinkingText ?? "",
        isThinking: derived?.isThinking ?? false,
        thinkingDuration: derived?.thinkingDuration ?? null,
        currentStreamingMessage,
        streamingMessageBlocks: derived?.blocks ?? EMPTY_BLOCKS,
        currentUserMsgId: derived?.userMsgId ?? null,
        currentAiMsgId: derived?.aiMsgId ?? null,
        currentImgGenAttachmentId: derived?.imgGenAttachmentId ?? null,
        sendChat,
        setActiveConversationId,
        clearError,
        resetStreamingState,
        isWaitingForRealId: store.isAwaitingRealId(),
        isConnected,
        imgGenEnabled: derived?.imgGenEnabled ?? false,
        imgGenFields: derived?.imgGenFields,
        store
      }}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChatContext() {
  const context = useContext(AIChatContext);
  if (!context) {
    throw new Error("useAIChatContext must be used within AIChatProvider");
  }
  return context;
}
