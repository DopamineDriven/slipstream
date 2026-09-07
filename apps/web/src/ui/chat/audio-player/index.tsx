"use client";

/**
 * Standalone compact audio player — the lyria (audioGen) playback surface.
 * Single-row transport: play/pause + stop, seek slider with tabular times,
 * hover-expanding volume cluster, blob-first download. `durationMs`
 * (Attachment.audio.duration — exact, from the server-side mp3 frame walk)
 * pre-paints the timeline before the element loads metadata; the element's
 * own duration takes over once known. The <audio> src is attribute-managed
 * so play/pause never resets position; CloudFront/S3 serve Range requests
 * natively so arbitrary seeking works.
 *
 * `src` is optional — while undefined the SAME mounted row renders its
 * compiling state (the hasLyrics && !hasAudio window upstream): ghosted
 * transport with a "sit tight, audio compiling…" shimmer occupying the seek
 * lane. Lyria delivers the full lyric sheet well before the AudioDelta
 * finishes accumulating + uploading to S3, and when the cdnUrl lands the
 * controls enable and the overlay cross-fades into the slider — a pure
 * prop/class morph on one mount, so the entrance animation never replays.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  Button,
  Download,
  Pause,
  Play,
  Slider,
  Stop,
  Volume,
  VolumeMuted
} from "@slipstream/ui";

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || Number.isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export interface AudioPlayerProps {
  /** CDN url of the generated track — undefined while it's still compiling server-side */
  src?: string;
  /** exact duration from Attachment.audio.duration — pre-paints the timeline */
  durationMs?: number;
  /** compiling-state microcopy */
  pendingLabel?: string;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
}

export function AudioPlayer({
  src,
  durationMs,
  pendingLabel = "sit tight, audio compiling…",
  className,
  onPlay,
  onPause,
  onEnded
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const isPending = !src;

  useEffect(() => {
    if (durationMs) {
      setDuration(durationMs / 1000);
    }
  }, [durationMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handlePlay = () => {
      setIsPlaying(true);
      onPlay?.();
    };
    const handlePause = () => {
      setIsPlaying(false);
      onPause?.();
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onEnded?.();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("loadedmetadata", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("loadedmetadata", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [onPlay, onPause, onEnded]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const handleStop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
  }, []);

  const handleSeek = useCallback((values: number[]) => {
    const audio = audioRef.current;
    const nextTime = values[0];
    if (audio && typeof nextTime === "number" && Number.isFinite(nextTime)) {
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
    }
  }, []);

  const handleVolumeChange = useCallback((values: number[]) => {
    const nextVolume = values[0];
    if (typeof nextVolume !== "number") return;
    setVolume(nextVolume);
    if (nextVolume > 0) {
      setIsMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => setIsMuted(prev => !prev), []);

  // blob-first download: a real .mp3 save whenever the CDN's CORS allows the
  // fetch; otherwise fall back to the imgGen-canvas behavior — an anchor whose
  // cross-origin `download` attr is ignored, opening the cdnUrl in a new tab
  const handleDownload = useCallback(() => {
    if (!src) return;
    const filename =
      src.split("/").at(-1)?.split("?")[0] || `generated-${Date.now()}.mp3`;
    const fallbackOpen = () => {
      const link = document.createElement("a");
      link.href = src;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.download = filename;
      link.click();
    };
    void (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) {
          fallbackOpen();
          return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(objectUrl);
      } catch {
        fallbackOpen();
      }
    })();
  }, [src]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      aria-busy={isPending}
      className={cn(
        "bg-card/80 flex items-center gap-2 rounded-lg border px-3 py-2 backdrop-blur-sm",
        className
      )}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <Button
        variant="ghost"
        size="icon"
        onClick={handlePlayPause}
        disabled={isPending}
        className={cn("size-8 rounded-full", isPlaying && "text-primary")}
        title={isPending ? pendingLabel : isPlaying ? "Pause" : "Play"}>
        {isPlaying ? <Pause /> : <Play />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleStop}
        disabled={isPending || (!isPlaying && currentTime === 0)}
        className="text-muted-foreground hover:text-foreground size-8"
        title="Stop">
        <Stop />
      </Button>

      <span
        className={cn(
          "text-muted-foreground text-xs tabular-nums",
          isPending && "opacity-50"
        )}>
        {formatAudioTime(currentTime)}
      </span>

      <div className="relative flex min-w-0 flex-1 items-center">
        <Slider
          value={[currentTime]}
          min={0}
          max={duration || 1}
          step={0.1}
          onValueChange={handleSeek}
          className={cn(
            "w-full cursor-pointer transition-opacity duration-300",
            isPending && "pointer-events-none opacity-0"
          )}
          aria-label="Seek"
        />
        {/* compiling overlay — holds the seek lane, class-fades out when src lands */}
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center transition-opacity duration-300",
            isPending ? "opacity-100" : "opacity-0"
          )}>
          <div className="bg-muted/60 relative h-1.5 w-full overflow-hidden rounded-full">
            {isPending && (
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
            {isPending ? pendingLabel : ""}
          </span>
        </div>
      </div>

      <span
        className={cn(
          "text-muted-foreground text-xs tabular-nums",
          isPending && "opacity-50"
        )}>
        {isPending ? "--:--" : formatAudioTime(duration)}
      </span>

      <div
        className="relative flex items-center"
        onMouseEnter={() => !isPending && setShowVolumeSlider(true)}
        onMouseLeave={() => setShowVolumeSlider(false)}>
        <motion.div
          initial={false}
          animate={{
            width: showVolumeSlider ? 72 : 0,
            opacity: showVolumeSlider ? 1 : 0
          }}
          className="overflow-hidden">
          <Slider
            value={[isMuted ? 0 : volume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={handleVolumeChange}
            className="mr-2 w-16"
            aria-label="Volume"
          />
        </motion.div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          disabled={isPending}
          className="text-muted-foreground hover:text-foreground size-8"
          title={isMuted ? "Unmute" : "Mute"}>
          {isMuted || volume === 0 ? <VolumeMuted /> : <Volume />}
        </Button>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleDownload}
        disabled={isPending}
        className="text-muted-foreground hover:text-foreground size-8"
        title="Download audio">
        <Download />
      </Button>
    </motion.div>
  );
}
