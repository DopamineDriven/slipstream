/**
 * the union satisfies both the Prisma ORM expected enum (all uppercase) and the
 * client/server used (all lowercase) provider names
 */
export type FlexiProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "grok"
  | "OPENAI"
  | "ANTHROPIC"
  | "GEMINI"
  | "GROK";

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

export interface ListModelsSingleton {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export type SuccessResponse = {
  object: "list";
  data: ListModelsSingleton[];
};

export type GrokModelsResponse = SuccessResponse;

export type OpenAiError = {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string;
  };
};

export type GrokSuccess = {
  redacted_api_key: string;
  user_id: string;
  name: string;
  create_time: string;
  modify_time: string;
  modified_by: string;
  team_id: string;
  acls: string[];
  api_key_id: string;
  team_blocked: boolean;
  api_key_blocked: boolean;
  api_key_disabled: boolean;
};

export type AnthropicError = {
  type: "error";
  error: {
    type: string;
    message: string;
  };
};



export interface AnthropicModel {
  created_at: string;
  display_name: string;
  id: string;
  type: "model";
}

export type AnthropicSuccess = {
  data: AnthropicModel[];
  first_id: string | null;
  last_id: string | null;
  has_more: boolean;
}

export interface GeminiModel {
  name: string;
  version: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature?: number;
  topP?: number;
  topK?: number;
}

export type GeminiSuccess = {
  models: GeminiModel[];
  nextPageToken: string;
};

export type GeminiError = {
  error: {
    code: number;
    message: string;
    status: string;
  };
};

export type AnthropicResponse = XOR<AnthropicError, AnthropicSuccess>;

export type OpenAiResponse = XOR<OpenAiError, SuccessResponse>;

export type GeminiResponse = XOR<GeminiError, GeminiSuccess>;
