export { KeyValidator } from "@/http/index.ts";
export type {
  AnthropicError,
  AnthropicModel,
  AnthropicResponse,
  AnthropicSuccess,
  FlexiProvider,
  GeminiError,
  GeminiModel,
  GeminiResponse,
  GeminiSuccess,
  GrokModelsResponse,
  GrokSuccess,
  ListModelsSingleton,
  OpenAiError,
  OpenAiResponse,
  SuccessResponse,
  V0User,
  Without,
  XOR
} from "@/types/index.ts";
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
