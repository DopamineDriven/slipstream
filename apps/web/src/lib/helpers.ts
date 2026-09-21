import type { $Enums } from "@slipstream/db/node/generated/client";

export const getInitials = (name?: string | null) => {
  if (!name) return "U";
  return name
    .split(" ")
    .map(n => n.substring(0, 1))
    .join("");
};

export const getFirstName = (name?: string | null) => {
  if (!name) return "User";
  return name.split(" ")?.[0] ?? "User";
};

export const smoothScrollToBottom = (distance: number) => {
  return Math.min(Math.max(300, Math.sqrt(distance) * 20), 1500);
};

export const formatTime = (dateString: Date, locale: string, tz: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: decodeURIComponent(tz)
  });
};

export const fromPrismaFormat = (provider: $Enums.Provider) => {
  return provider.toLowerCase() as Lowercase<$Enums.Provider>;
};

/**
 * web twin of the ws-server lyria predicates (gemini/base.ts isLyriaModel,
 * prisma/chat-request.ts isAudioGenModel) — audioGenEnabled derives from
 * this at the send site; lyria targeting IS the intent, no user toggle
 */
export const isAudioGenModel = (m: string) => {
  return (
    m === "lyria-3.5" ||
    m === "lyria-3-pro-preview" ||
    m === "lyria-3-clip-preview"
  );
};

/**
 * automatically toggle the image gen to active for these pure image generation models.
 * it remains toggleable for a number of openai models (gpt-5.6-sol, gpt-5.5, etc) that have
 * internal image_generation tooling where they can invoke gpt-image-2 when the image generation
 * toggle is turned on by a user. but for pure image gen models, it should be auto-toggled whenever
 * they're targeted. use model-selection-context to access the currently targeted model id.
 */
export const isPureImageModel = (m: string) => {
  return (
    m === "gemini-2.5-flash-image" ||
    m === "gemini-3-pro-image-preview" ||
    m === "gemini-3.1-flash-image-preview" ||
    m === "gemini-3.1-flash-lite-image" ||
    m === "gpt-image-1" ||
    m === "gpt-image-1-mini" ||
    m === "gpt-image-1.5" ||
    m === "gpt-image-2" ||
    m === "gpt-image-2.5-sunburst" ||
    m === "gpt-image-2.5-flare" ||
    m === "grok-imagine-image" ||
    m === "grok-imagine-image-2.0" ||
    m === "grok-imagine-image-quality" ||
    m === "muse-image-1.0"
  );
};

export function isValidLangSTT(l: string) {
  return (
    l === "ar" ||
    l === "cs" ||
    l === "da" ||
    l === "de" ||
    l === "en" ||
    l === "es" ||
    l === "fa" ||
    l === "fil" ||
    l === "fr" ||
    l === "hi" ||
    l === "id" ||
    l === "it" ||
    l === "ja" ||
    l === "ko" ||
    l === "mk" ||
    l === "ms" ||
    l === "nl" ||
    l === "pl" ||
    l === "pt" ||
    l === "ro" ||
    l === "ru" ||
    l === "sv" ||
    l === "th" ||
    l === "tr" ||
    l === "vi"
  );
}
/**
 * locale → provider language code: BCP-47 puts the language FIRST, so cut at
 * the first separator (`zh-Hant-TW` → `zh`, `hi-Latn-IN` → `hi`,
 * `fil-PH` → `fil`), lowercase, and anchor-validate so junk never passes as
 * a code. `tl` (how some platforms tag Filipino locales) maps to the
 * provider's `fil`.
 */
export function languageHelperSTT(t: string) {
  const base = t.toLowerCase().split(/[-_]/)[0];
  if (!base || !/^[a-z]{2,3}$/.test(base)) return;
  return base === "tl" ? "fil" : base;
}

export function normalizeLanguageSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .trim();
}
export type FromDraftIdRT = {
  userId: string;
  convoId: string;
  batchId: string;
  dictationOrdinal: number;
  isNewConvo: boolean;
};

export const DRAFT_ID_RE =
  /^[a-z0-9]{24}~(?:[a-z0-9]{24}|new-chat)~[a-z0-9]{24}~(?:0|[1-9][0-9]*)$/;

export function draftIdFormat({
  batchId,
  convoId,
  dictationOrdinal,
  userId
}: FromDraftIdRT) {
  return `${userId}~${convoId}~${batchId}~${dictationOrdinal}`;
}
export function parseDraftIdSingleton(d: string) {
  if (!DRAFT_ID_RE.test(d)) {
    throw new Error(`[malformed draftId detected in parseDraftId]: ${d}`);
  }
  const [userId, convoId, batchId, dictationOrdinal] = d.split("~") as [
    string,
    string,
    string,
    string
  ];

  return {
    userId,
    convoId,
    batchId,
    dictationOrdinal: Number.parseInt(dictationOrdinal, 10),
    isNewConvo: d.length < 76
  } satisfies FromDraftIdRT;
}

export function canParseDraftId(d: string) {
  return DRAFT_ID_RE.test(d);
}

export function parseDraftId(d: string): FromDraftIdRT;
export function parseDraftId(d: string[]): FromDraftIdRT[];
export function parseDraftId(d: string | string[]) {
  if (typeof d === "string") {
    return parseDraftIdSingleton(d);
  } else {
    return d.map(tt => parseDraftIdSingleton(tt));
  }
}

export function toDraftId(d: FromDraftIdRT[]): string[];
export function toDraftId(d: FromDraftIdRT): string;
export function toDraftId(d: FromDraftIdRT | FromDraftIdRT[]) {
  if (Array.isArray(d)) {
    const arr = Array.of<string>();
    for (const dd of d) {
      arr.push(draftIdFormat(dd));
    }
    return arr;
  } else {
    return draftIdFormat(d);
  }
}

export function draftIdEpimerize(d: string[]): FromDraftIdRT[];
export function draftIdEpimerize(d: FromDraftIdRT[]): string[];
export function draftIdEpimerize(d: FromDraftIdRT): string;
export function draftIdEpimerize(d: string): FromDraftIdRT;
export function draftIdEpimerize(
  d: FromDraftIdRT | FromDraftIdRT[] | string[] | string
) {
  if (typeof d === "string") {
    return parseDraftId(d);
  } else if (Array.isArray(d)) {
    return d.map(t => {
      if (typeof t === "string") {
        return parseDraftId(t);
      } else {
        return toDraftId(t);
      }
    });
  } else {
    return toDraftId(d);
  }
}
