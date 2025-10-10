"use client";

import { useCookiesCtx } from "@/context/cookie-context";

export function useIos() {
  const { get } = useCookiesCtx();
  return get("ios") === "true";
}
