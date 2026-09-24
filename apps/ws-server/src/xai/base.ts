import type { PrismaService } from "@/prisma/index.ts";
import type {
  InlinePostImageUploadProps,
  InputReasoningProps
} from "@/xai/responses-types.ts";
import type { DocumentStatus } from "@/xai/types.ts";
import type { ProviderDocState } from "@slipstream/db/enums-node";
import type {
  GrokModelIdUnion,
  InlineImageGenAggProps
} from "@slipstream/types";

export class GrokBaseService {
  constructor(protected prisma: PrismaService) {}
  protected readonly baseUrl = "https://api.x.ai/v1/responses";
  protected readonly baseImgGenUrl = "https://api.x.ai/v1/images/generations";
  protected readonly baseImgEditsUrl = "https://api.x.ai/v1/images/edits";
  protected readonly managementUrl =
    "https://management-api.x.ai/v1/collections";
  protected xaiURI(collection_id: string, file_id: string) {
    return `collections://${collection_id}/files/${file_id}` as const;
  }
  protected xaiToDbState = {
    DOCUMENT_STATUS_FAILED: "FAILED",
    DOCUMENT_STATUS_PROCESSED: "ACTIVE",
    DOCUMENT_STATUS_PROCESSING: "PROCESSING",
    DOCUMENT_STATUS_UNKNOWN: "PENDING"
  } as const satisfies Record<DocumentStatus, ProviderDocState>;

  protected canUseFunctionTools(m: GrokModelIdUnion) {
    return !(
      this.prisma.isGrokMultiAgentModel(m) ||
      this.prisma.isGrokImgModel(m) ||
      this.prisma.isGrokVideoModel(m)
    );
  }

  protected isLocalToolName(s: string) {
    return s === "repo_search" || s === "read_file" || s === "list_directory";
  }

  protected isGrokBuild(m: string) {
    return this.prisma.isGrokBuild(m);
  }

  protected isGrok4Model(m: string) {
    return (
      this.prisma.isGrokModel(m) &&
      !this.prisma.isGrokBuild(m) &&
      !this.prisma.isGrokImgModel(m) &&
      !this.prisma.isGrokVideoModel(m)
    );
  }
  /**
   * keep grok-4.20-multi-agent-0309 to "low" to not spend a fortune on subagents
   *
   *  grok-4.3 defaults to "low" (only grok-4.3 supports "none")
   *
   *  grok-4.5, grok-4.6, and grok-4.7 default to "high"
   */
  protected reasoningByModel(m?: string) {
    if (!m) return;
    if (!this.prisma.isGrokModel(m)) return;
    else if (!this.prisma.isGrokReasoningEffortModel(m)) return;
    else if (m === "grok-4.20-multi-agent-0309") {
      return {
        effort: "low"
      } satisfies InputReasoningProps<"grok-4.20-multi-agent-0309">;
    } else if (m === "grok-4.3") {
      return {
        effort: "low"
      } satisfies InputReasoningProps<"grok-4.3">;
    } else if (m === "grok-4.5") {
      return {
        effort: "high"
      } satisfies InputReasoningProps<"grok-4.5">;
    } else {
      return {
        effort: "xhigh"
      } satisfies InputReasoningProps<"grok-4.6" | "grok-4.7">;
    }
  }

  protected canViewDocs(model: GrokModelIdUnion) {
    return this.isGrok4Model(model) || this.isGrokBuild(model);
  }

  protected inlineImagePostUploadObj({
    cdnUrl,
    conversationId,
    facilitatingModel,
    filename,
    format,
    generatingModel,
    mime,
    kind,
    provider,
    revisedPrompt,
    s3LastModified,
    s3RTHelper,
    seriesId,
    seriesOrdinal,
    specs,
    uploadDuration,
    userId
  }: InlinePostImageUploadProps) {
    return {
      assetType: specs.type,
      audio: null,
      batchId: null,
      bucket: s3RTHelper.bucket,
      cacheControl: s3RTHelper.cacheControl ?? null,
      cdnUrl,
      checksumAlgo: s3RTHelper.checksum?.algo ?? "CRC32",
      checksumSha256: s3RTHelper.checksum?.value ?? null,
      compatCdnUrl: cdnUrl,
      compatExt: specs.format,
      compatKey: s3RTHelper.key,
      compatMime: mime,
      compatReadyAt: null,
      compatS3ObjectId: s3RTHelper.s3ObjectId,
      compatStatus: "ALIASED",
      compatVersionId: s3RTHelper.versionId,
      contentDisposition: s3RTHelper.contentDisposition ?? null,
      contentEncoding: null,
      conversationId,
      deletedAt: null,
      document: null,
      draftId: null,
      etag: s3RTHelper.etag ?? null,
      expiresAt: s3RTHelper.expires,
      ext: format,
      filename,
      key: s3RTHelper.key,
      mime,
      origin: "GENERATED",
      publicUrl: s3RTHelper.publicUrl,
      region: "us-east-1",
      s3LastModified,
      s3ObjectId: s3RTHelper.s3ObjectId,
      seriesId,
      size: specs.byteSize ?? s3RTHelper.size ?? 0,
      sourceUrl: "buffer",
      sseAlgorithm: null,
      sseKmsKeyId: null,
      status: "READY",
      storageClass: s3RTHelper.storageClass ?? null,
      uploadDuration,
      thumbnailKey: null,
      uploadMethod: "SERVER",
      userId,
      versionId: s3RTHelper.versionId,
      image: {
        animated: specs.animated,
        width: specs.width,
        height: specs.height,
        aspectRatio: specs.width / specs.height,
        cameraMake: null,
        cameraModel: null,
        colorSpace: specs.colorSpace,
        colorModel:
          specs.colorModel === "grayscale-alpha"
            ? "grayscale_alpha"
            : specs.colorModel,
        dominantColorHex: null,
        exifDateTimeOriginal: specs.exifDateTimeOriginal
          ? new Date(specs.exifDateTimeOriginal)
          : null,
        format: specs.format,
        frames: specs.frames,
        gpsLat: null,
        gpsLon: null,
        hasAlpha: specs.hasAlpha,
        iccProfile: specs.iccProfile,
        lensModel: null,
        orientation: specs.orientation
      },
      inlineImageGenOutput: {
        ext: format,
        mime,
        facilitatingModel,
        generatingModel,
        width: specs.width,
        height: specs.height,
        kind,
        provider,
        revisedPrompt,
        seriesId,
        seriesOrdinal
      }
    } satisfies InlineImageGenAggProps;
  }
}
