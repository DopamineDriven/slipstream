import type { AttachmentPreview } from "@/hooks/use-asset-metadata";
import type { AttachmentSingleton } from "@slipstream/types";
import { parseDraftId } from "@slipstream/types";

export type UploadLookup = {
  draftId?: string | null;
  cdnUrl?: string | null;
  publicUrl?: string | null;
  filename?: string | null;
  mime?: string | null;
  size?: number | null;
};

function toAssetType(
  mime: string | null | undefined
): "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" | "UNKNOWN" {
  if (!mime) return "UNKNOWN";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("application/") || mime.startsWith("text/"))
    return "DOCUMENT";
  return "UNKNOWN";
}

/**
 * Extracts seriesId from a generated asset's filename
 * Example: 1761729297502-ig_0d3912d56a96ce82016901dab7fa2c81a1886deddf5b1edfd1-3.png
 * Returns: ig_0d3912d56a96ce82016901dab7fa2c81a1886deddf5b1edfd1
 */
function extractSeriesIdFromGeneratedFilename(filename: string): string | null {
  try {
    // Remove file extension first
    const nameWithoutExt = filename.split(".")[0];
    if (!nameWithoutExt) return null;

    // Pattern: {timestamp}-{seriesId}-{index}
    // Split at first dash to remove timestamp
    const [_timestamp, ...rest] = nameWithoutExt.split("-");
    if (!rest.length) return null;

    // Join back and split from the end to remove index
    const withoutTimestamp = rest.join("-");
    const lastDashIndex = withoutTimestamp.lastIndexOf("-");

    if (lastDashIndex === -1) return null;

    // Extract seriesId (everything except the last segment which is the index)
    const seriesId = withoutTimestamp.substring(0, lastDashIndex);

    // Validate it looks like a seriesId (should contain underscore)
    if (seriesId.includes("_")) {
      return seriesId;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts S3 bucket, key, and determines if it's a generated asset from CDN URL
 * Examples:
 * - https://assets.aicoalesce.com/upload/userId/filename.jpg -> ws-server-assets-prod, false
 * - https://assets-dev.aicoalesce.com/upload/userId/filename.jpg -> ws-server-assets-dev, false
 * - https://assets.aicoalesce.com/generated/userId/filename.png -> py-gen-assets-prod, true
 * - https://assets-dev.aicoalesce.com/generated/userId/filename.png -> py-gen-assets-dev, true
 */
function extractS3InfoFromCdnUrl(cdnUrl: string | null): {
  bucket: string;
  key: string;
  isGenerated: boolean;
  seriesId: string | null;
} {
  if (!cdnUrl) {
    return { bucket: "", key: "", isGenerated: false, seriesId: null };
  }

  try {
    const url = new URL(cdnUrl);
    // Extract the path without leading slash
    const key = url.pathname.substring(1);

    // Check if it's a dev environment from the CDN URL
    const isDev = url.hostname.includes("assets-dev");

    // Determine bucket and type based on path prefix
    let bucket = "";
    let isGenerated = false;
    let seriesId: string | null = null;

    if (key.startsWith("upload/")) {
      bucket = isDev ? "ws-server-assets-dev" : "ws-server-assets-prod";
      isGenerated = false;
    } else if (key.startsWith("generated/")) {
      bucket = isDev ? "py-gen-assets-dev" : "py-gen-assets-prod";
      isGenerated = true;

      // Extract seriesId from the filename if it's a generated asset
      const pathParts = key.split("/");
      const filename = pathParts[pathParts.length - 1];
      if (filename) {
        seriesId = extractSeriesIdFromGeneratedFilename(filename);
      }
    }

    return { bucket, key, isGenerated, seriesId };
  } catch {
    return { bucket: "", key: "", isGenerated: false, seriesId: null };
  }
}

/**
 * Builds a complete AttachmentSingleton<true> for optimistic UI updates
 * Fills in required fields with sensible defaults for attachments that haven't been fully uploaded yet
 * Intelligently detects generated assets vs uploaded assets from the CDN URL
 */
export function buildOptimisticAttachment(
  preview: AttachmentPreview,
  conversationId: string,
  lookup?: UploadLookup,
  fallbackUserId?: string
): AttachmentSingleton<true> {
  const filename = (lookup?.filename ?? preview.filename) || "file";
  const mime = (lookup?.mime ?? preview.mime) || "application/octet-stream";
  const size =
    typeof (lookup?.size ?? preview.size) === "number"
      ? Number(lookup?.size ?? preview.size)
      : 0;
  const ext = filename ? (filename.split(".").pop() ?? "").toLowerCase() : null;
  const assetType = toAssetType(mime);

  // Extract batchId and userId from draftId if available
  let batchId: string | null = null;
  let userId = fallbackUserId ?? "pending";

  if (lookup?.draftId) {
    try {
      const [extractedUserId, , extractedBatchId] = parseDraftId(
        lookup.draftId
      );
      userId = extractedUserId;
      batchId = extractedBatchId;
    } catch {
      // Invalid draftId format, use fallbacks
    }
  }

  // Extract S3 info and detect if it's a generated asset
  const { bucket, key, isGenerated, seriesId } = extractS3InfoFromCdnUrl(
    lookup?.cdnUrl ?? null
  );

  // Determine origin and upload method based on whether it's generated
  const origin = isGenerated ? "GENERATED" : "UPLOAD";
  const uploadMethod = isGenerated ? "GENERATED" : "PRESIGNED";

  // For generated assets, generationGroupId might be derivable from seriesId
  // The seriesId typically contains the generation group ID
  const generationGroupId =
    isGenerated && seriesId ? `resp_${seriesId.replace("ig_", "")}` : null;

  const now = new Date();

  return {
    // Required identifiers
    id: `draft-${Date.now()}-${Math.random()}`,
    conversationId,
    draftId: lookup?.draftId ?? null,
    batchId,
    userId,
    messageId: null,
    s3ObjectId: null,
    seriesId: seriesId ?? "",
    // Status fields
    origin: origin as "UPLOAD" | "GENERATED",
    status: "UPLOADING" as const, // Optimistic attachments are uploading
    uploadMethod: uploadMethod as "PRESIGNED" | "GENERATED",
    uploadDuration: null,

    // Asset information
    assetType,
    filename,
    ext,
    mime,
    size,

    // URLs
    cdnUrl: lookup?.cdnUrl ?? null,
    publicUrl: lookup?.publicUrl ?? null,
    sourceUrl: null,
    thumbnailKey: null,

    // Compatibility fields (mirror main fields for optimistic)
    compatMime: mime,
    compatExt: ext,
    compatVersionId: null,
    compatKey: key || null,
    compatS3ObjectId: null,
    compatStatus: "PENDING" as const,
    compatReadyAt: null,
    compatCdnUrl: lookup?.cdnUrl ?? null,

    // S3 metadata - derive what we can
    bucket,
    key,
    versionId: null, // Can't derive from CDN URL
    region: "us-east-1", // Always us-east-1 as you mentioned
    cacheControl: null,
    contentDisposition: null,
    contentEncoding: null,
    expiresAt: null,
    etag: null,
    checksumAlgo: "SHA256" as const, // Default
    checksumSha256: null,
    storageClass: null,
    sseAlgorithm: null,
    sseKmsKeyId: null,
    s3LastModified: null,

    // Timestamps
    createdAt: now,
    updatedAt: now,
    deletedAt: null,

    // Optional nested data
    generationGroupId, // Set for generated assets (seriesId is extracted but used in imageGenOutput)
    image: null,
    document: null,
    imageGenOutput: null
  };
}
