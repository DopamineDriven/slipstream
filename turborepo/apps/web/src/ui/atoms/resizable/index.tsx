"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { GripVertical } from "@slipstream/ui";
import * as ResizablePrimitive from "react-resizable-panels";

type ResizablePanelProps<
  T extends "PanelResizeHandle" | "PanelGroup" | "Panel"
> = T extends "PanelResizeHandle"
  ? {
      [P in T]: ComponentPropsWithRef<(typeof ResizablePrimitive)[P]>;
    }[T] & { withHandle?: boolean }
  : { [P in T]: ComponentPropsWithRef<(typeof ResizablePrimitive)[P]> }[T];

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePanelProps<"PanelGroup">) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: ResizablePanelProps<"Panel">) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePanelProps<"PanelResizeHandle">) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      {...props}>
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVertical className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  );
}

export {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  type ResizablePanelProps
};
