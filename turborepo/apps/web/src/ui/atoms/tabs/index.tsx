"use client";

import type { ComponentPropsWithRef } from "react";
import React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

type TabsProps<T extends "Root" | "List" | "Content" | "Trigger"> = {
  [P in T]: ComponentPropsWithRef<(typeof TabsPrimitive)[P]>;
}[T];

const Tabs = ({ ref, children, ...props }: TabsProps<"Root">) => (
  <TabsPrimitive.Root ref={ref} {...props}>
    {children}
  </TabsPrimitive.Root>
);

Tabs.displayName = TabsPrimitive.Tabs.displayName;

const TabsList = ({ className, ref, ...props }: TabsProps<"List">) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1",
      className
    )}
    {...props}
  />
);

TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = ({ className, ref, ...props }: TabsProps<"Trigger">) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
);

TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = ({ className, ref, ...props }: TabsProps<"Content">) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-ring mt-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      className
    )}
    {...props}
  />
);

TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent, type TabsProps };
