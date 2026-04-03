import type { EventTypeMap } from "@slipstream/types";

/**
 * Extended event map that includes the existing EventTypeMap plus additional pub/sub events
 * for features like conversation management and stream resumption
 * All events follow the same pattern with a 'type' field
 */
export interface ExtendedEventMap extends EventTypeMap {
  "conversation:created": {
    type: "conversation:created";
    conversationId: string;
    userId: string;
    title: string;
    timestamp: number;
  };
  "conversation:title_updated": {
    type: "conversation:title_updated";
    conversationId: string;
    userId: string;
    title: string;
    timestamp: number;
  };
  "conversation:deleted": {
    type: "conversation:deleted";
    conversationId: string;
    userId: string;
    timestamp: number;
  };
  "stream:resumed": {
    type: "stream:resumed";
    conversationId: string;
    resumedAt: number;
    chunks: string[];
    title?: string;
    model?: string;
    provider?: string;
  };
  "user:settings_updated": {
    type: "user:settings_updated";
    userId: string;
    changes: Record<string, any>;
    timestamp: number;
  };
  "user:api_key_updated": {
    type: "user:api_key_updated";
    userId: string;
    provider: string;
    action: "added" | "removed" | "updated";
    timestamp: number;
  };
}
export type AllEvents = { [P in keyof ExtendedEventMap]: ExtendedEventMap[P] };
export type AllEventTypes = AllEvents[keyof AllEvents]["type"];
export type EventByType<T extends AllEventTypes> = Extract<
  AllEvents[keyof AllEvents],
  { type: T }
>;

export type StreamStateProps = {
  thinkingChunks?: string[];
  chunks: string[];
  metadata: {
    model?: string;
    provider?: string;
    title?: string;
    totalChunks: number;
    completed: boolean;
    systemPrompt?: string;
    temperature?: number;
    topP?: number;
  };
};
