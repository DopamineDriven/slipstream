import { Fs } from "@d0paminedriven/fs";
type CollapseSpaces<S extends string> =
  S extends `${infer T}  ${infer U}` ? CollapseSpaces<`${T} ${U}`> : S;

type Hyphenate<S extends string> = S extends `${infer T} ${infer U}`
  ? `${T}-${Hyphenate<U>}`
  : S;

type HyphenateUnderScores<T extends string> =
  T extends `${infer X}_${infer Y}` ? `${X}-${HyphenateUnderScores<Y>}` : T;

type OmitQuestionMark<T extends string> =
  T extends `${infer U}?${infer Z}` ? `${U}${OmitQuestionMark<Z>}` : T;

type OmitSemiColon<T extends string> = T extends `${infer U};${infer V}`
  ? `${U}${OmitSemiColon<V>}`
  : T;

type OmitExclamationMark<T extends string> =
  T extends `${infer U}!${infer X}` ? `${U}${OmitExclamationMark<X>}` : T;

type OmitCommas<T extends string> = T extends `${infer U},${infer X}`
  ? `${U}${OmitCommas<X>}`
  : T;

type OmitApostrophe<T extends string> = T extends `${infer U}'${infer X}`
  ? `${U}${OmitApostrophe<X>}`
  : T;

type OmitPeriod<T extends string> = T extends `${infer U}.${infer X}`
  ? `${U}${OmitPeriod<X>}`
  : T;

type OmitColons<T extends string> = T extends `${infer U}:${infer X}`
  ? `${U}${OmitColons<X>}`
  : T;

type HandleFloats<T extends string> = T extends `${infer U}.${infer X}` ? U & X extends number ?`${U}-point-${X}` : T : T;

type Clean<T extends string> = OmitSemiColon<
  OmitApostrophe<
    OmitQuestionMark<OmitExclamationMark<OmitColons<OmitCommas<OmitPeriod<HandleFloats<T>>>>>>
  >
>;

type ToSlug<T extends string> = Lowercase<
  HyphenateUnderScores<Hyphenate<CollapseSpaces<Clean<T>>>>
>;



const floatSlugifier = <const T extends string>(input:T) =>input
  .replace( /\b(\d+)\.(\d+)\b/, (_whole, intPart:number, decPart: number) => `${intPart}-point-${decPart}`) as HandleFloats<T>



function slugify<const T extends string>(title: T) {
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


const aiChatResponse = {
  type: "ai_chat_response",
  conversationId: "sf87jjxf99n27vxwm6g5v3kd",
  userId: "x1sa9esbc7nb1bbhnn5uy9ct",
  provider: "grok",
  model: "grok-3",
  title: "The Elegance of Advanced TypeScript",
  chunk:
    "**Ode to Advanced TypeScript**\n\nOh, TypeScript, guardian of code so vast,\nA language of types, both strict and steadfast.\nBeyond the basics, your power unfurls,\nIn advanced realms, where magic swirls.\n\nWith generics, you bend to our will,\nA type for each purpose, a void to fill.\n`T` and `K`, placeholders so fine,\nCrafting functions that dynamically align.\n`Array<T>` or `Promise<string>`, you say,\nEnsuring safety in every array.\n\nUnion types, a crossroads of choice,\n`string | number`, you give us voice.\nDiscriminated unions, with tags to guide,\n`{ kind: \"error\" } | { kind: \"success\" }`, decide!\nNarrowing paths with `if` and `switch`,\nYou guard our logic from every glitch.\n\nIntersection, oh blend of might,\n`Person & Logger`, combined in light.\nA type that’s both, no detail missed,\nProperties merged in a harmonious tryst.\nYet `never` lurks, a type so bare,\nA path impossible, a warning to beware.\n\nConditional types, a puzzle, a game,\n`T extends U ? X : Y`, not quite the same.\nInferring logic, a type to derive,\n`ReturnType<T>`, keeping magic alive.\nMapped types, remapping the keys,\n`Partial<T>`, `Pick<T, K>`, as we please.\n\nUtility types, your gifts abound,\n`Omit`, `Exclude`, solutions found.\nTransforming shapes with elegant ease,\nBuilding new types as if by a breeze.\nAnd `infer`, a keyword of subtle art,\nExtracting types from structures apart.\n\nOh, keyof, index of a type’s domain,\nA union of keys, no need to explain.\nAccessing deeply with dotted paths,\n`type Deep = Nested['a']['b']`, no wrath.\nAnd template literals, types as strings,\n`type Event = `on${string}`;`, such clever things.\n\nWith decorators, though experimental still,\nYou hint at patterns, a future thrill.\nClasses adorned with metadata bright,\nA glimpse of a world where types ignite.\nAnd module augmentation, extending with care,\nAdding to globals, a type to share.\n\nYet challenges rise, as complexity grows,\nType errors perplex, frustration shows.\nBut with `as` assertions, we sometimes cheat,\n`unknown` to `string`, a daring feat.\nStill, you urge caution, to tread with thought,\nFor type safety’s promise must not be bought.\n\nOh, TypeScript advanced, a craft so rare,\nA balance of power, of love, of care.\nYou shape our code with a vigilant eye,\nEnsuring no bug shall silently lie.\nSo here’s to your unions, your generics, your might,\nA coder’s companion in the endless night.",
  done: true
};
const fs = new Fs(process.cwd());

const path = `src/__out__/${aiChatResponse.provider}/${aiChatResponse.model}/${slugify(aiChatResponse.title)}.md`

fs.withWs(
  path,
  aiChatResponse.chunk
);
