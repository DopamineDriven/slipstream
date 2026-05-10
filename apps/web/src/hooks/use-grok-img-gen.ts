"use client";

import { useCallback, useEffect, useState } from "react";
import { imgCtx } from "@/lib/img-ctx";
import type { GrokImagineImageGenOpts } from "@slipstream/types";

export type GrokImgModelId = GrokImagineImageGenOpts["model"];

export type GrokAspectRatio = GrokImagineImageGenOpts["aspect_ratio"];

export type GrokQuality = GrokImagineImageGenOpts["resolution"];

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
] satisfies GrokAspectRatio[];

export const GROK_QUALITIES = ["1k", "2k"] satisfies GrokQuality[];

const DEFAULT_SETTINGS = {
  aspectRatio: "auto",
  quality: "1k"
} satisfies GrokImageSettings;

export function isValidGrokAspectRatio(ar: string) {
  return imgCtx.isValidGrokAR(ar);
}

export function isValidGrokQuality(q: string) {
  return imgCtx.isValidGrokQuality(q);
}

const STORAGE_KEY_PREFIX = "grok-image-settings";

function getStorageKey(modelId: string) {
  return `${STORAGE_KEY_PREFIX}:${modelId}`;
}

export function useGrokImageSettings(modelId: string) {
  const isCapable = isGrokImgGenCapable(modelId);
  const grokModelId = isCapable ? modelId : null;

  const [settings, setSettings] = useState<GrokImageSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    if (!grokModelId) return;

    try {
      const stored = localStorage.getItem(getStorageKey(modelId));
      if (stored) {
        const parsed = JSON.parse<{ aspectRatio?: string; quality?: string }>(
          stored
        );
        const ar = parsed.aspectRatio ?? DEFAULT_SETTINGS.aspectRatio;
        const q = parsed.quality ?? DEFAULT_SETTINGS.quality;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings({
          aspectRatio: isValidGrokAspectRatio(ar)
            ? ar
            : DEFAULT_SETTINGS.aspectRatio,
          quality: isValidGrokQuality(q) ? q : DEFAULT_SETTINGS.quality
        });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, [modelId, grokModelId]);

  // Persist to localStorage on change
  useEffect(() => {
    if (!grokModelId) return;

    try {
      localStorage.setItem(getStorageKey(modelId), JSON.stringify(settings));
    } catch {
      /*  */
    }
  }, [modelId, grokModelId, settings]);

  const updateSettings = useCallback((updates: GrokImageSettingsUpdates) => {
    setSettings(prev => {
      const aspectRatio =
        typeof updates.aspectRatio === "string" &&
        isValidGrokAspectRatio(updates.aspectRatio)
          ? GROK_ASPECT_RATIOS.find(option => option === updates.aspectRatio)
          : undefined;
      const quality =
        typeof updates.quality === "string" &&
        isValidGrokQuality(updates.quality)
          ? GROK_QUALITIES.find(option => option === updates.quality)
          : undefined;

      return {
        aspectRatio: aspectRatio ?? prev.aspectRatio,
        quality: quality ?? prev.quality
      };
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
    isCapable,
    modelId: grokModelId,
    aspectRatios: GROK_ASPECT_RATIOS,
    qualities: GROK_QUALITIES,
    supportsOutputFormat: false,
    supportsBackground: false
  };
}
