"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type SettingsTab = "apiKeys" | "account" | "customization" | "history";

interface SettingsDrawerContextValue {
  isOpen: boolean;
  activeTab: SettingsTab;
  open: () => void;
  close: () => void;
  openToTab: (tab: SettingsTab) => void;
  setActiveTab: (tab: SettingsTab) => void;
}

const SettingsDrawerContext = createContext<SettingsDrawerContextValue | undefined>(
  undefined
);

export function SettingsDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("apiKeys");

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const openToTab = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    setIsOpen(true);
  }, []);

  const value = useMemo<SettingsDrawerContextValue>(
    () => ({ isOpen, activeTab, open, close, openToTab, setActiveTab }),
    [isOpen, activeTab, open, close, openToTab]
  );

  return (
    <SettingsDrawerContext.Provider value={value}>
      {children}
    </SettingsDrawerContext.Provider>
  );
}

export function useSettingsDrawer() {
  const ctx = useContext(SettingsDrawerContext);
  if (!ctx) throw new Error("useSettingsDrawer must be used within SettingsDrawerProvider");
  return ctx;
}

