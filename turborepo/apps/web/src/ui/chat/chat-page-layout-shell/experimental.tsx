"use client";

import type { User } from "next-auth";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { usePlatformDetection } from "@/hooks/use-platform-detection";
import { SidebarProps } from "@/types/ui";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@/ui/atoms/sidebar";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { SettingsDrawer } from "@/ui/settings-drawer";
import { EnhancedSidebar } from "@/ui/sidebar/enhanced";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import {
  Button,
  PanelLeftClose as PanelLeft,
  Settings,
  ShareIcon as Share2
} from "@t3-chat-clone/ui";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);

interface ChatLayoutShellProps {
  children: React.ReactNode;
  sidebarData: SidebarProps[];
  user: User;
}

function HeaderActions({
  handleShareChat,
  setIsSettingsDrawerOpen
}: {
  handleShareChat: () => void;
  setIsSettingsDrawerOpen: () => React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (!resolvedTheme) {
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else {
      if (resolvedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [resolvedTheme]);
  return (
    <div className="flex items-center space-x-1 sm:space-x-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleShareChat}
        className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
        <Share2 className="size-5" />
        <span className="sr-only">Share chat</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsSettingsDrawerOpen(true)}
        className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
        <Settings className="size-5" />
        <span className="sr-only">Settings</span>
      </Button>
      <ThemeToggle className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component" />
    </div>
  );
}

export function ChatLayoutShell({
  children,
  sidebarData,
  user
}: ChatLayoutShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isMobileModelSelectorOpen, setIsMobileModelSelectorOpen] =
    useState(false);
  const { isMac } = usePlatformDetection();

  const keyboardShortcutsMemo = useMemo(
    () => [
      {
        key: "s",
        ctrlKey: !isMac,
        metaKey: isMac,
        shiftKey: true,
        callback: () => setIsSidebarOpen(!isSidebarOpen),
        description: "Toggle sidebar"
      }
    ],
    [isMac, isSidebarOpen]
  );

  useKeyboardShortcuts(keyboardShortcutsMemo);

  // Auto-open sidebar on desktop mount
  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    setIsSidebarOpen(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsSidebarOpen(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const handleShareChat = useCallback(() => {
    console.log("Share chat clicked. Implement sharing logic.");
    alert("Share functionality to be implemented!");
  }, []);



  // Shared header actions component

  return (
    <motion.div className="bg-brand-background text-brand-text flex h-screen overflow-hidden">
      <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar collapsible="icon" className="border-r bg-muted/20">
          <EnhancedSidebar user={user} sidebarData={sidebarData} />
        </Sidebar>
        <SidebarInset className="flex-1">
          <div className="flex h-full flex-col">
            <header className="border-border bg-background flex h-14 shrink-0 items-center justify-between border-b px-4">
              <div className="flex items-center">
                <SidebarTrigger className="-ml-2">
                  <PanelLeft className="size-5" />
                  <span className="sr-only">Toggle Sidebar</span>
                </SidebarTrigger>
                <Separator orientation="vertical" className="mx-2 h-6" />
                <h1 className="text-lg font-semibold">Chat</h1>
              </div>
              <HeaderActions handleShareChat={handleShareChat} setIsSettingsDrawerOpen={setIsSettingsDrawerOpen} />
            </header>
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
      <SettingsDrawer
        isOpen={isSettingsDrawerOpen}
        onOpenChange={setIsSettingsDrawerOpen}
      />
      <MobileModelSelectorDrawer
        isOpen={isMobileModelSelectorOpen}
        onOpenChangeAction={setIsMobileModelSelectorOpen}
      />
    </motion.div>
  );
}
