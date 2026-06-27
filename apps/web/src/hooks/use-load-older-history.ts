"use client";

/**
 * Upward pagination + scroll anchoring for the chat feed, with a VELOCITY-ADAPTIVE trigger.
 *
 * Trigger: the on-demand margin is a function of upward scroll velocity (`useScroll` → `useVelocity`) — slow scroll
 * fires near the top, a fast fling fires with full runway.
 *
 * Anchor (the SWR → store architecture adaptation, per codex): web-next renders from the store AFTER the bridge
 * ingests SWR, so we restore only once the rendered list has grown past the count captured before `loadMore`,
 * bumping `scrollTop` by the height gained (relative — a velocity-driven scroll-while-loading stays put), in
 * a layout effect so it lands before paint. The container disables native scroll-anchoring so only this restore runs.
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
  const countRef = useRef(messages.length);

  useEffect(() => {
    stateRef.current = { hasMore, isLoadingOlder, onLoadOlder, enabled };
    countRef.current = messages.length;
  }, [enabled, hasMore, isLoadingOlder, messages.length, onLoadOlder]);

  const onScrollChange = useCallback(
    (top: number) => {
      const { hasMore, isLoadingOlder, onLoadOlder, enabled } =
        stateRef.current;
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
