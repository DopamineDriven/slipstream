"use client";

import { useCallback, useEffect, useState } from "react";

export function useContainerAtBottom<const T extends HTMLElement | null>(
  container: T
) {
  const [containerAtBottom, setContainerAtBottom] = useState(false);

  /** This callback is a useEffect dependency and is invoked whenever a user scrolls to track container position in real-time */
  const trackPosition = useCallback(() => {
    if (!container) {
      return;
    }
    setContainerAtBottom(
      container.scrollTop + container.clientHeight >= container.scrollHeight
    );
  }, [container]);

  useEffect(() => {
    if (!container) {
      return;
    }

    container.addEventListener("scroll", trackPosition, { passive: true });

    trackPosition();

    return () => {
      container.removeEventListener("scroll", trackPosition);
    };
  }, [container, trackPosition]);

  return containerAtBottom;
}
