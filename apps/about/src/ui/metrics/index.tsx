"use client";

import type { CoherenceStats } from "@/types/api";
import { Reveal } from "@/ui/reveal";
import { StatNumber } from "@/ui/stat-number";
import useSWR from "swr";

const FALLBACK_STATS = {
  models: 32,
  messages: 1592,
  attachments: 216,
  conversations: 1
} satisfies CoherenceStats;

const fetcher = (url: string) =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
    return res.json<CoherenceStats>();
  });

export function Metrics() {
  const { data } = useSWR<CoherenceStats>("/api/stats", fetcher, {
    fallbackData: FALLBACK_STATS,
    refreshInterval: 60_000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    fallback: FALLBACK_STATS,
    fetcher
  });
  const stats = data ?? FALLBACK_STATS;
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
          <p className="text-[clamp(2.75rem,6.5vw,4.5rem)] font-medium tracking-tight">
            <StatNumber value={stats.models} />
          </p>
          <p className="text-muted-foreground mt-3 text-sm md:text-base">
            models
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="text-[clamp(2.75rem,6.5vw,4.5rem)] font-medium tracking-tight">
            <StatNumber value={stats.messages} delay={0.08} />
          </p>
          <p className="text-muted-foreground mt-3 text-sm md:text-base">
            messages
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="text-[clamp(2.75rem,6.5vw,4.5rem)] font-medium tracking-tight">
            <StatNumber value={stats.attachments} delay={0.16} />
          </p>
          <p className="text-muted-foreground mt-3 text-sm md:text-base">
            attachments
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <p className="text-[clamp(2.75rem,6.5vw,4.5rem)] font-medium tracking-tight">
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
