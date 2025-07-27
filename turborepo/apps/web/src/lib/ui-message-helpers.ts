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
}): UIMessage {
  return {
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
}): UIMessage {
  return {
    id: params.id,
    senderType: "AI",
    provider: toPrismaFormat(params.provider),
    model: params.model,
    content: params.content,
    createdAt: params.createdAt ?? new Date(),
    updatedAt: new Date(),
    userId: params.userId,
    userKeyId: null,
    conversationId: params.conversationId
  };
}

/**
 * Updates a streaming message to a final message
 */
export function finalizeStreamingMessage(
  streamingMsg: UIMessage,
  finalContent: string
): UIMessage {
  return {
    ...streamingMsg,
    id: `msg-${Date.now()}`,
    content: finalContent,
    updatedAt: new Date()
  };
}

/**
 * Type guard to check if a message is a streaming message
 */
export function isStreamingMessage(message: UIMessage): boolean {
  return message.id.startsWith("streaming-");
}
