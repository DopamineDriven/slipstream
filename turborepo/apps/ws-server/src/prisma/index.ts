import type { UserData } from "@/types/index.ts";
import { Attachment, Prisma, PrismaClient } from "@/generated/client/client.ts";
import { AssetOrigin, SenderType } from "@/generated/client/enums.ts";
import { ModelService } from "@/models/index.ts";
import { Fs } from "@d0paminedriven/fs";
import { Exact, InputJsonValue, JsonValue } from "@prisma/client/runtime/library";
import { withAccelerate } from "@prisma/extension-accelerate";
import * as dotenv from "dotenv";
import type {
  AIChatRequest,
  AIChatResponse,
  CTR,
  Providers,
  Rm,
  RTC,
  XOR
} from "@t3-chat-clone/types";
import { EncryptionService } from "@t3-chat-clone/encryption";
import { AttachmentWhereUniqueInput } from "@/generated/client/models.ts";

dotenv.config({ quiet: true });
export const prismaClient = new PrismaClient().$extends(withAccelerate());

export type InferTopLevelMime<T extends string> =
  T extends `${infer X}/${string}` ? InferTopLevelMime<X> : T;

export type PrismaClientWithAccelerate = typeof prismaClient;

export class PrismaService extends ModelService {
  private encryption: EncryptionService;
  constructor(
    public prismaClient: PrismaClientWithAccelerate,
    public fs: Fs
  ) {
    super();
    this.encryption = new EncryptionService(process.env.ENCRYPTION_KEY);
  }

  public async getAndValidateUserSessionByEmail(email: string) {
    const res = await this.prismaClient.user.findUnique({
      where: { email },
      include: { sessions: true }
      // cacheStrategy: { ttl: 60, swr: 3600 }
    });
    const id = res?.id ?? "";
    const sesh = res?.sessions.sort(
      (a, b) => b.expires.getTime() - a.expires.getTime()
    );
    let isValid = false;
    if (sesh?.[0]) {
      isValid = sesh?.[0].expires.getTime() > new Date(Date.now()).getTime();
    }
    return {
      userId: id,
      isValid
    };
  }
  private handleLatLng(latlng?: string) {
    const [lat, lng] = latlng
      ? (latlng?.split(",")?.map(p => {
          return Number.parseFloat(p);
        }) as [number, number])
      : [47.7749, -122.4194];
    return [lat, lng] as const;
  }
  public async updateProfile({
    city,
    country,
    latlng,
    region,
    tz,
    postalCode,
    userId
  }: { [P in keyof UserData]-?: UserData[P] } & { userId: string }) {
    const [lat, lng] = this.handleLatLng(latlng); // formatted `${lat},${lng}` in the cookie value for the key latlng
    await this.prismaClient.profile.upsert({
      where: { userId },
      create: {
        city,
        country,
        userId: userId,
        timezone: tz,
        region,
        postalCode,
        lat,
        lng
      },
      update: {
        city,
        country,
        region,
        userId,
        postalCode,
        timezone: tz,
        lat,
        lng
      }
    });
  }

  /**
   * ```ts
   * (property) userProviderKeyMap: Map<`${string}_openai` | `${string}_grok` | `${string}_gemini` | `${string}_anthropic`, string | undefined>
   * ```
   */
  private userProviderKeyMap = new Map<Providers, string | undefined>();

  public async handleApiKeyLookup(provider: Providers, userId?: string) {
    if (!userId) {
      this.userProviderKeyMap.clear();
      throw new Error("unauthorized");
    }
    const rec = await this.prismaClient.userKey.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: this.providerToPrismaFormat(provider)
        }
      }
    });
    if (!rec) {
      console.error(`No API key configured for ${provider}!`);
      return { apiKey: null, keyId: null };
    }
    try {
      const hasKey = this.userProviderKeyMap.get(provider);
      if (typeof hasKey !== "undefined") {
        return { apiKey: hasKey, keyId: rec.id };
      }

      const decrypted = await this.encryption.decryptText({
        authTag: rec.authTag,
        data: rec.apiKey,
        iv: rec.iv
      });

      this.userProviderKeyMap.set(provider, decrypted);

      return { apiKey: decrypted, keyId: rec.id };
    } catch (err) {
      if (err instanceof Error) {
        console.error(`Decryption failed for: ${provider}, ` + err.message);
        return { apiKey: null, keyId: null };
      } else return { apiKey: null, keyId: null };
    }
  }

  public async handleAiChatRequest({
    userId,
    provider,
    ...data
  }: Rm<AIChatRequest, "type"> & {
    userId: string;
  }) {
    const { keyId, apiKey } = await this.handleApiKeyLookup(provider, userId);
    if (data.conversationId === "new-chat") {
      const p = await this.prismaClient.conversation.create({
        include: { messages: true, conversationSettings: true },
        data: {
          messages: {
            create: {
              content: data.prompt,
              provider: this.providerToPrismaFormat(provider),
              senderType: SenderType.USER,
              model: data.model,
              userId,
              userKeyId: keyId
            }
          },
          conversationSettings: {
            create: {
              maxTokens: data.maxTokens,
              topP: data.topP,
              systemPrompt: data.systemPrompt,
              temperature: data.temperature
            }
          },
          userKeyId: keyId,
          userId
        }
      });
      const apiKeyAndRes = { apiKey, ...p };
      return apiKeyAndRes;
    } else {
      const pr = await this.prismaClient.conversation.update({
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          conversationSettings: true
        },
        where: { id: data.conversationId },
        data: {
          messages: {
            create: {
              content: data.prompt,
              senderType: SenderType.USER,
              provider: this.providerToPrismaFormat(provider),
              model: data.model,
              userId,
              userKeyId: keyId
            }
          },
          conversationSettings: {
            update: {
              topP: data.topP,
              systemPrompt: data.systemPrompt,
              maxTokens: data.maxTokens,
              temperature: data.temperature
            }
          },
          userId,
          userKeyId: keyId
        }
      });
      const apiKeyAndRes = { apiKey, ...pr };
      return apiKeyAndRes;
    }
  }

  public async handleAiChatResponse({
    userId,
    provider,
    ...data
  }: Rm<CTR<AIChatResponse, "provider">, "type">) {
    const { keyId } = await this.handleApiKeyLookup(provider, userId);
    return this.prismaClient.conversation.update({
      include: { messages: true, conversationSettings: true },
      where: { id: data.conversationId },
      data: {
        messages: {
          create: {
            content: data.chunk,
            senderType: SenderType.AI,
            provider: this.providerToPrismaFormat(provider),
            model: data.model,
            thinkingDuration: data.thinkingDuration,
            thinkingText: data?.thinkingText,
            userId,
            userKeyId: keyId
          }
        },
        userId,
        title: data.title,
        userKeyId: keyId
      }
    });
  }
  async createAttachment({
    ...data
  }: CTR<Rm<RTC<Attachment>, "id" | "meta">, "bucket" | "key" | "userId"> & {
    meta?: InputJsonValue;
  }) {
    return await this.prismaClient.attachment.create({
      data: { ...data, conversationId: data.conversationId ?? "new-chat" }
    });
  }

  /**
   * Update an attachment record
   */
  async updateAttachment({
    ...data
  }: CTR<
    RTC<Attachment>,
    "id" | "userId" | "conversationId" | "bucket" | "key"
  >): Promise<Attachment> {
    return await this.prismaClient.attachment.update({
      where: {
        bucket_key_conversationId: {
          bucket: data.bucket,
          key: data.key,
          conversationId: data.conversationId
        },
        id: data.id
      },
      data: {
        ...data,
        meta: data.meta ?? undefined
      }
    });
  }

  /**
   * Get attachment by ID
   * [string,string,string] -> [bucket, key, conversationId]
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
        bucket_key_conversationId: {
          bucket: props[0],
          key: props[1],
          conversationId: props[2]
        }
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
    prismaClient.$transaction;
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
   * Attach an asset to a message
   */
  async attachExistingToMessage(
    attachmentId: string,
    messageId: string,
    userId: string
  ) {
    const attachments = await this.prismaClient.$transaction(async t => {
      const attachment = await this.getAttachment(attachmentId);

      if (!attachment) {
        throw new Error("Attachment not found");
      }

      if (attachment.userId !== userId) {
        throw new Error("Unauthorized to attach this asset");
      }

      const {
        bucket,
        meta,
        conversationId,
        key,
        status: _oldStatus,
        messageId: _oldId,
        ...rest
      } = attachment;

      return await t.message.update({
        where: { id: messageId },
        select: { attachments: true, id: true },
        data: {
          attachments: {
            connect: [
              {
                status: "ATTACHED",
                messageId,
                meta: {...meta},
                bucket_key_conversationId: { bucket, conversationId, key },
                ...rest,
                bucket,
                key,
                conversationId
              }
            ]
          }
        }
      });
    });
    return attachments;
  }

  /**
   * Update attachment upload progress
   */
  // async updateUploadProgress(
  //   attachmentId: string,
  //   progress: {
  //     bytesUploaded: number;
  //     totalBytes: number;
  //     percentage: number;
  //   }
  // ): Promise<void> {
  //   await this.prismaClient.attachment.update({
  //     where: { id: attachmentId },
  //     data: {
  //       meta: {
  //         uploadProgress: progress
  //       }
  //     }
  //   });
  // }

  /**
   * Mark attachment as virus scanned
   */
  async markAsScanned(
    attachmentId: string,
    scanResult: "clean" | "infected"
  ): Promise<Attachment> {
    return this.prismaClient.attachment.update({
      where: { id: attachmentId },
      data: {
        status: scanResult === "clean" ? "READY" : "QUARANTINED",
        meta: {
          scannedAt: new Date(Date.now()).toISOString(),
          scanResult
        }
      }
    });
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
      keyof typeof AssetOrigin,
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

  /**
   * Batch create attachments
   */
  // async createBatchAttachments(
  //   attachments: Array<{
  //     conversationId: string;
  //     userId: string;
  //     filename: string;
  //     contentType: string;
  //     size?: number;
  //     origin?: keyof typeof AssetOrigin;
  //   }>
  // ): Promise<Attachment[]> {
  //   return this.prismaClient.$transaction(
  //     this.prismaClient.m.map(data =>
  //       this.prismaClient.attachment.create({
  //         data: {
  //           conversationId: data.conversationId,
  //           userId: data.userId,
  //           bucket: process.env.S3_BUCKET_ASSETS || "ws-assets",
  //           key: "",
  //           region: process.env.AWS_REGION || "us-east-1",
  //           origin: data.origin || "UPLOAD",
  //           status: "REQUESTED",
  //           uploadMethod: "SERVER",
  //           size: data.size ? BigInt(data.size) : null,
  //           mime: data.contentType,
  //           meta: {
  //             filename: data.filename,
  //             batchUpload: true
  //           }
  //         }
  //       })
  //     )
  //   );
  // }

  async createBatchedAttachments({
    conversationId,
    ...data
  }: CTR<Rm<RTC<Attachment>, "id" | "meta">, "bucket" | "key" | "userId"> &
    {
      meta?: InputJsonValue;
    }[]) {
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
        status: true,
        size: true,
        messageId: true,
        userId: true
      }
    });
  }

  /**
   * Get attachments pending virus scan
   */
  async getPendingScanAttachments(limit = 10): Promise<Attachment[]> {
    return await this.prismaClient.attachment.findMany({
      where: {
        status: "SCANNING"
      },
      take: limit,
      orderBy: { createdAt: "asc" }
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
        meta,
        conversationId: _oldConvId,
        messageId: _oldMsgId,
        id: _oldId,
        ...rest
      } = source;

      return await tx.attachment.create({
        data: {
          conversationId: targetConversationId,
          meta: meta as InputJsonValue,
          ...rest
        }
      });
    });
  }

  /**
   * Get recent attachments for a user
   */
  async getUserRecentAttachments(userId: string, take = 10) {
    return (await this.prismaClient.user.findUnique({
      where: { id: userId },
      select: {
        attachments: {
          include: {
            conversation: { select: { id: true, title: true } },
            message: { select: { id: true } }
          },
          take,
          orderBy: { createdAt: "desc" },
          where: { status: "READY" }
        }
      }
    })) satisfies {
      attachments: ({
        conversation: {
          id: string;
          title: string | null;
        } | null;
        message: {
          id: string;
        } | null;
      } & Attachment)[];
    } | null;
  }

  /**
   * Search attachments by filename
   */
  async searchAttachmentsByFilename(
    userId: string,
    searchTerm: string,
    conversationId?: string
  ): Promise<Attachment[]> {
    const where: Prisma.AttachmentWhereInput = {
      userId,
      deletedAt: null,
      ...(conversationId ? { conversationId } : {}),
      OR: [
        { meta: { path: ["filename"], string_contains: searchTerm } },
        { meta: { path: ["originalName"], string_contains: searchTerm } }
      ]
    };

    return this.prismaClient.attachment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20
    });
  }

  /**
   * Update attachment metadata
   */
  async updateAttachmentMetadata(
    attachmentId: string,
    metadata: Record<string, any>
  ): Promise<Attachment> {
    const attachment = await this.getAttachment(attachmentId);

    if (!attachment) {
      throw new Error("Attachment not found");
    }

    const currentMeta = (attachment.meta as object) || {};

    return this.prismaClient.attachment.update({
      where: { id: attachmentId },
      data: {
        meta: {
          ...currentMeta,
          ...metadata,
          lastMetadataUpdate: new Date(Date.now()).toISOString()
        }
      }
    });
  }

  public getTopLevelMime(
    target: keyof typeof this.mimeToExt
  ):
    | "audio"
    | "application"
    | "image"
    | "video"
    | "multipart"
    | "text"
    | "model"
    | "haptics"
    | "font" {
    return target.split("/")?.[0] as InferTopLevelMime<typeof target>;
  }

  /**
   * Get storage statistics for a conversation
   */
  public async getConversationStorageStats(conversationId: string): Promise<{
    totalSize: bigint;
    fileCount: number;
    byType: Record<keyof typeof AssetOrigin, { size: bigint; count: number }>;
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
}
