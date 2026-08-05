import { SiteFooter } from "@/ui/footer";
import { Hero } from "@/ui/hero";
import { Metrics } from "@/ui/metrics";
import { Philosophy } from "@/ui/philosophy";
import { Surfaces } from "@/ui/surfaces";

export default function Page() {
  return (
    <>
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
