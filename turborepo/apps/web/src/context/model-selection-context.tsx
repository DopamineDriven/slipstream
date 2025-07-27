"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { defaultModelSelection, ModelSelection } from "@/lib/models";
import type { AllModelsUnion, Provider } from "@t3-chat-clone/types";
import {
  displayNameToModelId,
  getModelIdByDisplayName,
  getAllProviders
} from "@t3-chat-clone/types";

interface ModelSelectionContextType {
  selectedModel: ModelSelection;
  isDrawerOpen: boolean;
  providers: readonly ["anthropic", "gemini", "grok", "openai"]
  setSelectedModel: (m: ModelSelection) => void;
  updateProvider: (p: Provider) => void;
  updateModel: (name: string, id: AllModelsUnion) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  handleModelSelect: <const V extends Provider>(
    provider: V,
    displayName: keyof (typeof displayNameToModelId)[V]
  ) => void;
}

const STORAGE_KEY = "selected-ai-model";

const ModelSelectionContext = createContext<
  | { [P in keyof ModelSelectionContextType]: ModelSelectionContextType[P] }
  | undefined
>(undefined);

export function ModelSelectionProvider({ children }: { children: ReactNode }) {
  const { lastEvent } = useChatWebSocketContext();

  // Safe default so SSR/client hydration always matches
  const [selectedModel, setSelectedModel] = useState<ModelSelection>(
    defaultModelSelection
  );
  // Add drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Load from localStorage exactly once, after mount
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

  // Persist whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedModel));
    } catch {
      /* ignore quota errors */
    }
  }, [selectedModel]);

  // Keep WebSocket-based reactions separate
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "ai_chat_error") {
      // reset model on error
      setSelectedModel(defaultModelSelection);
    }
    // etc.
  }, [lastEvent]);

  // Simple updater callbacks
  const updateProvider = useCallback((provider: Provider) => {
    setSelectedModel(m => ({ ...m, provider }));
  }, []);

  const updateModel = useCallback(
    (displayName: string, modelId: AllModelsUnion) => {
      setSelectedModel(m => ({ ...m, displayName, modelId }));
    },
    []
  );

  // Drawer control methods
  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  // combined model selection handler
  const handleModelSelect = useCallback(
    <const V extends Provider>(
      provider: V,
      displayName: keyof (typeof displayNameToModelId)[V]
    ) => {
      const modelId = getModelIdByDisplayName(provider, displayName);
      updateProvider(provider);
      updateModel(displayName as string, modelId as AllModelsUnion);
      closeDrawer();
    },
    [closeDrawer, updateModel, updateProvider]
  );

  const providers = useMemo(() => getAllProviders(),[]);

  return (
    <ModelSelectionContext.Provider
      value={{
        selectedModel,
        isDrawerOpen,
        providers,
        setSelectedModel,
        updateProvider,
        updateModel,
        openDrawer,
        closeDrawer,
        handleModelSelect
      }}>
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
