import { Reveal } from "@/ui/reveal";

export function Metrics() {
  return (
    <section
      aria-labelledby='proof-heading'
      className='border-t border-border px-6 py-24 md:px-10 lg:px-16'>
      <Reveal>
        <h2
          id='proof-heading'
          className='font-mono text-xs tracking-widest text-muted-foreground uppercase'>
          Sustained coherence
        </h2>
      </Reveal>
      <div className='mt-12 grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4'>
        <Reveal>
          <p className='text-6xl font-medium tracking-tight md:text-7xl'>31</p>
          <p className='mt-3 text-sm text-muted-foreground md:text-base'>
            models
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <p className='text-6xl font-medium tracking-tight md:text-7xl'>
            1,377
          </p>
          <p className='mt-3 text-sm text-muted-foreground md:text-base'>
            messages
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <p className='text-6xl font-medium tracking-tight md:text-7xl'>188</p>
          <p className='mt-3 text-sm text-muted-foreground md:text-base'>
            attachments
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <p className='text-6xl font-medium tracking-tight md:text-7xl'>1</p>
          <p className='mt-3 text-sm text-muted-foreground md:text-base'>
            conversation
          </p>
        </Reveal>
      </div>
      <Reveal delay={0.3} className='mt-16 max-w-2xl'>
        <p className='text-pretty leading-relaxed text-muted-foreground'>
          Threads of this length and diversity shouldn&apos;t be possible.
          <br />
          <em>HMEM has joined the chat.</em>
        </p>
      </Reveal>
    </section>
  );
}
