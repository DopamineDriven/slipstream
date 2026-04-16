"use client";

import { useState, useTransition } from "react";
import { rxnAction } from "@/app/actions/message-actions";
import { rxnObject } from "@/lib/rxn-object";
import type { MessageSingleton } from "@slipstream/types";

export function useReaction(message: MessageSingleton<true>) {
  const [reactionState, setReactionState] = useState({
    liked: message.liked ?? false,
    disliked: message.disliked ?? false
  });

  const [isPending, startTransition] = useTransition();

  const handleReaction = (currentAction: "like" | "dislike") => {
      let action: keyof typeof rxnObject, optimisticUpdate: typeof reactionState;

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
    startTransition(async () => {
      try {
        const serverRes = await rxnAction(action, message.id);

        setReactionState({
          liked: serverRes.liked ?? false,
          disliked: serverRes.disliked ?? false
        });
      } catch (error) {
        setReactionState(previousState); // Revert on error
        console.error("Failed to update reaction:", error);
      }
    });
  };

  return {
    reactionState,
    handleReaction,
    isPending
  };
}
