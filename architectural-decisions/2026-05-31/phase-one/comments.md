Why aren't we just using the same field names that the `ai_chat_chunk` event's payload?

```ts
export interface AIChatResEntity<T extends `ai_chat_${AIChatEventTypeUnion}`> {
  type: T;
  conversationId: string;
  userMsgId: string;
  userId: string;
  chunk?: string;
  done: T extends "ai_chat_error" ? true : boolean;
  data?: string;
  provider?: Provider;
  title?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  aiMsgId?: string;
  messageBlocks?: T extends "ai_chat_response"
    ? ChatChunkAndResMsgBlock[]
    : ChatChunkAndResMsgBlock;
  imgGenAttachmentId?: string;
  imgGenEnabled?: boolean;
  imgGenFields?: AIChatResponseImgGenFieldsFinal;
}

export type AIChatChunk = DX<
  AIChatResEntity<"ai_chat_chunk"> & {
    isThinking?: boolean;
    thinkingDuration?: number;
    thinkingText?: string;
  }
>;
```
vs 

```ts
export interface ChatDraft {
  readonly conversationId: string;
  readonly text: string;
  /**
   * Wire blocks (a subset of `MessageBlock`) accumulated from `ai_chat_chunk` — each chunk delivers ONE block.
   * Merge/replace and sort by `ordinal`; the server's ordinal is authoritative, never re-derived. On
   * `ai_chat_response` the draft is dropped and committed blocks come from `convo.messages[0].messageBlocks`
   * (the response's own event-level `messageBlocks` array is unused — the single `convo` message wins).
   */
  readonly blocks: readonly ChatChunkAndResMsgBlock[];
  readonly thinkingText: string;
  readonly isThinking: boolean;
  readonly thinkingDuration: number | null;
  readonly provider: Provider;
  readonly model: string;
  readonly imgGenEnabled: boolean;
  readonly imgGenFields: AIChatResponseImgGenFieldsFinal | null;
  readonly userMsgId: string | null;
  readonly aiMsgId: string | null;
  readonly imgGenAttachmentId: string | null;
}
```
This would just be 

```ts
type ChatDraft = Readonly<Rm<AIChatChunk, "type">>
```

then there's minimal contract drift? and honestly keeping the type would be harmless. Also why are we using null instead of undefined like the actual contract is...?
