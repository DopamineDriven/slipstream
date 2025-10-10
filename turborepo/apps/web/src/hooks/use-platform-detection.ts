"use client"

import { useCookiesCtx } from "@/context/cookie-context";

interface PlatformInfo {
  isMac: boolean
  isIOS: boolean
  viewport: "mobile" | "desktop"
  country: string
  city: string
  timezone: string
  coordinates: string
  hostname: string
}

export function usePlatformDetection(): PlatformInfo {
  const { get } = useCookiesCtx();

  return {
    isMac: get("isMac") === "true",
    isIOS: get("ios") === "true",
    viewport: (get("viewport") as "mobile" | "desktop" | undefined) ?? "desktop",
    country: get("country") ?? "US",
    city: get("city") ?? "Chicago",
    timezone: get("tz") ?? "america/chicago",
    coordinates: get("latlng") ?? "41.8338486,-87.8966849",
    hostname: get("hostname") ?? "localhost",
  }
}

export function useIsMac(): boolean {
  const { get } = useCookiesCtx();
  return get("isMac") === "true";
}
