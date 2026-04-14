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
import { useModelSelection } from "./model-selection-context";
import { imgCtx } from "@/lib/img-ctx";

export type ImageGenProvider = "openai" | "gemini" | "grok";

export function detectProvider(modelId: string) {
  if (isOpenAIImgGenCapable(modelId)) return "openai";
  if (isGoogleImgGenCapable(modelId)) return "gemini";
  if (isGrokImgGenCapable(modelId)) return "grok";
  return null;
}

export function isImgGenCapable(modelId: string) {
  return detectProvider(modelId) !== null;
}

export type UnifiedAspectRatio = GrokAspectRatio | GoogleAspectRatio | (string & {});
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
  modelId: string;
  setModelId: (modelId: string) => void;
  provider: ImageGenProvider;
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
  outputFormats: UnifiedQualityOption[] | null;
  backgrounds: UnifiedQualityOption[] | null;
  supportsOutputFormat: boolean;
  supportsBackground: boolean;
  openai: ReturnType<typeof useOpenAIImageSettings>;
  google: ReturnType<typeof useGoogleImageSettings>;
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
  const google = useGoogleImageSettings(modelId);
  const grok = useGrokImageSettings(modelId);

  const {selectedModel} = useModelSelection();
 const modelId= selectedModel.modelId
  const provider = selectedModel.provider;
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const settings = useMemo(() => {
    if (!(provider==="gemini" || provider==="openai" || provider==="grok") ) return null;
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
      default:
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
          openai.updateSettings(updates as Partial<OpenAIImageSettings>);
          break;
        case "gemini":
          google.updateSettings(updates as Partial<GoogleImageSettings>);
          break;
        case "grok":
          grok.updateSettings(updates as Partial<GrokImageSettings>);
          break;
      }
    },
    [provider, openai, google, grok]
  );

  const resetSettings = useCallback(() => {
    switch (provider) {
      case "openai":
        openai.resetSettings();
        break;
      case "gemini":
        google.resetSettings();
        break;
      case "grok":
        grok.resetSettings();
        break;
    }
  }, [provider, openai, google, grok]);

  const aspectRatios = useMemo(() => {
    switch (provider) {
      case "openai":
        return openai.aspectRatios.map((ar: OpenAIAspectRatioOption) => ({
          value: ar.value,
          label: ar.label,
          pixelSize: ar.pixelSize,
        }));
      case "gemini":
        return google.aspectRatios?.map((ar: GoogleAspectRatio) => ({
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
  }, [provider, openai.aspectRatios, google.aspectRatios, grok.aspectRatios]);

  const qualities = useMemo(() => {
    switch (provider) {
      case "openai":
        return openai.qualities.map((q: OpenAIQualityOption) => ({
          value: q.value,
          label: q.label,
        }));
      case "gemini":
        return google?.qualities?.map((q: GoogleQuality) => ({
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
  }, [provider, openai.qualities, google.qualities, grok.qualities]);

  const supportsOutputFormat = useMemo(() => {
    switch (provider) {
      case "openai":
        return openai.supportsOutputFormat;
      case "gemini":
        return google.supportsOutputFormat;
      case "grok":
        return grok.supportsOutputFormat;
      default:
        return false;
    }
  }, [provider, openai.supportsOutputFormat, google.supportsOutputFormat, grok.supportsOutputFormat]);

  const supportsBackground = useMemo(() => {
    switch (provider) {
      case "openai":
        return openai.supportsBackground;
      default:
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
      outputFormats,
      backgrounds,
      supportsOutputFormat,
      supportsBackground,
      openai,
      google,
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
      outputFormats,
      backgrounds,
      supportsOutputFormat,
      supportsBackground,
      openai,
      google,
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
