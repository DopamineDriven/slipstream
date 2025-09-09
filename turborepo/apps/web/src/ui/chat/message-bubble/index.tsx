"use client";

import type { Provider } from "@/lib/models";
import type { UIMessage } from "@/types/shared";
import type { User } from "next-auth";
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
import { MessageActionsDialog } from "@/ui/chat/message-bubble/actions-dialog";
import { ThinkingSection } from "@/ui/chat/thinking";
import { AllModelsUnion } from "@t3-chat-clone/types";
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
} from "@t3-chat-clone/ui";
import { MessageAttachments } from "../message-attachments";

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
  liveThinkingDuration
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

  const providerInfo = useMemo(
    () => providerMetadata[message.provider.toLowerCase() as Provider],
    [message.provider]
  );
  const { get } = useCookiesCtx();

  const tz = get("tz") ?? "america/chicago";
  const locale = get("locale") ?? "en-US";

  const contentToCopy = message.content;

  const handleMobileActionsClick = useCallback(() => {
    setShowMobileActions(true);
  }, []);

  // Process markdown content
  useEffect(() => {
    // For streaming messages, use lightweight processor
    if (isStreaming) {
      setRenderedContent(processStreamingMarkdown(message.content));
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

  // Process thinking text with markdown
  useEffect(() => {
    const thinkingTextToProcess = liveThinkingText ?? message.thinkingText;

    if (!thinkingTextToProcess) {
      setRenderedThinkingContent(null);
      return;
    }

    // For live/streaming thinking text, use lightweight processor
    if (liveThinkingText && (isStreaming || liveIsThinking)) {
      setRenderedThinkingContent(processStreamingMarkdown(liveThinkingText));
      return;
    }

    // For persisted thinking text from message object, only use lightweight processor if still streaming
    if (message.thinkingText && isStreaming) {
      setRenderedThinkingContent(
        processStreamingMarkdown(message.thinkingText)
      );
      return;
    }

    // For completed messages with thinking text, check cache first
    if (!message.thinkingText) return;

    const cacheKey = `thinking-${message.id}-${message.thinkingText.length}`;
    const cached = markdownCache.get(cacheKey);

    if (cached) {
      setRenderedThinkingContent(cached);
      return;
    }

    // Prevent duplicate processing
    if (thinkingProcessingRef.current) return;
    thinkingProcessingRef.current = true;

    (async () => {
      try {
        if (!message.thinkingText) return;

        const { processMarkdownToReact } = await import("@/lib/processor");
        const processed = await processMarkdownToReact(message.thinkingText);
        markdownCache.set(cacheKey, processed);
        setRenderedThinkingContent(processed);
      } catch (error) {
        console.error("Thinking text markdown processing error:", error);
        setRenderedThinkingContent(
          <div className="text-yellow-500">
            Error rendering thinking content. Raw text shown below:
            <pre className="mt-1 text-xs whitespace-pre-wrap">
              {message.thinkingText}
            </pre>
          </div>
        );
      } finally {
        thinkingProcessingRef.current = false;
      }
    })();
  }, [
    message.thinkingText,
    message.id,
    isStreaming,
    liveThinkingText,
    liveIsThinking
  ]);

  // Action button styling
  const actionButtonVariants = {
    default: cn(
      "size-3 sm:h-4 sm:w-4 p-0 bg-transparent hover:bg-transparent",
      isUser
        ? "text-primary-foreground/70 hover:text-primary-foreground/90"
        : ""
    )
  };

  return (
    <>
      <div
        id={`msg-${message.id}`}
        data-message-id={message.id}
        className={cn(
          "mx-auto flex w-full max-w-[100dvw] gap-3 sm:max-w-3xl md:max-w-4xl",
          isUser ? "justify-end" : "justify-start",
          className
        )}>
        {isAI && (
          <div className="mt-1 shrink-0">
            <div className="text-foreground bg-background dark:bg-foreground dark:text-background flex size-6 items-center justify-center rounded-full sm:size-8">
              <providerInfo.icon className="size-3 sm:size-4" />
            </div>
          </div>
        )}
        <div
          className={cn(
            "group relative max-w-[85%] min-w-0 rounded-2xl px-4 py-3 text-sm",
            isUser ? "bg-muted text-foreground" : "bg-primary/50 text-background dark:bg-primary/40 dark:text-foreground"
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
          {liveIsThinking || liveThinkingText ? (
            <ThinkingSection
              isThinking={liveIsThinking}
              thinkingContent={renderedThinkingContent ?? message.thinkingText}
              duration={
                liveThinkingDuration ?? message?.thinkingDuration ?? undefined
              }
              isStreaming={isStreaming ?? liveIsThinking ?? false}
            />
          ) : message.thinkingText ? (
            <ThinkingSection
              isThinking={liveIsThinking}
              thinkingContent={renderedThinkingContent ?? message.thinkingText}
              duration={
                liveThinkingDuration ?? message?.thinkingDuration ?? undefined
              }
              isStreaming={isStreaming ?? liveIsThinking ?? false}
            />
          ) : (
            <></>
          )}
          <div className="leading-relaxed text-pretty whitespace-pre-wrap">
            {renderedContent ?? message.content}
          </div>
          <MessageAttachments attachments={attachments} isUser={isUser} />
          <div
            className={cn(
              "mt-2 flex items-center justify-between pt-1 text-xs",
              isUser
                ? "text-foreground/90 [&_svg]:text-foreground/90"
                : "text-muted-foreground"
            )}>
            {isAI ? (
              <>
                <div className="hidden items-center gap-2 md:flex">
                  <AnimatedCopyButton
                    textToCopy={contentToCopy ?? ""}
                    className={cn(
                      actionButtonVariants.default,
                      "text-muted-foreground hover:text-foreground"
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
                        `text-muted-foreground hover:text-foreground transition-colors`
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
                <div className="hidden items-center gap-2 md:flex">
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
