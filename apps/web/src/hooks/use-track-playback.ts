"use client";

import type { PlaybackSnapshot } from "@/playback/store";
import { usePlaybackValue } from "@/hooks/use-playback-value";

/**
 * A track's view of the shared element: idle at 0:00 unless it is the loaded
 * one. `undefined` is a view with no track yet (the compiling window) and
 * reads idle rather than matching the unloaded store.
 */
export function useTrackPlayback(trackId: string | undefined) {
  const isLoaded = (s: PlaybackSnapshot) =>
    trackId !== undefined && s.track?.id === trackId;
  const current = usePlaybackValue(isLoaded);
  const status = usePlaybackValue(s => (isLoaded(s) ? s.status : "idle"));
  const time = usePlaybackValue(s => (isLoaded(s) ? s.currentTime : 0));
  const duration = usePlaybackValue(s =>
    isLoaded(s) ? s.duration : undefined
  );
  return { current, status, time, duration };
}
