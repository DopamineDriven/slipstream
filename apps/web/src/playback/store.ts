import type { CTR, Rm, RTC } from "@slipstream/types";

export type PlaybackTrack = {
  /**
   * The cdnUrl — the identity of the CDN object, equal on the live envelope and
   * the committed row; equality decides whether a control targets the loaded track.
   */
  id: string;
  src: string;
  title: string;
  /** The extractor's seconds, trusted until the element reports its own. */
  duration: number | undefined;
};

export type PlaybackStatus =
  "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type PlaybackSnapshot = {
  /** Absent until `load` has pointed the element at something. */
  track?: PlaybackTrack;
  status: PlaybackStatus;
  currentTime: number;
  /** The element's reported seconds once known, else the track's own; absent while idle. */
  duration?: number | undefined;
  /** Element-level, so they outlive any one track: `0..1`, and the mute flag beside it. */
  volume: number;
  muted: boolean;
};

/** What every `track?.id` check in the store leans on: once loaded, the track is there. */
export type LoadedPlayback = CTR<PlaybackSnapshot, "track">;

/** No track loaded; volume and mute ride along because they belong to the element, not the track. */
export type IdlePlayback = Rm<PlaybackSnapshot, "track" | "duration"> & {
  status: "idle";
};

export const IDLE_PLAYBACK = {
  status: "idle",
  currentTime: 0,
  volume: 1,
  muted: false
} satisfies IdlePlayback;

export type PlaybackStore = ReturnType<typeof createPlaybackStore>;

/**
 * One `HTMLAudioElement` for the whole `(chat)` group. Every player in the
 * tree is a view onto this store, so the feed card and the intercepted
 * lightbox read the same timeline and neither of them owns the sound:
 * mounting or unmounting a view never touches playback.
 *
 * Framework-free on purpose; `PlaybackProvider` mounts the element and hands
 * the store to React via context + `useSyncExternalStore`.
 */

export function createPlaybackStore() {
  let snapshot: PlaybackSnapshot = IDLE_PLAYBACK;
  let element: HTMLAudioElement | null = null;
  let frame = 0;
  const listeners = new Set<() => void>();

  const publish = () => {
    for (const listener of listeners) listener();
  };

  /**
   * Merge a partial update. Only the required keys loosen; `track` cannot be
   * unset this way because `track?: PlaybackTrack` rejects an explicit
   * `undefined`, so clearing it has to go through `replace`.
   */
  const patch = (next: RTC<PlaybackSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    publish();
  };

  /** The only whole-state jumps: back to idle, or onto a freshly loaded track. */
  const replace = (next: IdlePlayback | LoadedPlayback) => {
    snapshot = next;
    publish();
  };

  const elementDuration = () => {
    const d = element?.duration;
    return d !== undefined && Number.isFinite(d) ? d : undefined;
  };

  // `timeupdate` fires ~4×/s, which is visibly steppy on a scrubber; while
  // playing, a frame loop publishes the clock instead. Paused seeks still
  // arrive through `timeupdate`.
  const tick = () => {
    if (!element || element.paused) return;
    if (element.currentTime !== snapshot.currentTime)
      patch({ currentTime: element.currentTime });
    frame = requestAnimationFrame(tick);
  };

  const handlers = {
    play: () => patch({ status: "loading" }),
    playing: () => {
      patch({ status: "playing" });
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    },
    waiting: () => patch({ status: "loading" }),
    pause: () => {
      cancelAnimationFrame(frame);
      if (element && !element.ended)
        patch({ status: "paused", currentTime: element.currentTime });
    },
    ended: () => {
      cancelAnimationFrame(frame);
      patch({
        status: "ended",
        currentTime: elementDuration() ?? snapshot.currentTime
      });
    },
    timeupdate: () => {
      if (element?.paused) patch({ currentTime: element.currentTime });
    },
    loadedmetadata: () =>
      patch({ duration: elementDuration() ?? snapshot.duration }),
    durationchange: () =>
      patch({ duration: elementDuration() ?? snapshot.duration }),
    // the element is the source of truth for both; `setVolume` / `toggleMute`
    // write the element and this writes the snapshot (iOS ignores `volume`
    // writes and fires nothing, so the snapshot stays honest there too)
    volumechange: () => {
      if (element) patch({ volume: element.volume, muted: element.muted });
    },
    error: () => {
      cancelAnimationFrame(frame);
      patch({ status: "error" });
    }
  };

  /** React 19 ref callback: the returned cleanup runs when the element unmounts. */
  const attach = (el: HTMLAudioElement | null) => {
    element = el;
    if (!el) return;
    // volume and mute survive a remount: the snapshot's values go onto the new element
    el.volume = snapshot.volume;
    el.muted = snapshot.muted;
    for (const [type, handler] of Object.entries(handlers))
      el.addEventListener(type, handler);
    return () => {
      for (const [type, handler] of Object.entries(handlers))
        el.removeEventListener(type, handler);
      cancelAnimationFrame(frame);
      el.pause();
      el.removeAttribute("src");
      el.load();
      element = null;
      replace({
        ...IDLE_PLAYBACK,
        volume: snapshot.volume,
        muted: snapshot.muted
      });
    };
  };

  /** Points the element at `track` unless it already is; a track switch always restarts at 0. */
  const load = (track: PlaybackTrack) => {
    if (!element || snapshot.track?.id === track.id) return;
    cancelAnimationFrame(frame);
    element.src = track.src;
    replace({
      track,
      status: "loading",
      currentTime: 0,
      duration: track.duration,
      volume: snapshot.volume,
      muted: snapshot.muted
    });
  };

  const play = (track: PlaybackTrack) => {
    load(track);
    // `pause()` landing mid-`play()` rejects with AbortError; that is a
    // successful pause, not a media failure.
    void element?.play().catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
      patch({ status: "error" });
    });
  };

  const pause = () => element?.pause();

  const toggle = (track: PlaybackTrack) => {
    const current = snapshot.track?.id === track.id;
    if (
      current &&
      (snapshot.status === "playing" || snapshot.status === "loading")
    )
      pause();
    else play(track);
  };

  const seek = (track: PlaybackTrack, time: number) => {
    load(track);
    if (element) element.currentTime = time;
    patch({ currentTime: time });
  };

  /** Pause and rewind the loaded track; a no-op for any other. */
  const stop = (track: PlaybackTrack) => {
    if (!element || snapshot.track?.id !== track.id) return;
    cancelAnimationFrame(frame);
    element.pause();
    element.currentTime = 0;
    patch({ status: "paused", currentTime: 0 });
  };

  /** Writes the element; `volumechange` writes the snapshot. Raising it past 0 unmutes. */
  const setVolume = (volume: number) => {
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, volume));
    if (volume > 0) element.muted = false;
  };

  const toggleMute = () => {
    if (element) element.muted = !element.muted;
  };

  return {
    attach,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    play,
    pause,
    toggle,
    seek,
    stop,
    setVolume,
    toggleMute
  };
}
