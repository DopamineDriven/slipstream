"use client";

import type { SidebarProps } from "@/types/ui";
import type { User } from "@/utils/auth-client";
import type React from "react";
import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useCookiesCtx } from "@/context/cookie-context";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@/ui/atoms/sidebar";
import { HeaderActions } from "@/ui/chat/chat-page-layout-shell/header-actions";
import { MobileModelSelectorDrawer } from "@/ui/chat/mobile-model-selector-drawer";
import { ProviderModelSelector } from "@/ui/chat/provider-model-selector";
import { SettingsDrawer } from "@/ui/chat/settings-drawer";
import { EnhancedSidebar } from "@/ui/chat/sidebar";
import { useTheme } from "next-themes";
import {
  PanelLeftClose,
  Separator,
  useKeyboardShortcuts,
  useResolvedTheme
} from "@slipstream/ui";

const ThemeToggle = dynamic(
  () => import("@/ui/layout/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);

export function ChatLayoutShell({
  children,
  fallbackData,
  user
}: {
  children: React.ReactNode;
  fallbackData?: SidebarProps[];
  user?: User;
}) {
  const { resolvedTheme } = useTheme();

  useResolvedTheme(resolvedTheme);

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
                    <PanelLeftClose className="size-5" />
                    <span className="sr-only">Toggle Sidebar</span>
                  </SidebarTrigger>
                  <Separator orientation="vertical" className="mx-2 h-6" />
                  <ProviderModelSelector />
                </div>
                <HeaderActions>
                  <ThemeToggle className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component" />
                </HeaderActions>
              </header>
              <div className="flex-1 overflow-y-auto">{children}</div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
      <MobileModelSelectorDrawer />
      <SettingsDrawer user={user} />
    </div>
  );
}
