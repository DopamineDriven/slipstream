import type { GetModelUtilRT, Provider } from "@/types/index.ts";
import { providerModelChatApi } from "@/types/index.ts";

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
        } else return "grok-3" as const as NonNullable<K>;
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
  public providerToPrismaFormat<const T extends Provider>(provider: T) {
    return provider.toUpperCase() as  Uppercase<T>;
  }
}
