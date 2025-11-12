"use client";

import type { Provider } from "@/lib/models";
import type { User } from "@/utils/auth-client";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { getInitials } from "@/lib/helpers";
import { normalizeImgGenFields } from "@/lib/img-gen-to-attachment";
import { processStreamingMarkdown } from "@/lib/markdown-streaming";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentDisplay } from "@/ui/chat/attachment-display";
import { ImageGenerationCanvasTest } from "@/ui/chat/image-gen/test";
import { MessageActionsDialog } from "@/ui/chat/message-bubble/actions-dialog";
import { MessageIcons } from "@/ui/chat/message-bubble/message-icons";
import { ThinkingSection } from "@/ui/chat/thinking";
import { useTheme } from "next-themes";
import type { $Enums } from "@slipstream/db/edge-client";
import type {
  AIChatResponseImgGenFieldsFinal,
  AttachmentSingleton,
  MessageSingleton
} from "@slipstream/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  EllipsisHorizontal
} from "@slipstream/ui";

// Note: processMarkdownToReact is dynamically imported in the useEffect to reduce bundle size

interface ChatMessageProps {
  message: MessageSingleton<true>;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  className?: string;
  user?: User;
  isStreaming?: boolean;
  liveThinkingText?: string;
  liveIsThinking?: boolean;
  liveThinkingDuration?: number;
  liveImgGenEnabled?: boolean;
  liveImgGenFields?: AIChatResponseImgGenFieldsFinal;
  liveImgGenAttachmentId?: string;
}

// Global cache for processed markdown
const markdownCache = new Map<string, ReactNode>();

function formatAttmntLabel(message: MessageSingleton<true>) {
  if (message.attachments.length === 1) return "Attachment";
  else return `${message.attachments.length} Attachments`;
}

export function MessageBubble({
  message,
  className,
  user,
  isStreaming = false,
  liveThinkingText,
  liveIsThinking,
  liveThinkingDuration,
  liveImgGenFields,
  liveImgGenAttachmentId
}: ChatMessageProps) {
  useEffect(() => {
    console.log({
      ["message-bubble-has-image-gen-fields-data"]: JSON.stringify(
        liveImgGenFields,
        null,
        2
      )
    });
  }, [liveImgGenFields]);

  const isMobile = useIsMobile();
  const [showMobileActions, setShowMobileActions] = useState(false);

  const [renderedContent, setRenderedContent] = useState<ReactNode | null>(
    null
  );

  const [renderedThinkingContent, setRenderedThinkingContent] =
    useState<ReactNode | null>(null);

  const processingRef = useRef(false);

  const thinkingProcessingRef = useRef(false);

  const { resolvedTheme } = useTheme();

  const imageDataCacheRef = useRef<{
    images: string[];
    currentImageIndex: number;
    width: number;
    height: number;
    isGenerating: boolean;
    attachmentId?: string;
    prompt?: string;
    kind?: $Enums.ImageGenOutputKind;
  } | null>(null);

  const providerInfo = useMemo(
    () => providerMetadata[message.provider.toLowerCase() as Provider],
    [message.provider]
  );

  const contentToCopy = message.content;

  // Lightweight, derived thinking content during live streaming to avoid setState in effects
  const streamingThinkingRenderedContent = useMemo(() => {
    if (liveThinkingText && (isStreaming || liveIsThinking)) {
      return processStreamingMarkdown(liveThinkingText);
    }
    if (message.thinkingText && isStreaming) {
      return processStreamingMarkdown(message.thinkingText);
    }
    return null;
  }, [isStreaming, liveIsThinking, liveThinkingText, message.thinkingText]);

  const handleMobileActionsClick = useCallback(() => {
    setShowMobileActions(true);
  }, []);

  const streamingRenderedContent = useMemo(
    () => (isStreaming ? processStreamingMarkdown(message.content) : null),
    [isStreaming, message.content]
  );

  const imageGenerationData = useMemo(() => {
    const imageUrls: string[] = [];
    let isGenerating = true,
      prompt: string | undefined,
      width = 0,
      height = 0,
      finalAttachmentId: string | undefined,
      kind: $Enums.ImageGenOutputKind | undefined;

    // First, try to get images from streaming data
    if (liveImgGenFields) {
      const normalized = normalizeImgGenFields(liveImgGenFields);
      if (normalized) {
        // Collect all images in order (partials then finals)
        const allImages: AttachmentSingleton<true>[] = [];

        if (normalized?.partialImages && normalized.partialImages?.length > 0) {
          const partials = normalized?.partialImages?.filter(
            t => typeof t !== "undefined"
          );
          if (partials.length > 0) allImages.push(...partials);
        }
        if (normalized?.images && normalized.images.length > 0) {
          const finals = normalized?.images?.filter(
            t => typeof t !== "undefined"
          );
          if (finals.length > 0) allImages.push(...finals);
        }
        // Sort by seriesIndex to ensure proper order
        allImages.sort((a, b) => {
          const aIndex = a.imageGenOutput?.seriesIndex ?? 0;
          const bIndex = b.imageGenOutput?.seriesIndex ?? 0;
          return aIndex - bIndex;
        });

        // Build URL array, avoiding duplicates
        for (const img of allImages) {
          if (img.image?.width) {
            width = img.image?.width;
          }

          if (img?.image?.height) {
            height = img.image.height;
          }
          if (img.cdnUrl && !imageUrls.includes(img.cdnUrl)) {
            imageUrls.push(img.cdnUrl);
            // Update prompt from the latest image
            prompt = img.imageGenOutput?.revisedPrompt ?? prompt;
            // If we have a final image, we're no longer generating
            if (img?.imageGenOutput?.kind) {
              kind = img.imageGenOutput.kind;
              if (img.imageGenOutput?.kind === "FINAL") {
                console.log(
                  `[final attachment id in streaming block]:` + img.id
                );
                finalAttachmentId = img.id;
                isGenerating = false;
              }
            }
          }
        }
      }
    }

    // If no streaming data, check message attachments
    if (
      imageUrls.length === 0 &&
      message.attachments &&
      message.attachments.length > 0 &&
      message.senderType === "AI"
    ) {
      const imageGenAttachments = message.attachments
        .filter(att => att.imageGenOutput !== null)
        .sort((a, b) => {
          const aIndex = a.imageGenOutput?.seriesIndex ?? 0;
          const bIndex = b.imageGenOutput?.seriesIndex ?? 0;
          return aIndex - bIndex;
        });

      for (const att of imageGenAttachments) {
        if (att.image?.width) {
          width = att.image.width;
        }
        if (att.image?.height) {
          height = att.image.height;
        }
        if (att.cdnUrl && !imageUrls.includes(att.cdnUrl)) {
          imageUrls.push(att.cdnUrl);
          prompt = att.imageGenOutput?.revisedPrompt ?? prompt;
          if (att?.imageGenOutput?.kind) {
            kind = att.imageGenOutput.kind;
            if (att.imageGenOutput?.kind === "FINAL") {
              console.log(
                `[final attachment id in non-streaming block]:` + att.id
              );
              isGenerating = isStreaming;
              // Capture the attachment ID for the final image
              finalAttachmentId = att.id;
            }
          }
        }
      }
    }

    // If we have data, update the cache
    if (imageUrls.length > 0) {
      const newData = {
        images: imageUrls,
        currentImageIndex: imageUrls.length - 1,
        isGenerating,
        width,
        height,
        attachmentId: finalAttachmentId,
        kind,
        prompt
      };
      imageDataCacheRef.current = newData;
      return newData;
    }

    // If no data but we have cached data, check if it's still relevant
    // This handles the router transition moment
    if (imageDataCacheRef.current) {
      // Check if the cached data is for the same message
      // by comparing the final image URL with message attachments
      const cachedFinalUrl = imageDataCacheRef.current.images.at(-1);

      if (cachedFinalUrl) {
        const messageHasThisImage = message.attachments?.some(
          att => att.cdnUrl === cachedFinalUrl
        );
        if (messageHasThisImage) {
          // The cache is still valid for this message
          return imageDataCacheRef.current;
        }
      }
    }

    return null;
  }, [liveImgGenFields, message.attachments, message.senderType, isStreaming]);

  useEffect(() => {
    // Clear cache if we're looking at a different message
    return () => {
      if (imageDataCacheRef.current) {
        const lastUrl =
          imageDataCacheRef.current.images[
            imageDataCacheRef.current.images.length - 1
          ];
        const stillRelevant = message.attachments?.some(
          att => lastUrl && att.cdnUrl === lastUrl
        );
        if (!stillRelevant) {
          imageDataCacheRef.current = null;
        }
      }
    };
  }, [message.id, message.attachments]);

  // Process markdown content
  useEffect(() => {
    // For streaming messages, use lightweight processor
    if (isStreaming) {
      return;
    }

    // For completed messages, check cache first
    const cacheKey = `${message.id}-${message.content.length}`;
    const cached = markdownCache.get(cacheKey);

    if (cached) {
      setRenderedContent(cached);
      return;
    }

    // Prevent duplicate processing
    if (processingRef.current) return;
    processingRef.current = true;

    (async () => {
      try {
        const { processMarkdownToReact } = await import("@/lib/processor");
        const processed = await processMarkdownToReact(message.content);
        markdownCache.set(cacheKey, processed);
        setRenderedContent(processed);
        if (markdownCache.size > 50) {
          const firstKey = markdownCache.keys().next().value;
          if (firstKey) markdownCache.delete(firstKey);
        }
      } catch (error) {
        console.error("Markdown processing error:", error);
        setRenderedContent(
          <div className="text-red-500">
            Error rendering content. Raw text shown below:
            <pre className="mt-1 text-xs whitespace-pre-wrap">
              {message.content}
            </pre>
          </div>
        );
      } finally {
        processingRef.current = false;
      }
    })();
  }, [message.content, message.id, isStreaming]);

  useEffect(() => {
    const thinkingTextToProcess = message.thinkingText;

    if (!thinkingTextToProcess) {
      setRenderedThinkingContent(null);
      return;
    }

    if (isStreaming || liveIsThinking) return;

    const cacheKey = `thinking-${message.id}-${thinkingTextToProcess.length}`;
    const cached = markdownCache.get(cacheKey);

    if (cached) {
      setRenderedThinkingContent(cached);
      return;
    }

    if (thinkingProcessingRef.current) return;
    thinkingProcessingRef.current = true;

    (async () => {
      try {
        const { processMarkdownToReact } = await import("@/lib/processor");
        const processed = await processMarkdownToReact(thinkingTextToProcess);
        markdownCache.set(cacheKey, processed);
        setRenderedThinkingContent(processed);
      } catch (error) {
        console.error("Thinking text markdown processing error:", error);
        setRenderedThinkingContent(
          <div className="text-yellow-500">
            Error rendering thinking content. Raw text shown below:
            <pre className="mt-1 text-xs whitespace-pre-wrap">
              {thinkingTextToProcess}
            </pre>
          </div>
        );
      } finally {
        thinkingProcessingRef.current = false;
      }
    })();
  }, [message.thinkingText, message.id, isStreaming, liveIsThinking]);

  return (
    <>
      <div
        id={`msg-${message.id}`}
        data-message-id={message.id}
        className={cn(
          "mx-auto flex w-full gap-3 sm:max-w-3xl md:max-w-4xl",
          message.senderType === "USER" ? "justify-end" : "justify-start",
          className
        )}>
        {message.senderType === "AI" && (
          <div className="mt-1 shrink-0">
            <div className="flex size-6 items-center justify-center rounded-full bg-[#fafafa] text-[#0a0a0a] sm:size-8">
              <providerInfo.icon className="size-3 sm:size-4" />
            </div>
          </div>
        )}
        <div
          className={cn(
            "group relative max-w-[85%] min-w-0 rounded-2xl px-4 py-3 text-sm",
            liveImgGenFields && message.senderType !== "USER" && isStreaming
              ? "w-[85%]"
              : message.attachments.length > 0 && message.senderType === "USER"
                ? "w-[85%]"
                : "",
            message.senderType === "USER"
              ? "bg-muted text-foreground"
              : resolvedTheme === "light"
                ? "bg-[#2252ba] text-[#fefefe]"
                : "bg-[#0d2a6b] text-[#fafafa]"
          )}>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMobileActionsClick}
              className={cn(
                "absolute size-6 bg-transparent p-0 focus:bg-transparent",
                message.senderType === "USER"
                  ? "text-primary-foreground/70 hover:text-primary-foreground/90"
                  : "text-muted-foreground hover:text-foreground"
              )}>
              <EllipsisHorizontal className="h-3 w-3" />
              <span className="sr-only">Message options</span>
            </Button>
          )}
          {liveIsThinking || liveThinkingText ? (
            <ThinkingSection
              isThinking={liveIsThinking}
              thinkingContent={
                streamingThinkingRenderedContent ??
                renderedThinkingContent ??
                message.thinkingText
              }
              duration={
                liveThinkingDuration ?? message?.thinkingDuration ?? undefined
              }
              isStreaming={isStreaming ?? liveIsThinking ?? false}
            />
          ) : message.thinkingText ? (
            <ThinkingSection
              isThinking={liveIsThinking}
              thinkingContent={
                streamingThinkingRenderedContent ??
                renderedThinkingContent ??
                message.thinkingText
              }
              duration={
                liveThinkingDuration ?? message?.thinkingDuration ?? undefined
              }
              isStreaming={isStreaming ?? liveIsThinking ?? false}
            />
          ) : (
            <></>
          )}
          <div className="leading-relaxed text-pretty whitespace-pre-wrap">
            {isStreaming
              ? streamingRenderedContent
              : (renderedContent ?? message.content)}
          </div>
          {message.senderType !== "USER" &&
            (imageGenerationData ? (
              <ImageGenerationCanvasTest
                isGenerating={imageGenerationData.isGenerating}
                currentImageIndex={imageGenerationData.currentImageIndex}
                images={imageGenerationData.images}
                width={imageGenerationData.width}
                height={imageGenerationData.height}
                kind={imageGenerationData.kind}
                prompt={imageGenerationData.prompt}
                attachmentId={
                  liveImgGenAttachmentId ??
                  imageGenerationData.attachmentId ??
                  (isStreaming
                    ? `streaming-attachment-${message.conversationId}`
                    : undefined)
                }
              />
            ) : message.attachments.length > 0 &&
              message.messageType === "IMAGE_GEN" ? (
              <ImageGenerationCanvasTest
                images={message.attachments
                  .map(t => t.cdnUrl)
                  .filter(v => v != null)}
                isGenerating={false}
                attachmentId={
                  message.attachments.find(
                    v => v.imageGenOutput?.kind === "FINAL"
                  )?.id
                }
                kind={
                  message.attachments.find(
                    v => v.imageGenOutput?.kind === "FINAL"
                  )?.imageGenOutput?.kind
                }
                prompt={
                  message.attachments.find(
                    v => v.imageGenOutput?.kind === "FINAL"
                  )?.imageGenOutput?.revisedPrompt ?? undefined
                }
                currentImageIndex={message.attachments.length - 1}
                height={
                  message.attachments[message.attachments.length - 1]?.image
                    ?.height ?? 1024
                }
                width={
                  message.attachments[message.attachments.length - 1]?.image
                    ?.width ?? 1024
                }
              />
            ) : null)}
          {message.attachments && message.attachments.length > 0 && (
            <div className={cn("mt-3", className)}>
              <div
                className={cn(
                  "mb-2 text-xs font-medium",
                  message.senderType === "USER"
                    ? "text-foreground/80"
                    : "sr-only"
                )}>
                {formatAttmntLabel(message)}
              </div>
              {message.senderType === "USER" && (
                <AttachmentDisplay attachments={message.attachments} />
              )}
            </div>
          )}
          <MessageIcons
            isStreaming={isStreaming}
            message={message}
            user={user}
          />
        </div>
        {message.senderType === "USER" && (
          <div className="mt-1 shrink-0">
            <Avatar className="size-6 sm:size-8">
              {user?.image ? (
                <AvatarImage src={user?.image} alt={getInitials(user?.name)} />
              ) : (
                <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
              )}
            </Avatar>
          </div>
        )}
      </div>
      <MessageActionsDialog
        open={showMobileActions}
        onOpenChange={setShowMobileActions}
        messageContent={contentToCopy}
      />
    </>
  );
}
