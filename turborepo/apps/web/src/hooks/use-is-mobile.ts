"use client";

import { useCallback, useEffect, useState } from "react";
import { useCookiesCtx } from "@/context/cookie-context";

export function useIsMobile() {
  const { get } = useCookiesCtx();

  const initialIsMobile = () => {
    const viewportCookie = get("viewport");
    if (viewportCookie === "mobile") return true;
    if (viewportCookie === "desktop") return false;

    if (typeof window === "undefined") return false;
    const isTouchDevice =
      "ontouchstart" in window ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
      window.matchMedia("(pointer: coarse)").matches;
    const vmin = Math.min(window.innerWidth, window.innerHeight);
    return isTouchDevice && vmin < 500;
  };

  const [isMobile, setIsMobile] = useState<boolean>(initialIsMobile);

  const checkIsMobile = useCallback(() => {
    const viewportCookie = get("viewport");
    if (viewportCookie === "mobile") return setIsMobile(true);
    if (viewportCookie === "desktop") return setIsMobile(false);

    const isTouchDevice =
      "ontouchstart" in window ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
      window.matchMedia("(pointer: coarse)").matches;
    const vmin = Math.min(window.innerWidth, window.innerHeight);
    setIsMobile(isTouchDevice && vmin < 500);
  }, [get]);

  useEffect(() => {
    window.addEventListener("resize", checkIsMobile);
    window.addEventListener("orientationchange", checkIsMobile);
    return () => {
      window.removeEventListener("resize", checkIsMobile);
      window.removeEventListener("orientationchange", checkIsMobile);
    };
  }, [checkIsMobile]);

  return isMobile;
}
