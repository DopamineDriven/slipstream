"use client";

import type { Provider } from "@/lib/models";
import type { User } from "@/utils/auth-client";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { getInitials } from "@/lib/helpers";
import { processStreamingMarkdown } from "@/lib/markdown-streaming";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentDisplay } from "@/ui/chat/attachment-display";
import { ImageGenerationCanvas } from "@/ui/chat/image-gen/image-generation-canvas";
import { MessageActionsDialog } from "@/ui/chat/message-bubble/actions-dialog";
import { MessageIcons } from "@/ui/chat/message-bubble/message-icons";
import { ThinkingSection } from "@/ui/chat/thinking";
import { useTheme } from "next-themes";
import type {
  AIChatResponseImgGenFieldsFinal,
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
  liveImgGenEnabled,
  liveImgGenFields
}: ChatMessageProps) {
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

  // Extract the latest partial or final image for display
  const currentImageGenData = useMemo(() => {
    if (!liveImgGenEnabled || !liveImgGenFields) return null;

    // If we have final images, use the first one
    if (liveImgGenFields.images && liveImgGenFields.images.length > 0) {
      const final = liveImgGenFields.images[0];
      return {
        cdnUrl: final?.cdnUrl,
        width: final?.width ?? 1024,
        height: final?.height ?? 1024,
        mime: final?.mime,
        isFinal: true
      };
    }

    // Otherwise use the latest partial (highest index)
    if (
      liveImgGenFields.partialImages &&
      liveImgGenFields.partialImages.length > 0
    ) {
      // Get the partial with the highest index (most recent)
      const partial = liveImgGenFields.partialImages.reduce(
        (latest, current) =>
          !latest || current.index > latest.index ? current : latest
      );
      return {
        cdnUrl: partial.cdnUrl,
        width: partial.width,
        height: partial.height,
        mime: partial.mime,
        isFinal: false
      };
    }

    return null;
  }, [liveImgGenEnabled, liveImgGenFields]);

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

          {/* Image Generation Canvas - shows during streaming */}
          {currentImageGenData && (
            <div className="mt-3">
              <ImageGenerationCanvas
                isGenerating={isStreaming && !currentImageGenData.isFinal}
                cdnUrl={
                  currentImageGenData.isFinal
                    ? (currentImageGenData.cdnUrl ?? null)
                    : null
                }
                cdnUrlPartial={
                  !currentImageGenData.isFinal
                    ? currentImageGenData.cdnUrl
                    : null
                }
                width={currentImageGenData.width ?? 1024}
                height={currentImageGenData.height ?? 1024}
                mime={currentImageGenData.mime ?? "image/png"}
                prompt={liveImgGenFields?.revisedPrompt ?? message.content}
              />
            </div>
          )}
          {message.senderType === "AI" && (
            <div className="mt-3">
              {message.attachments &&
                message.attachments.length > 0 &&
                message.attachments
                  .filter(
                    t =>
                      t.imageGenOutput &&
                      t.imageGenOutput?.seriesIndex ===
                        message.attachments.length - 1 &&
                      t.imageGenOutput.kind === "PARTIAL"
                  )
                  .map(t => (
                    <ImageGenerationCanvas
                      key={t.imageGenOutput?.seriesIndex}
                      isGenerating={true}
                      cdnUrl={t.cdnUrl}
                      cdnUrlPartial={t.cdnUrl}
                      width={t.image?.width ?? t.imageGenOutput?.width ?? 1024}
                      height={
                        t?.image?.height ?? t.imageGenOutput?.height ?? 1024
                      }
                      mime={t.mime ?? "image/jpeg"}
                      prompt={"image gen in progress..."}
                    />
                  ))}
            </div>
          )}
          {liveImgGenFields?.partialImages &&
            liveImgGenFields.partialImages.length > 0 && (
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
                {message.senderType === "AI" && (
                  <div className="mt-3">
                    {liveImgGenFields?.partialImages &&
                      liveImgGenFields.partialImages.length > 0 &&
                      liveImgGenFields.partialImages
                        .filter(
                          t =>
                            liveImgGenFields?.partialImages &&
                            t.index ===
                              liveImgGenFields?.partialImages.length - 1
                        )
                        .map(t => (
                          <ImageGenerationCanvas
                            key={t.index}
                            isGenerating={false}
                            cdnUrl={t.cdnUrl}
                            cdnUrlPartial={t.cdnUrl}
                            width={t.width}
                            height={t.height}
                            mime={t.mime ?? "image/jpeg"}
                            prompt={"image gen in progress..."}
                          />
                        ))}
                  </div>
                )}
              </div>
            )}
          {/* Regular attachments - only show when NOT actively generating images */}
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
              {!currentImageGenData && message.senderType === "AI" && (
                <div className="mt-3">
                  {message.attachments
                    .filter(t => t.imageGenOutput?.kind === "FINAL")
                    .map(t => (
                      <ImageGenerationCanvas
                        key={t.id}
                        isGenerating={false}
                        cdnUrl={
                          t.imageGenOutput?.kind === "FINAL" ? t.cdnUrl : null
                        }
                        cdnUrlPartial={
                          t.imageGenOutput?.kind === "FINAL"
                            ? t.compatCdnUrl
                            : null
                        }
                        width={
                          t.imageGenOutput?.kind === "FINAL"
                            ? (t.image?.width ?? 1024)
                            : 1024
                        }
                        height={
                          t.imageGenOutput?.kind === "FINAL"
                            ? (t.image?.height ?? 1024)
                            : 1024
                        }
                        mime={t.mime ?? "image/png"}
                        prompt={t.imageGenOutput?.revisedPrompt ?? ""}
                      />
                    ))}
                </div>
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
