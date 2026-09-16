"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { isValidLangSTT, normalizeLanguageSearch } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import { CountryFlag } from "@/ui/chat/stt/country-flag";
import { Drawer } from "@/ui/chat/stt/drawer";
import { RadialLanguageMenu } from "@/ui/chat/stt/radial-language-menu";
import { animate, useReducedMotion } from "motion/react";
import type { STTTypes } from "@slipstream/types";
import {
  ArrowRight,
  Button,
  Check,
  Globe,
  Info,
  Search,
  SearchX,
  Voice,
  X
} from "@slipstream/ui";

function accelerateThenGlide(progress: number) {
  const handoff = 0.44;
  // Match velocity at the handoff: cubic acceleration gives way to a quartic glide.
  const distanceAtHandoff = (4 * handoff) / (3 + handoff);
  if (progress < handoff) return distanceAtHandoff * (progress / handoff) ** 3;
  return 1 - (1 - distanceAtHandoff) * ((1 - progress) / (1 - handoff)) ** 4;
}

function SelectionIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "text-primary-foreground flex size-4.5 shrink-0 items-center justify-center rounded-full border",
        selected
          ? "border-primary bg-primary"
          : "border-[color-mix(in_srgb,var(--foreground)_18%,transparent)]"
      )}>
      {selected && <Check className="size-3" />}
    </span>
  );
}

export interface LanguageSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: STTTypes.Web.LanguageSelection;
  onChange: (language: STTTypes.Web.LanguageSelection) => void;
  languages: STTTypes.Web.LanguageOption[];
}

export function LanguageSettings({
  open,
  onOpenChange,
  value,
  onChange,
  languages
}: LanguageSettingsProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      labelledBy={titleId}
      describedBy={descriptionId}>
      <LanguagePicker
        value={value}
        languages={languages}
        titleId={titleId}
        descriptionId={descriptionId}
        onClose={() => onOpenChange(false)}
        onApply={language => {
          onChange(language);
          onOpenChange(false);
        }}
      />
    </Drawer>
  );
}

function LanguagePicker({
  value,
  languages,
  titleId,
  descriptionId,
  onClose,
  onApply
}: {
  value: STTTypes.Web.LanguageSelection;
  languages: STTTypes.Web.LanguageOption[];
  titleId: string;
  descriptionId: string;
  onClose: () => void;
  onApply: (language: STTTypes.Web.LanguageSelection) => void;
}) {
  const [draft, setDraft] = useState<STTTypes.Web.LanguageSelection>(value);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cancelScrollRef = useRef<(() => void) | null>(null);
  const hasPositionedList = useRef(false);
  const handledQuickSwitch = useRef(0);
  const [quickSwitchRequest, setQuickSwitchRequest] = useState(0);
  const reducedMotion = useReducedMotion();
  const radioName = useId();
  const selected = languages.find(language => language.language === draft);
  const query = normalizeLanguageSearch(search);
  const filteredLanguages = languages.filter(language =>
    normalizeLanguageSearch(
      `${language.name} ${language.nativeName} ${language.language}`
    ).includes(query)
  );

  useEffect(() => {
    const isQuickSwitch = quickSwitchRequest !== handledQuickSwitch.current;
    handledQuickSwitch.current = quickSwitchRequest;
    let animation: ReturnType<typeof animate> | undefined;
    let canceled = false;

    // Measure after clearing search so the destination uses the full list's layout.
    const frame = requestAnimationFrame(() => {
      const shouldCenter = isQuickSwitch || !hasPositionedList.current;
      hasPositionedList.current = true;
      const scroller = scrollRef.current;
      const row = scroller
        ?.querySelector("input:checked")
        ?.closest("[data-language-row]");
      if (!scroller || !row) return;
      const viewportTop =
        scroller.getBoundingClientRect().top + scroller.clientTop;
      const selectedBounds = row.getBoundingClientRect();
      const start = scroller.scrollTop;
      const offset = shouldCenter
        ? selectedBounds.top -
          viewportTop -
          (scroller.clientHeight - selectedBounds.height) / 2
        : selectedBounds.top < viewportTop
          ? selectedBounds.top - viewportTop
          : Math.max(
              0,
              selectedBounds.bottom - viewportTop - scroller.clientHeight
            );
      const target = Math.max(
        0,
        Math.min(start + offset, scroller.scrollHeight - scroller.clientHeight)
      );
      const distance = Math.abs(target - start);

      if (!isQuickSwitch || reducedMotion || distance < 1) {
        scroller.scrollTop = target;
        return;
      }

      animation = animate(start, target, {
        type: "tween",
        duration: Math.min(0.94, 0.48 + Math.sqrt(distance) * 0.013),
        ease: accelerateThenGlide,
        onUpdate: position => {
          if (!canceled) scroller.scrollTop = position;
        },
        onComplete: () => {
          if (!canceled) scroller.scrollTop = target;
        }
      });
    });

    const cancel = () => {
      // Motion samples once more on stop; ignore that write so interruption never jumps.
      canceled = true;
      cancelAnimationFrame(frame);
      animation?.stop();
    };
    cancelScrollRef.current = cancel;
    return () => {
      cancel();
      if (cancelScrollRef.current === cancel) cancelScrollRef.current = null;
    };
  }, [draft, query, quickSwitchRequest, reducedMotion]);

  function interruptScroll() {
    cancelScrollRef.current?.();
  }

  function handleShortcut(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") interruptScroll();
    if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      interruptScroll();
      searchRef.current?.focus();
    }
  }

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col [@media(height<=680px)]:overflow-y-auto"
      onKeyDown={handleShortcut}>
      <header className="shrink-0 px-6.25 pt-6.25 pb-5.25 [@media(height<=850px)]:pt-4.75 [@media(height<=850px)]:pb-4.75 [@media(width<=767px)]:px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="border-border bg-secondary text-muted-foreground flex size-9 items-center justify-center rounded-xl border">
              <Voice className="size-4.5" aria-hidden="true" />
            </span>
            <h2
              id={titleId}
              className="text-foreground text-[23px] font-semibold tracking-tight [@media(width<=380px)]:text-[21px]">
              Speech language
            </h2>
          </div>
          <Button
            type="button"
            size={"icon"}
            variant="ghost"
            aria-label="Close language settings"
            onClick={onClose}
            autoFocus
            className="size-8 min-h-8">
            <X className="size-4.5" aria-hidden="true" />
          </Button>
        </div>
        <p
          id={descriptionId}
          className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Set the language for your next recording.
        </p>
      </header>

      <div className="shrink-0 px-6 pb-5.25 [@media(height<=850px)]:pb-4.25 [@media(width<=767px)]:px-5">
        <RadialLanguageMenu
          languages={languages}
          value={draft}
          onChange={code => {
            interruptScroll();
            setDraft(code);
            setSearch("");
            setQuickSwitchRequest(request => request + 1);
          }}
        />
      </div>

      <div className="shrink-0 px-6 pb-4 [@media(width<=767px)]:px-5">
        <div className="text-foreground flex h-11 items-center gap-2.5 rounded-[9px] border border-[color-mix(in_srgb,var(--foreground)_13%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] px-3.25 transition-[border-color,box-shadow] duration-160 ease-[ease] focus-within:border-[color-mix(in_srgb,var(--primary)_65%,transparent)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_8%,transparent)]">
          <Search
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0"
          />
          <input
            ref={searchRef}
            type="search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search languages"
            placeholder="Search languages…"
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || event.keyCode === 229)
                return;
              if (event.key === "Enter") {
                event.preventDefault();
                if (filteredLanguages.length === 1)
                  setDraft(filteredLanguages[0]?.language);
              }
            }}
            className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none [@media(width<=767px)]:text-[16px]"
          />
          {search ? (
            <button
              type="button"
              className="text-muted-foreground [&:hover]:text-foreground flex h-7 w-6 items-center justify-center rounded-sm"
              aria-label="Clear language search"
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}>
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <kbd
              className="border-border text-muted-foreground inline-flex h-5.75 w-5.25 items-center justify-center rounded-sm border font-[family-name:var(--font-geist),monospace] text-[14px]"
              aria-hidden="true">
              /
            </kbd>
          )}
        </div>
      </div>

      <fieldset className="m-0 flex min-h-0 flex-1 flex-col border-0 p-0 [@media(height<=680px)]:min-h-55 [@media(height<=680px)]:flex-none">
        <legend className="sr-only">Spoken language</legend>
        <div className="shrink-0 px-6 pb-3.75 [@media(width<=767px)]:px-5">
          <label
            className={cn(
              "has-[input:focus-visible]:outline-primary flex min-h-16.5 cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-[background,border-color] duration-150 ease-[ease] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2",
              draft === undefined
                ? "border-[color-mix(in_srgb,var(--primary)_36%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))] [&:hover]:bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))]"
                : "border-border [&:hover]:bg-secondary"
            )}>
            <input
              className="sr-only"
              type="radio"
              name={radioName}
              value="auto"
              checked={draft === undefined}
              onChange={() => setDraft(undefined)}
              aria-label="Detect automatically"
            />
            <span className="text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
              <Globe aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground block text-sm font-medium">
                Detect automatically
              </span>
              <span className="text-muted-foreground mt-0.5 block text-sm">
                Let the audio set the language
              </span>
            </span>
            <SelectionIndicator selected={draft === undefined} />
          </label>
        </div>

        <div className="flex min-h-8.5 shrink-0 items-center justify-between px-7.25 pb-2.5 [@media(width<=767px)]:px-6.25">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm font-medium">
              {query ? "Search results" : "All languages"}
            </span>
            <span
              className="border-border bg-secondary text-muted-foreground inline-flex h-5.25 min-w-6 items-center justify-center rounded-[5px] border px-1.25 text-sm"
              aria-live="polite"
              aria-atomic="true">
              {filteredLanguages.length}
            </span>
          </div>
          <span className="text-muted-foreground/70 text-sm" aria-hidden="true">
            A–Z
          </span>
        </div>

        <div
          ref={scrollRef}
          className="mr-1.75 min-h-25 flex-1 scrollbar-gutter-stable overflow-y-auto overscroll-contain scroll-auto pr-4.25 pb-2.5 pl-6 [overflow-anchor:none] [@media(height<=680px)]:max-h-65 [@media(width<=767px)]:pr-3.25 [@media(width<=767px)]:pl-5"
          onWheel={interruptScroll}
          onTouchStart={interruptScroll}
          onPointerDown={interruptScroll}
          onKeyDownCapture={interruptScroll}
          onFocusCapture={interruptScroll}>
          {filteredLanguages.length ? (
            filteredLanguages.map(language => {
              const active = draft === language.language;
              return (
                <label
                  key={language.language}
                  data-language-row
                  className={cn(
                    "has-[input:focus-visible]:outline-primary flex min-h-15 cursor-pointer items-center gap-3.25 rounded-[9px] border px-2.75 py-2 transition-[background,border-color] duration-150 ease-[ease] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 [&+[data-language-row]]:mt-0.75 [@media(height<=850px)]:min-h-14 [@media(width<=380px)]:gap-2.5",
                    active
                      ? "border-[color-mix(in_srgb,var(--primary)_36%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))] [&:hover]:bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))]"
                      : "[&:hover]:bg-secondary border-transparent"
                  )}>
                  <input
                    className="sr-only"
                    type="radio"
                    name={radioName}
                    value={language.language}
                    checked={active}
                    aria-label={`${language.name} (${language.language})`}
                    onChange={event => {
                      const code = event.currentTarget.value;
                      if (isValidLangSTT(code)) setDraft(code);
                    }}
                  />
                  <span className="flex min-h-7 w-8 shrink-0 items-center justify-start">
                    <CountryFlag language={language} width={29} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block text-sm font-medium">
                      {language.name}
                    </span>
                    <span
                      lang={language.language}
                      dir="auto"
                      className="text-muted-foreground block w-fit text-sm leading-5">
                      {language.nativeName}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-sm uppercase",
                      active ? "text-primary" : "text-muted-foreground/65"
                    )}>
                    {language.language}
                  </span>
                  <SelectionIndicator selected={active} />
                </label>
              );
            })
          ) : (
            <div
              className="flex min-h-47.5 flex-col items-center justify-center gap-2.75 p-3.75 text-center"
              role="status">
              <SearchX
                className="text-muted-foreground size-7"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">No languages found</p>
              <p className="text-muted-foreground max-w-64 text-sm leading-relaxed text-balance">
                Try a language name, native spelling, or code like “en”.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchRef.current?.focus();
                }}
                className="text-primary text-sm hover:underline">
                Clear search
              </button>
            </div>
          )}
        </div>
      </fieldset>

      <footer className="border-border bg-background text-foreground shrink-0 border-t px-6 pt-4.5 pb-5.5 [@media(height<=680px)]:sticky [@media(height<=680px)]:bottom-0 [@media(height<=850px)]:pt-3.75 [@media(height<=850px)_and_(width>767px)]:pb-4.25 [@media(width<=767px)]:px-5 [@media(width<=767px)]:pb-[max(18px,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-2.5">
          <Info
            aria-hidden="true"
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
          />
          <p className="text-muted-foreground text-sm leading-relaxed">
            Choosing a language also formats spoken numbers, currencies, and
            units.
          </p>
        </div>
        <Button className="mt-4 w-full" onClick={() => onApply(draft)}>
          <span className="flex w-full items-center justify-center gap-2.5">
            Use {selected?.name ?? "auto-detect"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </Button>
      </footer>
    </div>
  );
}
