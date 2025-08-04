// src/lib/ui-message-helpers.ts
import type { UIMessage } from "@/types/shared";
import type { Provider } from "@t3-chat-clone/types";
import { toPrismaFormat } from "@t3-chat-clone/types";

/**
 * Creates a properly typed UIMessage for user messages
 */
export function createUserMessage(params: {
  id: string;
  content: string;
  userId: string;
  provider: Provider;
  model: string;
  conversationId: string;
  liked?: boolean;
  disliked?: boolean;
  tryAgain?: boolean;
  thinkingDuration?: number;
  thinkingText?: string;
}): UIMessage {
  return {
    thinkingText: params.thinkingText ?? null,
    thinkingDuration: params.thinkingDuration ?? null,
    liked: params?.liked ?? false,
    disliked: params?.disliked ?? false,
    tryAgain: params.tryAgain ?? false,
    id: params.id,
    senderType: "USER",
    provider: toPrismaFormat(params.provider),
    model: params.model,
    content: params.content,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: params.userId,
    userKeyId: null,
    conversationId: params.conversationId
  };
}

/**
 * Creates a properly typed UIMessage for AI messages
 */
export function createAIMessage(params: {
  id: string;
  content: string;
  userId: string;
  provider: Provider;
  model: string;
  conversationId: string;
  createdAt?: Date;
  liked?: boolean;
  disliked?: boolean;
  tryAgain?: boolean;
  thinkingText?: string;
  thinkingDuration?: number;
}): UIMessage {
  return {
    liked: params?.liked ?? false,
    disliked: params?.disliked ?? false,
    tryAgain: params.tryAgain ?? false,
    id: params.id,
    senderType: "AI",
    provider: toPrismaFormat(params.provider),
    model: params.model,
    content: params.content,
    createdAt: params.createdAt ?? new Date(),
    updatedAt: new Date(),
    userId: params.userId,
    userKeyId: null,
    conversationId: params.conversationId,
    thinkingText: params.thinkingText ?? null,
    thinkingDuration: params.thinkingDuration ?? null
  };
}

/**
 * Updates a streaming message to a final message
 */
export function finalizeStreamingMessage(
  streamingMsg: UIMessage,
  finalContent: string,
  thinkingData?: {
    thinkingText?: string;
    thinkingDuration?: number;
  }
): UIMessage {
  return {
    ...streamingMsg,
    id: `msg-${Date.now()}`,
    content: finalContent,
    updatedAt: new Date(),
    thinkingText:
      thinkingData?.thinkingText ?? streamingMsg.thinkingText ?? null,
    thinkingDuration:
      thinkingData?.thinkingDuration ?? streamingMsg.thinkingDuration ?? null
  };
}

/**
 * Type guard to check if a message is a streaming message
 */
export function isStreamingMessage(message: UIMessage): boolean {
  return message.id.startsWith("streaming-");
}
