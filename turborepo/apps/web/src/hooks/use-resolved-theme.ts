"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

export function useResolvedTheme() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    // Check if user prefers dark mode
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    // Apply theme based on system preference during initial load
    if (!resolvedTheme) {
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else {
      // Apply theme based on resolvedTheme once it's available
      if (resolvedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [resolvedTheme]);
  return resolvedTheme;
}
