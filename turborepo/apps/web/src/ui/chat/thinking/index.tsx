"use client";

import type { Properties } from "csstype";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Sparkles
} from "@t3-chat-clone/ui";

interface ThinkingSectionProps {
  thinkingContent?: ReactNode;
  isStreaming?: boolean;
  duration?: number;
  className?: string;
}

export function ThinkingSection({
  thinkingContent,
  isStreaming = false,
  duration = 0,
  className
}: ThinkingSectionProps) {
  const [value, setValue] = useState<string | undefined>(undefined);
  const isExpanded = value === "thinking";

  return (
    <div className={cn("border-foreground/80 my-3 border-l-2 pl-4", className)}>
      <Accordion
        type="single"
        value={value}
        onValueChange={setValue}
        collapsible
        className="w-full">
        <AccordionItem value="thinking" className="border-none">
          <AccordionTrigger className="text-foreground/80 hover:text-foreground justify-start px-0 py-2 text-left hover:no-underline [&>svg]:hidden">
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
              <Sparkles
                className={cn(
                  "h-4 w-4 flex-shrink-0",
                  isStreaming && "animate-floating-bob"
                )}
                style={{ "--bob-multiplier": 1.2 }}
              />
              <span className="text-sm">
                Thought for {Math.round(duration/1000)} seconds...
                <span className="sr-only">
                  {isExpanded ? " - Hide thinking" : " - Show thinking"}
                </span>
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <div className="mt-3 text-sm whitespace-pre-wrap">
              <div className="text-foreground/85 leading-relaxed">
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
