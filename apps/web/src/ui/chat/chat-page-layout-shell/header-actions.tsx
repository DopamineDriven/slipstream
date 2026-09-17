"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useSettingsDrawer } from "@/context/settings-drawer-context";
import { useSTTCtx } from "@/context/stt-context";
import { LanguageSettings } from "@/ui/chat/stt";
import { Button, Settings, SlidersHorizontal } from "@slipstream/ui";

export function HeaderActions({ children }: { children: ReactNode }) {
  const { openToTab } = useSettingsDrawer();
  const stt = useSTTCtx();
  const [isSpeechSettingsOpen, setIsSpeechSettingsOpen] = useState(false);

  return (
    <div className="flex items-center space-x-1 sm:space-x-2">
      <Button
        variant="ghost"
        size="icon"
        title={
          stt.languageOption
            ? `Speech language (${stt.languageOption.name})`
            : "Speech language (auto-detect)"
        }
        aria-haspopup="dialog"
        aria-expanded={isSpeechSettingsOpen}
        onClick={() => setIsSpeechSettingsOpen(true)}
        className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
        <SlidersHorizontal className="size-5" />
        <span className="sr-only">Speech language settings</span>
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
      <LanguageSettings
        open={isSpeechSettingsOpen}
        onOpenChange={setIsSpeechSettingsOpen}
        value={stt.language}
        onChange={stt.setLanguage}
        languages={stt.languages}
      />
    </div>
  );
}
