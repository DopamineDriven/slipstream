"use client";

import { useEffect, useEffectEvent, useState } from "react";

export function useViewportDimensions() {
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const setDimensionsEffect = useEffectEvent(() => {
    if (typeof window === "undefined") return;
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight
    });
  });

  useEffect(() => {
    setDimensionsEffect();
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return dimensions ?? { width: 0, height: 0 };
}
