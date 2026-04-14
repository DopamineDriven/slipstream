"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { imgCtx } from "@/lib/img-ctx";
import type {
  OpenAIImageGenOpts,
  OpenAIImgCapableModels,
  RTC
} from "@slipstream/types";

export type OpenAIImgModelId = OpenAIImgCapableModels;

export type OpenAIAspectRatio = OpenAIImageGenOpts["size"];

export type OpenAIQuality = OpenAIImageGenOpts["quality"];

export type OpenAIOutputFormat = OpenAIImageGenOpts["output_format"];

export type OpenAIBackground = OpenAIImageGenOpts["background"];

export interface OpenAIImageSettings {
  aspectRatio: Exclude<OpenAIAspectRatio, undefined>;
  quality: Exclude<OpenAIQuality, undefined>;
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
  quality: "high",
  outputFormat: "png",
  background: "auto"
} satisfies OpenAIImageSettings;

export function isOpenAIImgGenCapable(m: string) {
  return imgCtx.openAIGptImgModel(m) || imgCtx.openAIFacilitatingImgGenModel(m);
}

export function isValidOpenAIAspectRatio(ar: string) {
  return imgCtx.isValidOpenAISize(ar);
}

export function isValidOpenAIQuality(q: string) {
  return imgCtx.isValidOpenAIQuality(q);
}

export function isValidOpenAIOutputFormat(f: string) {
  return imgCtx.isValidOpenAIOutputFormat(f);
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

        const aspectRatio =
          parsed.aspectRatio && isValidOpenAIAspectRatio(parsed.aspectRatio)
            ? parsed.aspectRatio
            : OPENAI_DEFAULT_SETTINGS.aspectRatio;
        const quality =
          parsed.quality && isValidOpenAIQuality(parsed.quality)
            ? parsed.quality
            : OPENAI_DEFAULT_SETTINGS.quality;
        const outputFormat =
          parsed.outputFormat && isValidOpenAIOutputFormat(parsed.outputFormat)
            ? parsed.outputFormat
            : OPENAI_DEFAULT_SETTINGS.outputFormat;
        const background =
          parsed.background && isValidOpenAIBackground(parsed.background)
            ? parsed.background
            : OPENAI_DEFAULT_SETTINGS.background;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings({
          aspectRatio,
          quality,
          outputFormat,
          background
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

  const updateSettings = useCallback((updates: RTC<OpenAIImageSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

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
