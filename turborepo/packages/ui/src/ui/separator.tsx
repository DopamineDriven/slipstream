"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

interface SeparatorProps
  extends React.ComponentPropsWithRef<typeof SeparatorPrimitive.Root> {}

const Separator = ({
  className,
  orientation = "horizontal",
  ref,
  decorative = true,
  ...props
}: SeparatorProps) => {
  const orientationMemo = React.useMemo(
    () => (orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]"),
    [orientation]
  );
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn("bg-border shrink-0", orientationMemo, className)}
      {...props}
    />
  );
};

Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator, type SeparatorProps };
