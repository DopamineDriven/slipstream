"use client";

/**
 * Upward pagination + scroll anchoring for the chat feed, with a VELOCITY-ADAPTIVE trigger.
 *
 * Trigger: rather than a fixed prefetch distance, the trigger margin is a function of upward scroll velocity —
 * a slow/casual scroll fires close to the top (`minMarginPx`, minimal premature prefetch), a fast fling fires with
 * full runway (`maxMarginPx`, so the next page is in cache before the reader arrives). Velocity comes from
 * `motion`'s `useScroll({ container }) → useVelocity` (px/s, negative when scrolling toward the top), read each
 * frame via `useMotionValueEvent`. One mechanism, no IntersectionObserver, no debounced scroll-state path.
 *
 * Anchor (the architecture-specific part — see codex's follow-up): the v0 prototype renders straight from SWR so it
 * can restore the instant `isLoadingMore` flips false. web-next can't — SWR resolves, THEN the bridge ingests into
 * the store, THEN `useChatCommitted` notifies, THEN the feed grows. Restoring on the flag alone would run with a
 * zero delta and clear the anchor too early. So we capture `scrollHeight` + message COUNT at trigger time and
 * restore only once the rendered list has grown past that count, bumping `scrollTop` by the height gained
 * (relative — a velocity-driven scroll-while-loading stays put), in a layout effect so it lands before paint. The
 * container disables native scroll-anchoring (`overflow-anchor: none`) so only this manual restore runs.
 */

import type { RefObject } from "react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useMotionValueEvent, useScroll, useVelocity } from "motion/react";
import type { MessageSingleton } from "@slipstream/types";

interface UseLoadOlderHistoryArgs {
  readonly hasMore: boolean;
  readonly isLoadingOlder: boolean;
  readonly onLoadOlder: () => void | Promise<unknown>;
  /** Hold off until the conversation's initial scroll-to-bottom has run (no page-1 fetch on first paint). */
  readonly enabled: boolean;
  /** Trigger distance from the top at (near-)zero upward velocity. */
  readonly minMarginPx?: number;
  /** Trigger distance from the top once upward speed saturates `maxVelocityPxPerSec` (full prefetch runway). */
  readonly maxMarginPx?: number;
  /** Upward speed (px/s) at which the margin reaches `maxMarginPx`. */
  readonly maxVelocityPxPerSec?: number;
}

export function useLoadOlderHistory(
  scrollRef: RefObject<HTMLDivElement | null>,
  messages: readonly MessageSingleton<true>[],
  {
    hasMore,
    isLoadingOlder,
    onLoadOlder,
    enabled,
    minMarginPx = 200,
    maxMarginPx = 1500,
    maxVelocityPxPerSec = 2500
  }: UseLoadOlderHistoryArgs
) {
  const { scrollY } = useScroll({ container: scrollRef });
  const scrollVelocity = useVelocity(scrollY);

  const pendingRef = useRef(false);
  const prevHeightRef = useRef(0);
  const prevCountRef = useRef(0);

  // Latest control values for the per-frame motion event, so the listener never re-subscribes or goes stale.
  const stateRef = useRef({ hasMore, isLoadingOlder, onLoadOlder, enabled });
  stateRef.current = { hasMore, isLoadingOlder, onLoadOlder, enabled };
  const countRef = useRef(messages.length);
  countRef.current = messages.length;

  // Memoized so `useMotionValueEvent` subscribes ONCE — not per streaming token (ChatFeed re-renders per token).
  // It reads all changing control state through `stateRef`/`countRef`, so the deps stay stable.
  const onScrollChange = useCallback(
    (top: number) => {
      const { hasMore, isLoadingOlder, onLoadOlder, enabled } = stateRef.current;
      if (!enabled || pendingRef.current || isLoadingOlder || !hasMore) return;
      // Negative velocity = scrolling up. Faster up → bigger margin → fire earlier (more runway).
      const upwardSpeed = Math.max(0, -scrollVelocity.get());
      const ramp = Math.min(1, upwardSpeed / maxVelocityPxPerSec);
      const margin = minMarginPx + ramp * (maxMarginPx - minMarginPx);
      if (top > margin) return;
      const el = scrollRef.current;
      if (!el) return;
      prevHeightRef.current = el.scrollHeight;
      prevCountRef.current = countRef.current;
      pendingRef.current = true;
      void onLoadOlder();
    },
    [scrollVelocity, scrollRef, minMarginPx, maxMarginPx, maxVelocityPxPerSec]
  );
  useMotionValueEvent(scrollY, "change", onScrollChange);

  useLayoutEffect(() => {
    if (!pendingRef.current) return;
    if (messages.length <= prevCountRef.current) return; // wait for the store-backed list to actually grow
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop += el.scrollHeight - prevHeightRef.current;
    pendingRef.current = false;
  }, [messages, scrollRef]);
}
