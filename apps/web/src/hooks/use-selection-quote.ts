"use client";

import { useCallback, useEffect, useState } from "react";

export type QuotePayload = {
  messageId: string;
  excerpt: string;
  kind: "text" | "code";
  language?: string;
  selector: {
    exact: string;
    prefix?: string;
    suffix?: string;
  };
};

export function useSelectionQuote(containerSelector = "[data-chat-feed]") {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [quote, setQuote] = useState<QuotePayload | null>(null);

  const clear = useCallback(() => {
    setRect(null);
    setQuote(null);
  }, []);

  useEffect(() => {
    // Wait for DOM to be ready
    const checkAndAttach = () => {
      const root = document.querySelector<HTMLElement>(containerSelector);
      if (!root) {
        // Retry after a short delay if container not found
        setTimeout(checkAndAttach, 100);
        return;
      }

      const handleMouseUp = (_e: MouseEvent) => {
        // Small delay to ensure selection is complete
        setTimeout(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return clear();

          const range = sel.getRangeAt(0);
          const selectedText = range.toString().trim();

          if (sel.isCollapsed || !selectedText) return clear();

          // Find the message container
          let startContainer = range.startContainer;
          if (
            startContainer.nodeType === Node.TEXT_NODE &&
            startContainer.parentElement
          ) {
            startContainer = startContainer.parentElement;
          }

          let endContainer = range.endContainer;
          if (
            endContainer.nodeType === Node.TEXT_NODE &&
            endContainer.parentElement
          ) {
            endContainer = endContainer.parentElement;
          }

          const startMsg = (startContainer as Element).closest(
            "[data-message-id]"
          );
          const endMsg = (endContainer as Element).closest("[data-message-id]");

          if (!startMsg || !endMsg || startMsg !== endMsg) return clear();

          const messageId = (startMsg as HTMLElement).dataset.messageId;
          const box = range.getBoundingClientRect();

          if (!box || (box.width === 0 && box.height === 0)) return clear();

          // Check if selection is inside code block
          const codeEl = (range.commonAncestorContainer as Element)?.closest?.(
            "pre code"
          ) as HTMLElement | null;
          const kind = codeEl ? "code" : "text";

          let language: string | undefined;
          if (codeEl?.className) {
            const match = codeEl.className.match(/language-([a-z0-9+#-]+)/i);
            if (match) language = match?.[1]?.toLowerCase();
          }

          // Build selector with context
          const bubbleText = (startMsg as HTMLElement).innerText;
          const idx = bubbleText.indexOf(selectedText);
          const prefix =
            idx > 0 ? bubbleText.slice(Math.max(0, idx - 32), idx) : undefined;
          const suffix =
            idx >= 0
              ? bubbleText.slice(
                  idx + selectedText.length,
                  idx + selectedText.length + 32
                )
              : undefined;

          setRect(box);
          if (!messageId) return;
          setQuote({
            messageId,
            excerpt: selectedText,
            kind,
            language,
            selector: { exact: selectedText, prefix, suffix }
          });
        }, 10);
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          clear();
          window.getSelection()?.removeAllRanges();
        }
      };

      const handleScroll = () => clear();

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Element;
        if (
          !target.closest(containerSelector) &&
          !target.closest("[data-selection-toolbar]")
        ) {
          clear();
        }
      };

      // Attach listeners
      root.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("keydown", handleKeyDown);
      root.addEventListener("scroll", handleScroll, { passive: true });
      document.addEventListener("mousedown", handleClickOutside);

      return () => {
        root.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("keydown", handleKeyDown);
        root.removeEventListener("scroll", handleScroll);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    };

    const cleanup = checkAndAttach();
    return cleanup;
  }, [containerSelector, clear]);

  return { rect, quote, clear };
}
