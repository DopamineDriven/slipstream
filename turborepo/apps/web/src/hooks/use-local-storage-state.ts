"use client";
import { useState, useEffect } from "react";

export function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, (v: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse<T>(raw) : defaultValue;
    } catch (err) {
      console.error(
        `something went wrong in useLocalStorageState...`,
        err instanceof Error ? err.message : ""
      );
      return defaultValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState];
}
