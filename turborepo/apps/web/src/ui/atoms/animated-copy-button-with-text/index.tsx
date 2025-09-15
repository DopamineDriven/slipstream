"use client";

import type { ButtonProps } from "@slipstream/ui";
import type React from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, Copy } from "@slipstream/ui";
import { motion } from "motion/react";

export interface AnimatedCopyButtonWithTextProps
  extends Omit<ButtonProps, "onClick"> {
  textToCopy: string;
  children: React.ReactNode;
  iconSize?: number;
  className?: string;
  copiedDuration?: number;
  onCopyComplete?: () => void;
}

export function AnimatedCopyButtonWithText({
  textToCopy,
  children,
  iconSize = 20,
  className,
  variant = "ghost",
  copiedDuration = 1500,
  onCopyComplete,
  ...props
}: AnimatedCopyButtonWithTextProps) {
  const [isCopied, setIsCopied] = useState(false);
  const checkmarkPath = "M4 12.75L9 17.75L20 6.75";

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isCopied) {
      timeoutId = setTimeout(() => {
        setIsCopied(false);
        onCopyComplete?.();
      }, copiedDuration);
    }
    return () => clearTimeout(timeoutId);
  }, [isCopied, copiedDuration, onCopyComplete]);

  const handleCopy = () => {
    if (!textToCopy || isCopied) return;

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setIsCopied(true);
      })
      .catch(err => {
        console.error("Failed to copy:", err);
      });
  };

  return (
    <Button
      variant={variant}
      className={cn("relative", className)}
      onClick={handleCopy}
      aria-label={isCopied ? "Copied!" : "Copy to clipboard"}
      {...props}>
      {/* Icon Container */}
      <div className="relative mr-3 flex h-5 w-5 items-center justify-center">
        {/* Copy Icon */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 1, scale: 1 }}
          animate={
            !isCopied
              ? { opacity: 1, scale: 1, y: 0, pointerEvents: "auto" }
              : { opacity: 0, scale: 0.8, y: -5, pointerEvents: "none" }
          }
          transition={{ duration: 0.2, ease: "easeOut" }}>
          <Copy width={iconSize} height={iconSize} />
        </motion.div>

        {/* Checkmark Icon */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.8, y: 5, pointerEvents: "none" }}
          animate={
            isCopied
              ? { opacity: 1, scale: 1, y: 0, pointerEvents: "auto" }
              : { opacity: 0, scale: 0.8, y: 5, pointerEvents: "none" }
          }
          transition={{ duration: 0.2, ease: "easeOut" }}>
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap={isCopied ? "round" : "butt"}
            strokeLinejoin="round">
            <motion.path
              d={checkmarkPath}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: isCopied ? 1 : 0 }}
              transition={{
                pathLength: {
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                  duration: isCopied ? 0.4 : 0.25
                }
              }}
            />
          </svg>
        </motion.div>
      </div>

      {/* Text Content */}
      {children}
    </Button>
  );
}
