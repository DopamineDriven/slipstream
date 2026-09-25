import type {
  BaseOpenAISize,
  GPTSizesUnion,
  GrokImagine2ARUnion,
  NanoBanana2OutputAR
} from "@slipstream/types";
import { toN } from "@slipstream/ui";

export type OpenAIAR = GPTSizesUnion["ar"];

export type OpenAISize = GPTSizesUnion["sizes"] | BaseOpenAISize;

// meta is covered by OpenAI, uses BaseOpenAISize only
export type ProviderAR = GrokImagine2ARUnion | NanoBanana2OutputAR | OpenAIAR;
export type AspectInput = ProviderAR | OpenAISize;
export type Ratio = { readonly w: number; readonly h: number };

const ASPECT_RE = /^(?<w>\d+(?:\.\d+)?)[x:](?<h>\d+(?:\.\d+)?)$/;

export function parseAspect(input: "auto"): null;
export function parseAspect(input: Exclude<AspectInput, "auto">): Ratio;
export function parseAspect(input: AspectInput): Ratio | null;
export function parseAspect(input: AspectInput) {
  if (input === "auto") return null;
  const groups = ASPECT_RE.exec(input)?.groups;
  const w = groups?.w;
  const h = groups?.h;
  if (w === undefined || h === undefined) {
    throw new Error(`${input}: expected "W:H" or "WxH"`);
  }
  return { w: toN(w), h: toN(h) };
}
