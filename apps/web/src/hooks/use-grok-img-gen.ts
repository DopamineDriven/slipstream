"use client";

import { useCallback, useEffect, useState } from "react";
import { imgCtx } from "@/lib/img-ctx";
import type {
  GrokImagine2ARUnion,
  GrokImagine2QualityUnion,
  GrokImagineARUnion,
  GrokImagineImageGenOpts,
  GrokImagineQualityUnion,
  GrokPureImageGenModels
} from "@slipstream/types";

export type GrokImgModelId =
  GrokImagineImageGenOpts<GrokPureImageGenModels>["model"];

export type GrokAspectRatio =
  GrokImagineImageGenOpts<GrokPureImageGenModels>["aspect_ratio"];

export type GrokQuality =
  GrokImagineImageGenOpts<GrokPureImageGenModels>["resolution"];

export interface GrokImageSettings {
  aspectRatio: Exclude<GrokAspectRatio, undefined | null>;
  quality: Exclude<GrokQuality, undefined | null>;
}

export interface GrokImageSettingsUpdates {
  aspectRatio?: string;
  quality?: string;
}

export function isGrokImgGenCapable(modelId: string) {
  return imgCtx.grokImagineImgGenModel(modelId);
}

export const GROK_ASPECT_RATIOS = [
  "auto",
  "1:1",
  "3:4",
  "4:3",
  "2:3",
  "3:2",
  "9:16",
  "16:9",
  "19.5:9",
  "9:19.5",
  "20:9",
  "9:20",
  "1:2",
  "2:1"
] as const satisfies GrokImagineARUnion[];

// grok-imagine-image-2.0 alone extends the range
export const GROK_2_ASPECT_RATIOS = [
  ...GROK_ASPECT_RATIOS,
  "21:9",
  "5:2"
] as const satisfies GrokImagine2ARUnion[];

const MODEL_ASPECT_RATIOS = new Map<
  GrokImgModelId,
  readonly GrokImageSettings["aspectRatio"][]
>([
  ["grok-imagine-image-2.0", GROK_2_ASPECT_RATIOS],
  ["grok-imagine-image", GROK_ASPECT_RATIOS],
  ["grok-imagine-image-quality", GROK_ASPECT_RATIOS]
]);

export const GROK_QUALITIES = ["1k", "2k"] satisfies GrokImagineQualityUnion[];

// grok-imagine-image-2.0 alone adds the 1.5k tier
export const GROK_2_QUALITIES = [
  "1k",
  "1.5k",
  "2k"
] satisfies GrokImagine2QualityUnion[];

const MODEL_QUALITIES = new Map<
  GrokImgModelId,
  readonly GrokImageSettings["quality"][]
>([
  ["grok-imagine-image-2.0", GROK_2_QUALITIES],
  ["grok-imagine-image", GROK_QUALITIES],
  ["grok-imagine-image-quality", GROK_QUALITIES]
]);

const GROK_DEFAULTS = {
  aspectRatio: "auto",
  quality: "1k"
} satisfies GrokImageSettings;

const MODEL_DEFAULTS = new Map<GrokImgModelId, GrokImageSettings>([
  ["grok-imagine-image-2.0", GROK_DEFAULTS],
  ["grok-imagine-image", GROK_DEFAULTS],
  ["grok-imagine-image-quality", GROK_DEFAULTS]
]);

// module-level so a non-grok model gets a stable reference, not a fresh
// array per render feeding the effect deps below
const NO_ASPECT_RATIOS = Array.of<GrokImageSettings["aspectRatio"]>();
const NO_QUALITIES = Array.of<GrokImageSettings["quality"]>();

const STORAGE_KEY_PREFIX = "grok-image-settings";

function getStorageKey(modelId: string) {
  return `${STORAGE_KEY_PREFIX}:${modelId}`;
}

export function useGrokImageSettings(modelId: string) {
  const isCapable = isGrokImgGenCapable(modelId);
  const grokModelId = isCapable
    ? (Array.from(MODEL_DEFAULTS.keys()).find(model => model === modelId) ??
      null)
    : null;
  const defaultSettings = grokModelId
    ? (MODEL_DEFAULTS.get(grokModelId) ?? GROK_DEFAULTS)
    : GROK_DEFAULTS;
  // the model's own lists are the single authority: what the UI offers, what
  // `updateSettings` accepts, and what hydration restores all come from them
  const aspectRatioOptions = grokModelId
    ? (MODEL_ASPECT_RATIOS.get(grokModelId) ?? NO_ASPECT_RATIOS)
    : NO_ASPECT_RATIOS;
  const qualityOptions = grokModelId
    ? (MODEL_QUALITIES.get(grokModelId) ?? NO_QUALITIES)
    : NO_QUALITIES;

  const [settings, setSettings] = useState<GrokImageSettings>(defaultSettings);

  useEffect(() => {
    if (!grokModelId) return;

    try {
      const stored = localStorage.getItem(getStorageKey(modelId));
      if (stored) {
        const parsed = JSON.parse<{ aspectRatio?: string; quality?: string }>(
          stored
        );
        const ar = parsed.aspectRatio ?? defaultSettings.aspectRatio;
        const q = parsed.quality ?? defaultSettings.quality;
        const aspectRatio =
          aspectRatioOptions.find(option => option === ar) ??
          defaultSettings.aspectRatio;
        const quality =
          qualityOptions.find(option => option === q) ??
          defaultSettings.quality;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings({
          aspectRatio,
          quality
        });
      } else {
        setSettings(defaultSettings);
      }
    } catch {
      setSettings(defaultSettings);
    }
  }, [
    aspectRatioOptions,
    defaultSettings,
    grokModelId,
    modelId,
    qualityOptions
  ]);

  // Persist to localStorage on change
  useEffect(() => {
    if (!grokModelId) return;

    try {
      localStorage.setItem(getStorageKey(modelId), JSON.stringify(settings));
    } catch {
      /*  */
    }
  }, [modelId, grokModelId, settings]);

  const updateSettings = useCallback(
    (updates: GrokImageSettingsUpdates) => {
      setSettings(prev => {
        const aspectRatio =
          typeof updates.aspectRatio === "string"
            ? aspectRatioOptions.find(option => option === updates.aspectRatio)
            : undefined;
        const quality =
          typeof updates.quality === "string"
            ? qualityOptions.find(option => option === updates.quality)
            : undefined;

        return {
          aspectRatio: aspectRatio ?? prev.aspectRatio,
          quality: quality ?? prev.quality
        };
      });
    },
    [aspectRatioOptions, qualityOptions]
  );

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
  }, [defaultSettings]);

  return {
    settings,
    updateSettings,
    resetSettings,
    isCapable,
    modelId: grokModelId,
    aspectRatios: aspectRatioOptions,
    qualities: qualityOptions,
    supportsOutputFormat: false,
    supportsBackground: false
  };
}
