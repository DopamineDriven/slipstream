```tsx
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
  type OpenAIImageSettings,
  type OpenAIAspectRatioOption,
  type OpenAIQualityOption,
} from "@/hooks/use-openai-image-settings";

import {
  useGoogleImageSettings,
  type GoogleImageSettings,
  type GoogleAspectRatio,
  type GoogleQuality,
} from "@/hooks/use-google-image-settings";

import {
  useGrokImageSettings,
  type GrokImageSettings,
  type GrokAspectRatio,
  type GrokQuality,
} from "@/hooks/use-grok-image-settings";

import { useModelSelection } from "@/context/model-selection-context";

export type ImageGenProvider = "openai" | "gemini" | "grok";


export type UnifiedAspectRatio = string;
export type UnifiedQuality = string;

export interface UnifiedImageSettings {
  aspectRatio: UnifiedAspectRatio;
  quality: UnifiedQuality;
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
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  settings: UnifiedImageSettings;
  updateSettings: (updates: Partial<UnifiedImageSettings>) => void;
  resetSettings: () => void;
  aspectRatios: UnifiedAspectRatioOption[];
  qualities: UnifiedQualityOption[];
  outputFormats: UnifiedQualityOption[] | null;
  backgrounds: UnifiedQualityOption[] | null;
  supportsOutputFormat: boolean;
  supportsBackground: boolean;
}

const ImageGenSettingsContext = createContext<ImageGenSettingsContextType | undefined>(undefined);

interface ImageGenSettingsProviderProps {
  children: ReactNode;
}

export function ImageGenSettingsProvider({ children }: ImageGenSettingsProviderProps) {
  const { selectedModel } = useModelSelection();
  const modelId = selectedModel.modelId;
  const provider = selectedModel.provider as ImageGenProvider;

  const [isOpen, setIsOpen] = useState(false);

  const openai = useOpenAIImageSettings(modelId);
  const google = useGoogleImageSettings(modelId);
  const grok = useGrokImageSettings(modelId);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const settings = useMemo((): UnifiedImageSettings => {
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
          aspectRatio: google.settings.aspectRatio,
          quality: google.settings.quality,
        };
      case "grok":
        return {
          aspectRatio: grok.settings.aspectRatio,
          quality: grok.settings.quality,
        };
    }
  }, [provider, openai.settings, google.settings, grok.settings]);

  const updateSettings = useCallback(
    (updates: Partial<UnifiedImageSettings>) => {
      switch (provider) {
        case "openai":
          return openai.updateSettings(updates as Partial<OpenAIImageSettings>);
        case "gemini":
          return google.updateSettings(updates as Partial<GoogleImageSettings>);
        case "grok":
          return grok.updateSettings(updates as Partial<GrokImageSettings>);
      }
    },
    [provider, openai, google, grok]
  );

  const resetSettings = useCallback(() => {
    switch (provider) {
      case "openai":
        return openai.resetSettings();
      case "gemini":
        return google.resetSettings();
      case "grok":
        return grok.resetSettings();
    }
  }, [provider, openai, google, grok]);

  const aspectRatios = useMemo((): UnifiedAspectRatioOption[] => {
    switch (provider) {
      case "openai":
        return openai.aspectRatios.map((ar: OpenAIAspectRatioOption) => ({
          value: ar.value,
          label: ar.label,
          pixelSize: ar.pixelSize,
        }));
      case "gemini":
        return google.aspectRatios.map((ar: GoogleAspectRatio) => ({
          value: ar,
          label: ar,
        }));
      case "grok":
        return grok.aspectRatios.map((ar: GrokAspectRatio) => ({
          value: ar,
          label: ar,
        }));
    }
  }, [provider, openai.aspectRatios, google.aspectRatios, grok.aspectRatios]);

  const qualities = useMemo((): UnifiedQualityOption[] => {
    switch (provider) {
      case "openai":
        return openai.qualities.map((q: OpenAIQualityOption) => ({
          value: q.value,
          label: q.label,
        }));
      case "gemini":
        return google.qualities.map((q: GoogleQuality) => ({
          value: q,
          label: q,
        }));
      case "grok":
        return grok.qualities.map((q: GrokQuality) => ({
          value: q,
          label: q,
        }));
    }
  }, [provider, openai.qualities, google.qualities, grok.qualities]);

  const supportsOutputFormat = useMemo(() => {
    switch (provider) {
      case "openai":
        return openai.supportsOutputFormat;
      case "gemini":
        return google.supportsOutputFormat;
      case "grok":
        return grok.supportsOutputFormat;
    }
  }, [provider, openai.supportsOutputFormat, google.supportsOutputFormat, grok.supportsOutputFormat]);

  const supportsBackground = useMemo(() => {
    switch (provider) {
      case "openai":
        return openai.supportsBackground;
      case "gemini":
      case "grok":
        return false;
    }
  }, [provider, openai.supportsBackground]);

  const outputFormats = useMemo((): UnifiedQualityOption[] | null => {
    if (provider === "openai" && openai.supportsOutputFormat) {
      return openai.outputFormats.map((f) => ({ value: f, label: f }));
    }
    return null;
  }, [provider, openai.supportsOutputFormat, openai.outputFormats]);

  const backgrounds = useMemo((): UnifiedQualityOption[] | null => {
    if (provider === "openai" && openai.supportsBackground) {
      return openai.backgrounds.map((b) => ({ value: b, label: b }));
    }
    return null;
  }, [provider, openai.supportsBackground, openai.backgrounds]);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      settings,
      updateSettings,
      resetSettings,
      aspectRatios,
      qualities,
      outputFormats,
      backgrounds,
      supportsOutputFormat,
      supportsBackground,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      settings,
      updateSettings,
      resetSettings,
      aspectRatios,
      qualities,
      outputFormats,
      backgrounds,
      supportsOutputFormat,
      supportsBackground,
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

export { isOpenAIImgGenCapable, isOpenAIPureImgModel } from "@/hooks/use-openai-image-settings";
export { isGoogleImgGenCapable } from "@/hooks/use-google-image-settings";
export { isGrokImgGenCapable } from "@/hooks/use-grok-image-settings";


```
