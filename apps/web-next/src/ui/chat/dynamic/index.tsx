"use client";

import type { AttachmentPreview } from "@/hooks/use-asset-metadata";
import type { ChatInterfaceProps } from "@/types/ui";
import type { Properties } from "csstype";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useRouter } from "next/navigation";
import { useAIChatContext } from "@/context/ai-chat-context";
import { ChatScrollProvider } from "@/context/chat-scroll-context";
import { useCookiesCtx } from "@/context/cookie-context";
import { useModelSelection } from "@/context/model-selection-context";
import { usePathnameContext } from "@/context/pathname-context";
import { useChatCommitted } from "@/hooks/use-chat-store-selector";
import { useHydrateChatStore } from "@/hooks/use-hydrate-chat-store";
import { cn } from "@/lib/utils";
import { ChatAreaSkeleton } from "@/ui/chat/chat-area-skeleton";
import { ChatFeed } from "@/ui/chat/chat-feed";
import { ChatHero } from "@/ui/chat/chat-hero";
import { ChatInput } from "@/ui/chat/chat-input";
import { FloatingScrollButton } from "@/ui/chat/floating-bob";

/** Attachment previews persisted across the home → `/chat/new-chat` navigation (sessionStorage handoff). */
interface PersistedAttachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  draftId?: string | null;
  cdnUrl?: string | null;
  publicUrl?: string | null;
}

export function ChatInterface({
  conversationId, // From the route params — used to scope SWR hydration; live state comes from the store/context.
  user
}: ChatInterfaceProps) {
  const {
    store,
    activeConversationId,
    streamedText,
    isStreaming,
    isNewChat,
    isWaitingForRealId,
    isConnected,
    isThinking,
    thinkingText,
    thinkingDuration,
    imgGenEnabled,
    imgGenFields,
    currentImgGenAttachmentId,
    currentAiMsgId,
    currentStreamingMessage,
    sendChat
  } = useAIChatContext();

  const router = useRouter();
  const { selectedModel } = useModelSelection();
  const { isHome } = usePathnameContext();
  const { get } = useCookiesCtx();
  const tz = get("client-tz");

  // The committed timeline (referentially stable across tokens — the perf invariant).
  const committed = useChatCommitted(store);

  // Hydrate cold history client-side via SWR (replaces the old server-route `initialMessages` seed). Home / new-chat
  // carry no server history, so skip the fetch. The store stays the single read model; the bridge writes into it.
  const historyConversationId =
    conversationId === "new-chat" || conversationId === "home" ?
      undefined
    : conversationId;
  const {
    error: historyError,
    loadMore,
    hasMore,
    isLoadingMore
  } = useHydrateChatStore(store, {
    userId: user.id,
    conversationId: historyConversationId
  });
  // Hold the skeleton until the store actually has rows — covers BOTH the SWR fetch and the hydration tick (no flash).
  const showSkeleton =
    historyConversationId !== undefined &&
    committed.length === 0 &&
    !historyError;

  // Feed = committed timeline + the live streaming bubble (or just committed when idle). The 599 committed bubbles
  // keep their object identity across tokens, so `React.memo(MessageBubble)` skips re-rendering them per token.
  const feed = useMemo(
    () =>
      currentStreamingMessage
        ? [...committed, currentStreamingMessage]
        : committed,
    [committed, currentStreamingMessage]
  );

  // No streaming bubble yet → first chunk hasn't landed → show the typing indicator.
  const isAwaitingFirstChunk = isStreaming && currentStreamingMessage === null;

  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);
  const processedRef = useRef(false);

  const _handlePromptClick = useCallback(
    (prompt: string) => {
      if (isHome) {
        try {
          sessionStorage.setItem("chat.initialPrompt", prompt.trim());
        } catch (err) {
          console.log(err);
        } finally {
          router.push("/chat/new-chat", { scroll: false });
        }
      }
      setQueuedPrompt(prompt.trim());
    },
    [router, isHome]
  );
  const handlePromptConsumed = useCallback(() => setQueuedPrompt(null), []);

  // Restore any attachments/batch persisted across the home → new-chat navigation, for the first send.
  const [initialPersistedAttachments, setInitialPersistedAttachments] =
    useState<PersistedAttachment[] | null>(null);
  const initialBatchIdRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("chat.initialAttachments");
      const bid = sessionStorage.getItem("chat.initialAttachmentsBatchId");
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setInitialPersistedAttachments(JSON.parse<PersistedAttachment[]>(raw));
      }
      if (bid) initialBatchIdRef.current = bid;
    } catch (err) {
      console.log(err);
    }
  }, []);

  // First send for a brand-new chat (queued via a hero prompt-click): replay the prompt (+ restored attachments)
  // through the store send path. The optimistic user bubble + streaming are owned by `sendChat` → `store.beginSend`,
  // so there is no local message state to splice.
  useEffect(() => {
    if (
      activeConversationId !== "new-chat" ||
      !queuedPrompt ||
      processedRef.current ||
      isWaitingForRealId
    ) {
      return;
    }
    processedRef.current = true;

    const restoredAttachments = (initialPersistedAttachments ?? []).map(
      (a): AttachmentPreview => ({
        id: a.id,
        file: new File([new Blob()], a.filename || "file"),
        filename: a.filename,
        mime: a.mime,
        size: a.size,
        status: "uploaded",
        width: a.width,
        height: a.height
      })
    );

    sendChat({
      content: queuedPrompt,
      attachments: restoredAttachments,
      batchId: initialBatchIdRef.current ?? undefined,
      imgGenEnabled
    });

    try {
      sessionStorage.removeItem("chat.initialAttachments");
      sessionStorage.removeItem("chat.initialAttachmentsBatchId");
    } catch (err) {
      console.log(err);
    }
  }, [
    activeConversationId,
    queuedPrompt,
    isWaitingForRealId,
    initialPersistedAttachments,
    imgGenEnabled,
    sendChat
  ]);

  // Re-arm the first-send guard when leaving new-chat.
  useEffect(() => {
    if (activeConversationId !== "new-chat") {
      processedRef.current = false;
    }
  }, [activeConversationId]);

  return (
    <ChatScrollProvider>
      <div
        className={cn(
          "flex h-full flex-col",
          isHome ? "mx-auto items-center justify-center p-4" : "overflow-y-auto"
        )}>
        {showSkeleton ?
          <ChatAreaSkeleton />
        : <ChatFeed
            messages={feed}
            streamedText={isStreaming ? streamedText : ""}
            isAwaitingFirstChunk={isAwaitingFirstChunk}
            activeConversationId={activeConversationId ?? "new-chat"}
            isStreaming={isStreaming}
            isThinking={isThinking}
            isNewChat={isNewChat}
            isHome={isHome}
            thinkingText={thinkingText}
            thinkingDuration={thinkingDuration ?? undefined}
            imgGenEnabled={imgGenEnabled}
            imgGenFields={imgGenFields}
            imgGenAttachmentId={currentImgGenAttachmentId ?? undefined}
            currentAiMsgId={currentAiMsgId ?? undefined}
            loadOlderMessages={loadMore}
            hasOlderMessages={hasMore}
            isLoadingOlderMessages={isLoadingMore}
            user={user}>
            <ChatHero user={user} selectedModel={selectedModel} tz={tz} />
          </ChatFeed>
        }
        <Suspense>
          <ChatInput
            handlePromptConsumed={handlePromptConsumed}
            initialPrompt={queuedPrompt}
            autoSubmitInitialPrompt
            onUserMessage={sendChat}
            user={user}
            isConnected={isConnected}
            activeConversationId={activeConversationId}
            conversationId={activeConversationId ?? conversationId}>
            <FloatingScrollButton isHome={isHome} />
          </ChatInput>
        </Suspense>
      </div>
    </ChatScrollProvider>
  );
}
declare module "react" {
  export interface CSSProperties extends Properties<string | number> {
    "--bob-multiplier"?: number;
  }
}
