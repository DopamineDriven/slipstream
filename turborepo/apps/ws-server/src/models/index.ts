import type { GetModelUtilRT, Provider } from "@t3-chat-clone/types";
import { providerModelChatApi } from "@t3-chat-clone/types";

export class ModelService {
  constructor() {}

  public getModel = <
    const V extends Provider,
    const K extends GetModelUtilRT<V>
  >(
    target: V,
    model?: K
  ): NonNullable<K> => {
    let xTarget = target as Provider;
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
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"grok">
          )
        ) {
          return model;
        } else return "grok-4" as const as NonNullable<K>;
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
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"meta">
          )
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
      case "openai":
      default: {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"openai">
          )
        ) {
          return model;
        } else return "gpt-5-nano" as const as NonNullable<K>;
      }
    }
  };
  public providerToPrismaFormat<const T extends Provider>(provider: T) {
    return provider.toUpperCase() as Uppercase<T>;
  }
}
