"use client";

import { useChatScroll } from "@/context/chat-scroll-context";
import { cn } from "@/lib/utils";
import { Button, ChevronDown } from "@slipstream/ui";

interface FloatingScrollButtonProps {
  isHome: boolean;
}

export function FloatingScrollButton({ isHome }: FloatingScrollButtonProps) {
  const { showScrollButton, scrollToBottom } = useChatScroll();

  if (isHome) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 left-0 right-0 z-50 flex justify-center px-4">
      <Button
        variant="secondary"
        size="icon"
        onClick={scrollToBottom}
        className={cn(
          "bg-background border-border pointer-events-auto h-8 w-8 rounded-full border shadow-lg transition-all duration-200 ease-[cubic-bezier(0.31,0.1,0.08,0.96)] hover:opacity-75 hover:shadow-xl",
          showScrollButton
            ? "animate-floating-bob pointer-events-auto translate-y-0 opacity-50"
            : "pointer-events-none translate-y-2 opacity-0"
        )}
        style={{ "--bob-multiplier": 0.7 } as React.CSSProperties}
        aria-label="Scroll to bottom">
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
