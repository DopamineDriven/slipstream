### TODO

```ts
import type { GetModelUtilRT, Provider } from "@/models.ts";

export type AIChatRequestDocumentInput = {
  id: string;
  type: "pdf" | "image" | "docx" | "xlsx" | "txt";
  url: string;
  metadata?: {
    pageCount?: number;
    extractedText?: string;
    ocrConfidence?: number;
    size?: number;
  };
};

export type AIChatRequestUserMetadata = {
  city?: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  tz?: string;
  postalCode?: string;
};
export type AIChatRequest = {
  type: "ai_chat_request";
  conversationId: string;
  prompt: string;
  provider: Provider;
  model?: GetModelUtilRT<Provider>;
  systemPrompt?: string;
  thinking?: boolean; // just added this, should it be tracked in convesation settings?
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  hasProviderConfigured?: boolean;
  isDefaultProvider?: boolean;
  documentInputs?: AIChatRequestDocumentInput[];
  userMetadata?: AIChatRequestUserMetadata;
};

export type AIChatSubTypeUnion = "text" | "citation" | "thinking";

export type AIChatChunk = {
  type: "ai_chat_chunk";
  conversationId: string;
  userId: string;
  chunk: string;
  done: boolean;
  provider?: Provider;
  title?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  sub_type: AIChatSubTypeUnion;
};

export type AIChatResponse = {
  type: "ai_chat_response";
  conversationId: string;
  userId: string;
  chunk: string;
  thinkingText?: string;
  citationsText?: string;
  done: boolean;
  provider?: Provider;
  title?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
};

export type AIChatInlineData = {
  type: "ai_chat_inline_data";
  conversationId: string;
  userId: string;
  data: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
};

export type AIChatError = {
  type: "ai_chat_error";
  conversationId: string;
  userId: string;
  message: string;
  done: true;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
};
```
