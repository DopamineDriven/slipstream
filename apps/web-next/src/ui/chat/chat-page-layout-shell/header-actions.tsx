"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";
import { useSettingsDrawer } from "@/context/settings-drawer-context";
import { Button, Settings, ShareIcon } from "@slipstream/ui";

export function HeaderActions({ children }: { children: ReactNode }) {
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
        <ShareIcon className="size-5" />
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
      {children}
    </div>
  );
}
