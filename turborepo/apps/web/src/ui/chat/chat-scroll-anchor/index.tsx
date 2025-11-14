"use client";

import { useEffect } from "react";
import { useInView } from "motion/react";

export interface ChatScrollAnchorProps {
  trackVisibility?: boolean;
}

export function ChatScrollAnchor({ trackVisibility }: ChatScrollAnchorProps) {
  const [ref, inView] = useInView({
    margin: "0px 0px -150px 0px"
  });

  useEffect(() => {
    if (trackVisibility && inView) {
      // Scroll into view when new content appears and we're tracking
      const element = ref as unknown as { current: HTMLElement | null };
      element.current?.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    }
  }, [inView, trackVisibility, ref]);

  return <div ref={ref} className="h-px w-full" />;
}
