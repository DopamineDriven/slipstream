"use client";

import type { Transition } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CountryFlag } from "@/ui/chat/stt/country-flag";
import { AnimatePresence, motion } from "motion/react";
import { STTTypes } from "@slipstream/types";
import { Check, Globe } from "@slipstream/ui";

const QUICK_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "ja",
  "ko"
] as const satisfies STTTypes.Language[];

const defaultSpring = {
  type: "spring",
  stiffness: 420,
  damping: 24
} satisfies Transition;

const closedState = { opacity: 0, scale: 0, x: 0, y: 0 };

const START_ANGLE = -150;

const ARC_SPAN = 300;

export function RadialLanguageMenu({
  languages,
  value,
  onChange,
  radius = 61,
  itemSpring = defaultSpring,
  staggerInterval = 0.04
}: {
  languages: STTTypes.Web.LanguageOption[];
  value: STTTypes.Web.LanguageSelection;
  onChange: (language: STTTypes.Web.LanguageSelection) => void;
  radius?: number;
  itemSpring?: Transition;
  staggerInterval?: number;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const selected = languages.find(language => language.language === value);

  /** ==============   Data   ================ */
  const menuItems = QUICK_LANGUAGES.flatMap(code => {
    const language = languages.find(item => item.language === code);
    return language ? [language] : [];
  });

  return (
    <section
      className="border-border bg-secondary text-foreground flex h-43 items-center justify-between rounded-[14px] border pr-3 pl-4.75 [@media(height<=850px)]:h-35.75 [@media(width<=380px)]:pr-1 [@media(width<=380px)]:pl-3.5"
      aria-label="Quick language switch">
      <div className="flex min-w-0 flex-col gap-5.5 [@media(height<=850px)]:gap-4.25">
        <div>
          <h3 className="text-foreground text-sm font-medium">Quick switch</h3>
          <p className="text-muted-foreground mt-2 max-w-36 text-sm leading-relaxed [@media(width<=380px)]:max-w-28">
            Your go-to languages,
            <br />a little closer.
          </p>
        </div>
        <div className="text-primary flex items-center gap-1.5 text-sm">
          <Check aria-hidden="true" className="size-3.5" />
          <span>{selected?.name ?? "Auto-detect"}</span>
        </div>
      </div>

      <div
        className="relative flex h-42 w-43.5 shrink-0 origin-center items-center justify-center select-none [@media(height<=850px)_and_(width>380px)]:scale-[0.87] [@media(width<=380px)]:w-38.75 [@media(width<=380px)]:scale-[0.85]"
        role="group"
        aria-label="Quick languages">
        <motion.div
          aria-hidden="true"
          className="absolute size-30.5 rounded-full border border-dashed border-[color-mix(in_srgb,var(--color-foreground)_17%,transparent)]"
          animate={{ opacity: isOpen ? 1 : 0, scale: isOpen ? 1 : 0.6 }}
          transition={{ duration: 0.2 }}
        />
        <AnimatePresence>
          {isOpen &&
            menuItems.map((language, index) => {
              const angle =
                START_ANGLE +
                (index / Math.max(menuItems.length - 1, 1)) * ARC_SPAN;
              const radian = (angle * Math.PI) / 180;
              const x = Math.cos(radian) * radius;
              const y = Math.sin(radian) * radius;
              const active = language.language === value;
              return (
                <motion.div
                  key={language.language}
                  className="absolute focus-within:z-5 [&:hover]:z-5"
                  initial={closedState}
                  animate={{ opacity: 1, scale: 1, x, y }}
                  exit={closedState}
                  transition={{
                    ...itemSpring,
                    delay: index * staggerInterval
                  }}>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => onChange(language.language)}
                    className={cn(
                      "group/radial-language text-foreground relative flex size-10 items-center justify-center rounded-full border",
                      active
                        ? "border-[color-mix(in_srgb,var(--color-primary)_75%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_9%,var(--color-surface))] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                        : "bg-secondary border-[color-mix(in_srgb,var(--color-foreground)_15%,transparent)] shadow-[0_2px_8px_color-mix(in_srgb,var(--color-background)_45%,transparent)]"
                    )}
                    aria-label={`Select ${language.name}`}
                    aria-pressed={active}>
                    <CountryFlag width={24} language={language} />
                    <span
                      className="border-border bg-foreground text-background pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded-md border px-2.25 py-1.25 text-[14px] whitespace-nowrap opacity-0 transition-opacity duration-140 ease-[ease] group-focus-visible/radial-language:opacity-100 group-[:hover]/radial-language:opacity-100"
                      aria-hidden="true">
                      {language.name}
                    </span>
                    {active && (
                      <span
                        className="border-secondary bg-primary text-primary-foreground absolute -right-0.5 -bottom-px flex size-3.75 items-center justify-center rounded-full border-2"
                        aria-hidden="true">
                        <Check className="size-2.5" strokeWidth={3} />
                      </span>
                    )}
                  </motion.button>
                </motion.div>
              );
            })}
        </AnimatePresence>
        <motion.button
          type="button"
          className="text-primary z-2 flex size-11.25 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--primary)_27%,transparent)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))]"
          onClick={() => setIsOpen(current => !current)}
          animate={{ rotate: isOpen ? 0 : -35 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={itemSpring}
          aria-label={
            isOpen ? "Collapse quick languages" : "Expand quick languages"
          }
          aria-expanded={isOpen}
          data-primary-action>
          <Globe aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </motion.button>
      </div>
    </section>
  );
}
