"use client";

import { useMemo } from "react";
import { useCookiesCtx } from "@/context/cookie-context";
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
                  `transition-colors`,
                  action.isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                  resolvedTheme === "light" && action.isActive
                    ? "text-white"
                    : actionButtonVariants.reaction
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
                    ? "text-white"
                    : actionButtonVariants.reaction
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
            <span className="font-medium">{getFirstName(user?.name)}</span>
          </div>
          <div className="items-center gap-2 md:flex">
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
