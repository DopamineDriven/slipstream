"use client";

import type { RouterTransition } from "@/navigation/transition-store";
import { Suspense, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAttachmentRegistryCtx } from "@/context/attachment-registry-context";
import { attachmentIdFromUrl, conversationIdFromUrl } from "@/navigation/routes";
import {
  getLatestRouterTransition,
  subscribeRouterTransitionStart
} from "@/navigation/transition-store";

/**
 * Two childless leaves inside AttachmentRegistryProvider. Route hooks live
 * here, never in the provider, so its context value is stable across
 * navigations and consumers never re-render for a route change.
 */
export function NavigationSync() {
  return (
    <>
      <TransitionWarmer />
      <Suspense fallback={null}>
        <CommittedRouteWarmer />
      </Suspense>
    </>
  );
}

/**
 * Pre-commit. No route hooks, so it never suspends: it mounts with the shell
 * and the subscription is live before any route data streams in. A transition
 * can start before this effect runs (a click during hydration) — replay the
 * latest one so it is not lost.
 */
function TransitionWarmer() {
  const { warm, warmAttachment } = useAttachmentRegistryCtx();
  useEffect(() => {
    const onTransition = (transition: RouterTransition) => {
      const conversationId = conversationIdFromUrl(transition.url);
      if (conversationId !== undefined) warm(conversationId);
      const attachmentId = attachmentIdFromUrl(transition.url);
      if (attachmentId !== undefined) warmAttachment(attachmentId);
    };
    const latest = getLatestRouterTransition();
    if (latest !== undefined) onTransition(latest);
    return subscribeRouterTransitionStart(onTransition);
  }, [warm, warmAttachment]);
  return null;
}

/**
 * Committed truth. useParams() already reflects the "/" → "/chat/home"
 * rewrite; it is a dynamic read, hence its own Suspense boundary above. Also
 * the only warm a hard load gets, since a hard load has no transition.
 */
function CommittedRouteWarmer() {
  const { warm, warmAttachment } = useAttachmentRegistryCtx();
  const params = useParams<{ conversationId?: string; id?: string }>();
  const conversationId = params.conversationId;
  const attachmentId = params.id;
  useEffect(() => {
    if (conversationId !== undefined) warm(conversationId);
  }, [conversationId, warm]);
  useEffect(() => {
    if (attachmentId !== undefined) warmAttachment(attachmentId);
  }, [attachmentId, warmAttachment]);
  return null;
}
