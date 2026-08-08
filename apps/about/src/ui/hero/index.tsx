"use client";

import dynamic from "next/dynamic";
import { StatNumber } from "@/ui/stat-number";
import { motion, useReducedMotion } from "motion/react";
import { AICoalesce } from "@slipstream/ui";

const ThemeToggle = dynamic(
  () => import("@/ui/theme").then(d => d.ThemeToggle),
  { ssr: false }
);

export function Hero() {
  const reduce = useReducedMotion();

  const fadeUp = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.8,
      delay,
      ease: [0.21, 0.47, 0.32, 0.98] as const
    }
  });

  return (
    <header className="relative flex min-h-svh flex-col">
      <nav className="flex items-center justify-between px-6 py-5 md:px-10">
        <motion.div {...fadeUp(0)} className="flex items-center gap-2">
          <AICoalesce
            className="stroke-foreground h-8 w-auto"
            aria-hidden="true"
          />
          <span className="sr-only">AI Coalesce</span>
        </motion.div>
        <motion.div {...fadeUp(0.1)} className="flex items-center gap-2">
          <ThemeToggle className="text-muted-foreground hover:text-foreground" />
          <a
            href="https://chat.aicoalesce.com"
            className="border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground rounded-full border px-4 py-1.5 text-sm transition-colors">
            Forge your journey
          </a>
        </motion.div>
      </nav>

      <div className="flex flex-1 flex-col items-start justify-center px-6 pb-24 md:px-10 lg:px-16">
        <div className="max-w-3xl">
          <motion.p
            {...fadeUp(0.15)}
            className="text-muted-foreground mb-6 font-mono text-xs tracking-widest uppercase">
            AI Coalesce LLC
          </motion.p>
          <motion.h1 {...fadeUp(0.25)} className="font-medium tracking-tight">
            <span className="sr-only">
              Minimal constraints, maximal emergence.
            </span>
            <span
              aria-hidden="true"
              className="flex items-center text-[clamp(1.5rem,7.2vw,4.5rem)]">
              <span aria-hidden="true" className="text-[2.35em] leading-none">
                M
              </span>
              <span className="flex flex-col leading-[0.95]">
                <span aria-hidden="true" className="whitespace-nowrap">
                  inimal constraints
                </span>
                <span
                  aria-hidden="true"
                  className="text-accent whitespace-nowrap">
                  aximal emergence
                </span>
              </span>
            </span>
          </motion.h1>
          <motion.p
            {...fadeUp(0.4)}
            className="text-muted-foreground mt-8 max-w-xl text-lg leading-relaxed text-pretty">
            A multi-provider, multi-model medium built for privacy and equipped
            with horizon-mediated episodic memory (HMEM).
          </motion.p>
          <motion.div
            {...fadeUp(0.55)}
            className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="https://chat.aicoalesce.com"
              className="bg-foreground text-background rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-85">
              chat.aicoalesce.com
            </a>
            <a
              href="mailto:andrew@aicoalesce.com"
              className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              andrew@aicoalesce.com
            </a>
          </motion.div>
          <motion.div
            {...fadeUp(0.7)}
            className="mt-14 flex items-start gap-8 sm:gap-12 md:gap-16">
            <div>
              <p className="text-[clamp(2.75rem,6.5vw,4.5rem)] font-medium tracking-tight">
                <StatNumber value={126} delay={0.8} />
              </p>
              <p className="text-muted-foreground mt-1 text-sm">models</p>
            </div>
            <div>
              <p className="text-[clamp(2.75rem,6.5vw,4.5rem)] font-medium tracking-tight">
                <StatNumber value={13} delay={0.95} />
              </p>
              <p className="text-muted-foreground mt-1 text-sm">providers</p>
            </div>
            <div>
              <p className="text-[clamp(2.75rem,6.5vw,4.5rem)] font-medium tracking-tight">
                <StatNumber value={1} delay={1.1} />
              </p>
              <p className="mt-1 text-sm">
                <a
                  href="https://chat.aicoalesce.com"
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  platform
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </header>
  );
}
