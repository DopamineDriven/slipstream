import { parseLyrics } from "@/lib/lyrics";
import { cn } from "@/lib/utils";

export function LyricsPanel({
  lyrics,
  className
}: {
  lyrics: string;
  className?: string | undefined;
}) {
  const sections = parseLyrics(lyrics);
  return (
    <section
      aria-label="Lyrics"
      className={cn("flex flex-col gap-6", className)}>
      {sections.map((section, i) => (
        <div key={`${section.code}-${i}`} className="flex flex-col gap-2">
          <h3 className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
            {section.code}
            {section.role ? ` · ${section.role}` : ""}
          </h3>
          {section.lines.length ? (
            <p className="text-sm leading-relaxed text-pretty">
              {section.lines.map((line, j) => (
                <span key={j} className="block">
                  {line}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm italic">Instrumental</p>
          )}
        </div>
      ))}
    </section>
  );
}
