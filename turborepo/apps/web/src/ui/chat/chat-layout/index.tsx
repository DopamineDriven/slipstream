"use client";

import type { ReactNode } from "react";

export function ChatLayoutClient({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bg-background text-foreground w-screen h-screen overflow-hidden">
      <div className="flex w-full flex-grow flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
