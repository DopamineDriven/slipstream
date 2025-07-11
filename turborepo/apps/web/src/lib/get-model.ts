import type { GetModelUtilRT, Provider, Providers } from "@t3-chat-clone/types";
import { providerModelChatApi } from "@t3-chat-clone/types";

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
      } else return "grok-3" as const as NonNullable<K>;
    }
    case "anthropic": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"anthropic">
        )
      ) {
        return model;
      } else return "claude-3-haiku-20240307" as const as NonNullable<K>;
    }
    default: {
      if (
        model &&
        providerModelChatApi[xTarget].includes(
          model as GetModelUtilRT<"openai">
        )
      ) {
        return model;
      } else return "gpt-4o-mini" as const as NonNullable<K>;
    }
  }
};
