"use client";

import { useRef } from "react";
import { Typewriter } from "motion-plus/react";
import { useInView, useReducedMotion } from "motion/react";

const PROMPT =
  "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.\n\nOlder messages are made searchable via tooling to keep things light.";

export function SystemPromptTypewriter() {
  const ref = useRef<HTMLQuoteElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const reduce = useReducedMotion();

  return (
    <blockquote
      ref={ref}
      className="text-foreground/90 min-h-40 font-mono text-sm leading-relaxed whitespace-pre-line md:min-h-32">
      {reduce ? (
        PROMPT
      ) : (
        <Typewriter
          play={inView}
          speed="fast"
          variance="natural"
          cursorStyle={{ backgroundColor: "var(--accent)" }}>
          {PROMPT}
        </Typewriter>
      )}
    </blockquote>
  );
}
