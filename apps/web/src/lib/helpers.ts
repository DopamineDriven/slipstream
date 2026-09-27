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


export function getCdnUrlBase(isProd?: string) {
  if (!isProd) return "https://assets.aicoalesce.com";
  else return "https://assets-dev.aicoalesce.com";
}

export function assetOriginAI(s: string) {
  return s === "generated";
}

export function assetOriginUser(s: string) {
  return s === "pasted" || s === "upload";
}

export function assetOrigin(s: string) {
  return assetOriginAI(s) || assetOriginUser(s);
}
/**
 * all images normalized to jpg (or jpeg), webp, or png via post-upload compat pipeline
 */
export function isImage(s: string) {
  return s === "jpg" || s === "jpeg" || s === "webp" || s === "png";
}

export function userCdnUrlConstituents(cdnUrl: string) {
  let assetOrigin: "pasted" | "upload";
  const [base, top] = [
    cdnUrl.slice(0, cdnUrl.lastIndexOf("/")),
    cdnUrl.slice(cdnUrl.lastIndexOf("/") + 1)
  ];
  // CompatStatus is "ACTIVE"
  // has the following shape: "https://assets.aicoalesce.com/pasted/converted/att_vz4h0zfw5w3cli5gn2dj91gp.png" (or upload, no userId, but attachmentId)
  if (top.startsWith("att_")) {
    const [attachmentId, ext, _convertedLiteral, toType] = [
      top.slice(4, top.lastIndexOf(".")),
      top.slice(top.lastIndexOf(".") + 1),
      base.slice(base.lastIndexOf("/") + 1),
      base.slice(0, base.lastIndexOf("/"))
    ];
    const urlOrigin = toType.slice(toType.lastIndexOf("/") + 1);

    if (assetOriginUser(urlOrigin)) {
      assetOrigin = urlOrigin;
    } else {
      assetOrigin = "upload";
    }

    if (isImage(ext)) {
      return {
        attachmentId,
        ext,
        compatStatus: "ACTIVE",
        assetOrigin,
        assetType: "IMAGE",
        filename: `att_${attachmentId}`
      } as const;
    } else {
      // all docs currently normalized to pdf
      return {
        attachmentId,
        ext: "pdf",
        compatStatus: "ACTIVE",
        assetOrigin,
        assetType: "DOCUMENT",
        filename: `att_${attachmentId}`
      } as const;
    }
  }
  const [userId, toType, ext, timestampMs, filename] = [
    base.slice(base.lastIndexOf("/") + 1),
    base.slice(0, base.lastIndexOf("/")),
    top.slice(top.lastIndexOf(".") + 1),
    Number.parseInt(top.slice(0, 13), 10),
    top.slice(14, top.lastIndexOf("."))
  ];
  const urlOrigin = toType.slice(toType.lastIndexOf("/") + 1);
  if (assetOriginUser(urlOrigin)) {
    assetOrigin = urlOrigin;
  } else {
    assetOrigin = "upload";
  }

  if (isImage(ext)) {
    return {
      userId,
      timestampMs,
      filename,
      compatStatus: "ALIASED",
      ext,
      assetType: "IMAGE",
      assetOrigin
    } as const;
  } else {
    return {
      userId,
      timestampMs,
      filename,
      compatStatus: "ALIASED",
      assetType: "DOCUMENT",
      ext: "pdf",
      assetOrigin
    } as const;
  }
}

export function toCdnUrlConstituents(cdnUrl: string) {
  const baseAlpha = cdnUrl.slice(0, cdnUrl.lastIndexOf("/"));
  const top = cdnUrl.slice(cdnUrl.lastIndexOf("/") + 1);

  const [seriesIdDashOrdinal, ext, timestampMs, userId, baseBeta] = [
    top.slice(14, top.lastIndexOf(".")),
    top.slice(top.lastIndexOf(".") + 1),
    Number.parseInt(top.slice(0, 13), 10),
    baseAlpha.slice(baseAlpha.lastIndexOf("/") + 1),
    baseAlpha.slice(0, baseAlpha.lastIndexOf("/"))
  ];

  const [sId, sOrdinal, assetOrigin] = [
    seriesIdDashOrdinal.slice(0, seriesIdDashOrdinal.lastIndexOf("-")),
    seriesIdDashOrdinal.slice(seriesIdDashOrdinal.lastIndexOf("-") + 1),
    baseBeta.slice(baseBeta.lastIndexOf("/") + 1)
  ];
  if (!assetOriginAI(assetOrigin)) {
    throw new Error("assetOrigin should always be generated for AI!");
  }
  const generatedType = /^[a-z0-9]{24}$/.test(sId)
    ? "InlineImageGenOutput"
    : "ImageGenOutput";

  if (isImage(ext)) {
    return {
      /**
       * "inlineImageGenOutput" uses cuid2 `/^[a-z0-9]{24}$/`
       *
       * "imageGenOutput" uses nanoid `/^[A-Za-z0-9]{21}$/` | `/^ig_[0-9a-f]{50}$/`
       */
      type: generatedType,
      sId,
      sOrdinal: Number.parseInt(sOrdinal, 10),
      ext,
      timestampMs,
      userId,
      assetOrigin,
      assetType: "IMAGE",
      compatStatus: "ALIASED"
    } as const;
  }
  return {
    /**
     * "inlineImageGenOutput" uses cuid2 `/^[a-z0-9]{24}$/`
     *
     * "imageGenOutput" uses nanoid `/^[A-Za-z0-9]{21}$/` | `/^ig_[0-9a-f]{50}$/`
     */
    type: generatedType,
    sId,
    sOrdinal: Number.parseInt(sOrdinal, 10),
    ext: "pdf",
    timestampMs,
    assetType: "DOCUMENT",
    userId,
    assetOrigin,
    compatStatus: "ALIASED"
  } as const;
}
