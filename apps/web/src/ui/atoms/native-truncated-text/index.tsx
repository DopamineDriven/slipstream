"use client";

import { useAspectCh } from "@/hooks/use-aspect-ch";
import { cn } from "@/lib/utils";

interface NativeTruncatedTextProps {
  text: string;
  className?: string;
  baseChars?: number;
  maxExtraChars?: number;
}

// Your calculated aspect ratios for 15" laptop
const MIN_ASPECT_RATIO = 229.8 / 799.6; // ≈ 0.2873
const MAX_ASPECT_RATIO = 383 / 799.6; // ≈ 0.4790

export function NativeTruncatedText({
  text,
  className,
  baseChars = 20,
  maxExtraChars = 4
}: NativeTruncatedTextProps) {
  const { ref, chars } = useAspectCh({
    baseChars,
    minAspectRatio: MIN_ASPECT_RATIO,
    maxAspectRatio: MAX_ASPECT_RATIO,
    maxExtraChars
  });

  // Simple check if text would be truncated at current char count
  const isTruncated = text.length > chars;

  return (
    <span
      ref={ref}
      className={cn("block w-full truncate", className)}
      style={{ maxWidth: `${chars}ch` }}
      title={isTruncated ? text : undefined} // Native browser tooltip
    >
      {text}
    </span>
  );
}
