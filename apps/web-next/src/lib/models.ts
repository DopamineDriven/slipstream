import type {
  AllModelsUnion,
  AnthropicDisplayNameUnion,
  AnthropicModelIdUnion,
  CohereDisplayNameUnion,
  CohereModelIdUnion,
  DeepSeekDisplayNameUnion,
  DeepSeekModelIdUnion,
  GeminiDisplayNameUnion,
  GeminiModelIdUnion,
  GrokDisplayNameUnion,
  GrokModelIdUnion,
  KimiDisplayNameUnion,
  KimiModelIdUnion,
  MetaDisplayNameUnion,
  MetaModelIdUnion,
  MistralDisplayNameUnion,
  MistralModelIdUnion,
  OpenAiDisplayNameUnion,
  OpenAiModelIdUnion,
  VercelDisplayNameUnion,
  VercelModelIdUnion,
  ZaiDisplayNameUnion,
  ZaiModelIdUnion
} from "@slipstream/types";
import {
  defaultModelDisplayNameByProvider,
  defaultModelIdByProvider,
  displayNameToModelId,
  getDisplayNameByModelId,
  getModelIdByDisplayName
} from "@slipstream/types";
import {
  ClaudeIcon,
  CohereIconCurrentColor as CohereIcon,
  DeepSeek,
  GeminiIcon,
  Kimi,
  MetaIcon,
  MistralIcon,
  OpenAiIcon,
  VercelIcon as v0Icon,
  XAiIcon,
  Zai
} from "@slipstream/ui";

export type Provider = keyof typeof displayNameToModelId;

export const providerMetadata = {
  openai: {
    name: "OpenAI",
    icon: OpenAiIcon,
    color: "#10a37f",
    description: "Advanced language models from OpenAI"
  },
  gemini: {
    name: "Google Gemini",
    icon: GeminiIcon,
    color: "#4285f4",
    description: "Google's multimodal AI models"
  },
  grok: {
    name: "xAI Grok",
    icon: XAiIcon,
    color: "#000000",
    description: "xAI's conversational AI models"
  },
  anthropic: {
    name: "Anthropic Claude",
    icon: ClaudeIcon,
    color: "#d97706",
    description: "Anthropic's helpful, harmless, and honest AI"
  },
  meta: {
    name: "Meta Llama",
    icon: MetaIcon,
    description: "Industry Leading, Open-Source AI",
    color: "#0081FB"
  },
  mistral: {
    name: "Mistral AI",
    icon: MistralIcon,
    description: "Open and Portable Generative AI",
    color: "#FF7000"
  },
  cohere: {
    name: "Cohere",
    icon: CohereIcon,
    color: "#FF7759",
    description: "Enterprise AI Built for Retrieval and Reasoning"
  },
  vercel: {
    name: "Vercel v0",
    icon: v0Icon,
    color: "#000000",
    description: "The AI Powered App Builder."
  },
  deepseek: {
    name: "DeepSeek",
    icon: DeepSeek,
    color: "#4D6BFE",
    description: "Open-Weight Reasoning and Coding Models"
  },
  moonshotai: {
    name: "Moonshot AI",
    icon: Kimi,
    color: "#4645F5",
    description: "Agentic AI for Deep Tool Use"
  },
  zai: {
    name: "Z.ai",
    icon: Zai,
    color: "#3B5CFF",
    description: "Open-Source GLM Models for Coding and Agents"
  }
} as const;

export type DisplayNameWorkup<T extends Provider> = T extends "openai"
  ? ReturnType<typeof getDisplayNameByModelId<T, OpenAiModelIdUnion>>
  : T extends "anthropic"
    ? ReturnType<typeof getDisplayNameByModelId<T, AnthropicModelIdUnion>>
    : T extends "grok"
      ? ReturnType<typeof getDisplayNameByModelId<T, GrokModelIdUnion>>
      : T extends "gemini"
        ? ReturnType<typeof getDisplayNameByModelId<T, GeminiModelIdUnion>>
        : T extends "meta"
          ? ReturnType<typeof getDisplayNameByModelId<T, MetaModelIdUnion>>
          : T extends "vercel"
            ? ReturnType<typeof getDisplayNameByModelId<T, VercelModelIdUnion>>
            : T extends "mistral"
              ? ReturnType<
                  typeof getDisplayNameByModelId<T, MistralModelIdUnion>
                >
              : T extends "cohere"
                ? ReturnType<
                    typeof getDisplayNameByModelId<T, CohereModelIdUnion>
                  >
                : T extends "deepseek"
                  ? ReturnType<
                      typeof getDisplayNameByModelId<T, DeepSeekModelIdUnion>
                    >
                  : T extends "moonshotai"
                    ? ReturnType<
                        typeof getDisplayNameByModelId<T, KimiModelIdUnion>
                      >
                    : T extends "zai"
                      ? ReturnType<
                          typeof getDisplayNameByModelId<T, ZaiModelIdUnion>
                        >
                      : never;

export type ModelIdWorkup<T extends Provider> = T extends "openai"
  ? ReturnType<typeof getModelIdByDisplayName<T, OpenAiDisplayNameUnion>>
  : T extends "anthropic"
    ? ReturnType<typeof getModelIdByDisplayName<T, AnthropicDisplayNameUnion>>
    : T extends "grok"
      ? ReturnType<typeof getModelIdByDisplayName<T, GrokDisplayNameUnion>>
      : T extends "gemini"
        ? ReturnType<typeof getModelIdByDisplayName<T, GeminiDisplayNameUnion>>
        : T extends "meta"
          ? ReturnType<typeof getModelIdByDisplayName<T, MetaDisplayNameUnion>>
          : T extends "vercel"
            ? ReturnType<
                typeof getModelIdByDisplayName<T, VercelDisplayNameUnion>
              >
            : T extends "mistral"
              ? ReturnType<
                  typeof getModelIdByDisplayName<T, MistralDisplayNameUnion>
                >
              : T extends "cohere"
                ? ReturnType<
                    typeof getModelIdByDisplayName<T, CohereDisplayNameUnion>
                  >
                : T extends "deepseek"
                  ? ReturnType<
                      typeof getModelIdByDisplayName<
                        T,
                        DeepSeekDisplayNameUnion
                      >
                    >
                  : T extends "moonshotai"
                    ? ReturnType<
                        typeof getModelIdByDisplayName<T, KimiDisplayNameUnion>
                      >
                    : T extends "zai"
                      ? ReturnType<
                          typeof getModelIdByDisplayName<T, ZaiDisplayNameUnion>
                        >
                      : never;
/**
 * use this in client components where the select options are
 * the display names (the keys of the object) which, on select, outputs the
 * respective model id (the value for the model expected by the ws-server for ai_chat_request arguments)
 */
export type ModelSelection = {
  provider: Provider;
  displayName: string;
  modelId: string;
};

export type ModelSelectionAlt<T extends Provider> = {
  provider: T;
  displayName: DisplayNameWorkup<T>;
  modelId: ModelIdWorkup<T>;
};

export const defaultModelByProvider = defaultModelDisplayNameByProvider;

export { defaultModelIdByProvider };

export let defaultProvider: Provider;
export const defaultModelSelection: ModelSelection = {
  provider: (defaultProvider = "anthropic"),
  displayName: defaultModelByProvider[defaultProvider],
  modelId:
    defaultProvider === "anthropic"
      ? getModelIdByDisplayName(
          (defaultProvider = "anthropic"),
          defaultModelByProvider[defaultProvider]
        )
      : defaultProvider === "gemini"
        ? getModelIdByDisplayName(
            (defaultProvider = "gemini"),
            defaultModelByProvider[defaultProvider]
          )
        : defaultProvider === "grok"
          ? getModelIdByDisplayName(
              (defaultProvider = "grok"),
              defaultModelByProvider[defaultProvider]
            )
          : defaultProvider === "meta"
            ? getModelIdByDisplayName(
                (defaultProvider = "meta"),
                defaultModelByProvider[defaultProvider]
              )
            : defaultProvider === "vercel"
              ? getModelIdByDisplayName(
                  (defaultProvider = "vercel"),
                  defaultModelByProvider[defaultProvider]
                )
              : defaultProvider === "mistral"
                ? getModelIdByDisplayName(
                    (defaultProvider = "mistral"),
                    defaultModelByProvider[defaultProvider]
                  )
                : defaultProvider === "cohere"
                  ? getModelIdByDisplayName(
                      (defaultProvider = "cohere"),
                      defaultModelByProvider[defaultProvider]
                    )
                  : defaultProvider === "deepseek"
                    ? getModelIdByDisplayName(
                        (defaultProvider = "deepseek"),
                        defaultModelByProvider[defaultProvider]
                      )
                    : defaultProvider === "moonshotai"
                      ? getModelIdByDisplayName(
                          (defaultProvider = "moonshotai"),
                          defaultModelByProvider[defaultProvider]
                        )
                      : defaultProvider === "zai"
                        ? getModelIdByDisplayName(
                            (defaultProvider = "zai"),
                            defaultModelByProvider[defaultProvider]
                          )
                        : getModelIdByDisplayName(
                            (defaultProvider = "openai"),
                            defaultModelByProvider[defaultProvider]
                          )
};
export function getModelDisplayName(
  toProvider: Provider,
  modelId: string | null
) {
  const model = (modelId ??
    defaultModelIdByProvider[toProvider]) as AllModelsUnion;

  return toProvider === "anthropic"
    ? getDisplayNameByModelId(toProvider, model as AnthropicModelIdUnion)
    : toProvider === "gemini"
      ? getDisplayNameByModelId(toProvider, model as GeminiModelIdUnion)
      : toProvider === "grok"
        ? getDisplayNameByModelId(toProvider, model as GrokModelIdUnion)
        : toProvider === "meta"
          ? getDisplayNameByModelId(toProvider, model as MetaModelIdUnion)
          : toProvider === "vercel"
            ? getDisplayNameByModelId(toProvider, model as VercelModelIdUnion)
            : toProvider === "mistral"
              ? getDisplayNameByModelId(
                  toProvider,
                  model as MistralModelIdUnion
                )
              : toProvider === "cohere"
                ? getDisplayNameByModelId(
                    toProvider,
                    model as CohereModelIdUnion
                  )
                : toProvider === "deepseek"
                  ? getDisplayNameByModelId(
                      toProvider,
                      model as DeepSeekModelIdUnion
                    )
                  : toProvider === "zai"
                    ? getDisplayNameByModelId(
                        toProvider,
                        model as ZaiModelIdUnion
                      )
                    : toProvider === "moonshotai"
                      ? getDisplayNameByModelId(
                          toProvider,
                          model as KimiModelIdUnion
                        )
                      : toProvider === "openai"
                        ? getDisplayNameByModelId(
                            toProvider,
                            model as OpenAiModelIdUnion
                          )
                        : getDisplayNameByModelId(
                            "openai",
                            model as OpenAiModelIdUnion
                          );
}
export function isGeminiDisplayName(n: string) {
  return (
    n === "Gemini 3.1 Flash Lite Preview" ||
    n === "Gemini 3.1 Pro Preview" ||
    n === "Gemini 3.1 Pro Preview Custom Tools" ||
    n === "Gemini 3 Flash Preview" ||
    n === "Gemini 2.5 Pro" ||
    n === "Nano Banana Pro" ||
    n === "Nano Banana" ||
    n === "Nano Banana 2" ||
    n === "Gemini 2.5 Flash" ||
    n === "Gemini 2.5 Flash-Lite" ||
    n === "Deep Research Pro Preview (Dec-12-2025)" ||
    n === "Gemini 2.0 Flash" ||
    n === "Gemini 2.0 Flash-Lite" ||
    n === "Imagen 4" ||
    n === "Imagen 4 Fast" ||
    n === "Imagen 4 Ultra" ||
    n === "Veo 3.1" ||
    n === "Veo 3.1 fast" ||
    n === "Veo 3" ||
    n === "Veo 3 fast" ||
    n === "Veo 2"
  );
}

export function isCohereDisplayName(n: string) {
  return n === "Command A" || n === "Command A Reasoning";
}
