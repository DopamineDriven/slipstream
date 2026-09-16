import { STTTypes } from "@slipstream/types";

export const QUICK_LANGUAGES = [
  "en",
  "es",
  "ja",
  "de",
  "fr",
  "ko"
] satisfies readonly STTTypes.Language[];

export function normalizeLanguageSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .trim();
}
