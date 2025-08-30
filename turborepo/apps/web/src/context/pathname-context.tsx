"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react";

interface PathnameContextValue {
  pathname: string;
  isHome: boolean;
  isChat: boolean;
  isSettings: boolean;
  conversationId: string | null;
  setPathname: (pathname: string) => void;
}

const PathnameContext = createContext<PathnameContextValue | null>(null);

export function PathnameProvider({
  children
}: Readonly<{ children: ReactNode }>) {
  const [currentPathname, setCurrentPathname] = useState("/");

  const setPathname = useCallback((pathname: string) => {
    setCurrentPathname(pathname);
  }, []);

  const value = useMemo<PathnameContextValue>(() => {
    const isHome = currentPathname === "/";
    const isChat = currentPathname.startsWith("/chat");
    const isSettings = currentPathname.startsWith("/settings");

    let conversationId: string | null = null;

    if (isHome) {
      conversationId = "new-chat";
     if (typeof window !=="undefined") console.log(window.history.state) // to monitor real conversationId acquisition from history.state object on shallow history.push event by ai-chat-context during streaming (before next.js route is re-synced with actual history.state to prevent redirects during streaming). this only occurs when /chat/new-chat is the path ->that's when to monitor window.history.state for updates to pluck out the true conversationId, else pathname is the source of truth
    } else if (isChat) {
      const parts = currentPathname.split("/");
      if (parts.length >= 3 && parts[2]) {
        conversationId = parts[2];
      } else {
        conversationId = "new-chat";
      }
    }

    return {
      pathname: currentPathname,
      isHome,
      isChat,
      isSettings,
      conversationId,
      setPathname
    };
  }, [currentPathname, setPathname]);

  return (
    <PathnameContext.Provider value={value}>
      {children}
    </PathnameContext.Provider>
  );
}

export function usePathnameContext() {
  const context = useContext(PathnameContext);
  if (!context) {
    throw new Error("usePathnameContext must be used within PathnameProvider");
  }
  return context;
}
