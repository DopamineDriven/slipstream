"use client";

import type { User } from "next-auth";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePlatformDetection } from "@/hooks/use-platform-detection";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/ui/atoms/resizable";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { ProviderModelSelector } from "@/ui/model-selector-drawer";
import { SettingsDrawer } from "@/ui/settings-drawer";
import { Sidebar } from "@/ui/sidebar";
import { SidebarToggleButton } from "@/ui/sidebar-toggle-button";
import { Conversation } from "@prisma/client";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Settings, ShareIcon as Share2 } from "@t3-chat-clone/ui";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);

interface ChatLayoutShellProps {
  user?: User;
  recentConvos?: Conversation[];
  children: React.ReactNode;
}

export function ChatLayoutShell({
  user,
  recentConvos,
  children
}: ChatLayoutShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isMobileModelSelectorOpen, setIsMobileModelSelectorOpen] =
    useState(false);
  const { isMac } = usePlatformDetection();
  const isDesktop = useMediaQuery("(min-width: 768px)");


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

  useEffect(() => {
    setIsSidebarOpen(isDesktop);
  }, [isDesktop]);

  const handleUpdateChatTitle = useCallback(
    async (threadId: string, newTitle: string) => {
      console.log("Update chat title:", threadId, newTitle);
      // In a real app, this would update the database
    },
    []
  );

  const handleDeleteChat = useCallback(async (threadId: string) => {
    console.log("Delete chat:", threadId);
    // In a real app, this would delete from database
  }, []);

  const handleShareChat = useCallback(() => {
    console.log("Share chat clicked. Implement sharing logic.");
    alert("Share functionality to be implemented!");
  },[]);

  const handleOpenMobileModelSelector = useCallback(() => {
    setIsMobileModelSelectorOpen(true);
  }, []);

  return (
    <div className="bg-brand-background text-brand-text flex h-fit overflow-y-auto">
      {isDesktop ? (
        <ResizablePanelGroup direction="horizontal">
          {isSidebarOpen && (
            <ResizablePanel
              defaultSize={20}
              style={{ overflowY: "scroll" }}
              minSize={15}
              maxSize={25}
              collapsible
              onCollapse={() => setIsSidebarOpen(false)}
              onExpand={() => setIsSidebarOpen(true)}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}>
                <Sidebar
                  chatThreads={recentConvos}
                  user={user}
                  onUpdateChatTitleAction={handleUpdateChatTitle}
                  onDeleteChatAction={handleDeleteChat}
                  onOpenSettings={() => setIsSettingsDrawerOpen(true)}
                  className="h-full"
                />
              </motion.div>
            </ResizablePanel>
          )}
          {isSidebarOpen && (
            <ResizableHandle
              withHandle
              className="bg-brand-border/50 hover:bg-brand-border data-[panel-group-direction=horizontal]:w-1"
            />
          )}
          <ResizablePanel style={{ overflowY: "scroll" }}>
            <div className="flex h-screen flex-col justify-between">
              {/* Header */}
              <header className="border-brand-border bg-brand-background sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b p-2 sm:p-4">
                <div className="flex items-center">
                  <SidebarToggleButton
                    isOpen={isSidebarOpen}
                    onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="mr-2"
                  />
                </div>
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
              </header>

              {/* Dynamic Content Area */}
              <main className="flex flex-grow flex-col">{children}</main>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <>
          <AnimatePresence>
            {isSidebarOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40 bg-black/50"
                  onClick={() => setIsSidebarOpen(false)}
                />
                <motion.div
                  key="sidebar-mobile"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="fixed top-0 left-0 z-50 h-full">
                  <Sidebar
                    chatThreads={recentConvos}
                    user={user}
                    onUpdateChatTitleAction={handleUpdateChatTitle}
                    onDeleteChatAction={handleDeleteChat}
                    onOpenSettings={() => setIsSettingsDrawerOpen(true)}
                    className="h-full w-[280px] sm:w-[300px]"
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>
          <div className="flex flex-grow flex-col">
            {/* Header */}
            <header className="border-brand-border bg-brand-background sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b p-2 sm:p-4">
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(true)}
                  className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component mr-2 md:hidden">
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
                  user={user}
                  onClick={handleOpenMobileModelSelector}
                />
              </div>
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
            </header>

            {/* Dynamic Content Area */}
            <main className="flex flex-grow flex-col overflow-y-auto">
              {children}
            </main>
          </div>
        </>
      )}
      <SettingsDrawer
    
        user={user}
        isOpen={isSettingsDrawerOpen}
        onOpenChange={setIsSettingsDrawerOpen}
      />
      <MobileModelSelectorDrawer
        isOpen={isMobileModelSelectorOpen}
        onOpenChangeAction={setIsMobileModelSelectorOpen}
      />
    </div>
  );
}
