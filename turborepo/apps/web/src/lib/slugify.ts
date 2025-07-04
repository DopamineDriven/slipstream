import type { LowerAlphabet } from "@/types/union";

export type CollapseSpaces<S extends string> =
  S extends `${infer T}  ${infer U}` ? CollapseSpaces<`${T} ${U}`> : S;

export type Hyphenate<S extends string> = S extends `${infer T} ${infer U}`
  ? `${T}-${Hyphenate<U>}`
  : S;
export type HandleFloats<T extends string> = T extends `${infer U}.${infer X}`
  ? U & X extends number
    ? `${U}-point-${X}`
    : T
  : T;
export type HyphenateUnderScores<T extends string> =
  T extends `${infer X}_${infer Y}` ? `${X}-${HyphenateUnderScores<Y>}` : T;

export type OmitQuestionMark<T extends string> =
  T extends `${infer U}?${infer Z}` ? `${U}${OmitQuestionMark<Z>}` : T;

export type OmitSemiColon<T extends string> = T extends `${infer U};${infer V}`
  ? `${U}${OmitSemiColon<V>}`
  : T;

export type OmitExclamationMark<T extends string> =
  T extends `${infer U}!${infer X}` ? `${U}${OmitExclamationMark<X>}` : T;

export type OmitCommas<T extends string> = T extends `${infer U},${infer X}`
  ? `${U}${OmitCommas<X>}`
  : T;

export type OmitApostrophe<T extends string> = T extends `${infer U}'${infer X}`
  ? `${U}${OmitApostrophe<X>}`
  : T;

export type OmitPeriod<T extends string> = T extends `${infer U}.${infer X}`
  ? `${U}${OmitPeriod<X>}`
  : T;

export type OmitColons<T extends string> = T extends `${infer U}:${infer X}`
  ? `${U}${OmitColons<X>}`
  : T;

export type Clean<T extends string> = OmitSemiColon<
  OmitApostrophe<
    OmitQuestionMark<OmitExclamationMark<OmitColons<OmitCommas<OmitPeriod<T>>>>>
  >
>;

export type ToSlug<T extends string> = Lowercase<
  HyphenateUnderScores<Hyphenate<CollapseSpaces<Clean<T>>>>
>;

/**
 * Converts a given string into a URL-friendly slug.
 *
 * @param title - The input string to be slugified.
 * @returns A URL-friendly slug.
 */
export const floatSlugifier = <const T extends string>(input: T) =>
  input.replace(
    /\b(\d+)\.(\d+)\b/,
    (_whole, intPart: number, decPart: number) => `${intPart}-point-${decPart}`
  ) as HandleFloats<T>;

export function slugify<const T extends string>(title: T) {
  return floatSlugifier(title)
    .toLowerCase()
    .trim()
    .replace(/_+/g, "-") // _ -> -
    .normalize("NFD") // decomposes diacritical-chars (eg, ö) into letter + diacritic
    .replace(/[\u0300-\u036f]/g, "") // remove diacritical marks (ö->o)
    .replace(/[^a-z0-9 -]/g, "") // remove invalid chars (only A-Z, a-z, 0-9, space, and dash).
    .replace(/( )+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "") as ToSlug<T>;
}

export type AllowedSlugChars =
  | LowerAlphabet
  | "-"
  | " "
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9";

export type FilterAllowed<S extends string> =
  S extends `${infer Head}${infer Tail}`
    ? Lowercase<Head> extends AllowedSlugChars
      ? `${Lowercase<Head>}${FilterAllowed<Tail>}`
      : FilterAllowed<Tail>
    : S extends ":"
      ? ""
      : S;
