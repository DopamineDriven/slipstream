"use client";

import type React from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useCookiesCtx } from "@/context/cookie-context";
import { useModelSelection } from "@/context/model-selection-context";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@/ui/atoms/sidebar";
import { MobileModelSelectorDrawer } from "@/ui/chat/mobile-model-selector-drawer";
import { ProviderModelSelector } from "@/ui/chat/provider-model-selector";
import { SettingsDrawer } from "@/ui/chat/settings-drawer";
import { EnhancedSidebar } from "@/ui/chat/sidebar";
import { useTheme } from "next-themes";
import {
  Button,
  PanelLeftClose as PanelLeft,
  Separator,
  Settings,
  ShareIcon as Share2
} from "@t3-chat-clone/ui";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);

interface ChatLayoutShellProps {
  children: React.ReactNode;
}

function HeaderActions() {
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

  const handleShareChat = useCallback(() => {
    console.log("Share chat clicked. Implement sharing logic.");
    alert("Share functionality to be implemented!");
  }, []);
  const { openDrawer } = useModelSelection();
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
        onClick={openDrawer}
        className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
        <Settings className="size-5" />
        <span className="sr-only">Settings</span>
      </Button>
      <ThemeToggle className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component" />
    </div>
  );
}

export function ChatLayoutShell({ children }: ChatLayoutShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);

  const { get } = useCookiesCtx();
  const isMac = get("isMac") === "true";
  const keyboardShortcutsMemo = useMemo(() => {
    return [
      {
        key: "s",
        ctrlKey: !isMac,
        metaKey: isMac,
        shiftKey: true,
        callback: () => setIsSidebarOpen(!isSidebarOpen),
        description: "Toggle sidebar"
      }
    ];
  }, [isMac, isSidebarOpen]);

  useKeyboardShortcuts(keyboardShortcutsMemo);

  return (
    <>
      <SidebarProvider>
        <div className="flex h-screen w-screen overflow-hidden">
          <Sidebar collapsible="icon" className="bg-muted/20 border-r">
            <Suspense>
              <EnhancedSidebar />
            </Suspense>
          </Sidebar>
          <SidebarInset className="flex-1">
            <div className="flex h-full flex-col">
              <header className="border-border bg-background flex h-14 shrink-0 items-center justify-between border-b px-4">
                <div className="flex items-center">
                  <SidebarTrigger className="-ml-2 z-30">
                    <PanelLeft className="size-5" />
                    <span className="sr-only">Toggle Sidebar</span>
                  </SidebarTrigger>
                  <Separator orientation="vertical" className="mx-2 h-6" />
                  <ProviderModelSelector />
                </div>
                <HeaderActions />
              </header>
              <div className="flex-1 overflow-y-auto">{children}</div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
      <MobileModelSelectorDrawer />
      <SettingsDrawer
        isOpen={isSettingsDrawerOpen}
        onOpenChange={setIsSettingsDrawerOpen}
      />
    </>
  );
}
