"use client";

import type { RxnUnion, UIMessage } from "@/types/shared";
import { useState, useTransition } from "react";
import { rxnAction } from "@/app/actions/message-actions";

export function useReaction(message: UIMessage) {
  const [reactionState, setReactionState] = useState({
    liked: message.liked ?? false,
    disliked: message.disliked ?? false
  });

  const [isPending, startTransition] = useTransition();

  const handleReaction = (currentAction: "like" | "dislike") => {
    startTransition(async () => {
      let action: RxnUnion, optimisticUpdate: typeof reactionState;

      if (currentAction === "like") {
        if (reactionState.liked) {
          action = "unliked";
          optimisticUpdate = { ...reactionState, liked: false };
        } else if (reactionState.disliked) {
          action = "switch-to-liked";
          optimisticUpdate = { liked: true, disliked: false };
        } else {
          action = "liked";
          optimisticUpdate = {
            liked: true,
            disliked: false
          };
        }
      } else {
        if (reactionState.disliked) {
          action = "undisliked";
          optimisticUpdate = { ...reactionState, disliked: false };
        } else if (reactionState.liked) {
          action = "switch-to-disliked";
          optimisticUpdate = { liked: false, disliked: true };
        } else {
          action = "disliked";
          optimisticUpdate = {
            disliked: true,
            liked: false
          };
        }
      }

      const previousState = reactionState;
      setReactionState(optimisticUpdate); // optimistic update

      try {
        const serverRes = await rxnAction(action, message.id);

        setReactionState({
          liked: serverRes.liked ?? false,
          disliked: serverRes.disliked ?? false
        });
        // TODO: Update parent component with fresh message data
        // create an onMessageUpdate callback
        // onMessageUpdate?.(serverRes)
      } catch (error) {
        setReactionState(previousState); // Revert on error
        console.error("Failed to update reaction:", error);
        // TODO: Show user-friendly error
        // toast.error('Failed to update reaction. Please try again.')
      }
    });
  };

  return {
    reactionState,
    handleReaction,
    isPending
  };
}
