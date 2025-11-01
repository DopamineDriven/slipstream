"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  AIChatRequestImgGenFields,
  AllModelsUnion,GetModelUtilRT,
  Provider
} from "@slipstream/types";
import { useModelSelection } from "./model-selection-context";

interface ImageGenContextType {
  selectedModel: AllModelsUnion;
  selectedProvider: Provider;
  supported: boolean;
  enabled: boolean;
  fields: AIChatRequestImgGenFields;
  setEnabled: (v: boolean) => void;
  updateFields: (p: Partial<AIChatRequestImgGenFields>) => void;
  reset: () => void;
}

  function isImgGenCapableModel<const T extends Provider = Provider>(
    provider: T,
    model?: GetModelUtilRT<T>
  ) {
    const p = provider as Provider;
    if (typeof model === "undefined") return false;
    switch (p) {
      case "anthropic":
      case "meta":
      case "vercel": {
        return false;
      }
      case "grok": {
        const m = model as GetModelUtilRT<typeof p>;
        switch (m) {
          case "grok-2-image-1212": {
            return true;
          }
          case "grok-2-vision-1212":
          case "grok-3":
          case "grok-3-mini":
          case "grok-4-fast-non-reasoning":
          case "grok-4-fast-reasoning":
          case "grok-code-fast-1":
          default: {
            return false;
          }
        }
      }
      case "gemini": {
        const m = model as GetModelUtilRT<typeof p>;
        switch (m) {
          case "gemini-2.5-flash-image":
          case "imagen-3.0-generate-002":
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            return true;
          }
          case "gemini-2.0-flash":
          case "gemini-2.0-flash-lite":
          case "gemini-2.5-flash":
          case "gemini-2.5-flash-lite":
          case "gemini-2.5-pro":
          case "veo-2.0-generate-001":
          case "veo-3.0-fast-generate-001":
          case "veo-3.0-generate-001":
          case "veo-3.1-fast-generate-preview":
          case "veo-3.1-generate-preview":
          default: {
            return false;
          }
        }
      }
      case "openai": {
        const m = model as GetModelUtilRT<typeof p>;
        switch (m) {
          case "dall-e-2":
          case "dall-e-3":
          case "gpt-image-1":
          case "gpt-image-1-mini":
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "o3":
          case "gpt-5-pro":
          case "gpt-5-chat-latest":
          case "gpt-5-mini":
          case "gpt-5-nano":
          case "gpt-5": {
            return true;
          }
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "chatgpt-4o-latest":
          case "o1-pro":
          case "sora-2":
          case "sora-2-pro":
          case "o1":
          case "o3-deep-research":
          case "o4-mini-deep-research":
          case "gpt-4-turbo":
          case "gpt-5-codex":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini":
          default: {
            return false;
          }
        }
      }
      default: {
        return false;
      }
    }
  }

  function _isPureImgGenModel<const T extends Provider = Provider>(
    provider: T,
    model?: GetModelUtilRT<T>
  ) {
    const p = provider as Provider;
    if (!model) return false;
    switch (p) {
      case "anthropic":
      case "meta":
      case "vercel": {
        return false;
      }
      case "grok": {
        const m = model as GetModelUtilRT<typeof p>;
        switch (m) {
          case "grok-2-image-1212": {
            return true;
          }
          case "grok-2-vision-1212":
          case "grok-3":
          case "grok-3-mini":
          case "grok-4-0709":
          case "grok-4-fast-non-reasoning":
          case "grok-4-fast-reasoning":
          case "grok-code-fast-1":
          default: {
            return false;
          }
        }
      }
      case "gemini": {
        const m = model as GetModelUtilRT<typeof p>;
        switch (m) {
          case "gemini-2.5-flash-image":
          case "imagen-3.0-generate-002":
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            return true;
          }
          case "gemini-2.0-flash":
          case "gemini-2.0-flash-lite":
          case "gemini-2.5-flash":
          case "gemini-2.5-flash-lite":
          case "gemini-2.5-pro":
          case "veo-2.0-generate-001":
          case "veo-3.0-fast-generate-001":
          case "veo-3.0-generate-001":
          case "veo-3.1-fast-generate-preview":
          case "veo-3.1-generate-preview":
          default: {
            return false;
          }
        }
      }
      case "openai": {
        const m = model as GetModelUtilRT<typeof p>;
        switch (m) {
          case "dall-e-2":
          case "dall-e-3":
          case "gpt-image-1":
          case "gpt-image-1-mini": {
            return true;
          }
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "gpt-4-turbo":
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "gpt-5":
          case "gpt-5-codex":
          case "gpt-5-mini":
          case "gpt-5-nano":
          case "gpt-5-pro":
          case "chatgpt-4o-latest":
          case "gpt-5-chat-latest":
          case "o1-pro":
          case "sora-2":
          case "sora-2-pro":
          case "o1":
          case "o3-deep-research":
          case "o4-mini-deep-research":
          case "o3":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini":
          default: {
            return false;
          }
        }
      }
      default: {
        return false;
      }
    }
  }

function handleOutputSize(
  provider: Provider,
  model?: AllModelsUnion,
  data?: { output_size?: string }
) {
  switch (provider) {
    case "anthropic":
    case "meta":
    case "vercel":
    case "grok": {
      return undefined;
    }
    case "gemini": {
      switch (model) {
        case "gemini-2.5-flash-image": {
          if (
            data?.output_size &&
            /^(1:1|2:3|3:2|3:4|4:3|4:5|5:4|9:16|16:9|21:9)$/gm.test(
              data.output_size
            )
          ) {
            return data.output_size;
          } else return "1:1";
        }
        case "imagen-3.0-generate-002":
        case "imagen-4.0-fast-generate-001":
        case "imagen-4.0-generate-001":
        case "imagen-4.0-ultra-generate-001": {
          if (
            data?.output_size &&
            /^(1:1|3:4|4:3|9:16|16:9)$/gm.test(data.output_size)
          ) {
            return data.output_size;
          } else return "1:1";
        }
        case "gemini-2.0-flash":
        case "gemini-2.0-flash-lite":
        case "gemini-2.5-flash":
        case "gemini-2.5-flash-lite":
        case "gemini-2.5-pro":
        case "veo-2.0-generate-001":
        case "veo-3.0-fast-generate-001":
        case "veo-3.0-generate-001":
        case "veo-3.1-fast-generate-preview":
        case "veo-3.1-generate-preview": {
          return undefined;
        }
        default: {
          return "1:1";
        }
      }
    }
    case "openai": {
      switch (model) {
        case "dall-e-2": {
          if (
            data?.output_size &&
            /^(256x256|512x512|1024x1024|auto)$/gm.test(data.output_size)
          ) {
            return data.output_size;
          } else return "auto";
        }
        case "dall-e-3": {
          if (
            data?.output_size &&
            /^(1792x1024|1024x1792|1024x1024|auto)$/gm.test(data.output_size)
          ) {
            return data.output_size;
          } else return "auto";
        }
        case "gpt-4.1":
        case "gpt-4.1-mini":
        case "gpt-4.1-nano":
        case "gpt-4o":
        case "gpt-4o-mini":
        case "gpt-5":
        case "gpt-5-mini":
        case "gpt-5-nano":
        case "gpt-image-1":
        case "gpt-image-1-mini":
        case "o3": {
          if (
            data?.output_size &&
            /^(1536x1024|1024x1536|1024x1024|auto)$/gm.test(data.output_size)
          ) {
            return data.output_size;
          } else return "auto";
        }
        case "gpt-3.5-turbo":
        case "gpt-4":
        case "gpt-4-turbo":
        case "gpt-5-codex":
        case "gpt-5-pro":
        case "o3-mini":
        case "o3-pro":
        case "o4-mini": {
          return undefined;
        }
        default: {
          return "auto";
        }
      }
    }
    default: {
      return undefined;
    }
  }
}
function _handlePartialImgGen(
  provider: Provider,
  model?: AllModelsUnion,
  data?: { partialImagesRequested?: number }
) {
  switch (provider) {
    case "openai": {
      if (model) {
        switch (model) {
          case "dall-e-2":
          case "dall-e-3":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini":
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "gpt-4-turbo":
          case "gpt-5-codex":
          case "gpt-5-pro": {
            return undefined;
          }
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "gpt-5":
          case "gpt-5-mini":
          case "gpt-5-nano":
          case "gpt-image-1":
          case "gpt-image-1-mini":
          case "o3": {
            if (
              data?.partialImagesRequested &&
              data.partialImagesRequested >= 0 &&
              data.partialImagesRequested <= 3
            ) {
              return data.partialImagesRequested;
            } else return 0;
          }
          default: {
            return undefined;
          }
        }
      } else return undefined;
    }
    case "anthropic":
    case "gemini":
    case "grok":
    case "meta":
    case "vercel":
    default: {
      return undefined;
    }
  }
}

function handleImgGenOutputQuality(
    provider: Provider,
    model?: AllModelsUnion,
    data?: { output_quality?: string }
  ) {
    switch (provider) {
      case "anthropic":
      case "meta":
      case "vercel":
      case "grok": {
        return undefined;
      }
      case "gemini": {
        const m = model as GetModelUtilRT<typeof provider>;
        switch (m) {
          case "imagen-3.0-generate-002": {
            if (data?.output_quality && /^1K$/gm.test(data.output_quality)) {
              return data.output_quality as "1K";
            } else return "1K";
          }
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            if (
              data?.output_quality &&
              /^(1|2)K$/gm.test(data.output_quality)
            ) {
              return data.output_quality as "1K" | "2K";
            } else return "1K";
          }
          case "gemini-2.0-flash":
          case "gemini-2.0-flash-lite":
          case "gemini-2.5-flash":
          case "gemini-2.5-flash-lite":
          case "gemini-2.5-pro":
          case "veo-2.0-generate-001":
          case "veo-3.0-fast-generate-001":
          case "veo-3.0-generate-001":
          case "veo-3.1-fast-generate-preview":
          case "veo-3.1-generate-preview":
          case "gemini-2.5-flash-image":
          default: {
            return undefined;
          }
        }
      }
      case "openai": {
        if (!model) return "auto";
        const m = model as GetModelUtilRT<typeof provider>;
        switch (m) {
          case "dall-e-2": {
            if (
              data?.output_quality &&
              /^(standard|auto)$/gm.test(data.output_quality)
            ) {
              return data.output_quality as "standard" | "auto";
            } else return "auto";
          }
          case "dall-e-3": {
            if (
              data?.output_quality &&
              /^(standard|auto|hd)$/gm.test(data.output_quality)
            ) {
              return data.output_quality as "standard" | "hd" | "auto";
            } else return "auto";
          }
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "gpt-5":
          case "gpt-5-mini":
          case "gpt-5-chat-latest":
          case "gpt-5-pro":
          case "gpt-5-nano":
          case "gpt-image-1":
          case "gpt-image-1-mini":
          case "o3": {
            if (
              data?.output_quality &&
              /^(high|medium|low|auto)$/gm.test(data.output_quality)
            ) {
              return data.output_quality as "high" | "medium" | "low" | "auto";
            } else return "auto";
          }
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "gpt-4-turbo":
          case "chatgpt-4o-latest":
          case "o1":
          case "o3-deep-research":
          case "o4-mini-deep-research":
          case "o1-pro":
          case "sora-2":
          case "sora-2-pro":
          case "gpt-5-codex":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini": {
            return undefined;
          }
          default: {
            return "auto";
          }
        }
      }
      default: {
        return undefined;
      }
    }
  }

const ImageGenContext = createContext<ImageGenContextType | undefined>(
  undefined
);

const DEFAULT_FIELDS: AIChatRequestImgGenFields = {
  // v1: n fixed to 1; streaming requires n=1, partials optional later
  n: 1,
  output_quality: "auto",
  output_size: "auto"
};

export function ImageGenProvider({ children }: { children: ReactNode }) {
  const { selectedModel } = useModelSelection();

  const supported = useMemo(
    () =>
      isImgGenCapableModel(
        selectedModel.provider,
        selectedModel.modelId as AllModelsUnion
      ),
    [selectedModel.modelId, selectedModel.provider]
  );

  const [enabled, setEnabled] = useState<boolean>(false);
  const [fields, setFields] =
    useState<AIChatRequestImgGenFields>(DEFAULT_FIELDS);

  // Normalize fields when model/provider changes
  useEffect(() => {
    // If unsupported, force disable
    // eslint-disable-next-line
    if (!supported && enabled) setEnabled(false);
    const quality = handleImgGenOutputQuality(
      selectedModel.provider,
      selectedModel.modelId as AllModelsUnion,
      { output_quality: fields.output_quality }
    );
    const size = handleOutputSize(
      selectedModel.provider,
      selectedModel.modelId as AllModelsUnion,
      { output_size: fields.output_size }
    );
    // Ensure n stays 1 for v1
    setFields(prev => ({
      ...prev,
      n: 1,
      output_quality: quality ?? prev.output_quality,
      output_size: size ?? prev.output_size
    }));
  }, [
    selectedModel.modelId,
    enabled,
    fields.output_quality,
    fields.output_size,
    selectedModel.provider,
    supported
  ]);

  const updateFields = (p: Partial<AIChatRequestImgGenFields>) => {
    setFields(prev => {
      const next = { ...prev, ...p, n: 1 } as AIChatRequestImgGenFields;
      // Normalize relevant fields
      next.output_quality = handleImgGenOutputQuality(
        selectedModel.provider,
        selectedModel.modelId as AllModelsUnion,
        { output_quality: next.output_quality }
      );
      next.output_size = handleOutputSize(
        selectedModel.provider,
        selectedModel.modelId as AllModelsUnion,
        { output_size: next.output_size }
      );
      return next;
    });
  };

  const reset = () => setFields({ ...DEFAULT_FIELDS });

  return (
    <ImageGenContext.Provider
      value={{
        selectedModel: selectedModel.modelId as AllModelsUnion,
        selectedProvider: selectedModel.provider,
        supported,
        enabled,
        fields,
        setEnabled,
        updateFields,
        reset
      }}>
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
