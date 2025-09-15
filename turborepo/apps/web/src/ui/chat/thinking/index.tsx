"use client";

import type { Properties } from "csstype";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useCookiesCtx } from "@/context/cookie-context";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Sparkles
} from "@slipstream/ui";
import { AnimateNumber } from "motion-plus/react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";

interface ThinkingSectionProps {
  thinkingContent?: ReactNode;
  isStreaming?: boolean;
  duration?: number;
  className?: string;
  isThinking?: boolean;
}

export function ThinkingSection({
  thinkingContent,
  isStreaming = false,
  duration,
  className,
  isThinking = false
}: ThinkingSectionProps) {
  const [value, setValue] = useState<string | undefined>(undefined);
  const isExpanded = value === "thinking";
  const [displayDuration, setDisplayDuration] = useState(0);
  const startTimeRef = useRef<number | undefined>(undefined);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(0);
  useEffect(() => {
    if (isThinking) {
      if (!startTimeRef.current) {
        startTimeRef.current = performance.now();
        setDisplayDuration(0);
      }

      const updateDuration = (currentTime: number) => {
        if (startTimeRef.current) {
          const elapsed = currentTime - startTimeRef.current;
          const seconds = elapsed / 1000;

          // Update every ~100ms for smooth animation without overwhelming the component
          if (currentTime - lastUpdateRef.current >= 100) {
            setDisplayDuration(seconds);
            lastUpdateRef.current = currentTime;
          }

          animationFrameRef.current = requestAnimationFrame(updateDuration);
        }
      };

      animationFrameRef.current = requestAnimationFrame(updateDuration);
    } else {
      // Stop the animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }

      // Set final duration if provided
      if (typeof duration !== "undefined") {
        setDisplayDuration(duration / 1000);
      }

      // Reset for next thinking session
      startTimeRef.current = undefined;
      lastUpdateRef.current = 0;
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isThinking, duration]);
  const { resolvedTheme } = useTheme();
  const { get } = useCookiesCtx();

  const locale = get("locale") ?? "en-US";

  return (
    <div
      className={cn(
        resolvedTheme === "light"
          ? "border-[#fafafa]/90"
          : "border-foreground/80",
        "my-3 border-l-2 pl-4",
        className
      )}>
      <Accordion
        type="single"
        value={value}
        onValueChange={setValue}
        collapsible
        className="w-full">
        <AccordionItem value="thinking" className="border-none">
          <AccordionTrigger
            className={cn(
              resolvedTheme === "light"
                ? "text-[#fafafa]/95 hover:text-[#fafafa]"
                : "text-foreground/80 hover:text-foreground",
              "justify-start px-0 py-2 text-left hover:no-underline [&>svg]:hidden"
            )}>
            <div className="flex items-center gap-2">
              <motion.svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0"
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20
                }}>
                <path d="m9 18 6-6-6-6" />
              </motion.svg>
              <motion.div
                animate={{
                  rotate: isThinking ? 360 : 0,
                  scale: isThinking ? [1, 1.1, 1] : 1
                }}
                transition={{
                  rotate: {
                    duration: 2,
                    repeat: isThinking ? Number.POSITIVE_INFINITY : 0,
                    ease: "linear"
                  },
                  scale: {
                    duration: 1.5,
                    repeat: isThinking ? Number.POSITIVE_INFINITY : 0,
                    ease: "easeInOut"
                  }
                }}>
                <Sparkles className="h-4 w-4 flex-shrink-0" />
              </motion.div>
              <span className="flex items-center gap-1 text-sm">
                <span>{isThinking ? "Thinking for" : "Thought for"}</span>
                <AnimateNumber
                  format={{
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1
                  }}
                  locales={locale}
                  className="font-mono tabular-nums"
                  transition={{
                    type: "spring",
                    bounce: 0.1,
                    duration: 0.3,
                    visualDuration: isThinking ? 0.2 : 0.4
                  }}>
                  {displayDuration}
                </AnimateNumber>
                <span>seconds...</span>
                <span className="sr-only">
                  {isExpanded ? " - Hide thinking" : " - Show thinking"}
                </span>
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <div className="mt-3 text-sm whitespace-pre-wrap">
              <div
                className={cn(
                  resolvedTheme === "light"
                    ? "leading-relaxed text-[#fafafa]"
                    : "text-foreground/85 leading-relaxed"
                )}>
                {typeof thinkingContent === "string" ? (
                  <span className="whitespace-pre-wrap">{thinkingContent}</span>
                ) : (
                  thinkingContent
                )}
                {/* Add streaming cursor only when actively streaming */}
                {isStreaming && (
                  <span className="bg-primary/70 ml-1 inline-block h-4 w-2 animate-pulse" />
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

declare module "react" {
  export interface CSSProperties extends Properties<string | number> {
    "--bob-multiplier"?: number;
  }
}
