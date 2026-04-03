"use client";

import { useChatScroll } from "@/context/chat-scroll-context";
import { cn } from "@/lib/utils";
import { Button, ChevronDown } from "@slipstream/ui";

export function FloatingScrollButton({ isHome }: { isHome: boolean }) {
  const { showScrollButton, scrollToBottom } = useChatScroll();
  return (
    <div
      className={cn(
        "pointer-events-none absolute -top-10 flex w-full items-center justify-center",
        isHome ? "sr-only" : ""
      )}>
      <Button
        variant="secondary"
        size="icon"
        onClick={scrollToBottom}
        className={cn(
          "bg-background border-border pointer-events-auto h-7 w-7 rounded-full border shadow-lg hover:opacity-75 hover:shadow-xl",
          "transition-all duration-200 ease-[cubic-bezier(0.31,0.1,0.08,0.96)]",
          showScrollButton
            ? "animate-floating-bob pointer-events-auto translate-y-0 opacity-50"
            : "pointer-events-none translate-y-2 opacity-0"
        )}
        style={{ "--bob-multiplier": 0.7 }}
        aria-label="Scroll to bottom">
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
