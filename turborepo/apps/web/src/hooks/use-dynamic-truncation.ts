"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseDynamicTruncationOptions {
  text: string;
  maxLines?: number;
  reservedSpace?: number; // Space to reserve for ellipsis and padding
  minChars?: number; // Minimum characters to always show
}

export function useDynamicTruncation({
  text,
  maxLines: _maxLines = 1,
  reservedSpace = 20,
  minChars = 8 // Always show at least 8 characters
}: UseDynamicTruncationOptions) {
  const [truncatedText, setTruncatedText] = useState(text);
  const [isTruncated, setIsTruncated] = useState(false);
  const containerRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLElement>(null);

  const measureText = useCallback((testText: string): number => {
    if (!measureRef.current) return 0;
    measureRef.current.textContent = testText;
    return measureRef.current.scrollWidth;
  }, []);

  const truncateText = useCallback(() => {
    if (!containerRef.current || !measureRef.current || !text) {
      setTruncatedText(text);
      setIsTruncated(false);
      return;
    }

    const containerWidth = containerRef.current.clientWidth - reservedSpace;

    // If container is too small, just show minimum characters
    if (containerWidth < 50) {
      const minText = text.substring(0, Math.max(minChars, 3));
      setTruncatedText(minText);
      setIsTruncated(minText.length < text.length);
      return;
    }

    const fullTextWidth = measureText(text);

    // If text fits completely, no truncation needed
    if (fullTextWidth <= containerWidth) {
      setTruncatedText(text);
      setIsTruncated(false);
      return;
    }

    // Ensure we always show at least minChars
    const minText = text.substring(0, minChars);
    const minTextWithEllipsis = minText + "...";
    const minWidth = measureText(minTextWithEllipsis);

    // If even minimum text doesn't fit, just show what we can
    if (minWidth > containerWidth) {
      const fallbackLength = Math.max(1, Math.floor(text.length * 0.3));
      setTruncatedText(text.substring(0, fallbackLength));
      setIsTruncated(true);
      return;
    }

    // Binary search for optimal truncation point, but never go below minChars
    let left = minChars;
    let right = text.length;
    let bestFit = minText;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const testText = text.substring(0, mid);
      const testWidth = measureText(testText + "...");

      if (testWidth <= containerWidth) {
        bestFit = testText;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Word-aware truncation (but respect minimum)
    if (bestFit.length > minChars) {
      const words = bestFit.split(" ");
      if (words.length > 1) {
        const lastWord = words[words.length - 1];
        const withoutLastWord = words.slice(0, -1).join(" ");

        // Only remove last word if it saves space and we stay above minimum
        if (
          lastWord &&
          lastWord?.length > 3 &&
          withoutLastWord.length >= minChars
        ) {
          bestFit = withoutLastWord;
        }
      }
    }

    setTruncatedText(bestFit.trim());
    setIsTruncated(bestFit.trim().length < text.length);
  }, [text, measureText, reservedSpace, minChars]);

  useEffect(() => {
    truncateText();
  }, [truncateText]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      // Debounce the truncation to avoid excessive recalculations
      setTimeout(truncateText, 10);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [truncateText]);

  return {
    containerRef,
    measureRef,
    truncatedText,
    isTruncated,
    fullText: text
  };
}
