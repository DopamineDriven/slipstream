"use client";

import type { ReactNode, RefObject } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState
} from "react";
import { smoothScrollToBottom } from "@/lib/helpers";

interface ChatScrollContextValue {
  scrollRef: RefObject<HTMLDivElement | null>;
  isNearBottom: boolean;
  showScrollButton: boolean;
  scrollToBottom: () => void;
  setScrollState: (isNear: boolean, showButton: boolean) => void;
}

const ChatScrollContext = createContext<ChatScrollContextValue | null>(null);

export function ChatScrollProvider({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  const setScrollState = useCallback((isNear: boolean, showButton: boolean) => {
    setIsNearBottom(isNear);
    setShowScrollButton(showButton);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current || isScrolling) return;

    setIsScrolling(true);
    const container = scrollRef.current;
    const startScrollTop = container.scrollTop;
    const targetScrollTop = container.scrollHeight - container.clientHeight;
    const distance = targetScrollTop - startScrollTop;

    const duration = smoothScrollToBottom(distance);

    const startTime = performance.now();

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutQuart easing function for natural deceleration
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);

      const currentScrollTop = startScrollTop + distance * easeOutQuart;
      container.scrollTop = currentScrollTop;

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      } else {
        setIsScrolling(false);
      }
    };

    requestAnimationFrame(animateScroll);
  }, [isScrolling]);

  return (
    <ChatScrollContext.Provider
      value={{
        scrollRef,
        isNearBottom,
        showScrollButton,
        scrollToBottom,
        setScrollState
      }}>
      {children}
    </ChatScrollContext.Provider>
  );
}

export function useChatScroll() {
  const context = useContext(ChatScrollContext);
  if (!context) {
    throw new Error("useChatScroll must be used within ChatScrollProvider");
  }
  return context;
}
