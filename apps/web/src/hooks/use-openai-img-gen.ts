"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { imgCtx } from "@/lib/img-ctx";
import type {
  OpenAIImageGenOpts,
  OpenAIImgCapableModels
} from "@slipstream/types";

export type OpenAIImgModelId = OpenAIImgCapableModels;

export interface OpenAIImageSettings {
  aspectRatio: Exclude<OpenAIImageGenOpts["size"], undefined>;
  quality: Exclude<OpenAIImageGenOpts["quality"], undefined>;
  outputFormat?: OpenAIImageGenOpts["output_format"];
  background?: OpenAIImageGenOpts["background"];
}

export interface OpenAIAspectRatioOption {
  value: OpenAIImageGenOpts["size"];
  label: string;
  pixelSize?: string;
}

export interface OpenAIQualityOption {
  value: OpenAIImageGenOpts["quality"];
  label: string;
}

export interface OpenAIImageSettingsUpdates {
  aspectRatio?: string;
  quality?: string;
  outputFormat?: string;
  background?: string;
}

export const OPENAI_ASPECT_RATIOS = [
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "1:1", pixelSize: "1024×1024" },
  { value: "1024x1536", label: "2:3", pixelSize: "1024×1536" },
  { value: "1536x1024", label: "3:2", pixelSize: "1536×1024" }
] satisfies OpenAIAspectRatioOption[];


export const OPENAI_GPT_IMAGE_2_ASPECT_RATIOS = [
  { value: "auto", label: "Auto" },

  // 1:1
  { value: "1024x1024", label: "1:1", pixelSize: "1024×1024" },
  { value: "1536x1536", label: "1:1 (1536)", pixelSize: "1536×1536" },
  { value: "2048x2048", label: "1:1 2K", pixelSize: "2048×2048" },
  { value: "2560x2560", label: "1:1 (2560)", pixelSize: "2560×2560" },
  { value: "2880x2880", label: "1:1 Max", pixelSize: "2880×2880" },

  // 2:3
  { value: "1024x1536", label: "2:3", pixelSize: "1024×1536" },
  { value: "1536x2304", label: "2:3 (1536)", pixelSize: "1536×2304" },
  { value: "2048x3072", label: "2:3 2K", pixelSize: "2048×3072" },
  { value: "2304x3456", label: "2:3 Max", pixelSize: "2304×3456" },

  // 3:2
  { value: "1536x1024", label: "3:2", pixelSize: "1536×1024" },
  { value: "2304x1536", label: "3:2 (1536)", pixelSize: "2304×1536" },
  { value: "3072x2048", label: "3:2 2K", pixelSize: "3072×2048" },
  { value: "3456x2304", label: "3:2 Max", pixelSize: "3456×2304" },

  // 3:4
  { value: "1152x1536", label: "3:4", pixelSize: "1152×1536" },
  { value: "1536x2048", label: "3:4 (1536)", pixelSize: "1536×2048" },
  { value: "1920x2560", label: "3:4 2K", pixelSize: "1920×2560" },
  { value: "2304x3072", label: "3:4 Max", pixelSize: "2304×3072" },

  // 4:3
  { value: "1536x1152", label: "4:3", pixelSize: "1536×1152" },
  { value: "2048x1536", label: "4:3 (2048)", pixelSize: "2048×1536" },
  { value: "2560x1920", label: "4:3 2K", pixelSize: "2560×1920" },
  { value: "3072x2304", label: "4:3 Max", pixelSize: "3072×2304" },

  // 4:5
  { value: "1024x1280", label: "4:5", pixelSize: "1024×1280" },
  { value: "1536x1920", label: "4:5 (1536)", pixelSize: "1536×1920" },
  { value: "2048x2560", label: "4:5 2K", pixelSize: "2048×2560" },
  { value: "2304x2880", label: "4:5 (2304)", pixelSize: "2304×2880" },
  { value: "2560x3200", label: "4:5 Max", pixelSize: "2560×3200" },

  // 5:4
  { value: "1280x1024", label: "5:4", pixelSize: "1280×1024" },
  { value: "1920x1536", label: "5:4 (1920)", pixelSize: "1920×1536" },
  { value: "2560x2048", label: "5:4 2K", pixelSize: "2560×2048" },
  { value: "2880x2304", label: "5:4 (2880)", pixelSize: "2880×2304" },
  { value: "3200x2560", label: "5:4 Max", pixelSize: "3200×2560" },

  // 9:16
  { value: "1152x2048", label: "9:16", pixelSize: "1152×2048" },
  { value: "1440x2560", label: "9:16 (1440)", pixelSize: "1440×2560" },
  { value: "1728x3072", label: "9:16 3K", pixelSize: "1728×3072" },
  { value: "2016x3584", label: "9:16 (2016)", pixelSize: "2016×3584" },
  { value: "2160x3840", label: "9:16 4K", pixelSize: "2160×3840" },

  // 16:9
  { value: "2048x1152", label: "16:9", pixelSize: "2048×1152" },
  { value: "2560x1440", label: "16:9 (2560)", pixelSize: "2560×1440" },
  { value: "3072x1728", label: "16:9 3K", pixelSize: "3072×1728" },
  { value: "3584x2016", label: "16:9 (3584)", pixelSize: "3584×2016" },
  { value: "3840x2160", label: "16:9 4K", pixelSize: "3840×2160" },

  // 10:16
  { value: "960x1536", label: "10:16", pixelSize: "960×1536" },
  { value: "1280x2048", label: "10:16 (1280)", pixelSize: "1280×2048" },
  { value: "1600x2560", label: "10:16 2.5K", pixelSize: "1600×2560" },
  { value: "1920x3072", label: "10:16 3K", pixelSize: "1920×3072" },
  { value: "2240x3584", label: "10:16 Max", pixelSize: "2240×3584" },

  // 16:10
  { value: "1536x960", label: "16:10", pixelSize: "1536×960" },
  { value: "2048x1280", label: "16:10 (2048)", pixelSize: "2048×1280" },
  { value: "2560x1600", label: "16:10 2.5K", pixelSize: "2560×1600" },
  { value: "3072x1920", label: "16:10 3K", pixelSize: "3072×1920" },
  { value: "3584x2240", label: "16:10 Max", pixelSize: "3584×2240" },

  // 1:2
  { value: "1024x2048", label: "1:2", pixelSize: "1024×2048" },
  { value: "1280x2560", label: "1:2 (1280)", pixelSize: "1280×2560" },
  { value: "1536x3072", label: "1:2 3K", pixelSize: "1536×3072" },
  { value: "1792x3584", label: "1:2 (1792)", pixelSize: "1792×3584" },
  { value: "1920x3840", label: "1:2 Max", pixelSize: "1920×3840" },

  // 2:1
  { value: "2048x1024", label: "2:1", pixelSize: "2048×1024" },
  { value: "2560x1280", label: "2:1 (2560)", pixelSize: "2560×1280" },
  { value: "3072x1536", label: "2:1 3K", pixelSize: "3072×1536" },
  { value: "3584x1792", label: "2:1 (3584)", pixelSize: "3584×1792" },
  { value: "3840x1920", label: "2:1 Max", pixelSize: "3840×1920" },

  // 9:21
  { value: "864x2016", label: "9:21", pixelSize: "864×2016" },
  { value: "1152x2688", label: "9:21 (1152)", pixelSize: "1152×2688" },
  { value: "1440x3360", label: "9:21 3K", pixelSize: "1440×3360" },
  { value: "1632x3808", label: "9:21 Max", pixelSize: "1632×3808" },

  // 21:9
  { value: "2016x864", label: "21:9", pixelSize: "2016×864" },
  { value: "2688x1152", label: "21:9 (2688)", pixelSize: "2688×1152" },
  { value: "3360x1440", label: "21:9 3K", pixelSize: "3360×1440" },
  { value: "3808x1632", label: "21:9 Max", pixelSize: "3808×1632" },

  // 1:3
  { value: "512x1536", label: "1:3", pixelSize: "512×1536" },
  { value: "768x2304", label: "1:3 (768)", pixelSize: "768×2304" },
  { value: "1024x3072", label: "1:3 3K", pixelSize: "1024×3072" },
  { value: "1280x3840", label: "1:3 Max", pixelSize: "1280×3840" },

  // 3:1
  { value: "1536x512", label: "3:1", pixelSize: "1536×512" },
  { value: "2304x768", label: "3:1 (2304)", pixelSize: "2304×768" },
  { value: "3072x1024", label: "3:1 3K", pixelSize: "3072×1024" },
  { value: "3840x1280", label: "3:1 Max", pixelSize: "3840×1280" }
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
] satisfies OpenAIImageGenOpts["output_format"][];

export const OPENAI_BACKGROUNDS = [
  "auto",
  "transparent",
  "opaque"
] satisfies OpenAIImageGenOpts["background"][];

const OPENAI_DEFAULT_SETTINGS = {
  aspectRatio: "auto",
  quality: "high",
  outputFormat: "png",
  background: "auto"
} satisfies OpenAIImageSettings;

const STORAGE_KEY_PREFIX = "openai-image-settings";

function getStorageKey(modelId: string) {
  return `${STORAGE_KEY_PREFIX}:${modelId}`;
}

export function useOpenAIImageSettings(modelId: string) {
  const [settings, setSettings] = useState<OpenAIImageSettings>(
    OPENAI_DEFAULT_SETTINGS
  );

  useEffect(() => {
    if (!imgCtx.openAIImgGenCapable(modelId)) return;

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
          parsed.aspectRatio && imgCtx.isValidOpenAISize(parsed.aspectRatio)
            ? parsed.aspectRatio
            : OPENAI_DEFAULT_SETTINGS.aspectRatio;
        const quality =
          parsed.quality && imgCtx.isValidOpenAIQuality(parsed.quality)
            ? parsed.quality
            : OPENAI_DEFAULT_SETTINGS.quality;
        const outputFormat =
          parsed.outputFormat &&
          imgCtx.isValidOpenAIOutputFormat(parsed.outputFormat)
            ? parsed.outputFormat
            : OPENAI_DEFAULT_SETTINGS.outputFormat;
        const backgroundCandidate =
          parsed.background && imgCtx.isValidOpenAIBg(parsed.background)
            ? parsed.background
            : OPENAI_DEFAULT_SETTINGS.background;
        const background =
          outputFormat === "jpeg" ? undefined : backgroundCandidate;
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
    if (!imgCtx.openAIImgGenCapable(modelId)) return;

    try {
      localStorage.setItem(getStorageKey(modelId), JSON.stringify(settings));
    } catch {
      /* */
    }
  }, [modelId, settings]);

  const updateSettings = useCallback((updates: OpenAIImageSettingsUpdates) => {
    setSettings(prev => {
      const aspectRatio =
        typeof updates.aspectRatio === "string" &&
        imgCtx.isValidOpenAISize(updates.aspectRatio)
          ? OPENAI_ASPECT_RATIOS.find(
              option => option.value === updates.aspectRatio
            )?.value
          : undefined;
      const quality =
        typeof updates.quality === "string" &&
        imgCtx.isValidOpenAIQuality(updates.quality)
          ? OPENAI_QUALITIES.find(option => option.value === updates.quality)
              ?.value
          : undefined;
      const outputFormat =
        typeof updates.outputFormat === "string" &&
        imgCtx.isValidOpenAIOutputFormat(updates.outputFormat)
          ? OPENAI_OUTPUT_FORMATS.find(
              option => option === updates.outputFormat
            )
          : undefined;
      const nextOutputFormat =
        outputFormat ??
        prev.outputFormat ??
        OPENAI_DEFAULT_SETTINGS.outputFormat;
      const backgroundCandidate =
        typeof updates.background === "string" &&
        imgCtx.isValidOpenAIBg(updates.background)
          ? OPENAI_BACKGROUNDS.find(option => option === updates.background)
          : undefined;
      const background =
        nextOutputFormat === "jpeg"
          ? undefined
          : (backgroundCandidate ??
            prev.background ??
            OPENAI_DEFAULT_SETTINGS.background);

      return {
        aspectRatio: aspectRatio ?? prev.aspectRatio,
        quality: quality ?? prev.quality,
        outputFormat: nextOutputFormat,
        background
      };
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(OPENAI_DEFAULT_SETTINGS);
  }, []);

  const isCapable = useMemo(
    () => imgCtx.openAIImgGenCapable(modelId),
    [modelId]
  );

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
