"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { usePlatformDetection } from "@/hooks/use-platform-detection";
import { cn } from "@/lib/utils";
import { SidebarProps } from "@/types/ui";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/ui/atoms/resizable";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { ProviderModelSelector } from "@/ui/model-selector-drawer";
import { SettingsDrawer } from "@/ui/settings-drawer";
import { SidebarToggleButton } from "@/ui/sidebar-toggle-button";
import { EnhancedSidebar } from "@/ui/sidebar/enhanced";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { Button, Settings, ShareIcon as Share2 } from "@t3-chat-clone/ui";
import type {User} from "next-auth";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);

interface ChatLayoutShellProps {
  children: React.ReactNode;
  sidebarData: SidebarProps[];
  user: User;
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

  const handleOpenMobileModelSelector = useCallback(() => {
    setIsMobileModelSelectorOpen(true);
  }, []);

  // Shared header actions component
  const HeaderActions = () => (
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

  return (
    <motion.div className="bg-brand-background text-brand-text flex h-screen overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden",
          isSidebarOpen ? "opacity-100" : "pointer-events-none hidden"
        )}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 z-50 h-full transition-transform md:hidden",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
        <EnhancedSidebar
          className="h-full w-[280px] sm:w-[300px]"
          user={user}
          sidebarData={sidebarData}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex h-full w-full">
        {/* Mobile Layout */}
        <div className="flex h-full w-full flex-col md:hidden">
          <header className="border-brand-border bg-brand-background flex h-14 shrink-0 items-center justify-between border-b p-2 sm:p-4">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(true)}
                className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component mr-2">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
                <span className="sr-only">Open sidebar</span>
              </Button>
              <ProviderModelSelector
                onClick={handleOpenMobileModelSelector}
              />
            </div>
            <HeaderActions />
          </header>
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>

        {/* Desktop Layout with ResizablePanelGroup */}
        <ResizablePanelGroup
          direction="horizontal"
          className="hidden md:flex md:h-full"
          style={{ overflowY: "scroll" }}>
          {/* Desktop Sidebar Panel */}
          <ResizablePanel
            defaultSize={isSidebarOpen ? 20 : 0}
            minSize={0}
            style={{ overflowY: "scroll" }}
            maxSize={25}
            collapsible
            collapsedSize={0}
            onCollapse={() => setIsSidebarOpen(false)}
            onExpand={() => setIsSidebarOpen(true)}
            className={cn(
              "transition-all duration-300",
              !isSidebarOpen && "!w-0 !min-w-0"
            )}>
            <div className={cn("h-full", !isSidebarOpen && "hidden")}>
              <EnhancedSidebar
                className="h-full"
                user={user}
                sidebarData={sidebarData}
              />
            </div>
          </ResizablePanel>

          {/* Resizable Handle */}
          <ResizableHandle
            withHandle
            className={cn(
              "bg-brand-border/50 hover:bg-brand-border data-[panel-group-direction=horizontal]:w-1",
              !isSidebarOpen && "hidden"
            )}
          />

          {/* Main Content Panel */}
          <ResizablePanel style={{overflowY: "scroll"}}>
            <div className="flex h-full flex-col">
              <header className="border-brand-border bg-brand-background flex h-14 shrink-0 items-center justify-between border-b p-2 sm:p-4">
                <div className="flex items-center">
                  <SidebarToggleButton
                    isOpen={isSidebarOpen}
                    onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="mr-2"
                  />
                </div>
                <HeaderActions />
              </header>
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
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
