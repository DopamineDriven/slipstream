"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends ComponentPropsWithRef<"textarea"> {}

const Textarea = ({ ref, className, ...rest }: TextareaProps) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        `border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring font-inter flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50`,
        className
      )}
      {...rest}
    />
  );
};

Textarea.displayName = "Textarea";

export { Textarea, type TextareaProps };
