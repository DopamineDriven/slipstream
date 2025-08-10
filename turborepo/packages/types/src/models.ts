import type { Unenumerate } from "@/utils.ts";
import { displayNameToModelId } from "@/codegen/__gen__/display-name-to-model-id.ts";
import { displayNameModelsByProvider } from "@/codegen/__gen__/display-names-by-provider.ts";
import { modelIdToDisplayName } from "@/codegen/__gen__/model-id-to-display-name.ts";
import { modelIdsByProvider } from "@/codegen/__gen__/model-ids-by-provider.ts";

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
  openai: "GPT 5 Nano" satisfies OpenAiDisplayNameUnion,
  gemini: "Gemini 2.5 Flash" satisfies GeminiDisplayNameUnion,
  grok: "Grok 4" satisfies GrokDisplayNameUnion,
  anthropic: "Claude Sonnet 4" satisfies AnthropicDisplayNameUnion
} as const;

export const defaultModelIdByProvider = {
  openai: "gpt-5-nano" satisfies OpenAiModelIdUnion,
  gemini: "gemini-2.5-flash" satisfies GeminiModelIdUnion,
  grok: "grok-4-0709" satisfies GrokModelIdUnion,
  anthropic: "claude-sonnet-4-20250514" satisfies AnthropicModelIdUnion
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
