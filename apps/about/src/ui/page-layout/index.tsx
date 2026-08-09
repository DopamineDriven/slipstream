"use client";

import { useCookiesCtx } from "@/context/cookie-context";
import { CursorDot } from "@/ui/cursor-dot";
import { SiteFooter } from "@/ui/footer";
import { Hero } from "@/ui/hero";
import { Metrics } from "@/ui/metrics";
import { Philosophy } from "@/ui/philosophy";
import { Surfaces } from "@/ui/surfaces";

export function PageLayout() {
  const { getTargeted } = useCookiesCtx();
  const { viewport } = getTargeted(["viewport"]);

  return (
    <>
      {viewport === "desktop" && <CursorDot />}
      <Hero />
      <main>
        <Metrics />
        <Philosophy />
        <Surfaces />
      </main>
      <SiteFooter />
    </>
  );
}
