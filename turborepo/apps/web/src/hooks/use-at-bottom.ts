"use client";

import { useEffect, useState } from "react";

export function useAtBottom(offset = 0): boolean {
  const [isAtBottom, setIsAtBottom] = useState(false);

  useEffect(() => {
    const container = document.querySelector("[data-chat-feed]") as HTMLElement;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

      setIsAtBottom(distanceFromBottom <= offset);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [offset]);

  return isAtBottom;
}
