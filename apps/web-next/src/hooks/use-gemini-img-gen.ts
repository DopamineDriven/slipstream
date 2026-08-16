"use client";

import { useCallback, useEffect, useState } from "react";
import { imgCtx } from "@/lib/img-ctx";
import type {
  GeminiImageQuality,
  GeminiImageSize,
  GeminiImgGenModels
} from "@slipstream/types";

export type GeminiImgModelId = GeminiImgGenModels;

export type NanoBananaAR = GeminiImageSize["gemini-3-pro-image-preview"];

export type NanoBanana2AR = GeminiImageSize[
  "gemini-3.1-flash-image-preview" | "gemini-3.1-flash-lite-image"];

export type GoogleAspectRatio = NanoBanana2AR;

export type NanoBananaQuality =
  GeminiImageQuality["gemini-3-pro-image-preview"];

export type NanoBanana2LiteQuality =
  GeminiImageQuality["gemini-3.1-flash-lite-image"];

export type NanoBanana2Quality =
  GeminiImageQuality["gemini-3.1-flash-image-preview"];

export type GoogleQuality = NanoBanana2Quality;

export interface GoogleImageSettings {
  aspectRatio: GoogleAspectRatio;
  quality: GoogleQuality;
}

export interface GoogleImageSettingsUpdates {
  aspectRatio?: string;
  quality?: string;
}

export function isGoogleImgGenCapable(m: string) {
  return imgCtx.geminiNanoBananasModel(m);
}

const NANO_BANANA_ASPECT_RATIOS = [
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "2:3",
  "3:2",
  "4:5",
  "5:4",
  "21:9"
] satisfies NanoBananaAR[];
const NANO_BANANA_2_ASPECT_RATIOS = [
  ...NANO_BANANA_ASPECT_RATIOS,
  "1:4",
  "4:1",
  "1:8",
  "8:1"
] satisfies NanoBanana2AR[];

const MODEL_ASPECT_RATIOS = new Map<GeminiImgModelId, GoogleAspectRatio[]>([
  ["gemini-3.1-flash-lite-image", NANO_BANANA_2_ASPECT_RATIOS],
  ["gemini-3.1-flash-image-preview", NANO_BANANA_2_ASPECT_RATIOS],
  ["gemini-3-pro-image-preview", NANO_BANANA_ASPECT_RATIOS],
  ["gemini-2.5-flash-image", NANO_BANANA_ASPECT_RATIOS],
  ["deep-research-max-preview-04-2026", NANO_BANANA_ASPECT_RATIOS],
  ["deep-research-preview-04-2026", NANO_BANANA_ASPECT_RATIOS]
]);

const NANO_BANANA_QUALITIES = ["1K", "2K", "4K"] satisfies NanoBananaQuality[];
const NANO_BANANA_2_LITE_QUALITIES = [
  "0.5K",
  "1K"
] satisfies NanoBanana2LiteQuality[];
const NANO_BANANA_2_QUALITIES = [
  "0.5K",
  "1K",
  "2K",
  "4K"
] satisfies NanoBanana2Quality[];

const MODEL_QUALITIES = new Map<GeminiImgModelId, GoogleQuality[]>([
  ["gemini-3.1-flash-lite-image", NANO_BANANA_2_LITE_QUALITIES],
  ["gemini-3.1-flash-image-preview", NANO_BANANA_2_QUALITIES],
  ["gemini-3-pro-image-preview", NANO_BANANA_QUALITIES],
  ["gemini-2.5-flash-image", NANO_BANANA_QUALITIES],
  ["deep-research-max-preview-04-2026", NANO_BANANA_QUALITIES],
  ["deep-research-preview-04-2026", NANO_BANANA_QUALITIES]
]);

const IMAGEN_DEFAULTS = {
  aspectRatio: "1:1",
  quality: "1K"
} satisfies GoogleImageSettings;

const NANO_BANANA_2_LITE_DEFAULTS = {
  aspectRatio: "16:9",
  quality: "1K"
} satisfies GoogleImageSettings;
const NANO_BANANA_DEFAULTS = {
  aspectRatio: "16:9",
  quality: "2K"
} satisfies GoogleImageSettings;

const MODEL_DEFAULTS = new Map<GeminiImgModelId, GoogleImageSettings>([
  ["gemini-3.1-flash-lite-image", NANO_BANANA_2_LITE_DEFAULTS],
  ["gemini-3.1-flash-image-preview", NANO_BANANA_DEFAULTS],
  ["gemini-3-pro-image-preview", NANO_BANANA_DEFAULTS],
  ["gemini-2.5-flash-image", NANO_BANANA_DEFAULTS],
  ["deep-research-max-preview-04-2026", NANO_BANANA_DEFAULTS],
  ["deep-research-preview-04-2026", NANO_BANANA_DEFAULTS]
]);

export function isValidNanoBananaAR(ar: string) {
  return imgCtx.isValidNanoBananaGenOneAR(ar);
}

export function isValidNanoBanana2AR(ar: string) {
  return isValidNanoBananaAR(ar) || imgCtx.isValidNanoBananaGenTwoAR(ar);
}

export function isValidImagenQuality(q: string) {
  return imgCtx.isValidImagenOutputQuality(q);
}

export function isValidNanoBananaQuality(q: string) {
  return (
    isValidImagenQuality(q) || imgCtx.isValidNanoBananaProAndTwoOutputQuality(q)
  );
}

export function isValidNanoBanana2Quality(q: string) {
  return (
    isValidNanoBananaQuality(q) || imgCtx.isValidNanoBananaTwoOutputQuality(q)
  );
}

const STORAGE_KEY_PREFIX = "gemini-image-settings";

function getStorageKey(modelId: string) {
  return `${STORAGE_KEY_PREFIX}:${modelId}`;
}

export function useGoogleImageSettings(modelId: string) {
  const isCapable = isGoogleImgGenCapable(modelId);
  const googleModelId = isCapable
    ? (Array.from(MODEL_DEFAULTS.keys()).find(model => model === modelId) ??
      null)
    : null;
  const defaultSettings = googleModelId
    ? (MODEL_DEFAULTS.get(googleModelId) ?? IMAGEN_DEFAULTS)
    : IMAGEN_DEFAULTS;
  const aspectRatioOptions = googleModelId
    ? (MODEL_ASPECT_RATIOS.get(googleModelId) ?? Array.of<GoogleAspectRatio>())
    : Array.of<GoogleAspectRatio>();
  const qualityOptions = googleModelId
    ? (MODEL_QUALITIES.get(googleModelId) ?? Array.of<GoogleQuality>())
    : Array.of<GoogleQuality>();

  const [settings, setSettings] =
    useState<GoogleImageSettings>(defaultSettings);

  useEffect(() => {
    if (!googleModelId) return;

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
    googleModelId,
    modelId,
    qualityOptions
  ]);

  useEffect(() => {
    if (!googleModelId) return;

    try {
      localStorage.setItem(getStorageKey(modelId), JSON.stringify(settings));
    } catch {
      /* ignore quota errors */
    }
  }, [modelId, googleModelId, settings]);

  const updateSettings = useCallback(
    (updates: GoogleImageSettingsUpdates) => {
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
    modelId: googleModelId,
    aspectRatios: aspectRatioOptions,
    qualities: qualityOptions,
    supportsOutputFormat: false,
    supportsBackground: false
  };
}
