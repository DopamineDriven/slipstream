"use client";

import { useCallback, useEffect, useState } from "react";
import { modelIdToDisplayNameImgGen } from "@slipstream/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GeminiImgModelId = keyof typeof modelIdToDisplayNameImgGen.gemini;

/** Imagen base aspect ratios */
export type ImagenAR = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
/** Nano Banana adds more options */
export type NanoBananaAR = ImagenAR | "2:3" | "3:2" | "4:5" | "5:4" | "21:9";
/** Nano Banana 2 - most flexible */
export type NanoBanana2AR = NanoBananaAR | "1:4" | "4:1" | "8:1" | "1:8";
/** Union of all Google aspect ratios */
export type GoogleAspectRatio = NanoBanana2AR;

/** Imagen base qualities */
export type ImagenQuality = "1K" | "2K";
/** Nano Banana adds 4K */
export type NanoBananaQuality = ImagenQuality | "4K";
/** Nano Banana 2 adds 0.5K */
export type NanoBanana2Quality = NanoBananaQuality | "0.5K";
/** Union of all Google qualities */
export type GoogleQuality = NanoBanana2Quality;

export interface GoogleImageSettings {
  aspectRatio: GoogleAspectRatio;
  quality: GoogleQuality;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Detection
// ─────────────────────────────────────────────────────────────────────────────

export function isGoogleImgGenCapable(modelId: string): modelId is GeminiImgModelId {
  return modelId in modelIdToDisplayNameImgGen.gemini;
}

function isImagenModel(m: string | null) {
  return m === "imagen-4.0-generate-001" || m === "imagen-4.0-fast-generate-001" || m === "imagen-4.0-ultra-generate-001"
}

// ─────────────────────────────────────────────────────────────────────────────
// Aspect Ratio Options by Model
// ─────────────────────────────────────────────────────────────────────────────

const IMAGEN_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] satisfies ImagenAR[];
const NANO_BANANA_ASPECT_RATIOS = [...IMAGEN_ASPECT_RATIOS, "2:3", "3:2", "4:5", "5:4", "21:9"] satisfies NanoBananaAR[];
const NANO_BANANA_2_ASPECT_RATIOS = [...NANO_BANANA_ASPECT_RATIOS, "1:4", "4:1", "1:8", "8:1"] satisfies NanoBanana2AR[];

const MODEL_ASPECT_RATIOS = new Map<GeminiImgModelId, GoogleAspectRatio[]>([
  ["gemini-3.1-flash-image-preview", NANO_BANANA_2_ASPECT_RATIOS],
  ["gemini-3-pro-image-preview", NANO_BANANA_ASPECT_RATIOS],
  ["gemini-2.5-flash-image", NANO_BANANA_ASPECT_RATIOS],
  ["deep-research-pro-preview-12-2025", NANO_BANANA_ASPECT_RATIOS],
  ["imagen-4.0-generate-001", IMAGEN_ASPECT_RATIOS],
  ["imagen-4.0-fast-generate-001", IMAGEN_ASPECT_RATIOS],
  ["imagen-4.0-ultra-generate-001", IMAGEN_ASPECT_RATIOS],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Quality Options by Model
// ─────────────────────────────────────────────────────────────────────────────

const IMAGEN_QUALITIES = ["1K", "2K"] satisfies ImagenQuality[];
const NANO_BANANA_QUALITIES = ["1K", "2K", "4K"] satisfies NanoBananaQuality[];
const NANO_BANANA_2_QUALITIES = ["0.5K", "1K", "2K", "4K"] satisfies NanoBanana2Quality[];

const MODEL_QUALITIES = new Map<GeminiImgModelId, GoogleQuality[]>([
  ["gemini-3.1-flash-image-preview", NANO_BANANA_2_QUALITIES],
  ["gemini-3-pro-image-preview", NANO_BANANA_QUALITIES],
  ["gemini-2.5-flash-image", NANO_BANANA_QUALITIES],
  ["deep-research-pro-preview-12-2025", NANO_BANANA_QUALITIES],
  ["imagen-4.0-generate-001", IMAGEN_QUALITIES],
  ["imagen-4.0-fast-generate-001", IMAGEN_QUALITIES],
  ["imagen-4.0-ultra-generate-001", IMAGEN_QUALITIES],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Defaults by Model
// ─────────────────────────────────────────────────────────────────────────────

const IMAGEN_DEFAULTS = { aspectRatio: "1:1", quality: "1K" } satisfies GoogleImageSettings;
const NANO_BANANA_DEFAULTS = { aspectRatio: "1:1", quality: "2K" } satisfies GoogleImageSettings;

const MODEL_DEFAULTS = new Map<GeminiImgModelId, GoogleImageSettings>([
  ["gemini-3.1-flash-image-preview", NANO_BANANA_DEFAULTS],
  ["gemini-3-pro-image-preview", NANO_BANANA_DEFAULTS],
  ["gemini-2.5-flash-image", NANO_BANANA_DEFAULTS],
  ["deep-research-pro-preview-12-2025", NANO_BANANA_DEFAULTS],
  ["imagen-4.0-generate-001", IMAGEN_DEFAULTS],
  ["imagen-4.0-fast-generate-001", IMAGEN_DEFAULTS],
  ["imagen-4.0-ultra-generate-001", IMAGEN_DEFAULTS],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export function isValidImagenAR(ar: string) {
  return ar === "1:1" || ar === "3:4" || ar === "4:3" || ar === "9:16" || ar === "16:9";
}

export function isValidNanoBananaAR(ar: string) {
  return isValidImagenAR(ar) || ar === "2:3" || ar === "3:2" || ar === "4:5" || ar === "5:4" || ar === "21:9";
}

export function isValidNanoBanana2AR(ar: string) {
  return isValidNanoBananaAR(ar) || ar === "1:4" || ar === "4:1" || ar === "8:1" || ar === "1:8";
}

export function isValidImagenQuality(q: string) {
  return q === "1K" || q === "2K";
}

export function isValidNanoBananaQuality(q: string) {
  return isValidImagenQuality(q) || q === "4K";
}

export function isValidNanoBanana2Quality(q: string) {
  return isValidNanoBananaQuality(q) || q === "0.5K";
}

function isNanoBanana2(modelId: GeminiImgModelId) {
  return modelId === "gemini-3.1-flash-image-preview";
}

function isNanoBanana(modelId: GeminiImgModelId) {
  return modelId === "gemini-3-pro-image-preview"
    || modelId === "gemini-2.5-flash-image"
    || modelId === "deep-research-pro-preview-12-2025";
}

// ───────────────────���─────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────��─────────────────��─────────────────────

const STORAGE_KEY_PREFIX = "google-image-settings";

function getStorageKey(modelId: string) {
  return `${STORAGE_KEY_PREFIX}:${modelId}`;
}

export function useGoogleImageSettings(modelId: string) {
  const isCapable = isGoogleImgGenCapable(modelId);
  const googleModelId = isCapable ? modelId as GeminiImgModelId : null;
  const defaultSettings = googleModelId ? MODEL_DEFAULTS.get(googleModelId) ?? IMAGEN_DEFAULTS : IMAGEN_DEFAULTS;

  const [settings, setSettings] = useState<GoogleImageSettings>(defaultSettings);

  // Load from localStorage on mount/model change
  useEffect(() => {
    if (!googleModelId) return;

    try {
      const stored = localStorage.getItem(getStorageKey(modelId));
      if (stored) {
        const parsed = JSON.parse<{ aspectRatio?: string; quality?: string }>(stored);
        const ar = parsed.aspectRatio ?? defaultSettings.aspectRatio;
        const q = parsed.quality ?? defaultSettings.quality;

        const aspectRatio =
          isNanoBanana2(googleModelId) && isValidNanoBanana2AR(ar) ? ar
            : isNanoBanana(googleModelId) && isValidNanoBananaAR(ar) ? ar
              : isValidImagenAR(ar) ? ar
                : defaultSettings.aspectRatio;

        const quality =
          isNanoBanana2(googleModelId) && isValidNanoBanana2Quality(q) ? q
            : isNanoBanana(googleModelId) && isValidNanoBananaQuality(q) ? q
              : isValidImagenQuality(q) ? q
                : defaultSettings.quality;
// eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings({
          aspectRatio: aspectRatio as GoogleAspectRatio,
          quality: quality as GoogleQuality,
        });
      } else {
        setSettings(defaultSettings);
      }
    } catch {
      setSettings(defaultSettings);
    }
  }, [modelId, googleModelId, defaultSettings]);

  // Persist to localStorage on change
  useEffect(() => {
    if (!googleModelId) return;

    try {
      localStorage.setItem(getStorageKey(modelId), JSON.stringify(settings));
    } catch {
      /* ignore quota errors */
    }
  }, [modelId, googleModelId, settings]);

  const updateSettings = useCallback((updates: Partial<GoogleImageSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
  }, [defaultSettings]);

  const aspectRatios = googleModelId ? MODEL_ASPECT_RATIOS.get(googleModelId) : [];
  const qualities = googleModelId ? MODEL_QUALITIES.get(googleModelId) : [];

  return {
    settings,
    updateSettings,
    resetSettings,
    isCapable,
    modelId: googleModelId,
    aspectRatios,
    qualities,
    supportsOutputFormat: isImagenModel(googleModelId),
    supportsBackground: false,
  };
}
