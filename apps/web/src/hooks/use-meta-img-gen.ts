"use client";

import { useCallback, useEffect, useState } from "react";
import { imgCtx } from "@/lib/img-ctx";
import type { MetaImgGenOpts } from "@slipstream/types";

// one model, one contract — every type here comes off MetaImgGenOpts
export type MetaImgModelId = MetaImgGenOpts["model"];

// the contract's size union already carries "auto" (Meta's default shape)
export type MetaAspectRatio = Exclude<MetaImgGenOpts["size"], undefined>;

export interface MetaImageSettings {
  aspectRatio: MetaAspectRatio;
}

export interface MetaAspectRatioOption {
  value: MetaAspectRatio;
  label: string;
  pixelSize?: string;
}

export interface MetaImageSettingsUpdates {
  aspectRatio?: string;
}

export function isMetaImgGenCapable(modelId: string) {
  return imgCtx.metaImgGenCapable(modelId);
}

/**
 * The Responses `image_generation` tool validates `size` against a fixed
 * list, whatever Meta's prose says about "any WxH". Live-tested 2026-09-21:
 * `auto`, `1024x1024`, `1024x1536` and `1536x1024` are all accepted;
 * `1536x1152` (4:3) and `2048x1152` (16:9) return
 * `400 tools[0] did not match any supported type`. That is exactly the set
 * the OpenAI tool originally enumerated, and it is what `MetaImgSize` now
 * encodes, so `satisfies` below rejects anything wider.
 *
 * `size` sets the aspect ratio only: the image comes back at the generator's
 * own resolution (3:2 and `auto` both return 1920x1280). `pixelSize` shows the
 * exact value sent, for parity with the GPT list
 */
export const META_ASPECT_RATIOS = [
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "1:1", pixelSize: "1024×1024" },
  { value: "1024x1536", label: "2:3", pixelSize: "1024×1536" },
  { value: "1536x1024", label: "3:2", pixelSize: "1536×1024" }
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
