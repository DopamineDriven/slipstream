"use client";

import type { PlaybackTrack } from "@/playback/store";
import type { ChangeEvent } from "react";
import { usePlaybackContext } from "@/context/playback-context";
import { usePlaybackValue } from "@/hooks/use-playback-value";
import { useTrackPlayback } from "@/hooks/use-track-playback";
import { downloadAsset, fileDownloadName, formatDuration } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import { WaveformScrubber } from "@/ui/chat/waveform";
import { motion } from "motion/react";
import {
  BaseButton as Button,
  Download,
  Pause,
  Play,
  Stop,
  Volume,
  VolumeMuted
} from "@slipstream/ui";

const NO_PEAKS = Object.freeze(Array.of<number>());

export interface AudioPlayerProps {
  /**
   * Undefined while the track is still compiling server-side (lyrics landed,
   * audio still uploading): the same mounted row renders ghosted with the
   * shimmer over the seek lane, and morphs in place when the track lands.
   */
  track?: PlaybackTrack | undefined;
  /** Persisted envelope (`audio.waveformPeaks`); empty falls back to a plain slider. */
  peaks?: readonly number[];
  subtitle?: string | undefined;
  /** Compiling-state microcopy over the seek lane. */
  pendingLabel?: string;
  size?: "sm" | "lg";
  className?: string;
}

/**
 * A view onto the element in `PlaybackProvider`. Several instances for the
 * same track (feed card, lightbox, full page) show one timeline; none of
 * them owns an `<audio>`, so opening the lightbox mid-song is seamless.
 * Volume and mute are element-level and sit beside the title, not the track.
 */
export function AudioPlayer({
  track,
  peaks = NO_PEAKS,
  subtitle,
  pendingLabel = "",
  size = "lg",
  className
}: AudioPlayerProps) {
  const { toggle, seek, stop, setVolume, toggleMute } = usePlaybackContext();
  const { status, time, duration } = useTrackPlayback(track?.id);
  const volume = usePlaybackValue(s => s.volume);
  const muted = usePlaybackValue(s => s.muted);

  const pending = track === undefined;
  const total = duration ?? track?.duration;
  const active = status === "playing" || status === "loading";
  const large = size === "lg";
  const laneHeight = large ? 48 : 28;
  const ghostSize = large ? "icon" : "icon-sm";

  const onToggle = () => {
    if (track) toggle(track);
  };
  const onStop = () => {
    if (track) stop(track);
  };
  const onSeek = (e: ChangeEvent<HTMLInputElement>) => {
    if (track) seek(track, Number(e.currentTarget.value));
  };
  const onVolume = (e: ChangeEvent<HTMLInputElement>) =>
    setVolume(Number(e.currentTarget.value));
  const onDownload = () => {
    if (track) void downloadAsset(track.src, fileDownloadName(track.src));
  };

  return (
    <div
      aria-busy={pending}
      className={cn("flex items-center", large ? "gap-4" : "gap-3", className)}>
      <div
        className={cn("flex shrink-0 items-center", large ? "gap-2" : "gap-1")}>
        <Button
          variant="default"
          size={large ? "icon-lg" : "icon"}
          onClick={onToggle}
          disabled={pending}
          aria-label={
            track
              ? `${active ? "Pause" : "Play"} ${track.title}`
              : pendingLabel || "Audio compiling"
          }
          title={track ? (active ? "Pause" : "Play") : pendingLabel}
          className={cn(
            "hover:bg-primary/90 rounded-full",
            large ? "size-14" : "size-9",
            status === "loading" && "animate-pulse"
          )}>
          {active ? (
            <Pause className={large ? "size-6" : "size-4"} />
          ) : (
            <Play
              className={cn("translate-x-px", large ? "size-6" : "size-4")}
            />
          )}
        </Button>
        <Button
          variant="ghost"
          size={ghostSize}
          onClick={onStop}
          disabled={pending || (!active && time === 0)}
          aria-label="Stop"
          title="Stop"
          className="text-muted-foreground hover:text-foreground rounded-full">
          <Stop />
        </Button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <p
            className={cn(
              "min-w-0 flex-1 truncate font-medium",
              large ? "min-h-6 text-base" : "min-h-5 text-sm",
              pending && "text-muted-foreground"
            )}>
            {track?.title}
          </p>
          {subtitle ? (
            <p className="text-muted-foreground shrink-0 font-mono text-xs">
              {subtitle}
            </p>
          ) : null}
          <div className="group/vol flex shrink-0 items-center">
            <div
              className={cn(
                "flex w-0 items-center overflow-hidden opacity-0 transition-[width,opacity] duration-200",
                !pending &&
                  "group-focus-within/vol:w-18 group-focus-within/vol:opacity-100 group-hover/vol:w-18 group-hover/vol:opacity-100"
              )}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={onVolume}
                disabled={pending}
                aria-label="Volume"
                className="accent-foreground mr-2 h-1.5 w-16 cursor-pointer disabled:cursor-default"
              />
            </div>
            <Button
              variant="ghost"
              size={ghostSize}
              onClick={toggleMute}
              disabled={pending}
              aria-label={muted ? "Unmute" : "Mute"}
              title={muted ? "Unmute" : "Mute"}
              className="text-muted-foreground hover:text-foreground">
              {muted || volume === 0 ? <VolumeMuted /> : <Volume />}
            </Button>
          </div>
          <Button
            variant="ghost"
            size={ghostSize}
            onClick={onDownload}
            disabled={pending}
            aria-label="Download audio"
            title="Download audio"
            className="text-muted-foreground hover:text-foreground">
            <Download />
          </Button>
        </div>

        {/* the lane holds its height in both states, so landing never shifts the row */}
        <div
          style={{ height: laneHeight }}
          className="relative flex items-center">
          <div
            className={cn(
              "w-full transition-opacity duration-300",
              pending && "pointer-events-none opacity-0"
            )}>
            <WaveformScrubber
              peaks={peaks}
              value={time}
              max={total}
              disabled={pending || total === undefined}
              label={track ? `Seek ${track.title}` : "Seek"}
              valueText={`${formatDuration(time)} of ${formatDuration(total)}`}
              onChangeAction={onSeek}
              height={laneHeight}
            />
          </div>
          {/* compiling overlay — class-fades out when the track lands, on the same mount */}
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center transition-opacity duration-300",
              pending ? "opacity-100" : "opacity-0"
            )}>
            <div className="bg-muted/60 relative h-1.5 w-full overflow-hidden rounded-full">
              {pending && (
                <motion.div
                  className="via-primary/60 absolute inset-y-0 w-1/3 rounded-full bg-linear-to-r from-transparent to-transparent"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{
                    duration: 1.4,
                    ease: "easeInOut",
                    repeat: Infinity
                  }}
                />
              )}
            </div>
            <span className="text-muted-foreground animate-shimmer absolute inset-x-0 truncate text-center text-xs">
              {pending ? pendingLabel : ""}
            </span>
          </div>
        </div>

        <div className="text-muted-foreground flex justify-between font-mono text-[11px] tabular-nums">
          <span className={cn(pending && "opacity-50")}>
            {formatDuration(time)}
          </span>
          <span className={cn(pending && "opacity-50")}>
            {status === "error" ? "unavailable" : formatDuration(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
