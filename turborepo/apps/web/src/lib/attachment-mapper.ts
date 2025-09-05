import type { AttachmentPreview } from "@/hooks/use-asset-metadata";
import type { AttachmentSingleton } from "@/types/shared";

export type UploadLookup = {
  draftId?: string | null;
  cdnUrl?: string | null;
  publicUrl?: string | null;
  filename?: string | null;
  mime?: string | null;
  size?: number | null;
};

function toAssetType(mime: string | null | undefined): "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" | "UNKNOWN" {
  if (!mime) return "UNKNOWN";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("application/") || mime.startsWith("text/")) return "DOCUMENT";
  return "UNKNOWN";
}

export function buildOptimisticAttachment(
  preview: AttachmentPreview,
  conversationId: string,
  lookup?: UploadLookup
): AttachmentSingleton {
  const filename = (lookup?.filename ?? preview.filename) || null;
  const mime = (lookup?.mime ?? preview.mime) || null;
  const size = typeof (lookup?.size ?? preview.size) === "number" ? Number(lookup?.size ?? preview.size) : null;
  const ext = filename ? (filename.split(".").pop() ?? "").toLowerCase() : null;
  const assetType = toAssetType(mime);

  return {
    id: `draft-${Date.now()}-${Math.random()}`,
    createdAt: new Date(),
    conversationId,
    draftId: lookup?.draftId ?? null,
    messageId: null,
    assetType: assetType,
    cdnUrl: lookup?.cdnUrl ?? null,
    publicUrl: lookup?.publicUrl ?? null,
    versionId: null,
    filename,
    ext,
    mime,
    size
  } satisfies AttachmentSingleton;
}

