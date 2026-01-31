import type {
  UpdateAttachment,
  UpdateAttachmentCompatProps,
  UpdateAttachmentMetadata
} from "@/types/index.ts";
import type { ExpandedDocSpecs, ExpandedImgSpecs } from "@d0paminedriven/fs";
import { ExtractService } from "@/extract/index.ts";
import { PrismaAttachmentProviderService } from "@/prisma/attachment-provider.ts";
import type {
  $Enums,
  Attachment,
  AudioMetadata,
  DocumentMetadata,
  ImageMetadata,
  VideoMetadata
} from "@slipstream/db/node/generated/client";
import type { CTR, Rm, RTC, XOR } from "@slipstream/types";
import { PrismaDbService } from "@slipstream/db/factory";

export class PrismaAttachmentService extends PrismaAttachmentProviderService {
  constructor(prisma: PrismaDbService, extractor: ExtractService, isProd: boolean) {
    super(prisma, extractor, isProd);
  }

  async createAttachment({
    conversationId,
    ...data
  }: CTR<Partial<Attachment>, "userId" | "bucket" | "key"> &
    XOR<
      XOR<
        { image?: Partial<ImageMetadata> },
        { document?: Partial<DocumentMetadata> }
      >,
      XOR<
        { audio?: Partial<AudioMetadata> },
        { video?: Partial<VideoMetadata> }
      >
    >) {
    const mime = data.mime ?? "application/octet-stream";
    const assetType = data.assetType ?? "UNKNOWN";
    const extension = this.contentTypeToExt(mime) ?? data.ext ?? "bin";
    if (this.isSupportedType(assetType, extension)) {
      if (assetType === "IMAGE" && data.image) {
        const { image } = data;
        return await this.prismaClient.attachment.create({
          include: { image: true },
          data: {
            ...data,
            assetType,
            document: undefined,
            audio: undefined,
            video: undefined,
            conversationId: this.convoId(conversationId),
            image: {
              create: {
                ...image,
                aspectRatio: image.width ?? 1 / (image?.height ?? 1),
                width: image.width ?? 0,
                height: image.height ?? 0
              }
            }
          }
        });
      } else if (assetType === "DOCUMENT" && data.document) {
        const { document, image: _image } = data;
        return await this.prismaClient.attachment.create({
          data: {
            ...data,
            assetType,
            image: undefined,
            video: undefined,
            audio: undefined,
            conversationId: this.convoId(conversationId),
            document: {
              create: {
                format: document?.format ?? "application/pdf",
                ...document
              }
            }
          }
        });
      } else if (assetType === "AUDIO" && data.audio) {
        const {
          audio,
          video: _video,
          document: _document,
          image: _image
        } = data;
        return await this.prismaClient.attachment.create({
          data: {
            ...data,
            assetType,
            image: undefined,
            video: undefined,
            document: undefined,
            conversationId: this.convoId(conversationId),
            audio: {
              create: {
                format: audio?.format ?? "audio/mpeg",
                duration: audio?.duration ?? 0,
                ...data.audio
              }
            }
          }
        });
      } else if (assetType === "VIDEO" && data.video) {
        const {
          video,
          audio: _audio,
          document: _document,
          image: _image
        } = data;
        return await this.prismaClient.attachment.create({
          data: {
            ...data,
            assetType,
            image: undefined,
            audio: undefined,
            document: undefined,
            conversationId: this.convoId(conversationId),
            video: {
              create: {
                format: video?.format ?? "video/mp4",
                duration: video?.duration ?? 0,
                width: video.width ?? 0,
                height: video.height ?? 0,
                ...data.video
              }
            }
          }
        });
      }
    }
    return await this.prismaClient.attachment.create({
      data: {
        ...data,
        document: undefined,
        video: undefined,
        audio: undefined,
        image: undefined,
        conversationId: this.convoId(conversationId)
      }
    });
  }

  /**
   * Update an attachment record
   */
  async updateAttachment({
    metadata,
    ...att
  }: {
    data: UpdateAttachment;
    metadata?: UpdateAttachmentMetadata;
  }) {
    const { data } = att;

    const { conversationId, ...rest } = data;

    return await this.prismaClient.attachment.update({
      where: {
        id: rest.id
      },
      include: { image: true, document: true },
      data: {
        ...rest,
        image:
          metadata?.type === "IMAGE" && metadata.img
            ? {
                upsert: {
                  where: { attachmentId: rest.id },
                  create: { ...metadata.img },
                  update: { ...metadata.img }
                }
              }
            : undefined,
        document:
          metadata?.type === "DOCUMENT" && metadata.doc
            ? {
                upsert: {
                  where: { attachmentId: rest.id },
                  create: { ...metadata.doc },
                  update: { ...metadata.doc }
                }
              }
            : undefined,
        conversationId: this.convoId(conversationId)
      }
    });
  }

  /**
   * Get attachment by ID
   * [string,string,string] -> [bucket, key, versionId]
   */
  async getAttachment(
    props: XOR<[string, string, string], string>
  ): Promise<Attachment | null> {
    if (!Array.isArray(props)) {
      return await this.prismaClient.attachment.findUnique({
        where: { id: props }
      });
    }
    return await this.prismaClient.attachment.findUnique({
      where: {
        s3ObjectId: `s3://${props[0]}/${props[1]}#${props[2] ?? "nov"}`
      }
    });
  }

  /**
   * Get attachments by convoId
   */
  async getConversationAttachments(conversationId: string) {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: { attachments: { orderBy: { createdAt: "desc" } } }
    });
  }

  /**
   * Get attachments by messageId
   */
  async getMessageAttachments(messageId: string) {
    return await this.prismaClient.message.findUnique({
      where: { id: messageId },
      include: { attachments: { orderBy: { createdAt: "desc" } } }
    });
  }

  /**
   * Hard delete old soft-deleted attachments (cleanup job)
   */
  async purgeDeletedAttachments(daysOld = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const result = await this.prismaClient.attachment.deleteMany({
      where: {
        deletedAt: {
          gte: cutoffDate
        }
      }
    });

    return result.count;
  }

  /**
   * Get user's total storage usage
   */
  async getUserStorageUsage(userId: string): Promise<{
    totalSize: bigint;
    fileCount: number;
    byOrigin: Record<string, { size: bigint; count: number }>;
  }> {
    const attachments = await this.prismaClient.attachment.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { not: "DELETED" }
      },
      select: {
        size: true,
        origin: true
      }
    });

    const byOrigin: Record<
      $Enums.AssetOrigin,
      { size: bigint; count: number }
    > = {
      GENERATED: { size: 0n, count: 0 },
      IMPORTED: { size: 0n, count: 0 },
      PASTED: { size: 0n, count: 0 },
      REMOTE: { size: 0n, count: 0 },
      SCRAPED: { size: 0n, count: 0 },
      SCREENSHOT: { size: 0n, count: 0 },
      UPLOAD: { size: 0n, count: 0 }
    };
    let totalSize = 0n;

    for (const attachment of attachments) {
      const size = attachment.size ?? 0n;
      totalSize += size;

      if (!byOrigin[attachment.origin]) {
        byOrigin[attachment.origin] = { size: 0n, count: 0 };
      }
      byOrigin[attachment.origin].size += size;
      byOrigin[attachment.origin].count++;
    }

    return {
      totalSize,
      fileCount: attachments.length,
      byOrigin
    };
  }

  async createBatchedAttachments({
    conversationId,
    ...data
  }: CTR<
    Rm<RTC<Attachment>, "id">,
    "bucket" | "key" | "userId" | "versionId" | "s3ObjectId"
  >) {
    return await this.prismaClient.attachment.createManyAndReturn({
      data: { ...data, conversationId: conversationId ?? "new-chat" },
      skipDuplicates: true,
      select: {
        id: true,
        bucket: true,
        key: true,
        createdAt: true,
        conversationId: true,
        sourceUrl: true,
        mime: true,
        s3ObjectId: true,
        versionId: true,
        cdnUrl: true,
        etag: true,
        ext: true,
        status: true,
        size: true,
        messageId: true,
        userId: true
      }
    });
  }

  /**
   * Copy attachment to another conversation
   * attachmentId can be id | [bucket,key,conversationId] -> [string,string,string]
   */
  async copyAttachment(
    attachmentId: XOR<string, [string, string, string]>,
    targetConversationId: string,
    userId: string
  ) {
    return await this.prismaClient.$transaction(async tx => {
      const source = await this.getAttachment(attachmentId);
      if (!source) {
        throw new Error("Source attachment not found");
      }

      if (source.userId !== userId) {
        throw new Error("Unauthorized to copy this attachment");
      }
      const {
        s3ObjectId,
        conversationId: _oldConvId,
        messageId: _oldMsgId,
        id: _oldId,
        ...rest
      } = source;

      return await tx.attachment.create({
        data: { s3ObjectId, conversationId: targetConversationId, ...rest }
      });
    });
  }

  /**
   * Get storage statistics for a conversation
   */
  public async getConversationStorageStats(conversationId: string): Promise<{
    totalSize: bigint;
    fileCount: number;
    byType: Record<$Enums.AssetOrigin, { size: bigint; count: number }>;
    oldestAttachment?: Date;
    newestAttachment?: Date;
  }> {
    const { attachments } =
      await this.prismaClient.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: {
          attachments: {
            orderBy: { createdAt: "asc" },
            where: { status: { not: "DELETED" } },
            select: {
              size: true,
              mime: true,
              sourceUrl: true,
              cdnUrl: true,
              ext: true,
              createdAt: true,
              uploadMethod: true
            }
          }
        }
      });

    const byType: Record<string, { size: bigint; count: number }> = {};
    let totalSize = 0n;

    for (const attachment of attachments) {
      if (attachment.size !== null) {
        totalSize += attachment.size;
      }
      const type = this.getTopLevelMime(
        attachment.mime as keyof typeof this.mimeToExt
      );

      if (!(type in byType)) {
        byType[type] = { size: 0n, count: 0 };
      }
      if (
        byType &&
        type in byType &&
        byType[type]?.size &&
        byType[type]?.count
      ) {
        byType[type].size += totalSize;
        byType[type].count++;
      }
    }

    return {
      totalSize,
      fileCount: attachments.length,
      byType,
      oldestAttachment: attachments[0]?.createdAt,
      newestAttachment: attachments[attachments.length - 1]?.createdAt
    };
  }

  public async findUniqueAttachment(attachmentId: string) {
    return await this.prismaClient.attachment.findUnique({
      where: { id: attachmentId }
    });
  }

  public async updateAttachmentCompat({
    attachmentId,
    compatCdnUrl,
    compatKey,
    compatReadyAt,
    compatStatus,
    compatExt,
    compatMime,
    compatS3ObjectId,
    compatVersionId
  }: UpdateAttachmentCompatProps) {
    const getMeta = (await this.extractor.extractRemote(
      compatCdnUrl,
      4096 * 96
    )) as ExpandedDocSpecs;
    return await this.prismaClient.attachment.update({
      where: { id: attachmentId },
      data: {
        compatCdnUrl,
        compatStatus,
        compatReadyAt,
        compatKey,
        compatExt,
        compatMime,
        compatVersionId,
        compatS3ObjectId,
        document: {
          upsert: {
            where: { attachmentId },
            create: {
              format: getMeta.format ?? "pdf",
              pageCount: getMeta.pageCount,
              isLinearized: getMeta.isLinearized,
              pdfVersion: getMeta.pdfVersion,
              isEncrypted: getMeta.isEncrypted ?? undefined,
              isSearchable: getMeta.isSearchable ?? undefined,
              encoding: getMeta.encoding,
              author: getMeta.author,
              keywords: getMeta.keywords ?? undefined,
              textPreview: getMeta.textPreview,
              language: getMeta.language,
              lineCount: getMeta.lineCount,
              subject: getMeta.subject,
              wordCount: getMeta.wordCount,
              createdAt: getMeta.createdDate ?? undefined
            },
            update: {
              format: getMeta.format ?? "pdf",
              pageCount: getMeta.pageCount,
              isLinearized: getMeta.isLinearized,
              pdfVersion: getMeta.pdfVersion,
              isEncrypted: getMeta.isEncrypted ?? undefined,
              isSearchable: getMeta.isSearchable ?? undefined,
              encoding: getMeta.encoding,
              author: getMeta.author,
              keywords: getMeta.keywords ?? undefined,
              textPreview: getMeta.textPreview,
              language: getMeta.language,
              lineCount: getMeta.lineCount,
              subject: getMeta.subject,
              wordCount: getMeta.wordCount,
              createdAt: getMeta.createdDate ?? undefined
            }
          }
        }
      }
    });
  }

  public async updateImgAttachmentCompat({
    attachmentId,
    compatCdnUrl,
    compatKey,
    compatReadyAt,
    compatStatus,
    compatExt,
    compatMime,
    compatS3ObjectId,
    checksumSha256,
    checksumAlgo,
    compatVersionId,
    cacheControl,
    contentDisposition,
    s3LastModified
  }: UpdateAttachmentCompatProps & {
    cacheControl?: string | null;
    contentDisposition?: string | null;
    s3LastModified?: string | Date | null;
    checksumAlgo?: $Enums.ChecksumAlgo;
    checksumSha256?: string | null;
  }) {
    const meta = (await this.extractor.extractRemote(
      compatCdnUrl,
      4096 * 32
    )) as ExpandedImgSpecs;
    return await this.prismaClient.attachment.update({
      where: { id: attachmentId },
      data: {
        compatCdnUrl,
        compatStatus,
        compatReadyAt,
        compatKey,
        compatExt,
        compatMime,
        compatVersionId,
        compatS3ObjectId,
        checksumAlgo,
        checksumSha256,
        cacheControl,
        contentDisposition,
        s3LastModified,
        size: meta.byteSize ? BigInt(meta.byteSize) : undefined,
        image: {
          upsert: {
            where: { attachmentId },
            update: {
              height: meta.height,
              width: meta.width,
              animated: meta.animated,
              aspectRatio: meta.aspectRatio,
              colorModel:
                meta.colorModel === "grayscale-alpha"
                  ? "grayscale_alpha"
                  : meta.colorModel,
              colorSpace: meta.colorSpace,
              format: meta.format,
              exifDateTimeOriginal: meta.exifDateTimeOriginal,
              frames: meta.frames,
              hasAlpha: meta.hasAlpha,
              iccProfile: meta.iccProfile,
              orientation: meta.orientation
            },
            create: {
              height: meta.height,
              width: meta.width,
              animated: meta.animated,
              aspectRatio: meta.aspectRatio,
              colorModel:
                meta.colorModel === "grayscale-alpha"
                  ? "grayscale_alpha"
                  : meta.colorModel,
              colorSpace: meta.colorSpace,
              format: meta.format,
              exifDateTimeOriginal: meta.exifDateTimeOriginal,
              frames: meta.frames,
              hasAlpha: meta.hasAlpha,
              iccProfile: meta.iccProfile,
              orientation: meta.orientation
            }
          }
        }
      }
    });
  }
}
