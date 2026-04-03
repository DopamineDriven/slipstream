"use client";

import type { ButtonProps } from "@slipstream/ui";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, Copy } from "@slipstream/ui";
import { motion } from "motion/react";

export interface AnimatedCopyButtonProps
  extends Omit<ButtonProps, "onClick" | "children"> {
  textToCopy: string;
  initialIconSize?: number;
  className?: string;
  iconClassName?: string;
  copiedDuration?: number; // Duration in ms for the "copied" state
}

export function AnimatedCopyButton({
  textToCopy,
  initialIconSize = 14,
  className,
  iconClassName,
  variant = "ghost",
  size = "icon",
  copiedDuration = 1500, // Default to 1.5 seconds
  ...props
}: AnimatedCopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  const checkmarkPath = "M4 12.75L9 17.75L20 6.75";

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isCopied) {
      timeoutId = setTimeout(() => {
        setIsCopied(false);
      }, copiedDuration);
    }
    return () => clearTimeout(timeoutId);
  }, [isCopied, copiedDuration]);

  const handleCopy = () => {
    if (!textToCopy || isCopied) return; // Prevent re-copying while in "copied" state
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setIsCopied(true);
      })
      .catch(err => {
        console.error("Failed to copy:", err);
        // Optionally, provide user feedback for error
      });
  };

  const iconContainerClasses = cn(
    "absolute inset-0 flex items-center justify-center",
    iconClassName
  );

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("relative overflow-hidden", className)}
      onClick={handleCopy}
      aria-label={isCopied ? "Copied!" : "Copy to clipboard"}
      {...props}>
      {/* Copy Icon Container */}
      <motion.div
        className={iconContainerClasses}
        initial={{ opacity: 1, scale: 1 }}
        animate={
          !isCopied
            ? { opacity: 1, scale: 1, y: 0, pointerEvents: "auto" }
            : { opacity: 0, scale: 0.8, y: -5, pointerEvents: "none" }
        }
        transition={{ duration: 0.2, ease: "easeOut" }}>
        <Copy
          width={initialIconSize * 1.2}
          height={initialIconSize * 1.2}
          className="size-3.5"
        />
      </motion.div>
      <motion.div
        className={iconContainerClasses}
        initial={{ opacity: 0, scale: 0.8, y: 5, pointerEvents: "none" }}
        animate={
          isCopied
            ? { opacity: 1, scale: 1, y: 0, pointerEvents: "auto" }
            : { opacity: 0, scale: 0.8, y: 5, pointerEvents: "none" }
        }
        transition={{ duration: 0.2, ease: "easeOut" }}>
        <svg
          width={initialIconSize * 1.2}
          height={initialIconSize * 1.2}
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
    </Button>
  );
}
