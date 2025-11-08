import type { UpdateAttachmentCompatProps } from "@/types/index.ts";
import { ModelService } from "@/models/index.ts";
import { DbService, PrismaClient } from "@slipstream/db/node";

export class PrismaAttachmentProviderService extends ModelService {
  protected readonly prismaClient: PrismaClient;

  constructor(prisma: DbService) {
    super();
    this.prismaClient = prisma.prismaClient;
  }

  public async findActiveOpenAIAsset(
    attachmentId: string,
    keyFingerprint = "server"
  ) {
    return this.prismaClient.attachmentProvider.findFirst({
      where: {
        attachmentId,
        provider: "OPENAI",
        keyFingerprint,
        state: "ACTIVE"
        // no TTL for OpenAI files; they persist until you delete them
      }
    });
  }

  public async getGeminiProviderAttachments(keyFingerprint: string) {
    const getAll = await this.prismaClient.attachmentProvider.findMany({
      where: { provider: "GEMINI", keyFingerprint },
      select: { providerUri: true, expiresAt: true }
    });
    const arr = Array.of<string>();
    for (const t of getAll) {
      if (
        t.expiresAt &&
        t.providerUri &&
        new Date(t.expiresAt).getTime() > Date.now()
      ) {
        arr.push(t.providerUri);
      }
    }
    return arr;
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
        compatS3ObjectId
      }
    });
  }

  public async findActiveGeminiAsset(
    attachmentId: string,
    keyFingerprint: string
  ) {
    return this.prismaClient.attachmentProvider.findFirst({
      where: {
        attachmentId,
        provider: "GEMINI",
        keyFingerprint,
        state: "ACTIVE",
        expiresAt: { gt: new Date() }
      }
    });
  }

  public async upsertOpenAIAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    keyId?: string
  ) {
    return this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId,
          provider: "OPENAI",
          keyFingerprint
        }
      },
      update: {
        state: "PENDING",
        errorCode: null,
        errorMessage: null,
        lastCheckedAt: new Date(Date.now())
      },
      create: {
        attachmentId,
        provider: "OPENAI",
        userKeyId: keyId,
        keyFingerprint,
        state: "PENDING",
        mime
      }
    });
  }

  public async upsertGeminiAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    keyId?: string
  ) {
    return this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId: attachmentId,
          provider: "GEMINI",
          keyFingerprint
        }
      },
      update: {
        state: "PENDING",
        errorCode: null,
        errorMessage: null,
        lastCheckedAt: new Date(Date.now())
      },
      create: {
        attachmentId: attachmentId,
        provider: "GEMINI",
        userKeyId: keyId,
        keyFingerprint,
        state: "PENDING",
        mime
      }
    });
  }

  public async finalizeOpenAIAsset(
    mappingId: string,
    providerRef: string,
    size?: bigint
  ) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "ACTIVE",
        providerRef, // store openai file_id here
        size,
        readyAt: new Date(Date.now()),
        lastCheckedAt: new Date(Date.now())
      }
    });
  }

  public async finalizeGeminiAsset(
    mappingId: string,
    providerUri: string,
    providerRef: string,
    expiresAt: Date,
    sizeBytes: number
  ) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "ACTIVE",
        providerUri,
        providerRef,
        expiresAt,
        readyAt: new Date(Date.now()),
        lastCheckedAt: new Date(Date.now()),
        size: sizeBytes
      }
    });
  }

  public async markOpenAIAssetFailed(mappingId: string, errorMessage: string) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "FAILED",
        errorMessage,
        lastCheckedAt: new Date(Date.now())
      }
    });
  }

  public async markGeminiAssetFailed(mappingId: string, errorMessage: string) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "FAILED",
        errorMessage,
        lastCheckedAt: new Date(Date.now())
      }
    });
  }

  public async findActiveAnthropicAsset(
    attachmentId: string,
    keyFingerprint = "server"
  ) {
    return this.prismaClient.attachmentProvider.findFirst({
      where: {
        attachmentId,
        provider: "ANTHROPIC",
        keyFingerprint,
        state: "ACTIVE",
        expiresAt: { gt: new Date() }
      }
    });
  }

  public async upsertAnthropicAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    keyId?: string
  ) {
    return this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId,
          provider: "ANTHROPIC",
          keyFingerprint
        }
      },
      update: {
        state: "PENDING",
        errorCode: null,
        errorMessage: null,
        lastCheckedAt: new Date()
      },
      create: {
        attachmentId,
        provider: "ANTHROPIC",
        userKeyId: keyId,
        keyFingerprint,
        state: "PENDING",
        mime
      }
    });
  }

  public async finalizeAnthropicAsset(
    mappingId: string,
    fileId: string,
    expiresAt: Date,
    size?: bigint
  ) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "ACTIVE",
        providerRef: fileId,
        expiresAt,
        size,
        readyAt: new Date(),
        lastCheckedAt: new Date()
      }
    });
  }

  public async markAnthropicAssetFailed(
    mappingId: string,
    errorMessage: string
  ) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "FAILED",
        errorMessage,
        lastCheckedAt: new Date()
      }
    });
  }
}
