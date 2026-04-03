import { XOR } from "@/utils.ts";

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
};

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

export type MultimodalRT = XOR<
  XOR<
    | {
        openai: string[];
        gemini: string[];
        grok: string[];
      }
    | {
        openai: {
          [k: string]: string;
        };
        gemini: {
          [k: string]: string;
        };
        grok: {
          [k: string]: string;
        };
      },
    | {
        openai: string[];
        gemini: string[];
      }
    | {
        openai: {
          [k: string]: string;
        };
        gemini: {
          [k: string]: string;
        };
      }
  >,
  | {
      openai: string[];
      gemini: string[];
      grok: string[];
      anthropic: string[];
      meta: string[];
      vercel: string[];
    }
  | {
      openai: {
        [k: string]: string;
      };
      gemini: {
        [k: string]: string;
      };
      grok: {
        [k: string]: string;
      };
      anthropic: {
        [k: string]: string;
      };
      meta: {
        [k: string]: string;
      };
      vercel: {
        [k: string]: string;
      };
    }
>;
