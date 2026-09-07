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
  return m ==="lyria-3.5" || m === "lyria-3-pro-preview" || m === "lyria-3-clip-preview";
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
    m === "grok-imagine-image" ||
    m === "grok-imagine-image-2.0" ||
    m === "grok-imagine-image-quality"
  );
};
