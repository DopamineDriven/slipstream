"use client";

import type React from "react";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useSettingsDrawer } from "@/context/settings-drawer-context";
import dynamic from "next/dynamic";
import { useCookiesCtx } from "@/context/cookie-context";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useResolvedTheme } from "@/hooks/use-resolved-theme";
import { SidebarProps } from "@/types/ui";
import type { ClientWorkupProps } from "@/types/shared";
import type { User } from "@/utils/auth-client";
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
import {
  Button,
  PanelLeftClose as PanelLeft,
  Separator,
  Settings,
  ShareIcon as Share2
} from "@slipstream/ui";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);

interface ChatLayoutShellProps {
  children: React.ReactNode;
  fallbackData?: SidebarProps[];
  apiKeyData?: ClientWorkupProps;
  user?: User;
}

function HeaderActions() {
  useResolvedTheme();
  const { openToTab } = useSettingsDrawer();
  const handleShareChat = useCallback(() => {
    console.log("Share chat clicked. Implement sharing logic.");
    alert("Share functionality to be implemented!");
  }, []);

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
        onClick={() => openToTab("apiKeys")}
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
  fallbackData,
  apiKeyData,
  user
}: ChatLayoutShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
    <div className="bg-background text-foreground h-full w-screen overflow-hidden">
      <SidebarProvider>
        <div className="flex h-full w-full overflow-hidden">
          <Sidebar collapsible="icon" className="bg-muted/20 border-r">
            <Suspense>
              <EnhancedSidebar fallbackData={fallbackData} />
            </Suspense>
          </Sidebar>
          <SidebarInset className="flex-1">
            <div className="flex h-dvh flex-col">
              <header className="border-border bg-background relative flex h-14 shrink-0 items-center justify-between border-b px-4">
                <div className="flex min-w-0 items-center">
                  <SidebarTrigger className="z-100">
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
      {apiKeyData && (
        <SettingsDrawer
          initialData={apiKeyData}
          user={user}
        />
      )}
    </div>
  );
}
