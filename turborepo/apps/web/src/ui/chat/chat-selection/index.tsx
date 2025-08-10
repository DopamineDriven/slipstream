"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Copy, QuoteIcon } from "@t3-chat-clone/ui";

type Props = {
  rect: DOMRect;
  onQuoteAction: () => void;
  onCopyAction: () => void;
  onCloseAction: () => void;
};

export function SelectionToolbar({
  rect,
  onQuoteAction: onQuote,
  onCopyAction: onCopy,
  onCloseAction: onClose
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);

    const handleScroll = () => onClose();
    const handleResize = () => onClose();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [onClose]);

  if (!mounted) return null;

  const top = window.scrollY + rect.top - 44; // 44px above selection
  const left = window.scrollX + rect.left + rect.width / 2;

  return createPortal(
    <div
      ref={ref}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/60 pointer-events-auto fixed z-50 -translate-x-1/2 rounded-full border px-2 py-1 shadow-xl backdrop-blur"
      style={{ top, left }}
      data-selection-toolbar
      role="toolbar"
      aria-label="Selection actions">
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onQuote}
        title="Quote">
        <QuoteIcon className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onCopy}
        title="Copy">
        <Copy className="h-4 w-4" />
      </Button>
      <button className="sr-only" onClick={onClose}>
        Close
      </button>
    </div>,
    document.body
  );
}
