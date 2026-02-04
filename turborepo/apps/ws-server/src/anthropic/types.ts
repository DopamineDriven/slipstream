import type { ProviderChatRequestEntity } from "@/types/index.ts";
import Anthropic from "@anthropic-ai/sdk";
import { Stream } from "@anthropic-ai/sdk/core/streaming.mjs";
import type { MessageSingleton } from "@slipstream/types";
import type { searchLocalDocChunksByStore } from "@slipstream/db/sql-node";

export interface AnthropicFileRecord {
  id: string;
  size_bytes: number;
  created_at: string;
  filename: string;
  mime_type: string;
  lastAccessedAt?: Date;
  dbRecordId?: string;
}

export interface ProviderAnthropicChatRequestEntity extends ProviderChatRequestEntity {
  user_location?: {
    type: "approximate";
    city?: string | null | undefined;
    country?: string | null | undefined;
    region?: string | null | undefined;
    timezone?: string | null | undefined;
  };
}

export interface PdfBudgetEntry {
  attachmentId: string;
  pageCount: number;
  filename: string;
  url: string;
  turnIndex: number;
  included: boolean;
}

export type RequestOptions = Parameters<
  InstanceType<typeof Anthropic>["messages"]["create"]
>["1"];

export type MessageInputParams = {
  isNewChat: boolean;
  msgs: MessageSingleton<true>[];
  userId: string;
  apiKey: string | undefined;
  keyId: string | null;
  max_tokens: number | undefined;
  model: string | undefined;
  systemPrompt: string | undefined;
  temperature: number | undefined;
  topP: number | undefined;
  user_location:
    | {
        type: "approximate";
        city?: string | null | undefined;
        country?: string | null | undefined;
        region?: string | null | undefined;
        timezone?: string | null | undefined;
      }
    | undefined;
};

export type CreateMessageStreamRT =
  Stream<Anthropic.Beta.BetaRawMessageStreamEvent> & {
    _request_id?: string | null;
  };

/** Direct alias of the typed SQL search result — includes joined doc fields + computed score */
export type LocalSearchResult = searchLocalDocChunksByStore.Result;


export interface FileSearchToolInput {
  query: string;
  max_results?: number;
}

export interface ToolUseAccumulator {
  id: string;
  name: string;
  inputJson: string;
}
