// src/lib/ui-message-helpers.ts
import type { MessageSingleton } from "@slipstream/types";

/**
 * Creates a properly typed MessageSingleton for user messages
 */
export function createUserMessage(params: MessageSingleton<true>): MessageSingleton<true> {
  return {
    id: params.id,
    userId: params.userId,
    provider: params.provider,
    createdAt: params.createdAt instanceof Date ? params.createdAt : new Date(params.createdAt),
    updatedAt: params.updatedAt instanceof Date ? params.updatedAt : new Date(params.updatedAt),
    userKeyId: params.userKeyId ?? null,
    conversationId: params.conversationId,
    model: params.model,
    senderType: "USER" as const,
    content: params.content,
    thinkingText: params.thinkingText ?? null,
    thinkingDuration: params.thinkingDuration ?? null,
    liked: params.liked ?? null,
    disliked: params.disliked ?? null,
    tryAgain: params.tryAgain ?? null,
    imageGenJob: params.imageGenJob ?? null,
    attachments: params.attachments ?? []
  };
}

/**
 * Creates a properly typed MessageSingleton for AI messages
 */
export function createAIMessage(params: MessageSingleton<true>): MessageSingleton<true> {
  return {
    id: params.id,
    userId: params.userId,
    provider: params.provider,
    createdAt: params.createdAt instanceof Date ? params.createdAt : new Date(params.createdAt),
    updatedAt: params.updatedAt instanceof Date ? params.updatedAt : new Date(params.updatedAt),
    userKeyId: params.userKeyId ?? null,
    conversationId: params.conversationId,
    model: params.model,
    senderType: "AI" as const,
    content: params.content,
    thinkingText: params.thinkingText ?? null,
    thinkingDuration: params.thinkingDuration ?? null,
    liked: params.liked ?? null,
    disliked: params.disliked ?? null,
    tryAgain: params.tryAgain ?? null,
    imageGenJob: params.imageGenJob ?? null,
    attachments: params.attachments ?? []
  };
}

/**
 * Converts a streaming message to a final message
 */
export function finalizeStreamingMessage(
  streamingMessage: MessageSingleton<true>,
  finalContent: string,
  additionalData?: {
    thinkingText?: string;
    thinkingDuration?: number;
  }
): MessageSingleton<true> {
  return {
    ...streamingMessage,
    id: streamingMessage.id.replace("streaming-", ""),
    content: finalContent,
    thinkingText: additionalData?.thinkingText ?? streamingMessage.thinkingText,
    thinkingDuration: additionalData?.thinkingDuration ?? streamingMessage.thinkingDuration,
    updatedAt: new Date()
  };
}