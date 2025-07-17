import type { Unenumerate } from "@/utils.ts";
import { displayNameToModelId } from "@/codegen/__gen__/display-name-to-model-id.ts";
import { displayNameModelsByProvider } from "@/codegen/__gen__/display-names-by-provider.ts";
import { modelIdToDisplayName } from "@/codegen/__gen__/model-id-to-display-name.ts";
import { modelIdsByProvider } from "@/codegen/__gen__/model-ids-by-provider.ts";

export const providerModelChatApi = {
  openai: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.5-preview",
    "o4-mini",
    "o1",
    "o3",
    "o1-mini",
    "o3-mini",
    "gpt-4o",
    "gpt-4o-audio-preview",
    "gpt-4o-mini",
    "gpt-4o-search-preview",
    "gpt-4o-mini-search-preview",
    "gpt-4o-mini-audio-preview",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k"
  ],
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-flash-preview-native-audio-dialog",
    "gemini-2.5-flash-exp-native-audio-thinking-dialog",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
    "gemini-2.0-flash",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-embedding-exp",
    "imagen-4.0-generate-preview-06-06",
    "imagen-4.0-ultra-generate-preview-06-06",
    "imagen-3.0-generate-002",
    "veo-2.0-generate-001",
    "gemini-live-2.5-flash-preview",
    "gemini-2.0-flash-live-001"
  ],
  grok: [
    "grok-3",
    "grok-2-1212",
    "grok-2-vision-1212",
    "grok-3-fast",
    "grok-3-mini",
    "grok-3-mini-fast",
    "grok-4-0709",
    "grok-2-image-1212"
  ],
  /**
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-names
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-aliases
   */
  anthropic: [
    "claude-opus-4-20250514",
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-20240620",
    "claude-3-haiku-20240307"
  ]
} as const;

export const providerModelResponsesApi = {
  openai: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.5-preview",
    "o1-pro",
    "o1",
    "o3",
    "o3-mini",
    "o3-deep-research",
    "o3-pro",
    "o4-mini",
    "o4-mini-deep-research",
    "o4-mini-deep-research-2025-06-26",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k"
  ],
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-flash-preview-native-audio-dialog",
    "gemini-2.5-flash-exp-native-audio-thinking-dialog",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
    "gemini-2.0-flash",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-embedding-exp",
    "imagen-4.0-generate-preview-06-06",
    "imagen-4.0-ultra-generate-preview-06-06",
    "imagen-3.0-generate-002",
    "veo-2.0-generate-001",
    "gemini-live-2.5-flash-preview",
    "gemini-2.0-flash-live-001"
  ],
  grok: [
    "grok-3",
    "grok-2-1212",
    "grok-2-vision-1212",
    "grok-3-fast",
    "grok-3-mini",
    "grok-3-mini-fast",
    "grok-4-0709",
    "grok-2-image-1212"
  ],
  /**
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-names
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-aliases
   */
  anthropic: [
    "claude-opus-4-20250514",
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-20240620",
    "claude-3-haiku-20240307"
  ]
} as const;

export type Provider = keyof typeof providerModelChatApi;

/**
 * type alias used in apps/web repo
 */
export type Providers = Provider;

export type Models<T extends keyof typeof providerModelChatApi> = {
  readonly [P in T]: Unenumerate<(typeof providerModelChatApi)[P]>;
}[T];

export type ModelMap = {
  readonly [P in keyof typeof providerModelChatApi]: Unenumerate<
    (typeof providerModelChatApi)[P]
  >;
};

export type DisplayNameModelMap = {
  readonly [P in keyof typeof displayNameModelsByProvider]: Unenumerate<
    (typeof displayNameModelsByProvider)[P]
  >;
};

export type OpenAIChatModels = ModelMap["openai"];

export type GeminiChatModels = ModelMap["gemini"];

export type GrokChatModels = ModelMap["grok"];

export type AnthropicChatModels = ModelMap["anthropic"];

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
        : never;

export function toPrismaFormat<const T extends Providers>(provider: T) {
  return provider.toUpperCase() as Uppercase<T>;
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
  openai: "GPT 4o Mini" satisfies OpenAiDisplayNameUnion,
  gemini: "Gemini 2.5 Flash" satisfies GeminiDisplayNameUnion,
  grok: "Grok 2" satisfies GrokDisplayNameUnion,
  anthropic: "Claude Haiku 3" satisfies AnthropicDisplayNameUnion
} as const;

export const defaultModelIdByProvider = {
  openai: "gpt-4o-mini" satisfies OpenAiModelIdUnion,
  gemini: "gemini-2.5-flash" satisfies GeminiModelIdUnion,
  grok: "grok-2-1212" satisfies GrokModelIdUnion,
  anthropic: "claude-3-haiku-20240307" satisfies AnthropicModelIdUnion
} as const;

export type ModelDisplayNameToModelId<T extends Provider> =
  keyof (typeof displayNameToModelId)[T];

export type ModelIdToModelDisplayName<T extends Provider> =
  keyof (typeof modelIdToDisplayName)[T];

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

// re-export for consumer apps
export {
  modelIdToDisplayName,
  displayNameToModelId,
  displayNameModelsByProvider,
  modelIdsByProvider
};

export type GetModelsForProviderRT<T extends Provider> = T extends "anthropic"
  ? AnthropicModelIdUnion
  : T extends "gemini"
    ? GeminiModelIdUnion
    : T extends "grok"
      ? GrokModelIdUnion
      : T extends "openai"
        ? OpenAiModelIdUnion
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
          : never;

export function getModelsForProvider<const T extends Provider>(provider: T) {
  return Object.entries(displayNameToModelId[provider])
    .map(([t, v]) => {
      return [t as T, v as GetModelsForProviderRT<T>] as const;
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

export function allProviders() {
  return ["anthropic", "gemini", "grok", "openai"] as const;
}

export function getAllProviders() {
  return allProviders();
}
