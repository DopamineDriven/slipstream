import { ModelService } from "@/models/index.ts";
import { DbService, PrismaClient } from "@slipstream/db/node";
import { $Enums } from "@slipstream/db/node/generated/client";

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
    return this.prismaClient.attachmentProvider.findFirst({
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
    return await this.prismaClient.$transaction(async t => {
      for (const id of ids) {
        await t.attachmentProvider.delete({ where: { id } });
      }
      return;
    });
  }

  public async findManyByProvider(provider: $Enums.Provider, userId: string) {
    const t = await this.prismaClient.$transaction(async p => {
      const d = await p.attachment.findMany({
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
      const agg = Array.of<{
        id: string;
        attachmentId: string;
        expiresAt: Date | null;
        provider: $Enums.Provider;
        keyFingerprint: string;
        userKeyId: string | null;
        providerRef: string;
        isExpired: boolean;
        providerUri: string | null;
      }>();
      for (const dd of d) {
        if (dd.providerLinks.length > 0) {
          for (const ddd of dd.providerLinks) {
            if (ddd.provider === provider && ddd.providerRef) {
              if (provider !== "GEMINI") {
                agg.push({
                  attachmentId: dd.id,
                  expiresAt: ddd.expiresAt,
                  id: ddd.id,
                  keyFingerprint: ddd.keyFingerprint,
                  provider: ddd.provider,
                  providerRef: ddd.providerRef,
                  isExpired:
                    14 * 24 * 60 * 60 * 1000 <
                    Date.now() -
                      (ddd.lastCheckedAt?.getTime() ?? ddd.createdAt.getTime()),
                  userKeyId: ddd.userKeyId,
                  providerUri: ddd.providerUri
                });
              }
              if (provider === "GEMINI" && ddd.providerUri && ddd.expiresAt) {
                agg.push({
                  attachmentId: dd.id,
                  expiresAt: ddd.expiresAt,
                  id: ddd.id,
                  keyFingerprint: ddd.keyFingerprint,
                  provider: ddd.provider,
                  providerRef: ddd.providerRef,
                  isExpired: ddd.expiresAt.getTime() < Date.now(),
                  userKeyId: ddd.userKeyId,
                  providerUri: ddd.providerUri
                });
              }
            }
          }
        }
      }
      if (agg.length > 0) {
        const idsToDelete = agg
          .filter(v => v.isExpired === true)
          .map(vv => vv.id);
        await this.deleteStaleIds(idsToDelete);
      }
      return agg.filter(v => v.isExpired === false);
    });
    return t;
  }

  public async hasProviderMessages(userId: string, provider: $Enums.Provider) {
    const p = await this.prismaClient.message.findFirst({
      where: {
        userId,
        attachments: { some: { providerLinks: { some: { provider } } } }
      },
      select: { id: true, userKeyId: true }
    });
    return p;
  }
}
