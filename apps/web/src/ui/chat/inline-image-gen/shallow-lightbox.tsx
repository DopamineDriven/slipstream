"use client";

import { useParams } from "next/navigation";
import { useAttachment } from "@/hooks/use-attachment";
import { cdnUrlHandler } from "@/lib/helpers";
import { LightboxRoute } from "@/ui/chat/inline-image-gen/lightbox-route";
import type {
  ImageGenOutputSingleton,
  InlineImageGenOutputSingleton
} from "@slipstream/types";
import type {InlineImageGenOutputModel} from "@slipstream/db/node/generated/models";

export function ShallowLightbox() {
  const { id } = useParams<{ id: string }>();
  const row = useAttachment(id);
  if (!row?.cdnUrl) return null; // by-id ack not landed yet

  const u = cdnUrlHandler(row.cdnUrl);

  if (u.senderType === "AI") {
    //
    u.sId;
  } else {
    if (u.compatStatus === "ACTIVE") {
      //
      u.attachmentId;
    } else {
      //
      u.userId;
    }
  }
  let d:
    ImageGenOutputSingleton<true> | InlineImageGenOutputSingleton<true> | null;
  const { type, ext: format } = cdnUrlHandler(row.cdnUrl);
  if (type === "ImageGenOutput") {
    d = row.imageGenOutput;
  } else if (type === "InlineImageGenOutput") {
    d = row.inlineImageGenOutput ?? null;
  } else {
    d = null;
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
