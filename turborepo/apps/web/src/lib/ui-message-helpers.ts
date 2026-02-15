// src/lib/ui-message-helpers.ts
import type {
  AIChatResponseImgGenFieldsFinal,
  AttachmentSingleton,
  MessageSingleton
} from "@slipstream/types";
import { normalizeImgGenFields } from "./img-gen-to-attachment";

/**
 * Creates a properly typed MessageSingleton for user messages
 */
export function createUserMessage(
  params: MessageSingleton<true>
): MessageSingleton<true> {
  return {
    id: params.id,
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
    attachments: params.attachments ?? []
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
    aiMsgId?: string;
    imgGenAttachmentId?: string;
    imgGenFields?: AIChatResponseImgGenFieldsFinal | null;
  }
): MessageSingleton<true> {
  const arr = Array.of<AttachmentSingleton<true>>();

  if (additionalData?.imgGenFields) {
    const partials = normalizeImgGenFields(
      additionalData.imgGenFields
    )?.partialImages;

    const finals = normalizeImgGenFields(additionalData.imgGenFields)?.images;

    if (partials && partials.length > 0) {
      const filter = partials.filter(t => typeof t !== "undefined");
      if (filter.length > 0) arr.push(...filter);
    }
    if (finals && finals?.length > 0) {
      const filter = finals.filter(t => typeof t !== "undefined");
      const withCorrectId = filter.map(({ id: _id, ...rest }) => ({
        ...rest,
        id: additionalData.imgGenAttachmentId ?? _id
      }));
      if (withCorrectId.length > 0) arr.push(...withCorrectId);
    }
  }
  return {
    ...streamingMessage,
    id:
      additionalData?.aiMsgId ?? streamingMessage.id.replace("streaming-", ""),
    content: finalContent,
    thinkingText: additionalData?.thinkingText ?? streamingMessage.thinkingText,
    thinkingDuration:
      additionalData?.thinkingDuration ?? streamingMessage.thinkingDuration,
    updatedAt: new Date(),
    attachments: arr.length > 0 ? arr : streamingMessage.attachments
  };
}
