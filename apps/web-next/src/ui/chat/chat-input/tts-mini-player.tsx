"use client";

import { useCallback, useMemo } from "react";
import { useTTSContext } from "@/context/tts-context";
import { cn } from "@/lib/utils";
import { Button, Pause, Play, Stop } from "@slipstream/ui";

export function TTSMiniPlayer() {
  const tts = useTTSContext();

  const isVisible = tts.isPlaying || tts.isGenerating;

  const handlePlayPause = useCallback(() => {
    if (tts.isGenerating) return;
    if (tts.isPlaying) {
      tts.pause();
    } else if (tts.currentPlaybackMessageId) {
      tts.play(tts.currentPlaybackMessageId);
    }
  }, [tts]);

  const handleStop = useCallback(() => {
    tts.stop();
  }, [tts]);

  const canPause = useMemo(
    () => !tts.isGenerating && tts.isPlaying,
    [tts.isGenerating, tts.isPlaying]
  );

  if (!isVisible) return null;

  return (
    <div className="mx-auto w-full max-w-3xl pt-2">
      <div
        className={cn(
          "bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-1.5",
          tts.isGenerating && "animate-pulse"
        )}>
        <Button
          variant="ghost"
          size="icon"
          disabled={!canPause}
          className="size-7 bg-transparent p-0"
          onClick={handlePlayPause}>
          {tts.isPlaying ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </Button>

        <span className="text-muted-foreground flex-1 text-xs">
          {tts.isGenerating ? "Generating audio..." : "Playing audio"}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-7 bg-transparent p-0"
          onClick={handleStop}>
          <Stop className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
