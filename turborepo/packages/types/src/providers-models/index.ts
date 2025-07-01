export type Unenumerate<T> = T extends (infer U)[] | readonly (infer U)[]
  ? U
  : T;
export type StripHyphen<T extends string> = T extends `${infer X}-${infer Y}`
  ? `${X}_${StripHyphen<Y>}`
  : T;

export const openAiChatModelsObj = {
  "gpt_4.1": "gpt-4.1",
  "gpt_4.1_mini": "gpt-4.1-mini",
  "gpt_4.1_nano": "gpt-4.1-nano",
  "gpt_4.5_preview": "gpt-4.5-preview",
  o4_mini: "o4-mini",
  o1: "o1",
  o3: "o3",
  o1_mini: "o1-mini",
  o3_mini: "o3-mini",
  gpt_4o: "gpt-4o",
  gpt_4o_audio_preview: "gpt-4o-audio-preview",
  gpt_4o_mini: "gpt-4o-mini",
  gpt_4o_search_preview: "gpt-4o-search-preview",
  gpt_4o_mini_search_preview: "gpt-4o-mini-search-preview",
  gpt_4o_mini_audio_preview: "gpt-4o-mini-audio-preview",
  gpt_4: "gpt-4",
  gpt_4_turbo: "gpt-4-turbo",
  "gpt_3.5_turbo": "gpt-3.5-turbo",
  "gpt_3.5_turbo_16k": "gpt-3.5-turbo-16k"
} as const;

export const providerModelChatApi = {
  openai: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.5-preview",
    "o4-mini",
    "o1",
    "o3",
    "o1-mini",
    "o3-mini",
    "gpt-4o",
    "gpt-4o-audio-preview",
    "gpt-4o-mini",
    "gpt-4o-search-preview",
    "gpt-4o-mini-search-preview",
    "gpt-4o-mini-audio-preview",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k"
  ],
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.5",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-flash-preview-native-audio-dialog",
    "gemini-2.5-flash-exp-native-audio-thinking-dialog",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
    "gemini-2.0-flash",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-embedding-exp",
    "imagen-4.0-generate-preview-06-06",
    "imagen-4.0-ultra-generate-preview-06-06",
    "imagen-3.0-generate-002",
    "veo-2.0-generate-001",
    "gemini-live-2.5-flash-preview",
    "gemini-2.0-flash-live-001"
  ],
  grok: ["grok-3", "grok-3.1", "grok-3.2"]
} as const;

export const providerModelResponsesApi = {
  openai: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.5-preview",
    "o1-pro",
    "o1",
    "o3",
    "o3-mini",
    "o3-deep-research",
    "o3-pro",
    "o4-mini",
    "o4-mini-deep-research",
    "o4-mini-deep-research-2025-06-26",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k"
  ],
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.5",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-flash-preview-native-audio-dialog",
    "gemini-2.5-flash-exp-native-audio-thinking-dialog",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
    "gemini-2.0-flash",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-embedding-exp",
    "imagen-4.0-generate-preview-06-06",
    "imagen-4.0-ultra-generate-preview-06-06",
    "imagen-3.0-generate-002",
    "veo-2.0-generate-001",
    "gemini-live-2.5-flash-preview",
    "gemini-2.0-flash-live-001"
  ],
  grok: ["grok-3", "grok-3.1", "grok-3.2"]
} as const;

export type Provider = keyof typeof providerModelChatApi;
export type Models = {
  readonly [P in keyof typeof providerModelChatApi]: Unenumerate<
    (typeof providerModelChatApi)[P]
  >;
};
export type OpenAiChatModels = Models["openai"];

export type GeminiChatModels = Models["gemini"];

export type GrokChatModels = Models["grok"];
export type OpenAiCompletionModels = Unenumerate<typeof providerModelResponsesApi["openai"]>;
export type AllModelsUnion = Models[Provider];

export type GetModelUtilRT<T = Provider> = T extends "openai"
  ? Unenumerate<(typeof providerModelChatApi)["openai"]>
  : T extends "gemini"
    ? Unenumerate<(typeof providerModelChatApi)["gemini"]>
    : Unenumerate<(typeof providerModelChatApi)["grok"]>;

// : "gpt-4o-mini" | "gemini-2.5-flash" | "grok-3" | (typeof model extends undefined ? GetModelUtilRT<typeof target> : typeof model)
export const getModelUtil = <const V extends Provider>(
  target: V,
  model?: GetModelUtilRT<typeof target>
) => {
  let xTarget = target as keyof typeof providerModelChatApi;
  switch (xTarget) {
    case xTarget as "gemini": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(model as Models[typeof xTarget])
      ) {
        return model as Models[typeof xTarget];
      } else return "gemini-2.5-flash" as const;
    }
    case xTarget as "grok": {
      if (
        model &&
        providerModelChatApi[xTarget].includes(model as Models[typeof xTarget])
      ) {
        return model as Models[typeof xTarget];
      } else return "grok-3" as const;
    }
    default: {
      xTarget;
      if (
        model &&
        providerModelChatApi[xTarget].includes(model as Models[typeof xTarget])
      ) {
        return model as Models[typeof xTarget];
      } else return "gpt-4o-mini" as const;
    }
  }
};
