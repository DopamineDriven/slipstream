export { ProviderValidation } from "@/provider-validation/index.ts";
export type {
  GeminiModelAspectRatio,
  GeminiModelAspectRatioWorkup,
  OpenAIModelAspectRatio,
  OpenAIModelAspectRatioWorkup,
  OutputSizeProps
} from "@/provider-validation/index.ts";

declare global {
  interface JSON {
    parse<T = unknown>(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): T;
  }
  interface Body {
    json<T = unknown>(): Promise<T>;
  }
}
