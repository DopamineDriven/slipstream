"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { useModelSelection } from "@/context/model-selection-context";
import { useGoogleImageSettings } from "@/hooks/use-gemini-img-gen";
import { useGrokImageSettings } from "@/hooks/use-grok-img-gen";
import {
  OPENAI_BACKGROUNDS,
  OPENAI_OUTPUT_FORMATS,
  useOpenAIImageSettings
} from "@/hooks/use-openai-img-gen";
import { imgCtx } from "@/lib/img-ctx";
import type {
  AIChatRequestImgGenFields,
  Provider,
  RTC
} from "@slipstream/types";

export interface ImageGenOption {
  value: string;
  label: string;
  pixelSize?: string;
}

export interface UnifiedImageGenSettings {
  aspectRatio: string;
  quality: string;
  outputFormat?: string;
  background?: "auto" | "opaque" | "transparent";
}

interface ImageGenExtraFields {
  output_partial_images?: number;
}

interface ImageGenContextType {
  selectedModel: string;
  selectedProvider: Provider;
  supported: boolean;
  enabled: boolean;
  fields: AIChatRequestImgGenFields;
  settings: UnifiedImageGenSettings | null;
  aspectRatios: readonly ImageGenOption[];
  qualities: readonly ImageGenOption[];
  outputFormats: readonly ImageGenOption[];
  backgrounds: readonly ImageGenOption[];
  supportsOutputFormat: boolean;
  supportsBackground: boolean;
  setEnabled: (v: boolean) => void;
  updateFields: (p: RTC<AIChatRequestImgGenFields>) => void;
  updateSettings: (updates: RTC<UnifiedImageGenSettings>) => void;
  reset: () => void;
  resetSettings: () => void;
}

function normalizeOpenAIOutputFormat(model = "gpt-5.4", outputFormat?: string) {
  if (!imgCtx.openAIImgGenCapable(model)) return;
  if (outputFormat && imgCtx.isValidOpenAIOutputFormat(outputFormat)) {
    return outputFormat;
  }
  return OPENAI_OUTPUT_FORMATS[0];
}

function normalizeOpenAIBackground(
  model = "gpt-5.4",
  background?: string,
  outputFormat?: string
) {
  if (!imgCtx.openAIImgGenCapable(model)) return undefined;
  if (outputFormat === "jpeg") return undefined;
  if (background && imgCtx.isValidOpenAIBg(background)) {
    return background;
  }
  return OPENAI_BACKGROUNDS[0];
}

const ImageGenContext = createContext<ImageGenContextType | undefined>(
  undefined
);

const DEFAULT_FIELDS = {
  n: 1,
  output_quality: "auto",
  output_size: "auto"
} satisfies AIChatRequestImgGenFields;

const DEFAULT_EXTRA_FIELDS = {} satisfies ImageGenExtraFields;

export function ImageGenProvider({ children }: { children: ReactNode }) {
  const { selectedModel } = useModelSelection();
  const currentModelId = selectedModel.modelId;
  const currentProvider = selectedModel.provider;

  const [enabled, setEnabled] = useState(false);
  const [extraFields, setExtraFields] =
    useState<ImageGenExtraFields>(DEFAULT_EXTRA_FIELDS);

  const supported = useMemo(() => {
    if (imgCtx.imgGenCapableModels(currentModelId)) {
      return true;
    } else return false;
  }, [currentModelId]);

  const openai = useOpenAIImageSettings(currentModelId);
  const google = useGoogleImageSettings(currentModelId);
  const grok = useGrokImageSettings(currentModelId);

  const normalizedOpenAIOutputFormat = useMemo(
    () =>
      normalizeOpenAIOutputFormat(currentModelId, openai.settings.outputFormat),
    [currentModelId, openai.settings.outputFormat]
  );

  const normalizedOpenAIBackground = useMemo(
    () =>
      normalizeOpenAIBackground(
        currentModelId,
        openai.settings.background,
        normalizedOpenAIOutputFormat
      ),
    [currentModelId, normalizedOpenAIOutputFormat, openai.settings.background]
  );

  useEffect(() => {
    if (!supported) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabled(false);
    }
  }, [supported]);

  const settings = useMemo(() => {
    if (
      !(
        currentProvider === "openai" ||
        currentProvider === "gemini" ||
        currentProvider === "grok"
      )
    ) {
      return null;
    }

    switch (currentProvider) {
      case "openai": {
        return {
          aspectRatio: openai.settings.aspectRatio,
          quality: openai.settings.quality,
          outputFormat: normalizedOpenAIOutputFormat,
          background: normalizedOpenAIBackground
        } satisfies UnifiedImageGenSettings;
      }
      case "gemini": {
        return {
          aspectRatio: google.settings.aspectRatio ?? "16:9",
          quality: google.settings.quality ?? "1K"
        } satisfies UnifiedImageGenSettings;
      }
      case "grok": {
        return {
          aspectRatio: grok.settings.aspectRatio ?? "auto",
          quality: grok.settings.quality ?? "1k"
        } satisfies UnifiedImageGenSettings;
      }
    }
  }, [
    currentProvider,
    google.settings.aspectRatio,
    google.settings.quality,
    grok.settings.aspectRatio,
    grok.settings.quality,
    normalizedOpenAIBackground,
    normalizedOpenAIOutputFormat,
    openai.settings.aspectRatio,
    openai.settings.quality
  ]);

  const aspectRatios = useMemo(() => {
    switch (currentProvider) {
      case "openai": {
        return openai.aspectRatios.map(option => ({
          value: option.value,
          label: option.label,
          pixelSize: option.pixelSize
        })) satisfies ImageGenOption[];
      }
      case "gemini": {
        return (google.aspectRatios ?? []).map(option => ({
          value: option,
          label: option
        })) satisfies ImageGenOption[];
      }
      case "grok": {
        return grok.aspectRatios.map(option => ({
          value: option,
          label: option
        })) satisfies ImageGenOption[];
      }
      default: {
        return [] satisfies ImageGenOption[];
      }
    }
  }, [
    currentProvider,
    google.aspectRatios,
    grok.aspectRatios,
    openai.aspectRatios
  ]);

  const qualities = useMemo(() => {
    switch (currentProvider) {
      case "openai": {
        return openai.qualities.map(option => ({
          value: option.value,
          label: option.label
        })) satisfies ImageGenOption[];
      }
      case "gemini": {
        return (google.qualities ?? []).map(option => ({
          value: option,
          label: option
        })) satisfies ImageGenOption[];
      }
      case "grok": {
        return grok.qualities.map(option => ({
          value: option,
          label: option
        })) satisfies ImageGenOption[];
      }
      default: {
        return [] satisfies ImageGenOption[];
      }
    }
  }, [currentProvider, google.qualities, grok.qualities, openai.qualities]);

  const supportsOutputFormat =
    currentProvider === "openai" && openai.supportsOutputFormat;

  const supportsBackground =
    currentProvider === "openai" && openai.supportsBackground;

  const outputFormats = useMemo(() => {
    if (!(currentProvider === "openai" && openai.supportsOutputFormat)) {
      return [] satisfies ImageGenOption[];
    }
    return openai.outputFormats.map(option => ({
      value: option,
      label: option.toUpperCase()
    })) satisfies ImageGenOption[];
  }, [currentProvider, openai.outputFormats, openai.supportsOutputFormat]);

  const backgrounds = useMemo(() => {
    if (!imgCtx.openAIImgGenCapable(currentModelId)) {
      return [] satisfies ImageGenOption[];
    }
    return openai.backgrounds.map(option => ({
      value: option,
      label:
        option === "auto"
          ? "Auto"
          : option.slice(0, 1).toUpperCase() + option.slice(1)
    })) satisfies ImageGenOption[];
  }, [currentModelId, openai.backgrounds]);

  const updateSettings = useCallback(
    (updates: RTC<UnifiedImageGenSettings>) => {
      switch (currentProvider) {
        case "openai": {
          openai.updateSettings(updates);
          return;
        }
        case "gemini": {
          google.updateSettings(updates);
          return;
        }
        case "grok": {
          grok.updateSettings(updates);
          return;
        }
        default: {
          return;
        }
      }
    },
    [currentProvider, google, grok, openai]
  );

  const resetSettings = useCallback(() => {
    switch (currentProvider) {
      case "openai": {
        openai.resetSettings();
        return;
      }
      case "gemini": {
        google.resetSettings();
        return;
      }
      case "grok": {
        grok.resetSettings();
        return;
      }
      default: {
        return;
      }
    }
  }, [currentProvider, google, grok, openai]);

  const updateFields = useCallback(
    (nextFields: RTC<AIChatRequestImgGenFields>) => {
      if (!imgCtx.imgGenCapableModels(currentModelId)) return;
      const nextSettings: RTC<UnifiedImageGenSettings> = {};

      if (typeof nextFields.output_size !== "undefined") {
        nextSettings.aspectRatio = nextFields.output_size;
      }
      if (typeof nextFields.output_quality !== "undefined") {
        nextSettings.quality = nextFields.output_quality;
      }
      if (typeof nextFields.output_format !== "undefined") {
        nextSettings.outputFormat = nextFields.output_format;
      }
      if (typeof nextFields.output_background !== "undefined") {
        nextSettings.background = nextFields.output_background;
      }
      if (Object.keys(nextSettings).length > 0) {
        updateSettings(nextSettings);
      }

      if (typeof nextFields.output_partial_images !== "undefined") {
        setExtraFields({
          output_partial_images: imgCtx.handlePartialImgGen(currentModelId, {
            partialImagesRequested: nextFields.output_partial_images
          })
        });
      }
    },
    [currentModelId, updateSettings]
  );

  const reset = useCallback(() => {
    resetSettings();
    setExtraFields(DEFAULT_EXTRA_FIELDS);
  }, [resetSettings]);

  const fields = useMemo(() => {
    const mod = imgCtx.imgGenCapableModels(currentModelId)
      ? currentModelId
      : "gemini-2.5-flash-image";
    const output_quality =
      imgCtx.handleImgGenOutputQuality(mod, {
        output_quality: settings?.quality
      }) ?? DEFAULT_FIELDS.output_quality;
    const output_size =
      imgCtx.handleOutputSize(mod, {
        output_size: settings?.aspectRatio
      }) ?? DEFAULT_FIELDS.output_size;

    const output_partial_images = imgCtx.handlePartialImgGen(mod, {
      partialImagesRequested: extraFields.output_partial_images
    });
    const output_format = imgCtx.imgGenCapableModels(currentModelId)
      ? imgCtx.handleImgGenOutputFormat(currentModelId, {
          format: settings?.outputFormat
        })
      : undefined;
    const output_background = imgCtx.handleImgGenBg(currentModelId, {
      background: settings?.background
    });

    return {
      n: 1,
      output_quality,
      output_size,
      output_partial_images,
      output_background,
      output_format
    } satisfies AIChatRequestImgGenFields;
  }, [currentModelId, extraFields.output_partial_images, settings]);

  const value = useMemo(
    () => ({
      selectedModel: currentModelId,
      selectedProvider: currentProvider,
      supported,
      enabled,
      fields,
      settings,
      aspectRatios,
      qualities,
      outputFormats,
      backgrounds,
      supportsOutputFormat,
      supportsBackground,
      setEnabled,
      updateFields,
      updateSettings,
      reset,
      resetSettings
    }),
    [
      aspectRatios,
      backgrounds,
      currentModelId,
      currentProvider,
      enabled,
      fields,
      outputFormats,
      qualities,
      reset,
      resetSettings,
      settings,
      supported,
      supportsBackground,
      supportsOutputFormat,
      updateFields,
      updateSettings
    ]
  );

  return (
    <ImageGenContext.Provider value={value}>
      {children}
    </ImageGenContext.Provider>
  );
}

export function useImageGen() {
  const ctx = useContext(ImageGenContext);
  if (!ctx) {
    throw new Error("useImageGen must be inside a provider");
  }
  return ctx;
}
