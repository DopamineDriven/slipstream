import type { Unenumerate } from "@/utils.ts";
import { displayNameToModelIdImgGen } from "@/codegen/__gen__/display-name-to-model-id-img-gen.ts";
import { displayNameToModelIdVideoGen } from "@/codegen/__gen__/display-name-to-model-id-video-gen.ts";
import { displayNameToModelId } from "@/codegen/__gen__/display-name-to-model-id.ts";
import { displayNameModelsByProviderImgGen } from "@/codegen/__gen__/display-names-by-provider-img-gen.ts";
import { displayNameModelsByProviderVideoGen } from "@/codegen/__gen__/display-names-by-provider-video-gen.ts";
import { displayNameModelsByProvider } from "@/codegen/__gen__/display-names-by-provider.ts";
import { modelIdToDisplayNameImgGen } from "@/codegen/__gen__/model-id-to-display-name-img-gen.ts";
import { modelIdToDisplayNameVideoGen } from "@/codegen/__gen__/model-id-to-display-name-video-gen.ts";
import { modelIdToDisplayName } from "@/codegen/__gen__/model-id-to-display-name.ts";
import { modelIdsByProviderImgGen } from "@/codegen/__gen__/model-ids-by-provider-img-gen.ts";
import { modelIdsByProviderVideoGen } from "@/codegen/__gen__/model-ids-by-provider-video-gen.ts";
import { modelIdsByProvider } from "@/codegen/__gen__/model-ids-by-provider.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

export type ImageGenModels =
  | "gpt-image-1"
  | "gpt-image-1.5"
  | "gpt-image-2"
  | "gpt-image-1-mini"
  | "grok-imagine-image"
  | "grok-imagine-image-quality"
  | "gemini-2.5-flash-image"
  | "gemini-3-pro-image-preview"
  | "gemini-3.1-flash-image-preview";

export const providerModelImageGenApi = {
  openai: ["gpt-image-2", "gpt-image-1", "gpt-image-1.5", "gpt-image-1-mini"],
  gemini: [
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",
    "deep-research-max-preview-04-2026",
    "deep-research-preview-04-2026"
  ],
  grok: ["grok-imagine-image-quality", "grok-imagine-image"]
} as const;

export const allImgSupportingProviderModels = {
  openai: modelIdsByProviderImgGen.openai,
  gemini: modelIdsByProviderImgGen.gemini,
  grok: modelIdsByProviderImgGen.grok
} as const;

export const providerModelImageGenFacilitatingApi = {
  openai: [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5-chat-latest",
    "gpt-5.5-pro",
    "gpt-5.4-pro",
    "gpt-5.2-pro",
    "gpt-5-pro",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3"
  ],
  gemini: [
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image",
    "gemini-3-pro-image-preview",
    "deep-research-max-preview-04-2026",
    "deep-research-preview-04-2026"
  ]
} as const;

export const imageModelSets = {
  gemini: new Set(providerModelImageGenApi.gemini),
  grok: new Set(providerModelImageGenApi.grok),
  openai: new Set(providerModelImageGenApi.openai)
} as const;

export const imageModelFacilitatorSets = {
  gemini: new Set(providerModelImageGenFacilitatingApi.gemini),
  openai: new Set(providerModelImageGenFacilitatingApi.openai)
} as const;

export type AllImgGenProviderModels<
  T extends keyof typeof allImgSupportingProviderModels
> = Unenumerate<(typeof allImgSupportingProviderModels)[T]>;

export const imageGenProviders = ["grok", "gemini", "openai"] as const;
export const imageGenFacilitatingProviders = ["gemini", "openai"] as const;
export type ImageGenProviders = keyof typeof providerModelImageGenApi;
export type ImageGenFacilitatingProviders =
  keyof typeof providerModelImageGenFacilitatingApi;

export type ImageGenModelsByProvider<
  T extends keyof typeof providerModelImageGenApi
> = Unenumerate<(typeof providerModelImageGenApi)[T]>;

export type AllImgGenProviderModelMap = {
  readonly [P in keyof typeof allImgSupportingProviderModels]: Unenumerate<
    (typeof allImgSupportingProviderModels)[P]
  >;
};
export type ImageGenFacilitatingModelsByProvider<
  T extends keyof typeof providerModelImageGenFacilitatingApi
> = Unenumerate<(typeof providerModelImageGenFacilitatingApi)[T]>;

export type ImgGenModelMap = {
  readonly [P in keyof typeof providerModelImageGenApi]: Unenumerate<
    (typeof providerModelImageGenApi)[P]
  >;
};

export type ImgGenFacilitatingModelMap = {
  readonly [P in keyof typeof providerModelImageGenFacilitatingApi]: Unenumerate<
    (typeof providerModelImageGenFacilitatingApi)[P]
  >;
};

export type OpenAIImgGenModels = ImgGenModelMap["openai"];

export type OpenAIImgGenFacilitatingModels =
  ImgGenFacilitatingModelMap["openai"];

export type GeminiImgGenFacilitatingModels =
  ImgGenFacilitatingModelMap["gemini"];

export type GeminiImgGenModels = ImgGenModelMap["gemini"];

export type GrokImgGenModels = ImgGenModelMap["grok"];

export type AllImgGenFacilitatingModelsUnion =
  ImgGenFacilitatingModelMap[ImageGenFacilitatingProviders];

export type AllImgGenModelsUnion = ImgGenModelMap[ImageGenProviders];

export type GetImgModelUtilRT<T = ImageGenProviders> = T extends "openai"
  ? OpenAIImgGenModels | OpenAIImgGenFacilitatingModels
  : T extends "gemini"
    ? GeminiImgGenModels
    : T extends "grok"
      ? GrokImgGenModels
      : never;

export type GetImgGenFacilitatingModelUtilRT<
  T = ImageGenFacilitatingProviders
> = T extends "openai"
  ? OpenAIImgGenFacilitatingModels
  : T extends "gemini"
    ? GeminiImgGenFacilitatingModels
    : never;

export type GetAllImgGenModelUtilRt<T = ImageGenProviders> = T extends "grok"
  ? GetImgModelUtilRT<"grok">
  : T extends "gemini"
    ? GetImgModelUtilRT<"gemini">
    : T extends "openai"
      ? GetImgModelUtilRT<"openai">
      : never;

export type VideoGenProviders = keyof typeof modelIdsByProviderVideoGen;

export type VideoGenModelMap = {
  readonly [P in keyof typeof modelIdsByProviderVideoGen]: Unenumerate<
    (typeof modelIdsByProviderVideoGen)[P]
  >;
};

export type OpenAIVideoGenModels = VideoGenModelMap["openai"];

export type GeminiVideoGenModels = VideoGenModelMap["gemini"];

export type GrokVideoGenModels = VideoGenModelMap["grok"];

export type AllVideoGenModels = VideoGenModelMap[VideoGenProviders];

export type GetVideoModelUtilRT<T = VideoGenProviders> = T extends "openai"
  ? OpenAIVideoGenModels
  : T extends "gemini"
    ? GeminiVideoGenModels
    : T extends "grok"
      ? GrokVideoGenModels
      : never;

export const providerModelChatApi = modelIdsByProvider;

export type Provider = keyof typeof modelIdsByProvider;

/**
 * type alias used in apps/web repo
 */
export type Providers = Provider;

export type Models<T extends keyof typeof modelIdsByProvider> = {
  readonly [P in T]: Unenumerate<(typeof modelIdsByProvider)[P]>;
}[T];

export type ModelMap = {
  readonly [P in keyof typeof modelIdsByProvider]: Unenumerate<
    (typeof modelIdsByProvider)[P]
  >;
};

export type DisplayNameModelMap = {
  readonly [P in keyof typeof displayNameModelsByProvider]: Unenumerate<
    (typeof displayNameModelsByProvider)[P]
  >;
};

export type SakanaChatModels = ModelMap["sakana"];

export type DeepSeekChatModels = ModelMap["deepseek"];

export type KimiChatModels = ModelMap["moonshotai"];

export type ZaiChatModels = ModelMap["zai"];

export type CohereChatModels = ModelMap["cohere"];

export type OpenAIChatModels = ModelMap["openai"];

export type GeminiChatModels = ModelMap["gemini"];

export type GrokChatModels = ModelMap["grok"];

export type AnthropicChatModels = ModelMap["anthropic"];

export type VercelChatModels = ModelMap["vercel"];

export type MetaChatModels = ModelMap["meta"];

export type MistralChatModels = ModelMap["mistral"];

export type AlibabaChatModels = ModelMap["alibaba"];
export type MiniMaxChatModels = ModelMap["minimax"];

export type AllModelsUnion = ModelMap[Provider];

export type AllDisplayNamesUnion = DisplayNameModelMap[Provider];

export type GetModelUtilRT<T = Provider> = T extends "openai"
  ? OpenAIChatModels
  : T extends "gemini"
    ? GeminiChatModels
    : T extends "grok"
      ? GrokChatModels
      : T extends "anthropic"
        ? AnthropicChatModels
        : T extends "meta"
          ? MetaChatModels
          : T extends "vercel"
            ? VercelChatModels
            : T extends "mistral"
              ? MistralChatModels
              : T extends "cohere"
                ? CohereChatModels
                : T extends "deepseek"
                  ? DeepSeekChatModels
                  : T extends "moonshotai"
                    ? KimiChatModels
                    : T extends "zai"
                      ? ZaiChatModels
                      : T extends "alibaba"
                        ? AlibabaChatModels
                        : T extends "minimax"
                          ? MiniMaxChatModels
                          : T extends "sakana"
                            ? SakanaChatModels
                            : never;

export function toPrismaFormat<const T extends Providers>(provider: T) {
  return provider.toUpperCase() as Uppercase<T> satisfies $Enums.Provider;
}

/**
 * utility to map model display name to model id
 */
export const getModelIdByDisplayName = <
  const V extends Provider,
  const K extends ModelDisplayNameToModelId<V>
>(
  target: V,
  model?: K
): (typeof displayNameToModelId)[V][K] => {
  const xTarget = target as Provider;
  switch (xTarget) {
    case "gemini": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"gemini">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.gemini as (typeof displayNameToModelId)[V][K];
    }
    case "grok": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"grok">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.grok as (typeof displayNameToModelId)[V][K];
    }
    case "anthropic": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"anthropic">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.anthropic as (typeof displayNameToModelId)[V][K];
    }
    case "meta": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"meta">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.meta as (typeof displayNameToModelId)[V][K];
    }
    case "vercel": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"vercel">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.vercel as (typeof displayNameToModelId)[V][K];
    }
    case "mistral": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"mistral">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.mistral as (typeof displayNameToModelId)[V][K];
    }
    case "cohere": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"cohere">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.cohere as (typeof displayNameToModelId)[V][K];
    }
    case "deepseek": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"deepseek">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.deepseek as (typeof displayNameToModelId)[V][K];
    }
    case "moonshotai": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"moonshotai">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.moonshotai as (typeof displayNameToModelId)[V][K];
    }
    case "zai": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"zai">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.zai as (typeof displayNameToModelId)[V][K];
    }
    case "alibaba": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"alibaba">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.alibaba as (typeof displayNameToModelId)[V][K];
    }
    case "minimax": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"minimax">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.minimax as (typeof displayNameToModelId)[V][K];
    }
    case "sakana": {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"sakana">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.sakana as (typeof displayNameToModelId)[V][K];
    }
    case "openai":
    default: {
      if (model && model in displayNameToModelId[xTarget]) {
        return displayNameToModelId[xTarget][
          model as ModelDisplayNameToModelId<"openai">
        ] as (typeof displayNameToModelId)[V][K];
      } else
        return defaultModelIdByProvider.openai as (typeof displayNameToModelId)[V][K];
    }
  }
};
/**
 * utility to map model id to model display name
 */
export const getDisplayNameByModelId = <
  const V extends Provider,
  const K extends ModelIdToModelDisplayName<V>
>(
  target: V,
  model?: K
): (typeof modelIdToDisplayName)[V][K] => {
  const xTarget = target as Provider;
  switch (xTarget) {
    case "gemini": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"gemini">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.gemini as (typeof modelIdToDisplayName)[V][K];
    }
    case "grok": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"grok">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.grok as (typeof modelIdToDisplayName)[V][K];
    }
    case "anthropic": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"anthropic">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.anthropic as (typeof modelIdToDisplayName)[V][K];
    }
    case "meta": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"meta">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.meta as (typeof modelIdToDisplayName)[V][K];
    }
    case "vercel": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"vercel">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.vercel as (typeof modelIdToDisplayName)[V][K];
    }
    case "mistral": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"mistral">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.mistral as (typeof modelIdToDisplayName)[V][K];
    }
    case "cohere": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"cohere">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.cohere as (typeof modelIdToDisplayName)[V][K];
    }
    case "deepseek": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"deepseek">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.deepseek as (typeof modelIdToDisplayName)[V][K];
    }
    case "moonshotai": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"moonshotai">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.moonshotai as (typeof modelIdToDisplayName)[V][K];
    }
    case "zai": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"zai">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.zai as (typeof modelIdToDisplayName)[V][K];
    }
    case "alibaba": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"alibaba">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.alibaba as (typeof modelIdToDisplayName)[V][K];
    }
    case "minimax": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"minimax">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.minimax as (typeof modelIdToDisplayName)[V][K];
    }
    case "sakana": {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"sakana">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.sakana as (typeof modelIdToDisplayName)[V][K];
    }
    case "openai":
    default: {
      if (model && model in modelIdToDisplayName[xTarget]) {
        return modelIdToDisplayName[xTarget][
          model as ModelIdToModelDisplayName<"openai">
        ] as (typeof modelIdToDisplayName)[V][K];
      } else
        return defaultModelDisplayNameByProvider.openai as (typeof modelIdToDisplayName)[V][K];
    }
  }
};

export const defaultModelDisplayNameByProvider = {
  openai: "GPT-5.5" satisfies OpenAiDisplayNameUnion,
  gemini: "Gemini 3.1 Pro Preview" satisfies GeminiDisplayNameUnion,
  grok: "Grok 4.3" satisfies GrokDisplayNameUnion,
  anthropic: "Claude Sonnet 5" satisfies AnthropicDisplayNameUnion,
  meta: "Llama 3.3 (70B, Instruct)" satisfies MetaDisplayNameUnion,
  vercel: "v0 medium" satisfies VercelDisplayNameUnion,
  mistral: "Mistral Medium 3.5" satisfies MistralDisplayNameUnion,
  cohere: "Command A Plus" satisfies CohereDisplayNameUnion,
  deepseek: "DeepSeek V4 Pro" satisfies DeepSeekDisplayNameUnion,
  moonshotai: "Kimi K2.6" satisfies KimiDisplayNameUnion,
  zai: "GLM 5.1" satisfies ZaiDisplayNameUnion,
  alibaba: "Qwen3.6-Plus" satisfies AlibabaDisplayNameUnion,
  minimax: "MiniMax-M3" satisfies MiniMaxDisplayNameUnion,
  sakana: "Fugu" satisfies SakanaDisplayNameUnion
} as const;

export const defaultModelIdByProvider = {
  openai: "gpt-5.5" satisfies OpenAiModelIdUnion,
  gemini: "gemini-3.1-pro-preview" satisfies GeminiModelIdUnion,
  grok: "grok-4.3" satisfies GrokModelIdUnion,
  anthropic: "claude-sonnet-5" satisfies AnthropicModelIdUnion,
  meta: "Llama-3.3-70B-Instruct" satisfies MetaModelIdUnion,
  vercel: "v0-1.5-md" satisfies VercelModelIdUnion,
  mistral: "mistral-medium-3.5" satisfies MistralModelIdUnion,
  cohere: "command-a-plus-05-2026" satisfies CohereModelIdUnion,
  deepseek: "deepseek-v4-pro" satisfies DeepSeekModelIdUnion,
  moonshotai: "kimi-k2.6" satisfies KimiModelIdUnion,
  zai: "glm-5.1" satisfies ZaiModelIdUnion,
  alibaba: "qwen3.6-plus" satisfies AlibabaModelIdUnion,
  minimax: "minimax-m3" satisfies MiniMaxModelIdUnion,
  sakana: "fugu" satisfies SakanaModelIdUnion
} as const;

export type ModelDisplayNameToModelId<T extends Provider> =
  keyof (typeof displayNameToModelId)[T];

export type ModelIdToModelDisplayName<T extends Provider> =
  keyof (typeof modelIdToDisplayName)[T];

export type ModelDisplayNameToModelIdImgGen<T extends ImageGenProviders> =
  keyof (typeof displayNameToModelIdImgGen)[T];

export type ModelIdToModelDisplayNameImgGen<T extends ImageGenProviders> =
  keyof (typeof modelIdToDisplayNameImgGen)[T];

export type ModelDisplayNameToModelIdVideoGen<T extends VideoGenProviders> =
  keyof (typeof displayNameToModelIdVideoGen)[T];

export type ModelIdToModelDisplayNameVideoGen<T extends VideoGenProviders> =
  keyof (typeof modelIdToDisplayNameVideoGen)[T];

/**
 * valid video gen capable openai model display names
 */
export type OpenAiDisplayNameUnionVideoGen =
  ModelDisplayNameToModelIdVideoGen<"openai">;

/**
 * valid video gen capable gemini model display names
 */
export type GeminiDisplayNameUnionVideoGen =
  ModelDisplayNameToModelIdVideoGen<"gemini">;

/**
 * valid video gen capable grok model display names
 */
export type GrokDisplayNameUnionVideoGen =
  ModelDisplayNameToModelIdVideoGen<"grok">;

/**
 * valid image gen capable openai model display names
 */
export type OpenAiDisplayNameUnionImgGen =
  ModelDisplayNameToModelIdImgGen<"openai">;
/**
 * valid image gen capable gemini model display names
 */
export type GeminiDisplayNameUnionImgGen =
  ModelDisplayNameToModelIdImgGen<"gemini">;
/**
 * valid image gen grok model display names
 */
export type GrokDisplayNameUnionImgGen =
  ModelDisplayNameToModelIdImgGen<"grok">;

/**
 * valid sakana model display names
 */
export type SakanaDisplayNameUnion = ModelDisplayNameToModelId<"sakana">;

/**
 * valid alibaba model display names
 */
export type AlibabaDisplayNameUnion = ModelDisplayNameToModelId<"alibaba">;
/**
 * valid minimax model display names
 */
export type MiniMaxDisplayNameUnion = ModelDisplayNameToModelId<"minimax">;
/**
 * valid deepseek model display names
 */
export type DeepSeekDisplayNameUnion = ModelDisplayNameToModelId<"deepseek">;
/**
 * valid moonshotai model display names
 */
export type KimiDisplayNameUnion = ModelDisplayNameToModelId<"moonshotai">;
/**
 * valid zai model display names
 */
export type ZaiDisplayNameUnion = ModelDisplayNameToModelId<"zai">;
/**
 * valid cohere model display names
 */
export type CohereDisplayNameUnion = ModelDisplayNameToModelId<"cohere">;
/**
 * valid grok model display names
 */
export type GrokDisplayNameUnion = ModelDisplayNameToModelId<"grok">;
/**
 * valid openai model display names
 */
export type OpenAiDisplayNameUnion = ModelDisplayNameToModelId<"openai">;
/**
 * valid gemini model display names
 */
export type GeminiDisplayNameUnion = ModelDisplayNameToModelId<"gemini">;
/**
 * valid anthropic model display names
 */
export type AnthropicDisplayNameUnion = ModelDisplayNameToModelId<"anthropic">;
/**
 * valid meta model display names
 */
export type MetaDisplayNameUnion = ModelDisplayNameToModelId<"meta">;
/**
 * valid v0 model display names
 */
export type VercelDisplayNameUnion = ModelDisplayNameToModelId<"vercel">;

/**
 * valid mistral model display names
 */
export type MistralDisplayNameUnion = ModelDisplayNameToModelId<"mistral">;

/**
 * valid grok img models to call
 */
export type GrokModelIdUnionImgGen = ModelIdToModelDisplayNameImgGen<"grok">;
/**
 * valid openai img models to call
 */
export type OpenAiModelIdUnionImgGen =
  ModelIdToModelDisplayNameImgGen<"openai">;
/**
 * valid gemini img models to call
 */
export type GeminiModelIdUnionImgGen =
  ModelIdToModelDisplayNameImgGen<"gemini">;
/**
 * valid openai video models to call
 */
export type OpenAiModelIdUnionVideoGen =
  ModelIdToModelDisplayNameVideoGen<"openai">;
/**
 * valid gemini video models to call
 */
export type GeminiModelIdUnionVideoGen =
  ModelIdToModelDisplayNameVideoGen<"gemini">;
/**
 * valid grok video models to call
 */
export type GrokModelIdUnionVideoGen =
  ModelIdToModelDisplayNameVideoGen<"grok">;

/**
 * valid sakana models to call
 */
export type SakanaModelIdUnion = ModelIdToModelDisplayName<"sakana">;
/**
 * valid alibaba models to call
 */
export type AlibabaModelIdUnion = ModelIdToModelDisplayName<"alibaba">;
/**
 * valid minimax models to call
 */
export type MiniMaxModelIdUnion = ModelIdToModelDisplayName<"minimax">;
/**
 * valid deepseek models to call
 */
export type DeepSeekModelIdUnion = ModelIdToModelDisplayName<"deepseek">;
/**
 * valid kimi models to call
 */
export type KimiModelIdUnion = ModelIdToModelDisplayName<"moonshotai">;
/**
 * valid zai models to call
 */
export type ZaiModelIdUnion = ModelIdToModelDisplayName<"zai">;
/**
 * valid cohere models to call
 */
export type CohereModelIdUnion = ModelIdToModelDisplayName<"cohere">;
/**
 * valid grok models to call
 */
export type GrokModelIdUnion = ModelIdToModelDisplayName<"grok">;
/**
 * valid openai models to call
 */
export type OpenAiModelIdUnion = ModelIdToModelDisplayName<"openai">;
/**
 * valid gemini models to call
 */
export type GeminiModelIdUnion = ModelIdToModelDisplayName<"gemini">;
/**
 * valid anthropic models to call
 */
export type AnthropicModelIdUnion = ModelIdToModelDisplayName<"anthropic">;
/**
 * valid meta models to call
 */
export type MetaModelIdUnion = ModelIdToModelDisplayName<"meta">;
/**
 * valid v0 models to call
 */
export type VercelModelIdUnion = ModelIdToModelDisplayName<"vercel">;
/**
 * valid mistral models to call
 */
export type MistralModelIdUnion = ModelIdToModelDisplayName<"mistral">;

// re-export for consumer apps
export {
  modelIdToDisplayName,
  displayNameToModelId,
  displayNameModelsByProvider,
  modelIdsByProvider,
  modelIdToDisplayNameImgGen,
  modelIdsByProviderImgGen,
  displayNameModelsByProviderImgGen,
  displayNameToModelIdImgGen,
  displayNameModelsByProviderVideoGen,
  displayNameToModelIdVideoGen,
  modelIdToDisplayNameVideoGen,
  modelIdsByProviderVideoGen
};

export type GetModelsForProviderRTImgGen<T extends Provider> =
  T extends "gemini"
    ? GeminiModelIdUnionImgGen
    : T extends "grok"
      ? GrokModelIdUnionImgGen
      : T extends "openai"
        ? OpenAiModelIdUnionImgGen
        : T extends "anthropic"
          ? undefined
          : T extends "meta"
            ? undefined
            : T extends "vercel"
              ? undefined
              : T extends "mistral"
                ? undefined
                : T extends "cohere"
                  ? undefined
                  : T extends "deepseek"
                    ? undefined
                    : T extends "moonshotai"
                      ? undefined
                      : T extends "zai"
                        ? undefined
                        : T extends "alibaba"
                          ? undefined
                          : T extends "minimax"
                            ? undefined
                            : T extends "sakana"
                              ? undefined
                              : never;

export type GetModelsForProviderRTVideoGen<T extends Provider> =
  T extends "gemini"
    ? GeminiModelIdUnionVideoGen
    : T extends "grok"
      ? GrokModelIdUnionVideoGen
      : T extends "openai"
        ? OpenAiModelIdUnionVideoGen
        : T extends "anthropic"
          ? undefined
          : T extends "meta"
            ? undefined
            : T extends "vercel"
              ? undefined
              : T extends "mistral"
                ? undefined
                : T extends "cohere"
                  ? undefined
                  : T extends "deepseek"
                    ? undefined
                    : T extends "moonshotai"
                      ? undefined
                      : T extends "zai"
                        ? undefined
                        : T extends "alibaba"
                          ? undefined
                          : T extends "minimax"
                            ? undefined
                            : T extends "sakana"
                              ? undefined
                              : never;

export type GetDisplayNamesForProviderRTImgGen<T extends Provider> =
  T extends "gemini"
    ? GeminiDisplayNameUnionImgGen
    : T extends "grok"
      ? GrokDisplayNameUnionImgGen
      : T extends "openai"
        ? OpenAiDisplayNameUnionImgGen
        : T extends "anthropic"
          ? undefined
          : T extends "meta"
            ? undefined
            : T extends "vercel"
              ? undefined
              : T extends "mistral"
                ? undefined
                : T extends "cohere"
                  ? undefined
                  : T extends "deepseek"
                    ? undefined
                    : T extends "moonshotai"
                      ? undefined
                      : T extends "zai"
                        ? undefined
                        : T extends "alibaba"
                          ? undefined
                          : T extends "minimax"
                            ? undefined
                            : T extends "sakana"
                              ? undefined
                              : never;

export type GetModelsForProviderRT<T extends Provider> = T extends "anthropic"
  ? AnthropicModelIdUnion
  : T extends "gemini"
    ? GeminiModelIdUnion
    : T extends "grok"
      ? GrokModelIdUnion
      : T extends "openai"
        ? OpenAiModelIdUnion
        : T extends "vercel"
          ? VercelModelIdUnion
          : T extends "meta"
            ? MetaModelIdUnion
            : T extends "mistral"
              ? MistralModelIdUnion
              : T extends "cohere"
                ? CohereModelIdUnion
                : T extends "deepseek"
                  ? DeepSeekModelIdUnion
                  : T extends "moonshotai"
                    ? KimiModelIdUnion
                    : T extends "zai"
                      ? ZaiModelIdUnion
                      : T extends "alibaba"
                        ? AlibabaModelIdUnion
                        : T extends "minimax"
                          ? MiniMaxModelIdUnion
                          : T extends "sakana"
                            ? SakanaModelIdUnion
                            : never;

export type GetDisplayNamesForProviderRTVideoGen<T extends Provider> =
  T extends "gemini"
    ? GeminiDisplayNameUnionVideoGen
    : T extends "grok"
      ? GrokDisplayNameUnionVideoGen
      : T extends "openai"
        ? OpenAiDisplayNameUnionVideoGen
        : T extends "anthropic"
          ? undefined
          : T extends "meta"
            ? undefined
            : T extends "vercel"
              ? undefined
              : T extends "mistral"
                ? undefined
                : T extends "cohere"
                  ? undefined
                  : T extends "deepseek"
                    ? undefined
                    : T extends "moonshotai"
                      ? undefined
                      : T extends "zai"
                        ? undefined
                        : T extends "alibaba"
                          ? undefined
                          : T extends "minimax"
                            ? undefined
                            : T extends "sakana"
                              ? undefined
                              : never;

export type GetDisplayNamesForProviderRT<T extends Provider> =
  T extends "anthropic"
    ? AnthropicDisplayNameUnion
    : T extends "gemini"
      ? GeminiDisplayNameUnion
      : T extends "grok"
        ? GrokDisplayNameUnion
        : T extends "openai"
          ? OpenAiDisplayNameUnion
          : T extends "vercel"
            ? VercelDisplayNameUnion
            : T extends "meta"
              ? MetaDisplayNameUnion
              : T extends "mistral"
                ? MistralDisplayNameUnion
                : T extends "cohere"
                  ? CohereDisplayNameUnion
                  : T extends "deepseek"
                    ? DeepSeekDisplayNameUnion
                    : T extends "moonshotai"
                      ? KimiDisplayNameUnion
                      : T extends "zai"
                        ? ZaiDisplayNameUnion
                        : T extends "alibaba"
                          ? AlibabaDisplayNameUnion
                          : T extends "minimax"
                            ? MiniMaxDisplayNameUnion
                            : T extends "sakana"
                              ? SakanaDisplayNameUnion
                              : never;

export function getModelsForProvider<const T extends Provider>(provider: T) {
  return Object.entries(displayNameToModelId[provider])
    .map(([t, v]) => {
      return [t as T, v as GetModelsForProviderRT<T>] as const;
    })
    .map(([_tt, vv]) => vv);
}

export function getModelsForProviderImgGen<const T extends Provider>(
  provider: T
) {
  if (!(provider === "gemini" || provider === "openai" || provider === "grok"))
    return undefined;
  const p = provider satisfies ImageGenProviders;
  return Object.entries(displayNameToModelIdImgGen[p])
    .map(([t, v]) => {
      return [t as T, v as GetModelsForProviderRTImgGen<T>] as const;
    })
    .map(([_tt, vv]) => vv);
}

export function getModelsForProviderVideoGen<const T extends Provider>(
  provider: T
) {
  if (!(provider === "gemini" || provider === "openai" || provider === "grok"))
    return undefined;
  const p = provider satisfies VideoGenProviders;
  return Object.entries(displayNameToModelIdVideoGen[p])
    .map(([t, v]) => {
      return [t as T, v as GetModelsForProviderRTVideoGen<T>] as const;
    })
    .map(([_tt, vv]) => vv);
}

export function getDisplayNamesForProvider<const T extends Provider>(
  provider: T
) {
  return Object.entries(modelIdToDisplayName[provider])
    .map(([k, v]) => {
      return [k as T, v as GetDisplayNamesForProviderRT<T>] as const;
    })
    .map(([_kk, vv]) => vv);
}

export function getDisplayNamesForProviderImgGen<
  const V extends Provider = Provider
>(provider: V) {
  if (!(provider === "gemini" || provider === "openai" || provider === "grok"))
    return undefined;
  const p = provider as ImageGenProviders;
  return Object.entries(modelIdToDisplayNameImgGen[p])
    .map(([k, v]) => {
      return [k as V, v as GetDisplayNamesForProviderRTImgGen<V>] as const;
    })
    .map(([_kk, vv]) => vv);
}

export function getDisplayNamesForProviderVideoGen<
  const V extends Provider = Provider
>(provider: V) {
  if (!(provider === "gemini" || provider === "openai" || provider === "grok"))
    return undefined;
  const p = provider as VideoGenProviders;
  return Object.entries(modelIdToDisplayNameVideoGen[p])
    .map(([k, v]) => {
      return [k as V, v as GetDisplayNamesForProviderRTVideoGen<V>] as const;
    })
    .map(([_kk, vv]) => vv);
}

export function allProviders() {
  return Object.keys(modelIdsByProvider).map(
    t => t
  ) satisfies readonly Lowercase<$Enums.Provider>[];
}
export function allImgGenProviders() {
  return ["gemini", "grok", "openai"] as const;
}

export function allVideoGenProviders() {
  return ["gemini", "grok", "openai"] as const;
}
export function getAllProviders() {
  return allProviders();
}

export function getAllImgGenProviders() {
  return allImgGenProviders();
}

export function getAllVideoGenProviders() {
  return allVideoGenProviders();
}

export const imgMimeSupportByProvider = {
  meta: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/x-icon"],
  grok: ["image/jpeg", "image/png", "image/webp"],
  openai: ["image/jpeg", "image/png", "image/webp"],
  vercel: ["image/jpeg", "image/png", "image/webp", "image/svg", "image/gif"],
  /**
   * https://ai.google.dev/gemini-api/docs/image-understanding#supported-formats
   */
  gemini: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
  anthropic: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  mistral: ["image/jpeg", "image/png", "image/webp"],
  cohere: ["image/jpeg", "image/png", "image/webp"],
  moonshotai: ["image/jpeg", "image/png", "image/webp"],
  deepseek: ["image/jpeg", "image/png", "image/webp"],
  zai: ["image/jpeg", "image/png", "image/webp"],
  alibaba: ["image/jpeg", "image/png", "image/webp"],
  minimax: ["image/jpeg", "image/png", "image/webp"],
  sakana: ["image/jpeg", "image/png", "image/webp"]
} as const;

// direct input -- I have a document conversion pipeline set up
// that handles office docs -> pdf as a background post-processing task
// to be handed off to models on the backend, for example
export const docMimeSupportByProvider = {
  meta: ["application/pdf"],
  grok: ["application/pdf", "text/markdown", "text/plain"],
  openai: ["application/pdf"],
  vercel: ["application/pdf"],
  mistral: ["application/pdf"],
  cohere: ["application/pdf"],
  moonshotai: ["application/pdf"],
  deepseek: ["application/pdf"],
  zai: ["application/pdf"],
  alibaba: ["application/pdf"],
  minimax: ["application/pdf"],
  sakana: ["application/pdf"],
  /**
   * https://ai.google.dev/gemini-api/docs/document-processing#technical-details
   */
  gemini: ["application/pdf"],
  anthropic: ["application/pdf", "text/plain", "text/rtf", "text/csv"]
} as const;

export const audioMimeSupportByProvider = {
  meta: [],
  grok: [],
  openai: [],
  vercel: [],
  mistral: [],
  cohere: [],
  moonshotai: [],
  deepseek: [],
  zai: [],
  alibaba: [],
  minimax: [],
  sakana: [],
  /**
   * https://ai.google.dev/gemini-api/docs/audio#supported-formats
   */
  gemini: [
    "audio/wav",
    "audio/mp3",
    "audio/aiff",
    "audio/aac",
    "audio/ogg",
    "audio/flac"
  ],
  anthropic: []
} as const;

export const videoMimeSupportByProvider = {
  meta: [],
  grok: [],
  mistral: [],
  cohere: [],
  openai: ["video/mp4"],
  vercel: ["video/mp4", "video/mov", "video/avi", "video/webm"],
  /**
   * https://ai.google.dev/gemini-api/docs/video-understanding
   */
  gemini: [
    "video/mp4",
    "video/mpeg",
    "video/mov",
    "video/avi",
    "video/x-flv",
    "video/mpg",
    "video/webm",
    "video/wmv",
    "video/3gpp"
  ],
  moonshotai: ["video/mpeg", "video/mp4"],
  deepseek: [],
  zai: [],
  anthropic: [],
  alibaba: [],
  minimax: [],
  sakana: []
} as const;
