"use client";

import type { ReactNode } from "react";

export function ChatLayoutClient({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bg-background text-foreground h-screen w-screen overflow-hidden">
      {children}
    </div>
  );
}
