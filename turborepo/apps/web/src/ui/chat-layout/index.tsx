"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/ui/atoms/resizable";
import { SettingsDrawer } from "@/ui/settings-drawer";
import { Sidebar } from "@/ui/sidebar";
import { AnimatePresence, motion } from "framer-motion";

interface ScaffoldChatLayoutProps {
  children: React.ReactNode;
}

export function ScaffoldChatLayout({ children }: ScaffoldChatLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Start closed to prevent flash
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Handle hydration and initial sidebar state
  useEffect(() => {
    setIsHydrated(true);
    // Set sidebar state based on screen size after hydration
    setIsSidebarOpen(isDesktop);
  }, [isDesktop]);

  const handleNewChat = () => {
    // This will be passed down to children via context or props
    if (!isDesktop) setIsSidebarOpen(false);
  };

  // Show loading skeleton until hydrated
  if (!isHydrated) {
    return (
      <div className="bg-brand-background flex h-screen">
        {/* Desktop sidebar skeleton */}
        <div className="bg-brand-sidebar border-brand-border hidden w-[20%] border-r md:block">
          <div className="space-y-4 p-4">
            <div className="bg-brand-component h-10 animate-pulse rounded" />
            <div className="bg-brand-component h-8 animate-pulse rounded" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((_, i) => (
                <div
                  key={i}
                  className="bg-brand-component h-12 animate-pulse rounded"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Main content skeleton */}
        <div className="flex flex-1 flex-col">
          {/* Header skeleton */}
          <div className="bg-brand-background border-brand-border flex h-14 items-center justify-between border-b px-4">
            <div className="bg-brand-component h-8 w-8 animate-pulse rounded md:hidden" />
            <div className="bg-brand-component h-8 w-32 animate-pulse rounded" />
            <div className="flex space-x-2">
              <div className="bg-brand-component h-8 w-8 animate-pulse rounded" />
              <div className="bg-brand-component h-8 w-8 animate-pulse rounded" />
            </div>
          </div>

          {/* Content skeleton */}
          <div className="flex-1 p-4">
            <div className="bg-brand-component/20 h-full animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-brand-background text-brand-text flex h-screen overflow-hidden">
      {isDesktop ? (
        <ResizablePanelGroup direction="horizontal">
          {isSidebarOpen && (
            <ResizablePanel
              defaultSize={20}
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
                  onNewChat={handleNewChat}
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
          <ResizablePanel>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="h-full">
              {children}
            </motion.div>
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
                    onNewChat={handleNewChat}
                    onOpenSettings={() => setIsSettingsDrawerOpen(true)}
                    className="h-full w-[280px] sm:w-[300px]"
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>
          <div className="flex flex-grow flex-col overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="h-full">
              {children}
            </motion.div>
          </div>
        </>
      )}
      {/* Shared drawers */}
      <SettingsDrawer
        isOpen={isSettingsDrawerOpen}
        onOpenChange={setIsSettingsDrawerOpen}
      />
    </div>
  );
}
