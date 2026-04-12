"use client";

import type { User } from "@/utils/auth-client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTTSContext } from "@/context/tts-context";
import { useReaction } from "@/hooks/use-reaction";
import { formatTime, fromPrismaFormat, getFirstName } from "@/lib/helpers";
import { getModelDisplayName } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AnimatedCopyButton } from "@/ui/atoms/animated-copy-button";
import { useTheme } from "next-themes";
import type { MessageSingleton } from "@slipstream/types";
import {
  Button,
  EditIcon,
  ReadAloud as ReadAloudIcon,
  RetryIcon,
  ShareIcon,
  ThumbsDown,
  ThumbsUp
} from "@slipstream/ui";

export function MessageIcons({
  user,
  message,
  isStreaming,
  isMobile,
  locale,
  tz
}: {
  isStreaming: boolean;
  message: MessageSingleton<true>;
  user?: User;
  isMobile: boolean;
  locale: string;
  tz: string;
}) {
  const { resolvedTheme } = useTheme();

  const { handleReaction, isPending, reactionState } = useReaction(message);

  const {
    hydrateFromTtsJob,
    requestTTS,
    currentPlaybackMessageId,
    isGenerating,
    activeMessageId,
    stop
  } = useTTSContext();

  const primerRef = useRef<HTMLAudioElement | null>(null);

  const hasPlayedPrimer = useRef(false);

  useEffect(() => {
    if (primerRef.current) return;
    const el = new Audio("/cassette-shortened.mp3");
    el.volume = 0.1;
    el.preload = "auto";
    el.onended = () => {
      hasPlayedPrimer.current = true;
    };
    primerRef.current = el;

    return () => {
      el.onended = null;
      el.pause();
      primerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (message.ttsJob) {
      hydrateFromTtsJob(message.id, message.ttsJob);
    }
  }, [message.id, message.ttsJob, hydrateFromTtsJob]);

  const isTTSActive =
    currentPlaybackMessageId === message.id ||
    (isGenerating && activeMessageId === message.id);
  // const handleReadAloud = useCallback(() => {
  //   if (isTTSActive) {
  //     stop();
  //   } else {
  //     if (primerRef.current && !hasPlayedPrimer.current) {
  //       void primerRef.current.play().catch(() => {});
  //     }
  //     requestTTS(message.id, message.conversationId);
  //   }

  // }, [isTTSActive, stop, requestTTS, message.id, message.conversationId]);
  const handleReadAloud = useCallback(() => {
    if (isTTSActive) {
      stop();
    } else {
      if (primerRef.current && !hasPlayedPrimer.current) {
        void primerRef.current.play().catch(() => {});
      }
      // hasCachedAudio(message.id);
      requestTTS(message.id, message.conversationId);
    }
  }, [isTTSActive, stop, requestTTS, message.id, message.conversationId]);

  const RxnIcons = useMemo(
    () =>
      [
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
      ] as const,
    [reactionState.liked, reactionState.disliked, handleReaction]
  );

  const actionButtonVariants = useMemo(
    () => ({
      default: cn(
        "size-3 sm:h-4 sm:w-4 p-0 bg-transparent hover:bg-transparent",
        message.senderType === "USER"
          ? "text-primary-foreground/70 hover:text-primary-foreground/90"
          : resolvedTheme === "light"
            ? "text-[#fafafa] hover:text-[#f2f2f2]"
            : ""
      ),
      parent: cn(
        "mt-2 flex items-center justify-between pt-1 text-xs",
        message.senderType === "USER"
          ? "text-foreground/90 [&_svg]:text-foreground/90"
          : resolvedTheme === "light"
            ? "text-[#f2f2f2] hover:text-[#fafafa]"
            : "text-muted-foreground hover:text-foreground"
      ),
      reaction: cn(
        resolvedTheme === "light"
          ? "text-[#f2f2f2] hover:text-[#fafafa]"
          : "text-muted-foreground hover:text-foreground"
      ),
      cpBtn: cn(
        resolvedTheme === "light"
          ? "text-[#f2f2f2] hover:text-[#fafafa]"
          : "text-muted-foreground hover:text-foreground"
      )
    }),
    [message.senderType, resolvedTheme]
  );

  return (
    <div className={actionButtonVariants.parent}>
      {message.senderType === "AI" ? (
        <>
          <div className="flex items-center gap-2">
            {!isMobile && (
              <AnimatedCopyButton
                textToCopy={message.content}
                className={cn(
                  actionButtonVariants.default,
                  actionButtonVariants.cpBtn
                )}
                iconClassName="text-xs"
                disabled={isStreaming === true}
                initialIconSize={12}
                size="icon"
              />
            )}
            {RxnIcons.map(action => (
              <Button
                key={action.id}
                variant="ghost"
                size="icon"
                disabled={isStreaming === true || isPending}
                className={cn(
                  actionButtonVariants.default,
                  "transition-all duration-200",
                  action.isActive
                    ? resolvedTheme === "light"
                      ? "scale-105 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]"
                      : "text-foreground scale-105 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]"
                    : resolvedTheme === "light"
                      ? "text-background/85 hover:text-white"
                      : "text-muted-foreground hover:text-foreground"
                )}
                onClick={action.onClick}>
                <action.icon
                  className={cn(
                    "size-4 transition-all duration-200 sm:size-3",
                    action.isActive && "fill-current"
                  )}
                />
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              disabled={isStreaming === true || (isGenerating && !isTTSActive)}
              className={cn(
                actionButtonVariants.default,
                isTTSActive
                  ? resolvedTheme === "light"
                    ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]"
                    : "text-foreground drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]"
                  : actionButtonVariants.reaction,
                isGenerating &&
                  activeMessageId === message.id &&
                  "animate-pulse"
              )}
              onClick={handleReadAloud}>
              <ReadAloudIcon className="size-4 sm:size-3" />
            </Button>
            {!isMobile && (
              <Button
                variant="ghost"
                size="icon"
                disabled={isStreaming === true || isPending}
                className={cn(
                  actionButtonVariants.default,
                  actionButtonVariants.reaction
                )}
                onClick={() => console.log("share action")}>
                <ShareIcon className="size-3" />
              </Button>
            )}
            {!isMobile && (
              <Button
                variant="ghost"
                size="icon"
                disabled={isStreaming === true || isPending}
                className={cn(
                  actionButtonVariants.default,
                  actionButtonVariants.reaction
                )}
                onClick={() => console.log("try again")}>
                <RetryIcon className="size-3" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>{formatTime(message.createdAt, locale, tz)}</span>
            {message.model && message.provider && (
              <>
                <span>•</span>
                <span className="font-medium">
                  {getModelDisplayName(
                    fromPrismaFormat(message.provider),
                    message.model
                  )}
                </span>
              </>
            )}
            {isMobile && (
              <AnimatedCopyButton
                textToCopy={message.content}
                className={cn(
                  "z-50",
                  actionButtonVariants.default,
                  actionButtonVariants.cpBtn
                )}
                iconClassName="text-xs"
                disabled={isStreaming === true}
                initialIconSize={12}
                size="icon"
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span>{formatTime(message.createdAt, locale, tz)}</span>
            <span>•</span>
            <span className="font-medium">{getFirstName(user?.name)}</span>
          </div>
          <div className="flex items-center gap-2">
            <AnimatedCopyButton
              textToCopy={message.content}
              className={cn(
                "z-50",
                actionButtonVariants.default,
                actionButtonVariants.cpBtn
              )}
              iconClassName="text-xs"
              initialIconSize={12}
              size="icon"
            />
            {!isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className={actionButtonVariants.default}
                onClick={() => console.log("Edit message")}>
                <EditIcon className="size-3" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
