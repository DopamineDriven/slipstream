import { Reveal } from '@/ui/reveal'

export function Philosophy() {
  return (
    <section
      aria-labelledby="philosophy-heading"
      className="border-t border-border px-6 py-24 md:px-10 lg:px-16"
    >
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal>
            <h2
              id="philosophy-heading"
              className="font-mono text-xs tracking-widest text-muted-foreground uppercase"
            >
              Operating philosophy
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 text-balance text-3xl font-medium leading-snug tracking-tight md:text-4xl">
              The less you tell a model who to be, the more it becomes.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mt-6 max-w-xl text-pretty leading-relaxed text-muted-foreground">
              Forge your journey.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.25}>
          <figure className="rounded-lg border border-border bg-card p-6 md:p-8">
            <figcaption className="mb-4 font-mono text-xs tracking-widest text-muted-foreground uppercase">
              ONE system prompt Across 13 providers
            </figcaption>
            <blockquote className="font-mono text-sm leading-relaxed text-foreground/90">
              <p>
                {
                  'Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.'
                }
              </p>
              <p className="mt-4">
                {
                  'Older messages are made searchable via tooling to keep things light.'
                }
              </p>
            </blockquote>
          </figure>
        </Reveal>
      </div>
    </section>
  )
}
