"use client";

import type { ReactNode } from "react";
import { Footer } from "@/ui/footer";
import { Nav } from "@/ui/nav";

export function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="@max-9xl:mx-auto flex min-h-screen flex-col justify-center">
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
