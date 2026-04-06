import type { GetModelUtilRT, Provider, Providers } from "@slipstream/types";
import { providerModelChatApi } from "@slipstream/types";

export const getModel = <
  const V extends Providers,
  const K extends GetModelUtilRT<V>
>(
  target: V,
  model?: K
): NonNullable<K> => {
  const xTarget = target as Provider;
  switch (xTarget) {
    case "gemini": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"gemini">
        )
      ) {
        return model;
      } else return "gemini-3.1-pro-preview" as const as NonNullable<K>;
    }
    case "grok": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(model as GetModelUtilRT<"grok">)
      ) {
        return model;
      } else return "grok-4.20-0309-reasoning" as const as NonNullable<K>;
    }
    case "anthropic": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"anthropic">
        )
      ) {
        return model;
      } else return "claude-opus-4-6" as const as NonNullable<K>;
    }
    case "meta": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(model as GetModelUtilRT<"meta">)
      ) {
        return model;
      } else return "Llama-3.3-70B-Instruct" as const as NonNullable<K>;
    }
    case "vercel": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"vercel">
        )
      ) {
        return model;
      } else return "v0-1.5-md" as const as NonNullable<K>;
    }
    case "mistral": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"mistral">
        )
      ) {
        return model;
      } else return "mistral-small-latest" as const as NonNullable<K>;
    }
    case "cohere": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"cohere">
        )
      ) {
        return model;
      } else return "command-a-reasoning-08-2025" as const as NonNullable<K>;
    }
    case "deepseek": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"deepseek">
        )
      ) {
        return model;
      } else return "deepseek-r1" as const as NonNullable<K>;
    }
    case "moonshotai": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"moonshotai">
        )
      ) {
        return model;
      } else return "kimi-k2.5" as const as NonNullable<K>;
    }
    case "zai": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(model as GetModelUtilRT<"zai">)
      ) {
        return model;
      } else return "glm-5" as const as NonNullable<K>;
    }
    case "openai":
    default: {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"openai">
        )
      ) {
        return model;
      } else return "gpt-5.4" as const as NonNullable<K>;
    }
  }
};
