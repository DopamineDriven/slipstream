export type ChatMessage = {
  type: "message";
  userId: string;
  conversationId: string;
  content: string;
  timestamp: number;
  attachments?: string[];
};

export type TypingIndicator = {
  type: "typing";
  userId: string;
  conversationId: string;
};

export type PingMessage = {
  type: "ping";
}

export type AnyEvent = ChatMessage | TypingIndicator | PingMessage;
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
  message: ChatMessage;
  typing: TypingIndicator;
  ping: PingMessage;
}

export type EventMap<T extends keyof EventTypeMap> = {
  [P in T]: EventTypeMap[P];
}[T];


