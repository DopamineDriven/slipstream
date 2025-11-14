"use client";

import { useCallback, useEffect, useState } from "react";
import { useScroll } from "motion/react";
import { useChatScroll } from "@/context/chat-scroll-context";
import { cn } from "@/lib/utils";
import { Button, ChevronDown } from "@slipstream/ui";

interface FloatingScrollButtonProps {
  isHome: boolean;
}

export function FloatingScrollButton({ isHome }: FloatingScrollButtonProps) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { scrollRef } = useChatScroll();

  // Track scroll progress of the chat feed container using the actual ref
  const { scrollYProgress } = useScroll({
    container: scrollRef,
  });

  // Update isAtBottom when scroll progress changes
  useEffect(() => {
    return scrollYProgress.on("change", (latest) => {
      // Consider "at bottom" if scroll progress > 0.95 (within 5% of bottom)
      setIsAtBottom(latest > 0.95);
    });
  }, [scrollYProgress]);

  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [scrollRef]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-24 left-0 right-0 z-50 justify-center px-4",
        isHome ? "hidden" : "flex"
      )}>
      <Button
        variant="secondary"
        size="icon"
        onClick={scrollToBottom}
        className={cn(
          "bg-background border-border pointer-events-auto h-8 w-8 rounded-full border shadow-lg transition-all duration-200 ease-[cubic-bezier(0.31,0.1,0.08,0.96)] hover:opacity-75 hover:shadow-xl",
          isAtBottom
            ? "pointer-events-none translate-y-2 opacity-0"
            : "animate-floating-bob pointer-events-auto translate-y-0 opacity-50"
        )}
        style={{ "--bob-multiplier": 0.7 } as React.CSSProperties}
        aria-label="Scroll to bottom">
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
