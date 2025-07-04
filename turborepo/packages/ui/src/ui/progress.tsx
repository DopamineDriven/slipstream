"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import * as ProgressPrimitive from "@radix-ui/react-progress";

type ProgressProps = ComponentPropsWithRef<typeof ProgressPrimitive.Root>;

const Progress = ({ className, value, ref, ...props }: ProgressProps) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "bg-secondary relative h-4 w-full overflow-hidden rounded-full",
      className
    )}
    {...props}>
    <ProgressPrimitive.Indicator
      className="bg-primary h-full w-full flex-1 transition-all"
      style={{
        transform: value
          ? `translateX(-${100 - value}%)`
          : `translateX(-${100}%)`
      }}
    />
  </ProgressPrimitive.Root>
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress, type ProgressProps };
