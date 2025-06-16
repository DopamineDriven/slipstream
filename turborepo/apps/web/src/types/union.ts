import type { Unenumerate } from "@/types/helpers";

export type Split<S extends string> = S extends `${infer First}${infer Rest}`
  ? [First, ...Split<Rest>]
  : [];

export type SplitR<S extends string> = S extends `${infer First}${infer Rest}`
  ? readonly [First, ...Split<Rest>]
  : [];

export type AtoZ = `abcdefghijklmnopqrstuvwxyz`;

export type LowerAlphabet = Unenumerate<Split<AtoZ>>;
