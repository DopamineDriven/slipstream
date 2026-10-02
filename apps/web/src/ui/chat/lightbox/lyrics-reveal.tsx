"use client";

import type { Transition } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatLyrics, parseLyrics } from "@/lib/lyrics";
import { cn } from "@/lib/utils";
import { LyricsPanel } from "@/ui/chat/lightbox/lyrics-panel";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Copy } from "@slipstream/ui";

/** Lands without overshoot so the card's bottom edge settles rather than bounces. */
const settle = {
  type: "spring",
  visualDuration: 0.4,
  bounce: 0
} satisfies Transition;

/**
 * Lives in the player's time row, set in the same 11px mono as the timestamps
 * so at rest it reads as part of the transport rather than as a control.
 */
export function LyricsToggle({
  open,
  controls,
  onToggle
}: {
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        "focus-visible:ring-ring/50 -my-1 flex items-center gap-0.5 rounded-md px-1.5 py-1 tracking-wide uppercase transition-colors outline-none focus-visible:ring-3",
        open ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}>
      lyrics
      <motion.span
        aria-hidden="true"
        className="flex"
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}>
        <ChevronDown className="size-3" strokeWidth="2.5" />
      </motion.span>
    </button>
  );
}

/** Unfurls beneath the player; the outer box grows while the text slides down into it. */
export function LyricsDrawer({
  id,
  open,
  lyrics
}: {
  id: string;
  open: boolean;
  lyrics: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="lyrics"
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ height: settle, opacity: { duration: 0.2 } }}
          className="overflow-hidden">
          <motion.div
            initial={{ y: -10 }}
            animate={{ y: 0 }}
            exit={{ y: -10 }}
            transition={settle}
            className="border-border/60 flex items-start gap-3 border-t px-4 pt-4 pb-5">
            <LyricsPanel
              lyrics={lyrics}
              className="max-h-[60dvh] min-w-0 flex-1 gap-5 overflow-y-auto overscroll-contain"
            />
            <CopyLyrics text={formatLyrics(parseLyrics(lyrics))} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CopyLyrics({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(reset.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Lyrics copied" : "Copy lyrics"}
      className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 focus-visible:ring-ring/50 -mt-2 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-3">
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={copied ? "check" : "copy"}
          className="flex"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.14 }}>
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {copied ? "Lyrics copied" : null}
      </span>
    </button>
  );
}
