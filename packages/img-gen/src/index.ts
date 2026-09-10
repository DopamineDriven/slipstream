export { ProviderValidation } from "@/provider-validation/index.ts";
export type {
  AllImgGenCapableModelUnion,
  AllNonImgGenCapableUnion,
  AllPureImgGenModelsUnion,
  BackgroundFormattingOpts,
  GrokQualityUnion,
  ModelToAspectRatioOpts,
  ModelToBackgroundFormatOpts,
  ModelToOutputFormatOpts,
  ModelToOutputFormatOptsProps,
  ModelToQuality as ModelToQualityOpts,
  ModelToQualityOptsProps
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
