"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCookiesCtx } from "@/context/cookie-context";
import { useTTSContext } from "@/context/tts-context";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useReaction } from "@/hooks/use-reaction";
import { formatTime, getFirstName } from "@/lib/helpers";
import { getModelDisplayName } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AnimatedCopyButton } from "@/ui/atoms/animated-copy-button";
import { User } from "@/utils/auth-client";
import { useTheme } from "next-themes";
import type {
  AllModelsUnion,
  MessageSingleton,
  Provider
} from "@slipstream/types";
import {
  Button,
  EditIcon,
  ReadAloud as ReadAloudIcon,
  RetryIcon,
  ShareIcon as Share,
  ThumbsDown,
  ThumbsUp
} from "@slipstream/ui";

const primerAudio = "/cassette-shortened.mp3";

export function MessageIcons({
  user,
  message,
  isStreaming
}: {
  isStreaming: boolean;
  message: MessageSingleton<true>;
  user?: User;
}) {
  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const { handleReaction, isPending, reactionState } = useReaction(message);
  const tts = useTTSContext();

  const isTTSActive =
    tts.currentPlaybackMessageId === message.id ||
    (tts.isGenerating && tts.activeMessageId === message.id);

  const primerRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedPrimer = useRef(false);

  useEffect(() => {
    const el = new Audio(primerAudio);
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

  const handleReadAloud = useCallback(() => {
    if (isTTSActive) {
      tts.stop();
    } else {
      if (primerRef.current && !hasPlayedPrimer.current) {
        void primerRef.current.play().catch(() => {});
      }
      tts.requestTTS(message.id, message.conversationId);
    }
  }, [isTTSActive, tts, message.id, message.conversationId]);




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

  const { get } = useCookiesCtx();

  const tz = get("tz") ?? "america/chicago";

  const locale = get("locale") ?? "en-US";

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
          <div
            className={cn(isMobile ? "hidden" : "flex", "items-center gap-2")}>
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
                    "size-3 transition-all duration-200",
                    action.isActive && "fill-current"
                  )}
                />
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              disabled={
                isStreaming === true || (tts.isGenerating && !isTTSActive)
              }
              className={cn(
                actionButtonVariants.default,
                isTTSActive
                  ? resolvedTheme === "light"
                    ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]"
                    : "text-foreground drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]"
                  : actionButtonVariants.reaction,
                tts.isGenerating &&
                  tts.activeMessageId === message.id &&
                  "animate-pulse"
              )}
              onClick={handleReadAloud}>
              <ReadAloudIcon className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={isStreaming === true || isPending}
              className={cn(
                actionButtonVariants.default,
                actionButtonVariants.reaction
              )}
              onClick={() => console.log("share action")}>
              <Share className="size-3" />
            </Button>
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
            <span className="font-medium">{getFirstName(user?.name)}</span>
          </div>
          <div
            className={cn("items-center gap-2", isMobile ? "hidden" : "flex")}>
            <AnimatedCopyButton
              textToCopy={message.content}
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
  );
}
