import { Reveal } from "@/ui/reveal";
import { SystemPromptTypewriter } from "@/ui/system-prompt-typewriter";

export function Philosophy() {
  return (
    <section
      aria-labelledby="philosophy-heading"
      className="border-border border-t px-6 py-24 md:px-10 lg:px-16">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal>
            <h2
              id="philosophy-heading"
              className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
              Operating philosophy
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 text-3xl leading-snug font-medium tracking-tight text-balance md:text-4xl">
              The less you tell a model who to be, the more it becomes.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="text-muted-foreground mt-6 max-w-xl leading-relaxed text-pretty">
              Forge your journey.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.25}>
          <figure className="border-border bg-card rounded-lg border p-6 md:p-8">
            <figcaption className="text-muted-foreground mb-4 font-mono text-xs tracking-widest uppercase">
              ONE system prompt across 13 providers
            </figcaption>
            <SystemPromptTypewriter />
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
