"use client";

import { useEffect, useState } from "react";

export function useAtBottom<const T extends number>(offset?: T) {
  const offsetUndefined = typeof offset === "undefined" ? 0 : offset;
  const [isAtBottom, setIsAtBottom] = useState(false);

  useEffect(() => {
    const container = document.querySelector("[data-chat-feed]") as HTMLElement;
    if (!container) return;

    const handleScroll = () => {
      setIsAtBottom(
        container.scrollTop + container.clientHeight >=
          container.scrollHeight - offsetUndefined
      );
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [offsetUndefined]);

  return isAtBottom;
}
