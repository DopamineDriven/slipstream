"use client";

import { Icon } from "@t3-chat-clone/ui";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";

const ThemeToggle = dynamic(
  () => import("@/ui/theme").then(d => d.ThemeToggle),
  { ssr: false }
);

export function Nav() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
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
  
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 max-w-9xl sticky top-0 z-40 w-full self-center border-b backdrop-blur">
      <div className="container flex h-14 items-center">
        <div className="mx-2 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Icon.Package className="size-6" />
            <span className="font-bold">turbogen</span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-6">
            <Link
              href="https://github.com/DopamineDriven/d0paminedriven"
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-2">
              <Icon.Github className="size-5" />
              <span className="sr-only">GitHub</span>
            </Link>
            <Link
              href="#"
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
              Documentation
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
}
