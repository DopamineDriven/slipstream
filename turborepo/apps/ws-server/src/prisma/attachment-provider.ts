import { PrismaUtilsService } from "@/prisma/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import { DbService } from "@slipstream/db/node";

export class PrismaAttachmentProviderService extends PrismaUtilsService {
  constructor(prisma: DbService) {
    super(prisma);
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
        for (const id of ids) {
          await t.attachmentProvider.delete({ where: { id } });
        }
        return;
      });
    } else return;
  }

  public async findManyByProvider(provider: $Enums.Provider, userId: string) {
    const prismaTransaction = await this.prismaClient.$transaction(
      async prisma => {
        const attachmentFindManyRes = await prisma.attachment.findMany({
          where: { AND: [{ providerLinks: { some: { provider } }, userId }] },
          select: {
            id: true,
            providerLinks: {
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
                if (provider !== "GEMINI") {
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
            for (const id of idsToDelete) {
              await prisma.attachmentProvider.delete({ where: { id } });
            }
          }
        }
        return aggArr.filter(v => v.isExpired === false);
      }
    );
    return prismaTransaction;
  }

  public async hasProviderMessages(userId: string, provider: $Enums.Provider) {
    const count = await this.prismaClient.attachment.count({
      where: { AND: [{ providerLinks: { some: { provider } }, userId }] },
      select: { id: true }
    });
    return count.id > 0 ? true : false;
  }
}
