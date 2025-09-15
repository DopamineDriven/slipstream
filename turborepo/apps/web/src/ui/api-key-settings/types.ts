import type { Providers } from "@slipstream/types";
import type { ComponentPropsWithRef, JSX } from "react";

export interface ApiKeyData {
  provider: Providers;
  text: string;
  icon: ({
    ...svg
  }: Omit<
    ComponentPropsWithRef<"svg">,
    "viewBox" | "fill" | "xmlns" | "role"
  >) => JSX.Element;
  value?: string;
  isSet?: boolean;
  isDefault?: boolean;
}
