"use client";

import type { ChangeEvent } from "react";
import { useId, useMemo } from "react";
import { useMeasure } from "@/hooks/use-measure";
import { cn } from "@/lib/utils";
import { WAVEFORM_PEAK_SCALE } from "@slipstream/types";

/** 2px bar + 1px gap. */
const BAR_PITCH = 3;
const BAR_STROKE = 2;
const MIN_BARS = 24;

interface WaveFormScrubberProps {
  peaks: readonly number[];
  value: number;
  max: number | undefined;
  disabled: boolean;
  label: string;
  valueText: string;
  onChangeAction: (e: ChangeEvent<HTMLInputElement>) => void;
  height: number;
}

/**
 * The seek control. A native range input stays the interactive element (keyboard,
 * pointer, a11y all come for free); when the track has a persisted envelope it
 * turns transparent over an SVG that redraws the envelope at one bar per 3px,
 * taking the max of the buckets each bar covers so nothing is lost on the way
 * down from 1024. Played bars are clipped in `primary`.
 */
export function WaveformScrubber({
  peaks,
  value,
  max,
  disabled,
  label,
  valueText,
  onChangeAction,
  height
}: WaveFormScrubberProps) {
  const clipId = `clip-${useId().replace(/\W/g, "")}`;

  const { measure, width: measuredWidth } = useMeasure();

  const width = Math.floor(measuredWidth);

  const bars =
    width > 0 ? Math.max(MIN_BARS, Math.floor(width / BAR_PITCH)) : 0;

  const path = useMemo(() => {
    if (bars === 0 || peaks.length === 0) return "";
    const mid = height / 2;
    const reach = mid - BAR_STROKE / 2;
    const pitch = width / bars;
    const parts = Array.of<string>();
    for (let i = 0; i < bars; i++) {
      const from = Math.floor((i * peaks.length) / bars);
      const to = Math.max(
        from + 1,
        Math.floor(((i + 1) * peaks.length) / bars)
      );
      let peak = 0;
      for (let j = from; j < to; j++) {
        const v = peaks[j];
        if (v !== undefined && v > peak) peak = v;
      }
      const half = Math.max(0.5, (peak / WAVEFORM_PEAK_SCALE) * reach);
      const x = (i * pitch + pitch / 2).toFixed(1);
      parts.push(`M${x} ${(mid - half).toFixed(1)}V${(mid + half).toFixed(1)}`);
    }
    return parts.join("");
  }, [peaks, bars, width, height]);

  const input = (
    <input
      type="range"
      min={0}
      max={max ?? 0}
      step={0.1}
      value={Math.min(value, max ?? 0)}
      onChange={onChangeAction}
      aria-label={label}
      aria-valuetext={valueText}
      disabled={disabled}
      className={cn(
        "w-full cursor-pointer disabled:cursor-default",
        path
          ? "absolute inset-0 h-full opacity-0"
          : "accent-foreground h-1.5 disabled:opacity-50"
      )}
    />
  );

  if (peaks.length === 0) return input;

  const played =
    max !== undefined && max > 0 ? Math.min(1, value / max) * width : 0;

  return (
    <div
      ref={measure}
      style={{ height }}
      className="group has-focus-visible:ring-ring/50 relative w-full rounded-sm has-focus-visible:ring-2">
      {path ? (
        <svg
          aria-hidden="true"
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="block overflow-visible">
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={played} height={height} />
            </clipPath>
          </defs>
          <path
            d={path}
            fill="none"
            strokeWidth={BAR_STROKE}
            strokeLinecap="round"
            className="stroke-muted-foreground/40 group-hover:stroke-muted-foreground/60 transition-colors"
          />
          <path
            d={path}
            fill="none"
            strokeWidth={BAR_STROKE}
            strokeLinecap="round"
            clipPath={`url(#${clipId})`}
            className="stroke-foreground"
          />
        </svg>
      ) : null}
      {input}
    </div>
  );
}
