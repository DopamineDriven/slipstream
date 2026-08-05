import { Reveal } from "@/ui/reveal";
import { StatNumber } from "@/ui/stat-number";

export function Metrics() {
  return (
    <section
      aria-labelledby="proof-heading"
      className="border-border border-t px-6 py-24 md:px-10 lg:px-16">
      <Reveal>
        <h2
          id="proof-heading"
          className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Sustained coherence
        </h2>
      </Reveal>
      <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4">
        <Reveal>
          <p className="text-6xl font-medium tracking-tight md:text-7xl">
            <StatNumber value={31} />
          </p>
          <p className="text-muted-foreground mt-3 text-sm md:text-base">
            models
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="text-6xl font-medium tracking-tight md:text-7xl">
            <StatNumber value={1377} delay={0.08} />
          </p>
          <p className="text-muted-foreground mt-3 text-sm md:text-base">
            messages
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="text-6xl font-medium tracking-tight md:text-7xl">
            <StatNumber value={189} delay={0.16} />
          </p>
          <p className="text-muted-foreground mt-3 text-sm md:text-base">
            attachments
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <p className="text-6xl font-medium tracking-tight md:text-7xl">
            <StatNumber value={1} delay={0.24} />
          </p>
          <p className="text-muted-foreground mt-3 text-sm md:text-base">
            conversation
          </p>
        </Reveal>
      </div>
      <Reveal delay={0.3} className="mt-16 max-w-2xl">
        <p className="text-muted-foreground leading-relaxed text-pretty">
          Threads of this length and diversity shouldn&apos;t be possible...
          <br />
          <em>HMEM has joined the chat.</em>
        </p>
      </Reveal>
    </section>
  );
}
