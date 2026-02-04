import { ExtractService } from "@/extract/index.ts";
import { PrismaUserMetaService } from "@/prisma/user-meta.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { AttachmentProviderSingleton } from "@slipstream/types";
import { PrismaDbService } from "@slipstream/db/factory";

export class PrismaAttachmentProviderService extends PrismaUserMetaService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
    this.extractor = extractor;
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

  public async upsertOpenAIAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    fileId: string,
    keyId?: string,
    size?: bigint,
    created_at?: string
  ) {
    return await this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId,
          provider: "OPENAI",
          keyFingerprint
        }
      },
      update: {
        state: "ACTIVE",
        errorCode: null,
        errorMessage: null,
        size,
        userKeyId: keyId,
        provider: "OPENAI",
        keyFingerprint,
        attachmentId,
        mime,
        providerRef: fileId,
        readyAt: created_at,
        lastCheckedAt: created_at
      },
      create: {
        state: "ACTIVE",
        errorCode: null,
        errorMessage: null,
        size,
        userKeyId: keyId,
        provider: "OPENAI",
        keyFingerprint,
        attachmentId,
        mime,
        providerRef: fileId,
        readyAt: created_at,
        lastCheckedAt: created_at
      }
    });
  }

  public async upsertGeminiAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    fileId: string,
    fileUri: string,
    expirationTime: string,
    keyId?: string,
    size?: bigint,
    created_at?: string
  ) {
    return this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId,
          provider: "GEMINI",
          keyFingerprint
        }
      },
      update: {
        state: "ACTIVE",
        errorCode: null,
        errorMessage: null,
        size,
        userKeyId: keyId,
        providerUri: fileUri,
        provider: "GEMINI",
        expiresAt: new Date(expirationTime),
        keyFingerprint,
        attachmentId,
        mime,
        providerRef: fileId,
        readyAt: created_at,
        lastCheckedAt: created_at
      },
      create: {
        state: "ACTIVE",
        errorCode: null,
        errorMessage: null,
        size,
        expiresAt: new Date(expirationTime),
        userKeyId: keyId,
        providerUri: fileUri,
        provider: "GEMINI",
        keyFingerprint,
        attachmentId,
        mime,
        providerRef: fileId,
        readyAt: created_at,
        lastCheckedAt: created_at
      }
    });
  }

  public async getUserKeyIdByProvider(
    userId: string,
    provider: $Enums.Provider
  ) {
    const keyId = await this.prismaClient.userKey.findUnique({
      where: { userId_provider: { userId, provider } },
      select: { id: true }
    });
    if (!keyId?.id) return "server";
    else return keyId.id;
  }

  public async upsertGrokAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    fileId: string,
    keyId?: string,
    size?: bigint,
    created_at?: Date
  ) {
    const newFile = await this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId,
          provider: "GROK",
          keyFingerprint
        }
      },
      update: {
        state: "ACTIVE",
        errorCode: null,
        errorMessage: null,
        size,
        userKeyId: keyId,
        providerUri: undefined,
        provider: "GROK",
        keyFingerprint,
        attachmentId,
        mime,
        providerRef: fileId,
        readyAt: created_at,
        lastCheckedAt: created_at
      },
      create: {
        state: "ACTIVE",
        errorCode: null,
        errorMessage: null,
        size,
        userKeyId: keyId,
        provider: "GROK",
        keyFingerprint,
        attachmentId,
        mime,
        providerRef: fileId,
        readyAt: created_at,
        lastCheckedAt: created_at
      }
    });
    return this.convertProviderAttBigInt(newFile);
  }

  public async findActiveAnthropicAsset(
    attachmentId: string,
    keyFingerprint = "server"
  ) {
    return await this.prismaClient.attachmentProvider.findFirst({
      where: {
        attachmentId,
        provider: "ANTHROPIC",
        keyFingerprint,
        state: "ACTIVE"
      }
    });
  }

  public async markProviderLastCheckedAt(
    id: string,
    provider: $Enums.Provider
  ) {
    return await this.prismaClient.attachmentProvider.update({
      where: { id, provider },
      data: {
        lastCheckedAt: new Date(Date.now())
      },
      select: { lastCheckedAt: true }
    });
  }

  public async upsertAnthropicAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    fileId: string,
    keyId?: string,
    size?: bigint,
    created_at?: string
  ) {
    return await this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId,
          provider: "ANTHROPIC",
          keyFingerprint
        }
      },
      update: {
        state: "ACTIVE",
        errorCode: null,
        errorMessage: null,
        size,
        userKeyId: keyId,
        provider: "ANTHROPIC",
        keyFingerprint,
        attachmentId,
        mime,
        providerRef: fileId,
        readyAt: created_at,
        lastCheckedAt: created_at
      },
      create: {
        state: "ACTIVE",
        errorCode: null,
        errorMessage: null,
        size,
        userKeyId: keyId,
        provider: "ANTHROPIC",
        keyFingerprint,
        attachmentId,
        mime,
        providerRef: fileId,
        readyAt: created_at,
        lastCheckedAt: created_at
      }
    });
  }

  public async deleteStaleIds(ids: string[]) {
    if (ids.length > 0) {
      return await this.prismaClient.$transaction(async t => {
        await t.attachmentProvider.deleteMany({ where: { id: { in: ids } } });
        return;
      });
    } else return;
  }

  public async removeFileAttachmentProvider(id: string) {
    return await this.prismaClient.attachmentProvider.delete({
      where: { id },
      select: { id: true, providerRef: true }
    });
  }

  public async findManyByProvider(provider: $Enums.Provider, userId: string) {
    const prismaTransaction = await this.prismaClient.$transaction(
      async prisma => {
        const attachmentFindManyRes = await prisma.attachment.findMany({
          where: { AND: [{ providerLinks: { some: { provider } }, userId }] },
          select: {
            id: true,
            providerLinks: {
              where: { provider },
              select: {
                id: true,
                keyFingerprint: true,
                expiresAt: true,
                providerRef: true,
                provider: true,
                userKeyId: true,
                lastCheckedAt: true,
                providerUri: true,
                createdAt: true
              }
            },
            key: true
          }
        });
        const aggArr = Array.of<{
          id: string;
          attachmentId: string;
          expiresAt: Date | null;
          provider: $Enums.Provider;
          keyFingerprint: string;
          userKeyId: string | null;
          providerRef: string;
          isExpired: boolean;
          providerUri: string | null;
          lastCheckedAt: Date | null;
        }>();

        for (const attachment of attachmentFindManyRes) {
          if (attachment.providerLinks.length > 0) {
            for (const providerLink of attachment.providerLinks) {
              if (
                providerLink.provider === provider &&
                providerLink.providerRef
              ) {
                if (provider !== "GEMINI" && provider !== "GROK") {
                  aggArr.push({
                    attachmentId: attachment.id,
                    expiresAt: providerLink.expiresAt,
                    id: providerLink.id,
                    keyFingerprint: providerLink.keyFingerprint,
                    provider: providerLink.provider,
                    providerRef: providerLink.providerRef,
                    isExpired:
                      14 * 24 * 60 * 60 * 1000 <
                      Date.now() -
                        (providerLink.lastCheckedAt?.getTime() ??
                          providerLink.createdAt.getTime()),
                    userKeyId: providerLink.userKeyId,
                    providerUri: providerLink.providerUri,
                    lastCheckedAt: providerLink.lastCheckedAt
                  });
                }
                if (provider === "GROK") {
                  aggArr.push({
                    attachmentId: attachment.id,
                    expiresAt: providerLink.expiresAt,
                    id: providerLink.id,
                    keyFingerprint: providerLink.keyFingerprint,
                    provider: providerLink.provider,
                    providerRef: providerLink.providerRef,
                    isExpired: false,
                    userKeyId: providerLink.userKeyId,
                    providerUri: providerLink.providerUri,
                    lastCheckedAt: providerLink.lastCheckedAt
                  });
                }
                if (
                  provider === "GEMINI" &&
                  providerLink.providerUri &&
                  providerLink.expiresAt
                ) {
                  aggArr.push({
                    attachmentId: attachment.id,
                    expiresAt: providerLink.expiresAt,
                    id: providerLink.id,
                    keyFingerprint: providerLink.keyFingerprint,
                    provider: providerLink.provider,
                    providerRef: providerLink.providerRef,
                    isExpired: providerLink.expiresAt.getTime() < Date.now(),
                    userKeyId: providerLink.userKeyId,
                    providerUri: providerLink.providerUri,
                    lastCheckedAt: providerLink.lastCheckedAt
                  });
                }
              }
            }
          }
        }
        if (aggArr.length > 0) {
          const idsToDelete = aggArr
            .filter(aggArrregate => aggArrregate.isExpired === true)
            .map(aggArrregate => aggArrregate.id);
          if (idsToDelete.length > 0) {
            await prisma.attachmentProvider.deleteMany({
              where: { id: { in: idsToDelete } }
            });
          }
        }
        return aggArr.filter(v => v.isExpired === false);
      }
    );
    return prismaTransaction;
  }

  public async hasProviderMessages(userId: string, provider: $Enums.Provider) {
    const count = await this.prismaClient.attachment.count({
      where: { AND: [{ providerLinks: { some: { provider } }, userId }] }
    });
    return count > 0;
  }

  public async providerFileAndDocCheck(
    fileId: string,
    docId: string,
    provider: $Enums.Provider
  ) {
    return await this.prismaClient.$transaction(async p => {
      const fileCount = await p.attachmentProvider.count({
        where: { id: fileId, provider }
      });
      const docCount = await p.providerStoreDocument.count({
        where: { id: docId, provider }
      });
      return {
        hasFile: fileCount > 0,
        hasDoc: docCount > 0
      };
    });
  }

  private convertProviderAttBigInt(
    obj: AttachmentProviderSingleton<true | false>
  ) {
    const { size, attachment: _att, userKey: _uk, ...rest } = obj;
    return {
      size: size ? Number(size) : null,
      ...rest
    } satisfies AttachmentProviderSingleton<true>;
  }

  public async getProviderAttachmentFile(
    attachmentId: string,
    keyFingerprint: string,
    provider: $Enums.Provider
  ) {
    return this.convertProviderAttBigInt(
      await this.prismaClient.attachmentProvider.findUniqueOrThrow({
        where: {
          attachmentId_provider_keyFingerprint: {
            attachmentId,
            provider,
            keyFingerprint
          }
        }
      })
    );
  }
  
  public async hasProviderAttachmentFile(
    attachmentId: string,
    providerRef: string,
    provider: $Enums.Provider
  ) {
    const count = await this.prismaClient.attachmentProvider.count({
      where: { attachmentId, providerRef, provider }
    });
    return count > 0;
  }

  public async getTargetedAtt(id: string) {
    const attachment = await this.prismaClient.attachment.findUniqueOrThrow({
      where: { id },
      include: { image: true, document: true, imageGenOutput: true }
    });
    const att = {
      ...attachment,
      size: attachment.size ? Number(attachment.size) : null
    };
    return att;
  }

  public async getManyAttachments(ids: string[]) {
    const attachments = await this.prismaClient.attachment.findMany({
      where: { id: { in: ids } },
      include: { image: true, document: true, imageGenOutput: true }
    });

    return attachments.map(v => {
      const { size, ...rest } = v;
      return {
        ...rest,
        size: size ? Number(size) : null
      };
    });
  }
}
