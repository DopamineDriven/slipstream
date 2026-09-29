"use client";

import { useSyncExternalStore } from "react";
import { useAttachmentRegistryCtx } from "@/context/attachment-registry-context";

/** a bucket, createdAt asc; "new-chat" is a valid key */
export function useConversationAttachments(bucketKey: string) {
  const { store } = useAttachmentRegistryCtx();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getBucket(bucketKey),
    store.getServerBucket
  );
}
