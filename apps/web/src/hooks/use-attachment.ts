"use client";

import { useSyncExternalStore } from "react";
import { useAttachmentRegistryCtx } from "@/context/attachment-registry-context";

/**
 * the row, or undefined until the mirror lands
 *
 * re-renders only when this row changes
 */
export function useAttachment(attachmentId: string) {
  const { store } = useAttachmentRegistryCtx();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getAttachment(attachmentId),
    store.getServerAttachment
  );
}
