"use client";

/**
 * AI Coalesce route loader — a branded "decode" screen, not a generic shimmer. The wordmark literally *coalesces*
 * out of noise (`motion-plus` `ScrambleText`, stagger from center), re-runs on a gentle cadence so it feels alive
 * while the route resolves, and re-scrambles on hover. Respects `prefers-reduced-motion` (settles to static text).
 *
 * Used by the route-level `loading.tsx` (Next Suspense fallback). Pure presentation — no data.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrambleText } from "motion-plus/react";
import { stagger } from "motion/react";
import { AICoalesce } from "@slipstream/ui";

/** Decode glyphs — binary + block-fade + geometric, for an "AI / data coalescing" texture. */
const SCRAMBLE_CHARS = "01█▓▒░◆◇◈○●◦∶∷/\\<>{}[]()=+*·:;";

const GLOW = {
  background:
    "radial-gradient(42% 44% at 50% 42%, color-mix(in oklch, var(--color-primary) 22%, transparent), transparent 72%)"
} satisfies React.CSSProperties;

const GRID = {
  backgroundImage:
    "radial-gradient(circle, var(--color-border) 1px, transparent 1.4px)",
  backgroundSize: "26px 26px",
  maskImage:
    "radial-gradient(ellipse 58% 56% at 50% 44%, black, transparent 80%)",
  WebkitMaskImage:
    "radial-gradient(ellipse 58% 56% at 50% 44%, black, transparent 80%)"
} satisfies React.CSSProperties;

const MARK_GLOW = {
  filter:
    "drop-shadow(0 0 26px color-mix(in oklch, var(--color-primary) 45%, transparent))"
} satisfies React.CSSProperties;

export function AiCoalesceLoader() {
  // `active === true` → characters scramble; flipping false→true re-runs the coalesce cycle.
  const [active, setActive] = useState(true);

  const recoalesce = useCallback(() => {
    setActive(false);
    requestAnimationFrame(() => setActive(true));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(false);
      return;
    }
    const id = setInterval(recoalesce, 2600);
    return () => clearInterval(id);
  }, [recoalesce]);

  return (
    <div
      role="status"
      aria-label="Loading AI Coalesce"
      onMouseEnter={recoalesce}
      className="bg-background text-foreground relative flex h-full min-h-[70dvh] w-full flex-col items-center justify-center overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={GLOW}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={GRID}
      />
      <div className="relative z-10 flex flex-col items-center gap-7 px-6">
        <div
          className="motion-safe:animate-floating-bob relative"
          style={MARK_GLOW}>
          <AICoalesce className="text-primary size-20 stroke-current sm:size-24 [&_path]:stroke-current" />
        </div>
        <ScrambleText
          as="h1"
          active={active}
          duration={1.1}
          delay={stagger(0.045, { from: "center" })}
          chars={SCRAMBLE_CHARS}
          className="font-geist-mono text-foreground text-center text-[clamp(1.55rem,7vw,4.25rem)] font-medium tracking-[0.16em] uppercase">
          AI COALESCE
        </ScrambleText>
        <p className="font-geist-mono text-muted-foreground flex items-center gap-1 text-[0.7rem] tracking-[0.45em] uppercase">
          coalescing
          <span className="text-primary motion-safe:animate-pulse">▋</span>
        </p>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
