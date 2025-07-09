"use client";

import { Button, Sun, Moon } from "@t3-chat-clone/ui";
import { useEffect, useState } from "react";
import type { ComponentPropsWithRef } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle({
  style,
  ...props
}: Omit<ComponentPropsWithRef<typeof Button>, "variant" | "size" | "onClick">) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  if (!mounted) {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    return (
      <Button
        {...props}
        variant="ghost"
        size="icon"
        style={{
          ...style,
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "2.5rem",
          height: "2.5rem",
          borderRadius: "0.375rem"
        }}>
        {prefersDark ? (
          <Moon className="size-5" />
        ) : (
          <Sun className="size-5" />
        )}
        <span
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            padding: "0",
            margin: "-1px",
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            borderWidth: "0"
          }}>
          Toggle theme
        </span>
      </Button>
    );
  }

  return (
    <Button
      {...props}
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      style={{
        ...style,
        backgroundColor: "transparent",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "2.5rem",
        height: "2.5rem",
        borderRadius: "0.375rem"
      }}>
      {resolvedTheme === "dark" ? (
        <Moon className="size-5" />
      ) : (
        <Sun className="size-5" />
      )}
      <span
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: "0",
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          borderWidth: "0"
        }}>
        Toggle theme
      </span>
    </Button>
  );
}
