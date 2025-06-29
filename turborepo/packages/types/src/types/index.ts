
export type Unenumerate<T> = T extends (infer U)[] | readonly (infer U)[]
  ? U
  : T;

export const providerModelObj = {
  openai: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.5-preview",
    "o4-mini",
    "o1",
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
    "gpt-3.5-turbo"
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

export type Provider = keyof typeof providerModelObj;
export type Models = {
  readonly [P in keyof typeof providerModelObj]: Unenumerate<
    (typeof providerModelObj)[P]
  >;
};

/**
 * inversely proportional to internal `Exclude<T, U>` utility type
 *
 * ```ts
 * type Include<T, U> = T extends U ? U : never;
 *  // ↕ inversely proportional utility types ↕
 * type Exclude<T, U> = T extends U ? never : T;
 * ```
 */
export type Include<T, U> = T extends U ? U : never;

export type AllModelsUnion = Models[Provider];

export type GetModelUtilRT<T = Provider> = T extends "openai"
  ? Unenumerate<(typeof providerModelObj)["openai"]>
  : T extends "gemini"
    ? Unenumerate<(typeof providerModelObj)["gemini"]>
    : Unenumerate<(typeof providerModelObj)["grok"]>;

// : "gpt-4o-mini" | "gemini-2.5-flash" | "grok-3" | (typeof model extends undefined ? GetModelUtilRT<typeof target> : typeof model)
export const getModelUtil = <const V extends Provider>(
  target: V,
  model?: GetModelUtilRT<typeof target>
) => {
  let xTarget = target as keyof typeof providerModelObj;
  switch (xTarget) {
    case xTarget as "gemini": {
      if (
        model &&
        providerModelObj[xTarget].includes(model as Models[typeof xTarget])
      ) {
        return model as Models[typeof xTarget];
      } else return "gemini-2.5-flash" as const;
    }
    case xTarget as "grok": {
      if (
        model &&
        providerModelObj[xTarget].includes(model as Models[typeof xTarget])
      ) {
        return model as Models[typeof xTarget];
      } else return "grok-3" as const;
    }
    default: {
      xTarget;
      if (
        model &&
        providerModelObj[xTarget].includes(model as Models[typeof xTarget])
      ) {
        return model as Models[typeof xTarget];
      } else return "gpt-4o-mini" as const;
    }
  }
};

export type ModelProvider = "openai" | "gemini";

export type GeminiModels = "gemini-2.5-flash" | "gemini-2.5-pro";

export type OpenAIModels =
  | "gpt-4o-2024-11-20"
  | "gpt-4.1"
  | "gpt-o3-pro"
  | "gpt-4.1-nano"
  | "gpt-4.5-preview"
  | "gpt-4o-mini";

export type SelectedProvider<T extends ModelProvider | undefined> =
  T extends "openai" ? OpenAIModels : GeminiModels;

export type ChatMessage = {
  type: "message";
  userId: string;
  conversationId: string;
  content: string;
  timestamp: number;
  attachments?: string[];
};

export type AIChatRequest = {
  type: "ai_chat_request";
  conversationId: string;
  prompt: string;
  apiKey?: string;
  provider?: ModelProvider;
  model?: SelectedProvider<ModelProvider>;
};

export type AIChatResponse = {
  type: "ai_chat_response";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
  provider?: ModelProvider;
  model?: string;
};

export type AIChatInlineData = {
  type: "ai_chat_inline_data";
  conversationId: string;
  userId: string;
  data: string;
  provider?: ModelProvider;
  model?: string;
};

export type AIChatChunk = {
  type: "ai_chat_chunk";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
  provider?: ModelProvider;
  model?: string;
};

export type AIChatError = {
  type: "ai_chat_error";
  conversationId: string;
  userId: string;
  message: string;
  done: true;
  provider?: ModelProvider;
  model?: string;
};

export type TypingIndicator = {
  type: "typing";
  userId: string;
  conversationId: string;
};

export type PingMessage = {
  type: "ping";
};

export type ImageGenRequest = {
  type: "image_gen_request";
  userId: string;
  conversationId: string;
  prompt: string;
  seed?: number;
};

export type ImageGenResponse = {
  type: "image_gen_response";
  userId: string;
  conversationId: string;
  imageUrl?: string;
  success: boolean;
  error?: string;
};

export type AssetUploadRequest = {
  type: "asset_upload_request";
  userId: string;
  conversationId: string;
  filename: string;
  contentType: string;
  base64: string;
};

export type AssetUploadResponse = {
  type: "asset_upload_response";
  userId: string;
  conversationId: string;
  url?: string;
  success: boolean;
  error?: string;
};

export type AnyEvent =
  | AssetUploadRequest
  | AssetUploadResponse
  | AIChatChunk
  | AIChatError
  | AIChatInlineData
  | AIChatRequest
  | AIChatResponse
  | ChatMessage
  | TypingIndicator
  | PingMessage
  | ImageGenRequest
  | ImageGenResponse;

export type AnyEventTypeUnion = AnyEvent["type"];

/**
 * helper workup for use in XOR type below
 * makes properties from U optional and undefined in T, and vice versa
 */
export type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

/**
 * enforces mutual exclusivity of T | U
 */
// prettier-ignore
export type XOR<T, U> =
  [T, U] extends [object, object]
    ? (Without<T, U> & U) | (Without<U, T> & T)
    : T | U

export type EventUnion = XOR<ChatMessage, TypingIndicator>;

export type EventTypeMap = {
  ai_chat_chunk: AIChatChunk;
  ai_chat_error: AIChatError;
  ai_chat_inline_data: AIChatInlineData;
  ai_chat_request: AIChatRequest;
  ai_chat_response: AIChatResponse;
  asset_upload_request: AssetUploadRequest;
  asset_upload_response: AssetUploadResponse;
  message: ChatMessage;
  typing: TypingIndicator;
  ping: PingMessage;
  image_gen_request: ImageGenRequest;
  image_gen_response: ImageGenResponse;
};

export type EventMap<T extends keyof EventTypeMap> = {
  [P in T]: EventTypeMap[P];
}[T];

export interface WSServerOptions {
  port: number;
  redisUrl: string;
  jwtSecret: string;
  channel?: string;
}

export interface UserData {
  city?: string;
  country?: string;
  latlng?: string;
  tz?: string;
}


export type BufferLike =
  | string
  | Buffer
  | DataView
  | number
  | ArrayBufferView
  | Uint8Array
  | ArrayBuffer
  | SharedArrayBuffer
  | Blob
  | readonly any[]
  | readonly number[]
  | { valueOf(): ArrayBuffer }
  | { valueOf(): SharedArrayBuffer }
  | { valueOf(): Uint8Array }
  | { valueOf(): readonly number[] }
  | { valueOf(): string }
  | { [Symbol.toPrimitive](hint: string): string };
