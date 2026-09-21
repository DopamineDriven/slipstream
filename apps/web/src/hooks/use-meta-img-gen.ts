"use client";

import { useCallback, useEffect, useState } from "react";
import { imgCtx } from "@/lib/img-ctx";
import type { MetaImgGenOpts } from "@slipstream/types";

// one model, one contract — every type here comes off MetaImgGenOpts
export type MetaImgModelId = MetaImgGenOpts["model"];

// "auto" = send no size and let the generator choose
export type MetaAspectRatio =
  Exclude<MetaImgGenOpts["size"], undefined> | "auto";

export interface MetaImageSettings {
  aspectRatio: MetaAspectRatio;
}

export interface MetaAspectRatioOption {
  value: MetaAspectRatio;
  label: string;
}

export interface MetaImageSettingsUpdates {
  aspectRatio?: string;
}

export function isMetaImgGenCapable(modelId: string) {
  return imgCtx.metaImgGenCapable(modelId);
}

/**
 * muse-image-1.0 turns `size` into an aspect ratio and renders at its own
 * fixed resolution, so the pixel numbers carry no meaning beyond their ratio.
 * One option per ratio (the smallest valid WxH for it), never a resolution
 * ladder — "2K" / "Max" tiers would promise something the model ignores
 */
export const META_ASPECT_RATIOS = [
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "1:1" },
  { value: "1024x1536", label: "2:3" },
  { value: "1536x1024", label: "3:2" },
  { value: "1152x1536", label: "3:4" },
  { value: "1536x1152", label: "4:3" },
  { value: "1024x1280", label: "4:5" },
  { value: "1280x1024", label: "5:4" },
  { value: "1152x2048", label: "9:16" },
  { value: "2048x1152", label: "16:9" },
  { value: "960x1536", label: "10:16" },
  { value: "1536x960", label: "16:10" },
  { value: "1024x2048", label: "1:2" },
  { value: "2048x1024", label: "2:1" },
  { value: "864x2016", label: "9:21" },
  { value: "2016x864", label: "21:9" },
  { value: "512x1536", label: "1:3" },
  { value: "1536x512", label: "3:1" }
] satisfies MetaAspectRatioOption[];

const META_DEFAULTS = {
  aspectRatio: "auto"
} satisfies MetaImageSettings;

const STORAGE_KEY_PREFIX = "meta-image-settings";

function getStorageKey(modelId: string) {
  return `${STORAGE_KEY_PREFIX}:${modelId}`;
}

export function useMetaImageSettings(modelId: string) {
  const isCapable = isMetaImgGenCapable(modelId);

  const [settings, setSettings] = useState<MetaImageSettings>(META_DEFAULTS);

  useEffect(() => {
    if (!isCapable) return;

    try {
      const stored = localStorage.getItem(getStorageKey(modelId));
      if (stored) {
        const parsed = JSON.parse<{ aspectRatio?: string }>(stored);
        const aspectRatio =
          META_ASPECT_RATIOS.find(option => option.value === parsed.aspectRatio)
            ?.value ?? META_DEFAULTS.aspectRatio;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings({ aspectRatio });
      } else {
        setSettings(META_DEFAULTS);
      }
    } catch {
      setSettings(META_DEFAULTS);
    }
  }, [isCapable, modelId]);

  useEffect(() => {
    if (!isCapable) return;

    try {
      localStorage.setItem(getStorageKey(modelId), JSON.stringify(settings));
    } catch {
      /* ignore quota errors */
    }
  }, [isCapable, modelId, settings]);

  const updateSettings = useCallback((updates: MetaImageSettingsUpdates) => {
    setSettings(prev => {
      const aspectRatio =
        typeof updates.aspectRatio === "string"
          ? META_ASPECT_RATIOS.find(
              option => option.value === updates.aspectRatio
            )?.value
          : undefined;

      return { aspectRatio: aspectRatio ?? prev.aspectRatio };
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(META_DEFAULTS);
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
    isCapable,
    aspectRatios: META_ASPECT_RATIOS,
    supportsOutputFormat: false,
    supportsBackground: false
  };
}
