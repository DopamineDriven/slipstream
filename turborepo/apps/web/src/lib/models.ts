import {
  AnthropicIcon,
  GeminiIcon,
  MetaIcon,
  OpenAiIcon,
  v0Icon,
  XAiIcon
} from "@/ui/icons";
import type {
  AllModelsUnion,
  AnthropicDisplayNameUnion,
  AnthropicModelIdUnion,
  GeminiDisplayNameUnion,
  GeminiModelIdUnion,
  GrokDisplayNameUnion,
  GrokModelIdUnion,
  MetaDisplayNameUnion,
  MetaModelIdUnion,
  OpenAiDisplayNameUnion,
  OpenAiModelIdUnion,
  VercelDisplayNameUnion,
  VercelModelIdUnion
} from "@t3-chat-clone/types";
import {
  defaultModelDisplayNameByProvider,
  defaultModelIdByProvider,
  displayNameToModelId,
  getDisplayNameByModelId,
  getModelIdByDisplayName
} from "@t3-chat-clone/types";

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
    icon: AnthropicIcon,
    color: "#d97706",
    description: "Anthropic's helpful, harmless, and honest AI"
  },
  meta: {
    name: "Meta Llama",
    icon: MetaIcon,
    description: "Industry Leading, Open-Source AI",
    color: "#0081FB"
  },
  vercel: {
    name: "Vercel v0",
    icon: v0Icon,
    color: "#000000",
    description: "The AI Powered App Builder."
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

export let defaultProvider:
  | "openai"
  | "gemini"
  | "grok"
  | "anthropic"
  | "meta"
  | "vercel";
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
            : getDisplayNameByModelId(toProvider, model as OpenAiModelIdUnion);
}
