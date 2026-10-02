"use client";

import type { PlaybackTrack } from "@/playback/store";
import { useId, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LyricsDrawer, LyricsToggle } from "@/ui/chat/lightbox/lyrics-reveal";
import { AudioPlayer } from "@/ui/chat/playback/audio-player";
import { motion } from "motion/react";
import { Eye } from "@slipstream/ui";

export interface InlineAudioGenProps {
  /** Undefined while compiling (lyrics landed, audio still uploading). */
  track?: PlaybackTrack | undefined;
  peaks?: readonly number[];
  subtitle?: string | undefined;
  /** The committed row's id; absent during the live window, so the Eye waits for commit. */
  attachmentId?: string | undefined;
  pendingLabel?: string;
  className?: string;

  lyrics?: string;
}

/**
 * An audio generation inline in the response. The player is a view onto the
 * shared element, so the song keeps playing through the Eye's handoff into the
 * lightbox. The entrance fade lives here, on the card, so the player can morph
 * from compiling to playable on one mount without replaying it.
 */
export function InlineAudioGen({
  track,
  peaks,
  subtitle,
  attachmentId,
  pendingLabel,
  className,
  lyrics
}: InlineAudioGenProps) {
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const drawerId = useId();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-card text-card-foreground border-border/60 flex w-full max-w-xl flex-col rounded-2xl border",
        className
      )}>
      <div className="flex items-center gap-3 p-3 pr-2">
        <div className="min-w-0 flex-1">
          <AudioPlayer
            size="sm"
            track={track}
            peaks={peaks}
            subtitle={subtitle}
            pendingLabel={pendingLabel}
            accessory={
              lyrics ? (
                <LyricsToggle
                  open={lyricsOpen}
                  controls={drawerId}
                  onToggle={() => setLyricsOpen(o => !o)}
                />
              ) : undefined
            }
          />
        </div>
        {attachmentId ? (
          <Link
            href={`/attachment/${attachmentId}`}
            scroll={false}
            aria-label={
              track ? `Open ${track.title} in lightbox` : "Open in lightbox"
            }
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-ring/50 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-3">
            <Eye className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {lyrics ? (
        <LyricsDrawer id={drawerId} open={lyricsOpen} lyrics={lyrics} />
      ) : null}
    </motion.div>
  );
}
