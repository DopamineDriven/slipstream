"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  useOpenAIImageSettings,
  isOpenAIImgGenCapable,
  type OpenAIImageSettings,
  type OpenAIAspectRatioOption,
  type OpenAIQualityOption,
} from "@/hooks/use-openai-img-gen";

import {
  useGoogleImageSettings,
  isGoogleImgGenCapable,
  type GoogleImageSettings,
  type GoogleAspectRatio,
  type GoogleQuality,
} from "@/hooks/use-gemini-img-gen";

import {
  useGrokImageSettings,
  isGrokImgGenCapable,
  type GrokImageSettings,
  type GrokAspectRatio,
  type GrokQuality,
} from "@/hooks/use-grok-img-gen";

export type ImageGenProvider = "openai" | "gemini" | "grok";

export function detectProvider(modelId: string): ImageGenProvider | null {
  if (isOpenAIImgGenCapable(modelId)) return "openai";
  if (isGoogleImgGenCapable(modelId)) return "gemini";
  if (isGrokImgGenCapable(modelId)) return "grok";
  return null;
}

export function isImgGenCapable(modelId: string) {
  return detectProvider(modelId) !== null;
}

export interface UnifiedImageSettings {
  aspectRatio: string;
  quality: string;
  outputFormat?: string;
  background?: string;
}

export interface UnifiedAspectRatioOption {
  value: string;
  label: string;
  pixelSize?: string;
}

export interface UnifiedQualityOption {
  value: string;
  label: string;
}

interface ImageGenSettingsContextType {
  modelId: string;
  setModelId: (modelId: string) => void;
  provider: ImageGenProvider | null;
  isCapable: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  settings: UnifiedImageSettings | null;
  updateSettings: (updates: Partial<UnifiedImageSettings>) => void;
  resetSettings: () => void;
  aspectRatios: UnifiedAspectRatioOption[];
  qualities: UnifiedQualityOption[];
  supportsOutputFormat: boolean;
  supportsBackground: boolean;
  openai: ReturnType<typeof useOpenAIImageSettings>;
  gemini: ReturnType<typeof useGoogleImageSettings>;
  grok: ReturnType<typeof useGrokImageSettings>;
}

const ImageGenSettingsContext = createContext<ImageGenSettingsContextType | undefined>(undefined);

interface ImageGenSettingsProviderProps {
  children: ReactNode;
  initialModelId?: string;
}

export function ImageGenSettingsProvider({
  children,
  initialModelId = "",
}: ImageGenSettingsProviderProps) {
  const [modelId, setModelId] = useState(initialModelId);
  const [isOpen, setIsOpen] = useState(false);

  const openai = useOpenAIImageSettings(modelId);
  const gemini = useGoogleImageSettings(modelId);
  const grok = useGrokImageSettings(modelId);

  const provider = useMemo(() => detectProvider(modelId), [modelId]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const settings = useMemo((): UnifiedImageSettings | null => {
    switch (provider) {
      case "openai":
        return {
          aspectRatio: openai.settings.aspectRatio,
          quality: openai.settings.quality,
          outputFormat: openai.settings.outputFormat,
          background: openai.settings.background,
        };
      case "gemini":
        return {
          aspectRatio: gemini.settings.aspectRatio,
          quality: gemini.settings.quality,
        };
      case "grok":
        return {
          aspectRatio: grok.settings.aspectRatio,
          quality: grok.settings.quality,
        };
      default:
        return null;
    }
  }, [provider, openai.settings, gemini.settings, grok.settings]);

  const updateSettings = useCallback(
    (updates: Partial<UnifiedImageSettings>) => {
      switch (provider) {
        case "openai":
          openai.updateSettings(updates as Partial<OpenAIImageSettings>);
          break;
        case "gemini":
          gemini.updateSettings(updates as Partial<GoogleImageSettings>);
          break;
        case "grok":
          grok.updateSettings(updates as Partial<GrokImageSettings>);
          break;
      }
    },
    [provider, openai, gemini, grok]
  );

  const resetSettings = useCallback(() => {
    switch (provider) {
      case "openai":
        openai.resetSettings();
        break;
      case "gemini":
        gemini.resetSettings();
        break;
      case "grok":
        grok.resetSettings();
        break;
    }
  }, [provider, openai, gemini, grok]);

  const aspectRatios = useMemo((): UnifiedAspectRatioOption[] => {
    switch (provider) {
      case "openai":
        return openai.aspectRatios.map((ar: OpenAIAspectRatioOption) => ({
          value: ar.value,
          label: ar.label,
          pixelSize: ar.pixelSize,
        }));
      case "gemini":
        return (gemini.aspectRatios ?? []).map((ar: GoogleAspectRatio) => ({
          value: ar,
          label: ar,
        }));
      case "grok":
        return grok.aspectRatios.map((ar: GrokAspectRatio) => ({
          value: ar,
          label: ar,
        }));
      default:
        return [];
    }
  }, [provider, openai.aspectRatios, gemini.aspectRatios, grok.aspectRatios]);

  const qualities = useMemo((): UnifiedQualityOption[] => {
    switch (provider) {
      case "openai":
        return openai.qualities.map((q: OpenAIQualityOption) => ({
          value: q.value,
          label: q.label,
        }));
      case "gemini":
        return (gemini.qualities ?? []).map((q: GoogleQuality) => ({
          value: q,
          label: q,
        }));
      case "grok":
        return grok.qualities.map((q: GrokQuality) => ({
          value: q,
          label: q,
        }));
      default:
        return [];
    }
  }, [provider, openai.qualities, gemini.qualities, grok.qualities]);

  const supportsOutputFormat = useMemo(() => {
    switch (provider) {
      case "openai":
        return openai.supportsOutputFormat;
      case "gemini":
        return gemini.supportsOutputFormat;
      case "grok":
        return grok.supportsOutputFormat;
      default:
        return false;
    }
  }, [provider, openai.supportsOutputFormat, gemini.supportsOutputFormat, grok.supportsOutputFormat]);

  const supportsBackground = useMemo(() => {
    switch (provider) {
      case "openai":
        return openai.supportsBackground;
      default:
        return false;
    }
  }, [provider, openai.supportsBackground]);

  const isCapable = provider !== null;

  const value = useMemo(
    () => ({
      modelId,
      setModelId,
      provider,
      isCapable,
      isOpen,
      open,
      close,
      toggle,
      settings,
      updateSettings,
      resetSettings,
      aspectRatios,
      qualities,
      supportsOutputFormat,
      supportsBackground,
      openai,
      gemini,
      grok,
    }),
    [
      modelId,
      provider,
      isCapable,
      isOpen,
      open,
      close,
      toggle,
      settings,
      updateSettings,
      resetSettings,
      aspectRatios,
      qualities,
      supportsOutputFormat,
      supportsBackground,
      openai,
      gemini,
      grok,
    ]
  );

  return (
    <ImageGenSettingsContext.Provider value={value}>
      {children}
    </ImageGenSettingsContext.Provider>
  );
}

export function useImageGenSettings() {
  const ctx = useContext(ImageGenSettingsContext);
  if (!ctx) {
    throw new Error("useImageGenSettings must be used within ImageGenSettingsProvider");
  }
  return ctx;
}

