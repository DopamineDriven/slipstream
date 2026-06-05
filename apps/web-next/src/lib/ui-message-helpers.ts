// src/lib/ui-message-helpers.ts
import type {
  ChatChunkAndResMsgBlock,
  MessageBlockSingleton,
  MessageSingleton
} from "@slipstream/types";

export function toMessageBlocks(
  messageId: string,
  blocks?: ChatChunkAndResMsgBlock[] | MessageBlockSingleton<true>[] | null
) {
  if (!blocks || blocks.length === 0) {
    return undefined;
  }

  const now = new Date();

  return blocks.map(block => {
    if ("messageId" in block) {
      return {
        ...block,
        messageId
      } satisfies MessageBlockSingleton<true>;
    }

    return {
      id: `${messageId}-block-${block.ordinal}`,
      conversationId: block.conversationId,
      messageId,
      ordinal: block.ordinal,
      content: block.content,
      type: block.type,
      durationMs: block.durationMs,
      createdAt: now,
      updatedAt: now
    } satisfies MessageBlockSingleton<true>;
  });
}

/**
 * Creates a properly typed MessageSingleton for user messages
 */
export function createUserMessage(
  params: MessageSingleton<true>
): MessageSingleton<true> {
  return {
    id: params.id,
    ordinal: params.ordinal,
    userId: params.userId,
    responseOutput: null,
    provider: params.provider,
    isImageGen: params.isImageGen,
    createdAt:
      params.createdAt instanceof Date
        ? params.createdAt
        : new Date(params.createdAt),
    updatedAt:
      params.updatedAt instanceof Date
        ? params.updatedAt
        : new Date(params.updatedAt),
    userKeyId: params.userKeyId ?? null,
    conversationMemoryChunkId: null,
    conversationId: params.conversationId,
    model: params.model,
    messageType: params.messageType,
    senderType: "USER" as const,
    content: params.content,
    thinkingText: params.thinkingText ?? null,
    thinkingDuration: params.thinkingDuration ?? null,
    liked: params.liked ?? null,
    disliked: params.disliked ?? null,
    tryAgain: params.tryAgain ?? null,
    imageGenJob: params.imageGenJob ?? null,
    attachments: params.attachments ?? [],
    messageBlocks: params.messageBlocks
  };
}

/**
 * Creates a properly typed MessageSingleton for AI messages
 */
export function createAIMessage(
  params: MessageSingleton<true>
): MessageSingleton<true> {
  return {
    id: params.id,
    ordinal: params.ordinal,
    userId: params.userId,
    provider: params.provider,
    createdAt:
      params.createdAt instanceof Date
        ? params.createdAt
        : new Date(params.createdAt),
    updatedAt:
      params.updatedAt instanceof Date
        ? params.updatedAt
        : new Date(params.updatedAt),
    userKeyId: params.userKeyId ?? null,
    conversationId: params.conversationId,
    responseOutput: params.responseOutput,
    isImageGen: params.isImageGen,
    model: params.model,
    conversationMemoryChunkId: null,
    senderType: "AI" as const,
    content: params.content,
    thinkingText: params.thinkingText ?? null,
    thinkingDuration: params.thinkingDuration ?? null,
    liked: params.liked ?? null,
    disliked: params.disliked ?? null,
    tryAgain: params.tryAgain ?? null,
    messageType: params.messageType,
    imageGenJob: params.imageGenJob ?? null,
    attachments: params.attachments ?? [],
    messageBlocks: params.messageBlocks
  };
}
