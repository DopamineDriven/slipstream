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
      } else return "gemini-2.5-flash" as const as NonNullable<K>;
    }
    case "grok": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(model as GetModelUtilRT<"grok">)
      ) {
        return model;
      } else return "grok-4-0709" as const as NonNullable<K>;
    }
    case "anthropic": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"anthropic">
        )
      ) {
        return model;
      } else return "claude-sonnet-4-20250514" as const as NonNullable<K>;
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
      } else return "v0-1.0-md" as const as NonNullable<K>;
    }
    default: {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"openai">
        )
      ) {
        return model;
      } else return "gpt-4.1-nano" as const as NonNullable<K>;
    }
  }
};
