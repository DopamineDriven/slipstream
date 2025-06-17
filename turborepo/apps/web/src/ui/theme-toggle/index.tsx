"use client";

import type React from "react";
import { Button, Icon } from "@t3-chat-clone/ui";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof Button>) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  // Determine the icon to show before mount, based on system preference or stored theme (via script)
  let initialIcon = <Icon.Sun className="size-5" />; // Default to Sun
  if (typeof window !== "undefined") {
    const scriptSetDark = document.documentElement.classList.contains("dark");
    if (scriptSetDark) {
      initialIcon = <Icon.Moon className="size-5" />;
    }
  }

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        disabled // Disable button until mounted to prevent interaction issues
        aria-label="Toggle theme (loading)"
        {...props}>
        {initialIcon}
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={className}
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
      {...props}>
      {resolvedTheme === "dark" ? (
        <Icon.Moon className="size-5" />
      ) : (
        <Icon.Sun className="size-5" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
