"use client";

/**
 * Upward pagination + scroll anchoring for the chat feed, with a velocity-adaptive on-demand trigger AND a
 * background backfill.
 *
 * Backfill (the "snappy illusion"): once armed, it eagerly walks the rest of the conversation into the caches on
 * IDLE (`requestIdleCallback`), so by the time a reader scrolls up the data is already preloaded — the on-demand
 * load-older path then resolves from cache, instantly. The velocity trigger survives purely for the race where
 * someone flings up before the backfill catches up.
 *
 * Trigger: the on-demand margin is a function of upward scroll velocity (`useScroll` → `useVelocity`) — slow scroll
 * fires near the top, a fast fling fires with full runway.
 *
 * Anchor (the SWR → store architecture adaptation, per codex): web-next renders from the store AFTER the bridge
 * ingests SWR, so we restore only once the rendered list has grown past the count captured before `loadMore`,
 * bumping `scrollTop` by the height gained (relative — a backfill prepend keeps a bottom-pinned reader pinned), in
 * a layout effect so it lands before paint. The container disables native scroll-anchoring so only this restore runs.
 *
 * Both the velocity trigger and the backfill route through one `triggerLoad` (capture + load), so they anchor
 * identically and dedupe via `pendingRef`.
 */

import type { RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useMotionValueEvent, useScroll, useVelocity } from "motion/react";
import type { MessageSingleton } from "@slipstream/types";

interface UseLoadOlderHistoryArgs {
  readonly hasMore: boolean;
  readonly isLoadingOlder: boolean;
  readonly onLoadOlder: () => void | Promise<unknown>;
  readonly enabled: boolean;
  /** Eagerly preload the rest of the convo in the background (on idle) so on-demand loads hit warm cache. */
  readonly backfill?: boolean;
  readonly minMarginPx?: number;
  readonly maxMarginPx?: number;
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
    backfill = true,
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
  const stateRef = useRef({ hasMore, isLoadingOlder, onLoadOlder, enabled });
  stateRef.current = { hasMore, isLoadingOlder, onLoadOlder, enabled };
  const countRef = useRef(messages.length);
  countRef.current = messages.length;

  // Capture scroll metrics + fire one older-page load — shared by the velocity trigger and the backfill so both
  // anchor identically.
  const triggerLoad = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    prevHeightRef.current = el.scrollHeight;
    prevCountRef.current = countRef.current;
    pendingRef.current = true;
    void stateRef.current.onLoadOlder();
  }, [scrollRef]);

  const onScrollChange = useCallback(
    (top: number) => {
      const s = stateRef.current;
      if (!s.enabled || pendingRef.current || s.isLoadingOlder || !s.hasMore) {
        return;
      }
      // Negative velocity = scrolling up. Faster up → bigger margin → fire earlier (more runway).
      const upwardSpeed = Math.max(0, -scrollVelocity.get());
      const ramp = Math.min(1, upwardSpeed / maxVelocityPxPerSec);
      const margin = minMarginPx + ramp * (maxMarginPx - minMarginPx);
      if (top > margin) return;
      triggerLoad();
    },
    [scrollVelocity, minMarginPx, maxMarginPx, maxVelocityPxPerSec, triggerLoad]
  );
  useMotionValueEvent(scrollY, "change", onScrollChange);

  // Background backfill: re-runs after each page (messages grows) to schedule the next idle load, until exhausted.
  useEffect(() => {
    if (!backfill || !enabled || !hasMore || pendingRef.current) return;
    const run = () => {
      const s = stateRef.current;
      if (pendingRef.current || s.isLoadingOlder || !s.hasMore) return;
      triggerLoad();
    };
    if (typeof window === "undefined") return;
    const id = window.requestIdleCallback(run, { timeout: 250 });
    return () => window.cancelIdleCallback(id);
  }, [backfill, enabled, hasMore, isLoadingOlder, messages.length, triggerLoad]);

  useLayoutEffect(() => {
    if (!pendingRef.current) return;
    if (messages.length <= prevCountRef.current) return; // wait for the store-backed list to actually grow
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop += el.scrollHeight - prevHeightRef.current;
    pendingRef.current = false;
  }, [messages, scrollRef]);
}
