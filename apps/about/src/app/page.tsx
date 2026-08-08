import { CursorDot } from "@/ui/cursor-dot";
import { SiteFooter } from "@/ui/footer";
import { Hero } from "@/ui/hero";
import { Metrics } from "@/ui/metrics";
import { Philosophy } from "@/ui/philosophy";
import { Surfaces } from "@/ui/surfaces";

export default function Page() {
  return (
    <>
      <CursorDot />
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
