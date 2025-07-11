import type { Providers } from "@t3-chat-clone/types";
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
