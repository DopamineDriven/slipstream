"use client";

import type { User } from "@/utils/auth-client";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCookiesCtx } from "@/context/cookie-context";
import { getInitials } from "@/lib/helpers";
import { normalizeImgGenFields } from "@/lib/img-gen-to-attachment";
import { processStreamingMarkdown } from "@/lib/markdown-streaming";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentDisplay } from "@/ui/chat/attachment-display";
import { ImageGenerationCanvasTest } from "@/ui/chat/image-gen/test";
import { MessageIcons } from "@/ui/chat/message-bubble/message-icons";
import { ThinkingSection } from "@/ui/chat/thinking";
import { useTheme } from "next-themes";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AIChatResponseImgGenFieldsFinal,
  AttachmentSingleton,
  MessageSingleton,
  Provider
} from "@slipstream/types";
import { Avatar, AvatarFallback, AvatarImage } from "@slipstream/ui";

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

type ImageDataCache = {
  images: string[];
  currentImageIndex: number;
  width: number;
  height: number;
  isGenerating: boolean;
  attachmentId?: string;
  prompt?: string;
  kind?: $Enums.ImageGenOutputKind;
};

// Global cache for processed markdown
const markdownCache = new Map<string, ReactNode>();
const ENCRYPTED_THINKING_PLACEHOLDER = "*encrypted output...*";

function formatAttmntLabel(message: MessageSingleton<true>) {
  if (message.attachments.length === 1) return "Attachment";
  else return `${message.attachments.length} Attachments`;
}

function MessageBubbleImpl({
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
  const { getTargeted } = useCookiesCtx();

  const {
    locale,
    "client-tz": tz,
    viewport
  } = getTargeted(["client-tz", "locale", "viewport"]);

  const isMobile = viewport === "mobile";

  const [renderedContent, setRenderedContent] = useState<ReactNode | null>(
    null
  );

  const [renderedThinkingContent, setRenderedThinkingContent] =
    useState<ReactNode | null>(null);
  const [renderedBlockContent, setRenderedBlockContent] = useState<
    Record<string, ReactNode>
  >({});

  const processingRef = useRef(false);

  const thinkingProcessingRef = useRef(false);

  const { resolvedTheme } = useTheme();

  const imageDataCacheRef = useRef<ImageDataCache | null>(null);

  // const [imageDataCache, _setImageDataCache] = useState<ImageDataCache | null>(null);

  // useEffect(()=>{
  //   imageDataCacheRef.current === imageDataCache;
  // },[imageDataCache]);

  const providerInfo = useMemo(
    () => providerMetadata[message.provider.toLowerCase() as Provider],
    [message.provider]
  );

  const orderedMessageBlocks = useMemo(() => {
    if (
      message.senderType !== "AI" ||
      !message.messageBlocks ||
      message.messageBlocks.length === 0
    ) {
      return Array.of<
        NonNullable<MessageSingleton<true>["messageBlocks"]>[number]
      >();
    }

    return [...message.messageBlocks].sort(
      (left, right) => left.ordinal - right.ordinal
    );
  }, [message.messageBlocks, message.senderType]);

  const hasRenderableMessageBlocks = orderedMessageBlocks.length > 0;
  const latestMessageBlock = orderedMessageBlocks.at(-1);
  const blockOrdinalKey = useCallback((ordinal: number) => String(ordinal), []);

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

  const streamingRenderedContent = useMemo(
    () => (isStreaming ? processStreamingMarkdown(message.content) : null),
    [isStreaming, message.content]
  );

  const imageGenerationData = useMemo(() => {
    const imageUrls = Array.of<string>();
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
        const allImages = Array.of<AttachmentSingleton<true>>();

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
      // eslint-disable-next-line react-hooks/refs
      imageDataCacheRef.current = newData;
      return newData;
    }

    // If no data but we have cached data, check if it's still relevant
    // This handles the router transition moment
    // eslint-disable-next-line react-hooks/refs
    if (imageDataCacheRef.current) {
      // Check if the cached data is for the same message
      // by comparing the final image URL with message attachments
      // eslint-disable-next-line react-hooks/refs
      const cachedFinalUrl = imageDataCacheRef.current.images.at(-1);

      if (cachedFinalUrl) {
        const messageHasThisImage = message.attachments?.some(
          att => att.cdnUrl === cachedFinalUrl
        );
        if (messageHasThisImage) {
          // The cache is still valid for this message
          // eslint-disable-next-line react-hooks/refs
          return imageDataCacheRef.current;
        }
      }
    }

    return null;
  }, [liveImgGenFields, message.attachments, message.senderType, isStreaming]);

  // if (imageGenerationData?.currentImageIndex) {
  //   if (!imageDataCache?.currentImageIndex) setImageDataCache(imageGenerationData);
  //   if (imageDataCache?.currentImageIndex !==imageGenerationData.currentImageIndex) setImageDataCache(imageGenerationData);

  // }

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  useEffect(() => {
    if (!hasRenderableMessageBlocks) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRenderedBlockContent({});
      return;
    }

    if (isStreaming) {
      return;
    }

    let cancelled = false;

    (async () => {
      const nextRendered: Record<string, ReactNode> = {};

      try {
        const { processMarkdownToReact } = await import("@/lib/processor");

        for (const block of orderedMessageBlocks) {
          const blockContent =
            block.type === "ENCRYPTED_THINKING"
              ? ENCRYPTED_THINKING_PLACEHOLDER
              : block.content;

          if (!blockContent) {
            continue;
          }

          const cacheKey = `block-${message.id}-${block.ordinal}-${block.type}-${blockContent.length}`;
          const cached = markdownCache.get(cacheKey);

          if (cached) {
            nextRendered[blockOrdinalKey(block.ordinal)] = cached;
            continue;
          }

          const processed = await processMarkdownToReact(blockContent);
          markdownCache.set(cacheKey, processed);
          nextRendered[blockOrdinalKey(block.ordinal)] = processed;
        }

        if (!cancelled) {
          setRenderedBlockContent(nextRendered);
          if (markdownCache.size > 50) {
            const firstKey = markdownCache.keys().next().value;
            if (firstKey) markdownCache.delete(firstKey);
          }
        }
      } catch (error) {
        console.error("Message block markdown processing error:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasRenderableMessageBlocks,
    isStreaming,
    message.id,
    orderedMessageBlocks,
    blockOrdinalKey
  ]);

  const renderedMessageBlocks = useMemo(() => {
    if (!hasRenderableMessageBlocks) {
      return null;
    }

    const rendered = Array.of<ReactNode>();

    for (const block of orderedMessageBlocks) {
      const blockContent =
        block.type === "ENCRYPTED_THINKING"
          ? ENCRYPTED_THINKING_PLACEHOLDER
          : block.content;
      const isThinkingBlock =
        block.type === "THINKING" || block.type === "ENCRYPTED_THINKING";
      const isActiveThinkingBlock =
        isThinkingBlock &&
        isStreaming &&
        liveIsThinking === true &&
        latestMessageBlock?.ordinal === block.ordinal;

      if (isThinkingBlock) {
        rendered.push(
          <ThinkingSection
            key={`${message.id}-thinking-${block.ordinal}`}
            isThinking={isActiveThinkingBlock}
            thinkingContent={
              isStreaming
                ? processStreamingMarkdown(blockContent)
                : (renderedBlockContent[blockOrdinalKey(block.ordinal)] ??
                  blockContent)
            }
            duration={block.durationMs}
            isStreaming={isActiveThinkingBlock}
          />
        );
        continue;
      }

      if (!blockContent) {
        continue;
      }

      rendered.push(
        <div
          key={`${message.id}-text-${block.ordinal}`}
          className="leading-relaxed text-pretty whitespace-pre-wrap">
          {isStreaming
            ? processStreamingMarkdown(blockContent)
            : (renderedBlockContent[blockOrdinalKey(block.ordinal)] ??
              blockContent)}
        </div>
      );
    }

    return rendered;
  }, [
    hasRenderableMessageBlocks,
    isStreaming,
    latestMessageBlock?.ordinal,
    liveIsThinking,
    message.id,
    blockOrdinalKey,
    orderedMessageBlocks,
    renderedBlockContent
  ]);

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
              : message.attachments.length > 0
                ? "w-[85%]"
                : "",
            message.senderType === "USER"
              ? "bg-muted text-foreground"
              : resolvedTheme === "light"
                ? "bg-[#2252ba] text-[#fefefe]"
                : "bg-[#0d2a6b] text-[#fafafa]"
          )}>
          {hasRenderableMessageBlocks ? (
            renderedMessageBlocks
          ) : (
            <>
              {liveIsThinking || liveThinkingText ? (
                <ThinkingSection
                  isThinking={liveIsThinking}
                  thinkingContent={
                    streamingThinkingRenderedContent ??
                    renderedThinkingContent ??
                    message.thinkingText
                  }
                  duration={
                    liveThinkingDuration ??
                    message?.thinkingDuration ??
                    undefined
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
                    liveThinkingDuration ??
                    message?.thinkingDuration ??
                    undefined
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
            </>
          )}
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
            isMobile={isMobile}
            locale={locale}
            tz={tz}
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
    </>
  );
}

/**
 * Memoized so the committed bubbles skip per-token re-renders during streaming: the store re-pins each committed
 * message's object identity across snapshots, and the feed passes stable `live*`/`isStreaming` props (only the
 * single `streaming-<id>` bubble gets live values), so a shallow prop compare short-circuits the other N bubbles.
 */
export const MessageBubble = memo(MessageBubbleImpl);

/**
   const bubblePropsEqual = (prev: ChatMessageProps, next: ChatMessageProps) =>
    prev.message === next.message &&
    prev.isStreaming === next.isStreaming &&
    prev.user === next.user &&
    prev.className === next.className &&
    // live* drive only the streaming bubble; committed rows ignore them
    (next.isStreaming !== true ||
      (prev.liveThinkingText === next.liveThinkingText &&
        prev.liveIsThinking === next.liveIsThinking &&
        prev.liveThinkingDuration === next.liveThinkingDuration &&
        prev.liveImgGenFields === next.liveImgGenFields &&
        prev.liveImgGenAttachmentId === next.liveImgGenAttachmentId));
 */
