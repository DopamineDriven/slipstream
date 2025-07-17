"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { ModelSelection, defaultModelSelection } from "@/lib/models";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import type { Provider, AllModelsUnion } from "@t3-chat-clone/types";

interface Context {
  selectedModel: ModelSelection;
  setSelectedModel: (m: ModelSelection) => void;
  updateProvider: (p: Provider) => void;
  updateModel: (name: string, id: AllModelsUnion) => void;
}

const STORAGE_KEY = "selected-ai-model";
const ModelSelectionContext = createContext<Context | undefined>(undefined);

export function ModelSelectionProvider({ children }: { children: ReactNode }) {
  const { lastEvent } = useChatWebSocketContext();

  // 1. Safe default so SSR/client hydration always matches
  const [selectedModel, setSelectedModel] = useState<ModelSelection>(
    defaultModelSelection
  );

  // 2. Load from localStorage exactly once, after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSelectedModel(JSON.parse(stored) as ModelSelection);
      }
    } catch (err) {
      console.warn("Could not load model from storage:", err);
    }
  }, []);

  // 3. Persist whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedModel));
    } catch {
      /* ignore quota errors */
    }
  }, [selectedModel]);

  // 4. Keep your WebSocket-based reactions separate
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "ai_chat_error") {
      // maybe reset model?
      setSelectedModel(defaultModelSelection);
    }
    // …etc.
  }, [lastEvent]);

  // 5. Simple updater callbacks
  const updateProvider = useCallback((provider: Provider) => {
    setSelectedModel((m) => ({ ...m, provider }));
  }, []);

  const updateModel = useCallback(
    (displayName: string, modelId: AllModelsUnion) => {
      setSelectedModel((m) => ({ ...m, displayName, modelId }));
    },
    []
  );

  return (
    <ModelSelectionContext.Provider
      value={{ selectedModel, setSelectedModel, updateProvider, updateModel }}
    >
      {children}
    </ModelSelectionContext.Provider>
  );
}

export function useModelSelection() {
  const ctx = useContext(ModelSelectionContext);
  if (!ctx) {
    throw new Error("useModelSelection must be inside a provider");
  }
  return ctx;
}
