"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { modelIdToDisplayNameImgGen } from "@slipstream/types";

export type OpenAIImgModelId = keyof typeof modelIdToDisplayNameImgGen.openai;

export type OpenAIAspectRatio =
  | "1024x1024"
  | "1024x1536"
  | "1536x1024"
  | "auto";

export type OpenAIQuality = "low" | "medium" | "high" | "auto";

export type OpenAIOutputFormat = "png" | "jpeg" | "webp";

export type OpenAIBackground = "auto" | "transparent" | "opaque";

export interface OpenAIImageSettings {
  aspectRatio: OpenAIAspectRatio;
  quality: OpenAIQuality;
  outputFormat?: OpenAIOutputFormat;
  background?: OpenAIBackground;
}

export interface OpenAIAspectRatioOption {
  value: OpenAIAspectRatio;
  label: string;
  pixelSize?: string;
}

export interface OpenAIQualityOption {
  value: OpenAIQuality;
  label: string;
}

export const OPENAI_ASPECT_RATIOS = [
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "1:1", pixelSize: "1024×1024" },
  { value: "1024x1536", label: "2:3", pixelSize: "1024×1536" },
  { value: "1536x1024", label: "3:2", pixelSize: "1536×1024" }
] satisfies OpenAIAspectRatioOption[];

export const OPENAI_QUALITIES = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Draft" },
  { value: "medium", label: "Standard" },
  { value: "high", label: "HD" }
] satisfies OpenAIQualityOption[];

export const OPENAI_OUTPUT_FORMATS = [
  "png",
  "jpeg",
  "webp"
] satisfies OpenAIOutputFormat[];

export const OPENAI_BACKGROUNDS = [
  "auto",
  "transparent",
  "opaque"
] satisfies OpenAIBackground[];

const OPENAI_DEFAULT_SETTINGS = {
  aspectRatio: "auto",
  quality: "auto",
  outputFormat: "png",
  background: "auto"
} satisfies OpenAIImageSettings;

function isImgGenFacilitating(m: string) {
  return (
    m === "gpt-5.4-mini" ||
    m === "gpt-5.4-nano" ||
    m === "gpt-4.1" ||
    m === "gpt-4.1-mini" ||
    m === "gpt-4.1-nano" ||
    m === "gpt-5" ||
    m === "gpt-5-chat-latest" ||
    m === "gpt-5-mini" ||
    m === "gpt-5-nano" ||
    m === "gpt-5-pro" ||
    m === "gpt-5.1" ||
    m === "gpt-5.2" ||
    m === "gpt-5.2-pro" ||
    m === "gpt-5.4" ||
    m === "gpt-5.4-pro" ||
    m === "o3" ||
    m === "gpt-4o" ||
    m === "gpt-4o-mini"
  );
}

function isImgGenNative(m: string) {
  return (
    m === "gpt-image-1" || m === "gpt-image-1-mini" || m === "gpt-image-1.5"
  );
}
function isImgGenCapable(m: string) {
  return isImgGenNative(m) || isImgGenFacilitating(m);
}

export function isOpenAIImgGenCapable(modelId: string) {
  return isImgGenCapable(modelId);
}

export function isOpenAIPureImgModel(modelId: string) {
  return isImgGenNative(modelId);
}

export function isValidOpenAIAspectRatio(ar: string) {
  return (
    ar === "1024x1024" ||
    ar === "1024x1536" ||
    ar === "1536x1024" ||
    ar === "auto"
  );
}

export function isValidOpenAIQuality(q: string) {
  return q === "low" || q === "medium" || q === "high" || q === "auto";
}

export function isValidOpenAIOutputFormat(f: string) {
  return f === "png" || f === "jpeg" || f === "webp";
}

export function isValidOpenAIBackground(b: string) {
  return b === "auto" || b === "transparent" || b === "opaque";
}

const STORAGE_KEY_PREFIX = "openai-image-settings";

function getStorageKey(modelId: string) {
  return `${STORAGE_KEY_PREFIX}:${modelId}`;
}

export function useOpenAIImageSettings(modelId: string) {
  const [settings, setSettings] = useState<OpenAIImageSettings>(
    OPENAI_DEFAULT_SETTINGS
  );

  useEffect(() => {
    if (!isOpenAIImgGenCapable(modelId)) return;

    try {
      const stored = localStorage.getItem(getStorageKey(modelId));
      if (stored) {
        const parsed = JSON.parse<{
          aspectRatio?: string;
          quality?: string;
          outputFormat?: string;
          background?: string;
        }>(stored);

        const ar = parsed.aspectRatio ?? OPENAI_DEFAULT_SETTINGS.aspectRatio;
        const q = parsed.quality ?? OPENAI_DEFAULT_SETTINGS.quality;
        const fmt = parsed.outputFormat ?? OPENAI_DEFAULT_SETTINGS.outputFormat;
        const bg = parsed.background ?? OPENAI_DEFAULT_SETTINGS.background;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings({
          aspectRatio: isValidOpenAIAspectRatio(ar)
            ? ar
            : OPENAI_DEFAULT_SETTINGS.aspectRatio,
          quality: isValidOpenAIQuality(q)
            ? q
            : OPENAI_DEFAULT_SETTINGS.quality,
          outputFormat:
            fmt && isValidOpenAIOutputFormat(fmt)
              ? fmt
              : OPENAI_DEFAULT_SETTINGS.outputFormat,
          background:
            bg && isValidOpenAIBackground(bg)
              ? bg
              : OPENAI_DEFAULT_SETTINGS.background
        });
      } else {
        setSettings(OPENAI_DEFAULT_SETTINGS);
      }
    } catch {
      setSettings(OPENAI_DEFAULT_SETTINGS);
    }
  }, [modelId]);
  
  useEffect(() => {
    if (!isOpenAIImgGenCapable(modelId)) return;

    try {
      localStorage.setItem(getStorageKey(modelId), JSON.stringify(settings));
    } catch {
      /* */
    }
  }, [modelId, settings]);

  const updateSettings = useCallback(
    (updates: Partial<OpenAIImageSettings>) => {
      setSettings(prev => ({ ...prev, ...updates }));
    },
    []
  );

  const resetSettings = useCallback(() => {
    setSettings(OPENAI_DEFAULT_SETTINGS);
  }, []);

  const isCapable = useMemo(() => isOpenAIImgGenCapable(modelId), [modelId]);

  return {
    settings,
    updateSettings,
    resetSettings,
    isCapable,
    aspectRatios: OPENAI_ASPECT_RATIOS,
    qualities: OPENAI_QUALITIES,
    outputFormats: OPENAI_OUTPUT_FORMATS,
    backgrounds: OPENAI_BACKGROUNDS,
    supportsOutputFormat: true,
    supportsBackground: true
  };
}
