"use client";

import { useCallback, useEffect, useState } from "react";
import { modelIdToDisplayNameImgGen } from "@slipstream/types";

export type GrokImgModelId = keyof typeof modelIdToDisplayNameImgGen.grok;

export type GrokAspectRatio =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "16:9"
  | "9:16"
  | "19.5:9"
  | "9:19.5"
  | "9:20"
  | "20:9"
  | "1:2"
  | "2:1"
  | "auto";

export type GrokQuality = "1k" | "2k";

export interface GrokImageSettings {
  aspectRatio: GrokAspectRatio;
  quality: GrokQuality;
}

export function isGrokImgGenCapable(
  modelId: string
): modelId is GrokImgModelId {
  return modelId in modelIdToDisplayNameImgGen.grok;
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
  return (
    ar === "1:1" ||
    ar === "1:2" ||
    ar === "2:1" ||
    ar === "2:3" ||
    ar === "3:2" ||
    ar === "3:4" ||
    ar === "4:3" ||
    ar === "9:16" ||
    ar === "16:9" ||
    ar === "19.5:9" ||
    ar === "9:19.5" ||
    ar === "20:9" ||
    ar === "9:20" ||
    ar === "auto"
  );
}

export function isValidGrokQuality(q: string) {
  return q === "1k" || q === "2k";
}

const STORAGE_KEY_PREFIX = "grok-image-settings";

function getStorageKey(modelId: string) {
  return `${STORAGE_KEY_PREFIX}:${modelId}`;
}

export function useGrokImageSettings(modelId: string) {
  const isCapable = isGrokImgGenCapable(modelId);
  const grokModelId = isCapable ? (modelId as GrokImgModelId) : null;

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

  const updateSettings = useCallback((updates: Partial<GrokImageSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
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
