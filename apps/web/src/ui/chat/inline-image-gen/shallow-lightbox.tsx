"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useAttachment } from "@/hooks/use-attachment";
import { toAssetView } from "@/lib/asset-view";
import { LightboxRoute } from "@/ui/chat/inline-image-gen/lightbox-route";

/** The intercept: the row from the mirror through the one adapter, nothing else. */
export function ShallowLightbox() {
  const { id } = useParams<{ id: string }>();
  const row = useAttachment(id);
  const asset = useMemo(() => (row ? toAssetView(row) : null), [row]);
  // by-id ack not landed yet, or nothing to show for this row
  if (!asset) return null;
  return <LightboxRoute asset={asset} />;
}
