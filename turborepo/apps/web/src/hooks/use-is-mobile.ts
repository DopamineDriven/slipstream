"use client";

import { useCallback, useEffect, useState } from "react";
import { useCookiesCtx } from "@/context/cookie-context";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const { get } = useCookiesCtx();

  const checkIsMobile = useCallback(() => {
    const viewportCookie = get("viewport");

    const isTouchDevice =
      "ontouchstart" in window ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
      window.matchMedia("(pointer: coarse)").matches;

    const vmin = Math.min(window.innerWidth, window.innerHeight);
    const deviceIsMobile = isTouchDevice && vmin < 500;
    if (viewportCookie === "mobile") {
      setIsMobile(true);
    } else if (viewportCookie === "desktop") {
      setIsMobile(false);
    } else {
      setIsMobile(deviceIsMobile);
    }
  }, [get]);

  useEffect(() => {
    checkIsMobile();

    window.addEventListener("resize", checkIsMobile);
    window.addEventListener("orientationchange", checkIsMobile);

    return () => {
      window.removeEventListener("resize", checkIsMobile);
      window.removeEventListener("orientationchange", checkIsMobile);
    };
  }, [checkIsMobile]);

  return isMobile;
}
