"use client";

import type { ReactNode } from "react";

export function ChatLayoutClient({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bg-background text-foreground h-full w-full overflow-hidden">
      {children}
    </div>
  );
}
