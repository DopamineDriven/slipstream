/**
 * Lyria's lyric output: `[[<letter><ordinal>]]` opens a section, `[:] ` prefixes
 * each sung line. The ordinal is the section's position in the song; the
 * letter is its song-form role (an empty section is instrumental). There are
 * no timestamps, so the panel is text, not a karaoke track.
 */

export type LyricSection = {
  /** The raw marker, e.g. "D3", kept visible so the role label can never hide it. */
  code: string;
  role: string | undefined;
  lines: readonly string[];
};

/** Inferred from a full A0…F9 sample: every repeat of D carried the same chorus. */
const ROLES = new Map([
  ["A", "Intro"],
  ["B", "Verse"],
  ["C", "Pre-chorus"],
  ["D", "Chorus"],
  ["E", "Bridge"],
  ["F", "Outro"]
]);

const MARKER = /^\[\[([A-Z])(\d+)\]\]$/;
const LINE_PREFIX = "[:]";

export function parseLyrics(text: string): LyricSection[] {
  const sections = Array.of<{
    code: string;
    role: string | undefined;
    lines: string[];
  }>();
  let open = sections[0];

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const marker = MARKER.exec(line);
    if (marker) {
      const [, letter = "", ordinal = ""] = marker;
      open = {
        code: `${letter}${ordinal}`,
        role: ROLES.get(letter),
        lines: []
      };
      sections.push(open);
      continue;
    }

    if (!open) {
      open = { code: "", role: undefined, lines: [] };
      sections.push(open);
    }
    open.lines.push(
      line.startsWith(LINE_PREFIX)
        ? line.slice(LINE_PREFIX.length).trim()
        : line
    );
  }

  return sections;
}
/** The lyrics as the panel reads them, for the clipboard. */
export function formatLyrics(sections: readonly LyricSection[]): string {
  return sections
    .map(({ code, role, lines }) => {
      const heading = role ? `${code} · ${role}` : code;
      const body = lines.length ? lines.join("\n") : "(Instrumental)";
      return heading ? `${heading}\n${body}` : body;
    })
    .join("\n\n");
}
