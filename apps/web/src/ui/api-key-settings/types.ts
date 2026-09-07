import type { Provider, Rm } from "@slipstream/types";
import type { ComponentPropsWithRef, JSX } from "react";

export type ProviderIcon = (
  svg: Rm<ComponentPropsWithRef<"svg">, "viewBox" | "fill" | "xmlns" | "role">
) => JSX.Element;

/**
 * one immutable roster row per supported provider — display metadata only.
 * Whether a key is on file / is the default comes from `providerContext`
 * (server truth) at render time; nothing here is ever mutated.
 */
export interface ProviderRosterEntry {
  readonly provider: Provider;
  readonly text: string;
  readonly icon: ProviderIcon;
  readonly placeholder: string;
}
