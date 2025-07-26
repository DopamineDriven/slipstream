"use client";

import type {
  CookieContextType,
  CookieKey,
  CookieValue,
  GetCookie
} from "@/lib/cookies";
import React, { createContext, useCallback, useContext } from "react";
import { COOKIES } from "@/lib/cookies";
import Cookies from "js-cookie";

const CookieContext = createContext<CookieContextType | undefined>(undefined);

export function CookieProvider({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const get = useCallback(<const K extends CookieKey>(key: K) => {
    return Cookies.get(key) as GetCookie<K> | undefined;
  }, []);

  const set = useCallback(
    <const K extends CookieKey>(
      key: K,
      value: CookieValue[K],
      options?: Cookies.CookieAttributes
    ) => {
      Cookies.set(COOKIES[key], value, options);
    },
    []
  );

  const remove = useCallback((key: CookieKey) => {
    Cookies.remove(COOKIES[key]);
  }, []);

  const getAll = useCallback((): Partial<CookieValue> => {
    const result: Record<string, string> = {};

    Array.from(Object.entries(COOKIES)).forEach(([key, _]) => {
      const k = key as keyof typeof COOKIES;
      const value = get(k);
      if (typeof value !== "undefined") {
        result[k] = value;
      }
    });

    return result as CookieValue;
  }, [get]);

  const contextValue: CookieContextType = {
    get,
    set,
    remove,
    getAll
  };

  return (
    <CookieContext.Provider value={contextValue}>
      {children}
    </CookieContext.Provider>
  );
}

export function useCookiesCtx() {
  const context = useContext(CookieContext);
  if (!context) {
    throw new Error("useCookies must be used within a CookieProvider");
  }
  return context;
}
