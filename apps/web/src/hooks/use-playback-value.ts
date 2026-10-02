"use client";

import type { PlaybackSnapshot } from "@/playback/store";
import {
  useSyncExternalStore
} from "react";
import { usePlaybackContext } from "@/context/playback-context";
import { IDLE_PLAYBACK } from "@/playback/store";

/** Subscribe to one primitive from the snapshot; the leaf re-renders only when it changes. */
export function usePlaybackValue<const T>(
  select: (snapshot: PlaybackSnapshot) => T
) {
  const store = usePlaybackContext();
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => select(IDLE_PLAYBACK)
  );
}
