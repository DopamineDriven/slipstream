"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatElapsed } from "@/ui/chat/stt/utils";
import {
  motion,
  motionValue,
  useAnimationFrame,
  useReducedMotion
} from "motion/react";
import { IconButton, X } from "@slipstream/ui";

const MAX_BARS = 120;
const MIN_BARS = 24;
const BAR_SLOT_WIDTH = 7;
const HISTORY_STEP_MS = 48;
const REST_SCALE = 0.08;
const TIMER_DECIMALS = 1;

interface SpeechWaveformProps {
  readLevel: () => number;
  interim: string;
  languageName: string;
  startedAt: number | null;
  transcriptionAvailable: boolean;
  onDiscard: () => void;
}

export function SpeechWaveform({
  readLevel,
  interim,
  languageName,
  startedAt,
  transcriptionAvailable,
  onDiscard
}: SpeechWaveformProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [barCount, setBarCount] = useState(MIN_BARS);
  const scales = useMemo(
    () => Array.from({ length: MAX_BARS }, () => motionValue(REST_SCALE)),
    []
  );
  const opacities = useMemo(
    () => Array.from({ length: MAX_BARS }, () => motionValue(0.3)),
    []
  );
  const historyRef = useRef(new Float32Array(MAX_BARS));
  const smoothedRef = useRef(0);
  const lastStepRef = useRef(0);
  const timerRef = useRef<HTMLSpanElement>(null);
  const timerTextRef = useRef("");
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const fitted = Math.floor(entry.contentRect.width / BAR_SLOT_WIDTH);
      setBarCount(Math.min(MAX_BARS, Math.max(MIN_BARS, fitted)));
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  useAnimationFrame(time => {
    if (startedAt !== null && timerRef.current) {
      const text = formatElapsed(performance.now() - startedAt);
      if (text !== timerTextRef.current) {
        timerTextRef.current = text;
        timerRef.current.textContent = text;
      }
    }

    const level = readLevel();
    const previous = smoothedRef.current;
    // Fast attack and slower release keep syllables punchy without flicker.
    const rate = level > previous ? 0.55 : 0.16;
    const smoothed = previous + (level - previous) * rate;
    smoothedRef.current = smoothed;

    if (reducedMotion) {
      for (let index = 0; index < barCount; index += 1) {
        const position = barCount === 1 ? 0.5 : index / (barCount - 1);
        const contour = 0.3 + 0.7 * Math.sin(Math.PI * position);
        scales[index]?.set(REST_SCALE + contour * smoothed * (1 - REST_SCALE));
        opacities[index]?.set(0.35 + 0.65 * smoothed);
      }
      return;
    }

    const history = historyRef.current;
    if (time - lastStepRef.current >= HISTORY_STEP_MS) {
      lastStepRef.current = time;
      history.copyWithin(0, 1, barCount);
    }
    history[barCount - 1] = smoothed;
    for (let index = 0; index < barCount; index += 1) {
      // a zero is a resting bar, not the end of the history — the buffer
      // starts empty and the newest sample lands at the far right
      const value = history[index] ?? 0;
      const position = barCount === 1 ? 1 : index / (barCount - 1);
      scales[index]?.set(REST_SCALE + value * (1 - REST_SCALE));
      opacities[index]?.set((0.25 + 0.75 * position) * (0.45 + 0.55 * value));
    }
  });

  return (
    <motion.section
      aria-label="Voice input"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="bg-background text-foreground absolute inset-0 flex flex-col justify-between gap-1.5 rounded-t-[15px] px-5 py-2.5 [@media(width<=767px)]:px-4">
      <div className="flex items-center justify-between gap-3 text-xs">
        <p className="text-muted-foreground flex min-w-0 items-center gap-2">
          <span className="relative flex size-2 shrink-0" aria-hidden="true">
            <motion.span
              className="bg-primary absolute inset-0 rounded-full"
              animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
            />
            <span className="bg-primary relative size-2 rounded-full" />
          </span>
          <span role="status" className="sr-only">
            Listening for speech in {languageName}
          </span>
          <span className="text-foreground" aria-hidden="true">
            Listening
          </span>
          <span aria-hidden="true">·</span>
          <span className="truncate" aria-hidden="true">
            {languageName}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <span
            ref={timerRef}
            className="text-muted-foreground font-mono tabular-nums">
            {formatElapsed(0, TIMER_DECIMALS)}
          </span>
          <IconButton
            // inside the chat <form>: a button without a type submits it
            type="button"
            label="Discard recording"
            onClick={onDiscard}
            className="size-6 min-h-6 rounded-md">
            <X className="size-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div
        ref={trackRef}
        aria-hidden="true"
        className="relative flex min-h-9 flex-1 items-stretch justify-between mask-[linear-gradient(to_right,transparent,#000_14%)]">
        <span className="bg-border absolute inset-x-0 top-1/2 h-px -translate-y-1/2" />
        {scales.slice(0, barCount).map((scale, index) => {
          const position = barCount === 1 ? 1 : index / (barCount - 1);
          const primaryMix = Math.round(position * position * 100);
          return (
            <motion.span
              key={index}
              className="w-0.75 rounded-full"
              style={{
                scaleY: scale,
                opacity: opacities[index],
                backgroundColor: `color-mix(in srgb, var(--color-primary) ${primaryMix}%, var(--color-foreground))`
              }}
            />
          );
        })}
      </div>

      <p className="flex justify-end overflow-hidden text-sm whitespace-nowrap">
        {interim ? (
          <span className="text-foreground">{interim}</span>
        ) : (
          <span className="text-muted-foreground">
            {transcriptionAvailable
              ? "Start speaking — your words land here."
              : "Live transcription isn't available in this browser."}
          </span>
        )}
      </p>
    </motion.section>
  );
}
