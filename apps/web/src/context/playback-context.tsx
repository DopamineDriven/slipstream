"use client";

import type { PlaybackStore } from "@/playback/store";
import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { createPlaybackStore } from "@/playback/store";

const PlaybackContext = createContext<PlaybackStore | null>(null);

/**
 * Mounts the single `<audio>` element. Lives in `(chat)/layout.tsx` above both
 * the `children` and `@modal` slots so it survives every route in the group,
 * including the intercepted lightbox opening and closing.
 */
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createPlaybackStore);
  const { attach } = store;
  return (
    <PlaybackContext value={store}>
      {children}
      <audio ref={attach} preload="metadata" />
    </PlaybackContext>
  );
}

export function usePlaybackContext() {
  const store = useContext(PlaybackContext);
  if (!store) {
    throw new Error(
      "usePlaybackContext must be used inside <PlaybackProvider>"
    );
  }
  return store;
}
