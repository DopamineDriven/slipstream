"use client";

import type { Provider } from "@/lib/models";
import type { UIMessage } from "@/types/shared";
import type { User } from "@/utils/auth-client";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCookiesCtx } from "@/context/cookie-context";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useReaction } from "@/hooks/use-reaction";
import { formatTime, getFirstName, getInitials } from "@/lib/helpers";
import { processStreamingMarkdown } from "@/lib/markdown-streaming";
import { getModelDisplayName, providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AnimatedCopyButton } from "@/ui/atoms/animated-copy-button";
import { MessageAttachments } from "@/ui/chat/message-attachments";
import { MessageActionsDialog } from "@/ui/chat/message-bubble/actions-dialog";
import { ThinkingSection } from "@/ui/chat/thinking";
import { ImageGenerationCanvas } from "@/ui/chat/image-gen/image-generation-canvas";
import { ImageGenSeries, ImageGenSeriesItem, ImageGenSeriesStack } from "@/ui/chat/image-gen/series-stack";
import { useTheme } from "next-themes";
import type { AllModelsUnion } from "@slipstream/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  EditIcon,
  EllipsisHorizontal,
  ReadAloud as ReadAloudIcon,
  RetryIcon,
  ShareIcon as Share,
  ThumbsDown,
  ThumbsUp
} from "@slipstream/ui";

// Note: processMarkdownToReact is dynamically imported in the useEffect to reduce bundle size

interface ChatMessageProps {
  message: UIMessage;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  attachments?: UIMessage["attachments"];
  className?: string;
  user?: User;
  isStreaming?: boolean;
  liveThinkingText?: string;
  liveIsThinking?: boolean;
  liveThinkingDuration?: number;
  // Live image generation (progressive) data
  liveImgGenEnabled?: boolean;
  liveImgPartial?: {
    index: number;
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
  };
  liveImgFinals?: {
    index: number;
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
  }[];
}

// Global cache for processed markdown
const markdownCache = new Map<string, ReactNode>();

export function MessageBubble({
  message,
  className,
  user,
  isStreaming = false,
  liveThinkingText,
  attachments,
  liveIsThinking,
  liveThinkingDuration,
  liveImgGenEnabled,
  liveImgPartial,
  liveImgFinals
}: ChatMessageProps) {
  const isMobile = useIsMobile();
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [renderedContent, setRenderedContent] = useState<ReactNode | null>(
    null
  );
  const [renderedThinkingContent, setRenderedThinkingContent] =
    useState<ReactNode | null>(null);

  const { handleReaction, isPending, reactionState } = useReaction(message);



  const RxnIcons = [
    {
      id: "like-action",
      icon: ThumbsUp,
      onClick: () => handleReaction("like"),
      isActive: reactionState.liked
    },
    {
      id: "dislike-action",
      icon: ThumbsDown,
      onClick: () => handleReaction("dislike"),
      isActive: reactionState.disliked
    }
  ];

  const IconMap = [
    {
      id: "read-aloud-action",
      icon: ReadAloudIcon,
      onClick: () => console.log("read aloud"),
      isActive: false
    },
    {
      id: "share-action",
      icon: Share,
      onClick: () => console.log("share action"),
      isActive: false
    },
    {
      id: "retry-action",
      icon: RetryIcon,
      onClick: () => console.log("try again"),
      isActive: false
    }
  ];

  const processingRef = useRef(false);
  const thinkingProcessingRef = useRef(false);
  const isUser = message.senderType === "USER";
  const isAI = message.senderType === "AI";

  const { resolvedTheme } = useTheme();

  const providerInfo = useMemo(
    () => providerMetadata[message.provider.toLowerCase() as Provider],
    [message.provider]
  );
  const { get } = useCookiesCtx();

  const tz = get("tz") ?? "america/chicago";
  const locale = get("locale") ?? "en-US";

  const contentToCopy = message.content;

  // Derive live image generation canvas props when streaming image-gen
  const canvasHasFinal = Boolean(liveImgFinals && liveImgFinals.length > 0);
  const canvasHasPartial = Boolean(liveImgPartial?.cdnUrl);
  const canvasShouldRender = Boolean(liveImgGenEnabled && (canvasHasPartial || canvasHasFinal));
  const canvasFinal = canvasHasFinal ? liveImgFinals![0] : undefined;
  const canvasCdnFinal = canvasFinal?.cdnUrl ?? null;
  const canvasCdnPartial = liveImgPartial?.cdnUrl ?? null;
  const canvasWidth = canvasFinal?.width ?? liveImgPartial?.width ?? 1024;
  const canvasHeight = canvasFinal?.height ?? liveImgPartial?.height ?? 1024;
  const canvasMime = canvasFinal?.mime ?? liveImgPartial?.mime ?? "image/png";

  // Completed IMAGE_GEN messages: derive series finals from attachments
  const completedImageGenSeries = useMemo(() => {
    if (isStreaming) return [] as { final: any; partial?: any }[];
    if (!isAI) return [] as { final: any; partial?: any }[];
    if (!Array.isArray(attachments) || attachments.length === 0)
      return [] as { final: any; partial?: any }[];

    // Group by imageGenOutput.seriesId where present
    type AnyAtt = any;
    const gens = attachments.filter(a => (a as AnyAtt)?.imageGenOutput);
    if (gens.length === 0) return [] as { final: any; partial?: any }[];

    const bySeries = new Map<string, { finals: AnyAtt[]; partials: AnyAtt[] }>();
    for (const att of gens as AnyAtt[]) {
      const igo = att.imageGenOutput;
      const sid: string | undefined = igo?.seriesId;
      if (!sid) continue;
      const bucket = bySeries.get(sid) ?? { finals: [], partials: [] };
      if (igo?.isPartial || igo?.kind === "PARTIAL") bucket.partials.push(att);
      else bucket.finals.push(att);
      bySeries.set(sid, bucket);
    }

    const seriesList: { final: AnyAtt; partial?: AnyAtt }[] = [];
    for (const [, grp] of bySeries) {
      // Pick the first final (if multiple, prefer lowest jobIndex then lowest seriesIndex)
      const final = grp.finals.sort((a, b) => {
        const ai = a.imageGenOutput?.jobIndex ?? 0;
        const bi = b.imageGenOutput?.jobIndex ?? 0;
        if (ai !== bi) return ai - bi;
        return (a.imageGenOutput?.seriesIndex ?? 0) - (b.imageGenOutput?.seriesIndex ?? 0);
      })[0];
      if (!final) continue;
      const partial = grp.partials.sort(
        (a, b) => (a.imageGenOutput?.seriesIndex ?? 0) - (b.imageGenOutput?.seriesIndex ?? 0)
      ).at(-1);
      seriesList.push({ final, partial });
    }
    return seriesList;
  }, [attachments, isAI, isStreaming]);
  const hasCompletedImageGen = completedImageGenSeries.length > 0;

  // Build series stack data structure for richer UI (stack/replay)
  const seriesStackData = useMemo(() => {
    if (isStreaming) return [] as ImageGenSeries[];
    if (!isAI) return [] as ImageGenSeries[];
    if (!Array.isArray(attachments) || attachments.length === 0)
      return [] as ImageGenSeries[];

    type AnyAtt = any;
    const gens = attachments.filter(a => (a as AnyAtt)?.imageGenOutput) as AnyAtt[];
    const bySeries = new Map<string, AnyAtt[]>();
    for (const att of gens) {
      const sid = att.imageGenOutput?.seriesId;
      if (!sid) continue;
      const arr = bySeries.get(sid) ?? [];
      arr.push(att);
      bySeries.set(sid, arr);
    }
    const out: ImageGenSeries[] = [];
    for (const [sid, arr] of bySeries) {
      const sorted = arr.sort(
        (a, b) => (a.imageGenOutput?.seriesIndex ?? 0) - (b.imageGenOutput?.seriesIndex ?? 0)
      );
      const items: ImageGenSeriesItem[] = sorted.map(a => ({
        cdnUrl: a.cdnUrl,
        width: a.imageGenOutput?.width ?? a.image?.width ?? 1024,
        height: a.imageGenOutput?.height ?? a.image?.height ?? 1024,
        mime: a.imageGenOutput?.mime ?? a.mime ?? "image/png",
        isPartial: a.imageGenOutput?.isPartial ?? a.imageGenOutput?.kind === "PARTIAL",
        index: a.imageGenOutput?.seriesIndex,
        generationGroupId: a.generationGroupId,
        seriesId: sid,
        revisedPrompt: a.imageGenOutput?.revisedPrompt ?? null
      }));
      const jobId = sorted[0]?.imageGenOutput?.jobId;
      const jobIndex = sorted[0]?.imageGenOutput?.jobIndex;
      const generationGroupId = sorted[0]?.generationGroupId;
      const revisedPrompt = sorted.find(x => !x.imageGenOutput?.isPartial)?.imageGenOutput?.revisedPrompt ?? null;
      out.push({ seriesId: sid, items, jobId, jobIndex, generationGroupId, revisedPrompt });
    }
    return out.sort((a, b) => (a.jobIndex ?? 0) - (b.jobIndex ?? 0));
  }, [attachments, isAI, isStreaming]);

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

  // Process thinking text for completed messages (heavy processor + cache)
  useEffect(() => {
    const thinkingTextToProcess = message.thinkingText;

    if (!thinkingTextToProcess) {
      setRenderedThinkingContent(null);
      return;
    }

    // Skip heavy processing while streaming; handled by streamingThinkingRenderedContent
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

  // Action button styling
  const actionButtonVariants = {
    default: cn(
      "size-3 sm:h-4 sm:w-4 p-0 bg-transparent hover:bg-transparent",
      isUser
        ? "text-primary-foreground/70 hover:text-primary-foreground/90"
        : resolvedTheme === "light"
          ? "text-[#fafafa] hover:text-[#f2f2f2]"
          : ""
    )
  };

  return (
    <>
      <div
        id={`msg-${message.id}`}
        data-message-id={message.id}
        className={cn(
          "mx-auto flex w-full gap-3 sm:max-w-3xl md:max-w-4xl",
          isUser ? "justify-end" : "justify-start",
          className
        )}>
        {isAI && (
          <div className="mt-1 shrink-0">
            <div className="flex size-6 items-center justify-center rounded-full bg-[#fafafa] text-[#0a0a0a] sm:size-8">
              <providerInfo.icon className="size-3 sm:size-4" />
            </div>
          </div>
        )}
        <div
          className={cn(
            "group relative max-w-[85%] min-w-0 rounded-2xl px-4 py-3 text-sm",
            isUser
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
                isUser
                  ? "text-primary-foreground/70 hover:text-primary-foreground/90"
                  : "text-muted-foreground hover:text-foreground"
              )}>
              <EllipsisHorizontal className="h-3 w-3" />
              <span className="sr-only">Message options</span>
            </Button>
          )}
          {canvasShouldRender && (
            <div className="mb-2">
              <ImageGenerationCanvas
                isGenerating={!canvasHasFinal}
                cdnUrl={canvasCdnFinal}
                cdnUrlPartial={canvasCdnPartial}
                width={canvasWidth}
                height={canvasHeight}
                mime={canvasMime}
                prompt={message.content}
              />
            </div>
          )}
          {!canvasShouldRender && hasCompletedImageGen && (
            seriesStackData.length > 1 ? (
              <div className="mb-2">
                <ImageGenSeriesStack seriesList={seriesStackData} />
              </div>
            ) : (
              <div className="mb-2 space-y-3">
                {completedImageGenSeries.map(({ final, partial }, idx) => (
                  <ImageGenerationCanvas
                    key={final?.id ?? idx}
                    isGenerating={false}
                    cdnUrl={final?.cdnUrl ?? null}
                    cdnUrlPartial={partial?.cdnUrl ?? null}
                    width={final?.imageGenOutput?.width ?? partial?.imageGenOutput?.width ?? 1024}
                    height={final?.imageGenOutput?.height ?? partial?.imageGenOutput?.height ?? 1024}
                    mime={final?.imageGenOutput?.mime ?? partial?.imageGenOutput?.mime ?? final?.mime ?? "image/png"}
                    prompt={final?.imageGenOutput?.revisedPrompt ?? message.content}
                  />
                ))}
              </div>
            )
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
          {(() => {
            // If we rendered completed image-gen canvases for AI messages, suppress attachments for that message.
            if (!isUser && hasCompletedImageGen) return null;
            const finalUrl = canvasCdnFinal;
            const hasDuplicateFinal =
              !!finalUrl &&
              Array.isArray(attachments) &&
              attachments.some(att => att.cdnUrl === finalUrl);
            if (canvasShouldRender && hasDuplicateFinal) return null;
            return (
              <MessageAttachments attachments={attachments} isUser={isUser} />
            );
          })()}
          <div
            className={cn(
              "mt-2 flex items-center justify-between pt-1 text-xs",
              isUser
                ? "text-foreground/90 [&_svg]:text-foreground/90"
                : resolvedTheme === "light"
                  ? "text-[#f2f2f2] hover:text-[#fafafa]"
                  : "text-muted-foreground hover:text-foreground"
            )}>
            {isAI ? (
              <>
                <div className={cn(isMobile ? "hidden" : "flex", "items-center gap-2")}>
                  <AnimatedCopyButton
                    textToCopy={contentToCopy ?? ""}
                    className={cn(
                      actionButtonVariants.default,
                      resolvedTheme === "light"
                        ? "text-[#f2f2f2] hover:text-[#fafafa]"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    iconClassName="text-xs"
                    disabled={isStreaming === true}
                    initialIconSize={12}
                    size="icon"
                  />
                  {RxnIcons.map(action => (
                    <Button
                      key={action.id}
                      variant="ghost"
                      size="icon"
                      disabled={isStreaming === true || isPending}
                      className={cn(
                        actionButtonVariants.default,
                        `transition-colors`,
                        action.isActive
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                        resolvedTheme === "light" && action.isActive
                          ? "text-[#ffffff]"
                          : resolvedTheme === "light"
                            ? "text-[#f2f2f2] hover:text-[#fafafa]"
                            : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={action.onClick}>
                      <action.icon className="size-3" />
                    </Button>
                  ))}
                  {IconMap.map(action => (
                    <Button
                      key={action.id}
                      variant="ghost"
                      size="icon"
                      disabled={isStreaming === true || isPending}
                      className={cn(
                        actionButtonVariants.default,
                        resolvedTheme === "light" && action.isActive
                          ? "text-[#ffffff]"
                          : resolvedTheme === "light"
                            ? "text-[#f2f2f2] hover:text-[#fafafa]"
                            : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={action.onClick}>
                      <action.icon className="size-3" />
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span>{formatTime(message.createdAt, locale, tz)}</span>
                  {message.model && message.provider && (
                    <>
                      <span>•</span>
                      <span className="font-medium">
                        {getModelDisplayName(
                          message.provider.toLowerCase() as Provider,
                          message.model as AllModelsUnion
                        )}
                      </span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span>{formatTime(message.createdAt, locale, tz)}</span>
                  <span>•</span>
                  <span className="font-medium">
                    {getFirstName(user?.name)}
                  </span>
                </div>
                <div className="items-center gap-2 md:flex">
                  <AnimatedCopyButton
                    textToCopy={contentToCopy ?? ""}
                    className={actionButtonVariants.default}
                    iconClassName="text-xs"
                    initialIconSize={12}
                    size="icon"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className={actionButtonVariants.default}
                    onClick={() => console.log("Edit message")}>
                    <EditIcon className="size-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
        {isUser && (
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
        messageContent={contentToCopy ?? ""}
      />
    </>
  );
}
