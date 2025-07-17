"use client"

import { cn } from "@/lib/utils"
import { useDynamicTruncation } from "@/hooks/use-dynamic-truncation"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/atoms/tooltip"

interface DynamicTruncatedTextProps {
  text: string
  className?: string
  maxLines?: number
  reservedSpace?: number
  minChars?: number
  showTooltip?: boolean
  tooltipSide?: "top" | "bottom" | "left" | "right"
}

export function DynamicTruncatedText({
  text,
  className,
  maxLines = 1,
  reservedSpace = 16, // Reduced default reserved space
  minChars = 8, // Minimum characters to show
  showTooltip = true,
  tooltipSide = "top",
}: DynamicTruncatedTextProps) {
  const { containerRef, measureRef, truncatedText, isTruncated, fullText } = useDynamicTruncation({
    text,
    maxLines,
    reservedSpace,
    minChars,
  })

  // Fallback for empty or very short text
  if (!text || text.length === 0) {
    return <span className={className}>Untitled</span>
  }

  const content = (
    <div className="relative w-full min-w-0">
      {/* Visible text */}
      <span
        ref={containerRef}
        className={cn(
          "block w-full overflow-hidden",
          maxLines === 1 ? "whitespace-nowrap" : `line-clamp-${maxLines}`,
          className,
        )}
      >
        {truncatedText}
        {isTruncated && "..."}
      </span>

      {/* Hidden measuring element */}
      <span
        ref={measureRef}
        className={cn("absolute invisible whitespace-nowrap pointer-events-none", className)}
        aria-hidden="true"
      />
    </div>
  )

  if (showTooltip && isTruncated) {
    return (
      <TooltipProvider delayDuration={500}>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent
            side={tooltipSide}
            className="max-w-xs bg-brand-component text-brand-text border-brand-border"
          >
            <p className="text-sm break-words">{fullText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return content
}
