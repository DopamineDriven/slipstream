"use client";

import { useParams } from "next/navigation";
import { useAttachment } from "@/hooks/use-attachment";
import { toCdnUrlConstituents } from "@/lib/helpers";
import { LightboxRoute } from "@/ui/chat/inline-image-gen/lightbox-route";
import type {
  ImageGenOutputSingleton,
  InlineImageGenOutputSingleton
} from "@slipstream/types";

export function ShallowLightbox() {
  const { id } = useParams<{ id: string }>();
  const row = useAttachment(id);
  if (!row?.cdnUrl) return null; // by-id ack not landed yet
  let d:
    ImageGenOutputSingleton<true> | InlineImageGenOutputSingleton<true> | null;
  const { type, ext: format } = toCdnUrlConstituents(row.cdnUrl);
  if (type === "ImageGenOutput") {
    d = row.imageGenOutput;
  } else {
    d = row.inlineImageGenOutput ?? null;
  }
  const src = row.cdnUrl,
    height = row.image?.height ?? d?.height,
    width = row.image?.width ?? d?.width,
    alt = row.id,
    caption = d?.revisedPrompt ?? row.filename ?? undefined;

  if (!width || !height) return null;

  return (
    <LightboxRoute
      image={{
        src,
        width,
        height,
        alt,
        caption,
        format
      }}
    />
  );
}
