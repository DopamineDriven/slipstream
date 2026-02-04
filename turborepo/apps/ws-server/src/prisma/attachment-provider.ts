import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { FssDoc, StoreDocDbRegistryProps } from "@/gemini/types.ts";
import type {
  CreateLocalStoreParams,
  CreateLocalStoreRT,
  FindManyLocalStoreDocsShape
} from "@/prisma/types.ts";
import type {
  CreateGrokProviderStoreDocParams,
  CreateManyGrokProviderStoreDocsProps,
  xAIDocDbRegistryProps
} from "@/xai/types.ts";
import { ExtractService } from "@/extract/index.ts";
import { PrismaUtilsService } from "@/prisma/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AttachmentProviderSingleton,
  AttachmentSingleton,
  ProviderStoreDocumentSingleton,
  ProviderStoreSingleton,
  XOR
} from "@slipstream/types";
import { PrismaDbService } from "@slipstream/db/factory";

export interface AttachmentSingletonWithProvider<
  T extends $Enums.Provider
> extends AttachmentSingleton<true> {
  provider: T;
}

export type AttachmentSingletonProviderWorkup<T extends $Enums.Provider> =
  AttachmentSingleton<true> & { provider: T };
export class PrismaAttachmentProviderService extends PrismaUtilsService {
  public extractor: ExtractService;
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, isProd);
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

  public async createGeminiStoreDoc({
    attachmentId,
    docRef,
    docUri,
    filename,
    indexedAt,
    mimeType,
    state,
    storeId,
    storeRef,
    userId,
    size
  }: {
    userId: string;
    attachmentId: string;
    storeId: string;
    docRef: string;
    docUri: string;
    storeRef: string;
    filename: string;
    indexedAt: Date;
    mimeType: string;
    state: $Enums.ProviderDocState;
    size?: bigint;
  }) {
    return await this.prismaClient.$transaction(async prisma => {
      const [doc, store] = await Promise.all([
        prisma.providerStoreDocument.create({
          data: {
            state,
            indexedAt,
            size,
            mimeType,
            docRef,
            filename,
            docUri,
            provider: "GEMINI",
            attachmentId,
            storeId,
            lastAccessed: indexedAt
          },
          select: {
            filename: true,
            id: true,
            createdAt: true,
            mimeType: true,
            provider: true,
            errorMessage: true,
            size: true,
            updatedAt: true,
            indexedAt: true,
            attachmentId: true,
            state: true,
            docRef: true,
            docUri: true,
            lastAccessed: true
          }
        }),
        prisma.providerStore.update({
          where: { userId_provider: { provider: "GEMINI", userId } },
          data: {
            fileCount: { increment: 1 },
            lastSyncedAt: new Date(Date.now()),
            storeRef,
            totalBytes: { increment: size ?? 0n }
          },
          select: {
            storeRef: true,
            id: true
          }
        })
      ]);

      return {
        attachmentId: doc.attachmentId,
        docRef: doc.docRef,
        docUri: doc.docUri,
        state: doc.state,
        storeRef: store.storeRef,
        id: doc.id,
        storeId: store.id,
        size: doc.size ? Number(doc.size) : null,
        filename: doc.filename,
        createdAt: doc.createdAt,
        errorMessage: doc.errorMessage,
        indexedAt: doc.indexedAt,
        lastAccessed: doc.lastAccessed,
        mimeType: doc.mimeType,
        provider: "GEMINI",
        updatedAt: doc.updatedAt
      } satisfies StoreDocDbRegistryProps;
    });
  }

  public async createManyGrokProviderDocs({
    userId,
    storeRef: _storeRef,
    totalBytes,
    data
  }: CreateManyGrokProviderStoreDocsProps) {
    return await this.prismaClient.$transaction(async prisma => {
      const [newDocs, store] = await Promise.all([
        prisma.providerStoreDocument.createManyAndReturn({
          data
        }),
        prisma.providerStore.update({
          where: { userId_provider: { userId, provider: "GROK" } },
          data: {
            totalBytes: { increment: totalBytes },
            lastSyncedAt: new Date(Date.now()),
            fileCount: { increment: data.length }
          },
          select: { storeRef: true }
        })
      ]);
      return this.convertProviderStoreDocBigInt(newDocs).map(
        newDoc =>
          ({
            ...newDoc,
            storeRef: store.storeRef
          }) satisfies xAIDocDbRegistryProps
      );
    });
  }

  private async handleGrokDocCheck(
    attachmentId: string,
    docRef: string,
    storeId: string,
    storeRef: string
  ) {
    const exists = await this.hasProviderStoreDocument(
      attachmentId,
      docRef,
      storeId,
      "GROK"
    );
    if (exists) {
      const { id } =
        await this.prismaClient.providerStoreDocument.findUniqueOrThrow({
          where: { storeId_attachmentId: { attachmentId, storeId } },
          select: { id: true }
        });
      return {
        exists: true,
        id,
        storeRef,
        storeId
      } as const;
    } else {
      return {
        exists: false,
        id: undefined,
        storeRef,
        storeId
      } as const;
    }
  }

  public async upsertGrokProviderDoc({
    attachmentId,
    docRef,
    docUri,
    filename,
    last_indexed_at,
    mimeType,
    state,
    storeId,
    storeRef,
    userId,
    size
  }: CreateGrokProviderStoreDocParams) {
    // absolute certainty
    const docExists = await this.handleGrokDocCheck(
      attachmentId,
      docRef,
      storeId,
      storeRef
    );
    return await this.prismaClient.$transaction(async prisma => {
      if (!docExists.exists) {
        const [doc, store] = await Promise.all([
          prisma.providerStoreDocument.create({
            data: {
              state,
              indexedAt: last_indexed_at,
              size,
              mimeType,
              docRef,
              filename,
              docUri,
              provider: "GROK",
              attachmentId,
              storeId,
              lastAccessed: last_indexed_at
            },
            select: {
              filename: true,
              id: true,
              createdAt: true,
              mimeType: true,
              provider: true,
              errorMessage: true,
              size: true,
              updatedAt: true,
              indexedAt: true,
              attachmentId: true,
              state: true,
              docRef: true,
              docUri: true,
              lastAccessed: true
            }
          }),
          prisma.providerStore.update({
            where: { userId_provider: { provider: "GROK", userId } },
            data: {
              fileCount: { increment: 1 },
              lastSyncedAt: new Date(Date.now()),
              storeRef,
              totalBytes: { increment: size ?? 0n }
            },
            select: {
              storeRef: true,
              id: true
            }
          })
        ]);
        return {
          attachmentId: doc.attachmentId,
          docRef: doc.docRef,
          docUri: doc.docUri,
          state: doc.state,
          storeRef: store.storeRef,
          id: doc.id,
          storeId: store.id,
          size: doc.size ? Number(doc.size) : null,
          filename: doc.filename,
          createdAt: doc.createdAt,
          errorMessage: doc.errorMessage,
          indexedAt: doc.indexedAt,
          lastAccessed: doc.lastAccessed,
          mimeType: doc.mimeType,
          provider: "GROK",
          updatedAt: doc.updatedAt
        } satisfies xAIDocDbRegistryProps;
      } else {
        const doc = await prisma.providerStoreDocument.update({
          where: { id: docExists.id },
          data: {
            state,
            indexedAt: last_indexed_at,
            size,
            mimeType,
            docRef,
            filename,
            updatedAt: new Date(Date.now()),
            docUri,
            provider: "GROK",
            attachmentId,
            storeId,
            lastAccessed: last_indexed_at
          },
          select: {
            filename: true,
            id: true,
            createdAt: true,
            mimeType: true,
            provider: true,
            errorMessage: true,
            size: true,
            updatedAt: true,
            indexedAt: true,
            attachmentId: true,
            state: true,
            docRef: true,
            docUri: true,
            lastAccessed: true
          }
        });

        return {
          attachmentId: doc.attachmentId,
          docRef: doc.docRef,
          docUri: doc.docUri,
          state: doc.state,
          storeRef,
          id: doc.id,
          storeId,
          size: doc.size ? Number(doc.size) : null,
          filename: doc.filename,
          createdAt: doc.createdAt,
          errorMessage: doc.errorMessage,
          indexedAt: doc.indexedAt,
          lastAccessed: doc.lastAccessed,
          mimeType: doc.mimeType,
          provider: "GROK",
          updatedAt: doc.updatedAt
        } satisfies xAIDocDbRegistryProps;
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

  public async hasProviderStoreDocs(userId: string, provider: $Enums.Provider) {
    const count = await this.prismaClient.attachment.count({
      where: { AND: [{ providerStoreDocs: { some: { provider } }, userId }] }
    });
    return count > 0;
  }

  public async removeDocFromProviderStore(
    provider: $Enums.Provider,
    userId: string,
    doc: xAIDocDbRegistryProps
  ) {
    return await this.prismaClient.$transaction(async p => {
      const updateStore = await p.providerStore.update({
        where: { userId_provider: { userId, provider } },
        data: {
          totalBytes: { decrement: doc.size ? BigInt(doc.size) : 0n },
          fileCount: { decrement: 1 },
          docs: { delete: { id: doc.id } }
        },
        select: { storeRef: true, id: true }
      });

      return {
        storeRef: updateStore.storeRef,
        storeId: updateStore.id,
        id: doc.id,
        filename: doc.filename
      };
    });
  }

  public async removeFileAttachmentProvider(id: string) {
    return await this.prismaClient.attachmentProvider.delete({
      where: { id },
      select: { id: true, providerRef: true }
    });
  }

  public async findManyProviderStoreDocs(
    provider: $Enums.Provider,
    userId: string
  ) {
    return await this.prismaClient.$transaction(async prisma => {
      const providerDocsFindMany = await prisma.attachment.findMany({
        where: { AND: [{ providerStoreDocs: { some: { provider } }, userId }] },
        select: {
          id: true,
          compatCdnUrl: true,
          providerStoreDocs: {
            where: { provider },
            select: {
              id: true,
              createdAt: true,
              lastAccessed: true,
              docRef: true,
              docUri: true,
              updatedAt: true,
              indexedAt: true,
              provider: true,
              errorMessage: true,
              filename: true,
              mimeType: true,
              state: true,
              size: true,
              store: { select: { id: true, storeRef: true, storeName: true } }
            }
          }
        }
      });

      const arr = Array.of<{
        id: string;
        size: number | null;
        filename: string;
        createdAt: Date;
        updatedAt: Date;
        attachmentId: string;
        provider: $Enums.Provider;
        state: $Enums.ProviderDocState;
        errorMessage: string | null;
        storeId: string;
        storeRef: string;
        storeName: string;
        docRef: string;
        docUri: string | null;
        indexedAt: Date | null;
        mimeType: string;
        lastAccessed: Date | null;
      }>();

      for (const attachment of providerDocsFindMany) {
        const attachmentId = attachment.id;
        if (attachment.providerStoreDocs.length > 0) {
          for (const doc of attachment.providerStoreDocs) {
            const { store, size, ...docRest } = doc;
            const { storeRef, storeName, id: storeId } = store;
            const record = {
              storeRef,
              storeName,
              storeId,
              attachmentId,
              size: size ? Number(size) : null,
              ...docRest
            };
            arr.push(record);
          }
        }
      }
      return arr;
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
  private convertProviderStoreDocBigInt(
    obj: ProviderStoreDocumentSingleton<true | false>
  ): ProviderStoreDocumentSingleton<true>;
  private convertProviderStoreDocBigInt(
    obj: ProviderStoreDocumentSingleton<true | false>[]
  ): ProviderStoreDocumentSingleton<true>[];
  private convertProviderStoreDocBigInt(
    obj:
      | ProviderStoreDocumentSingleton<true | false>
      | ProviderStoreDocumentSingleton<true | false>[]
  ) {
    if (Array.isArray(obj)) {
      return obj.map(t => {
        const { size, attachment: _att, store: _st, ...rest } = t;
        return {
          size: size ? Number(size) : null,
          ...rest
        };
      }) satisfies ProviderStoreDocumentSingleton<true>[];
    }
    const { size, attachment: _att, store: _st, ...rest } = obj;
    return {
      size: size ? Number(size) : null,
      ...rest
    } satisfies ProviderStoreDocumentSingleton<true>;
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

  public async hasProviderStoreDocument(
    attachmentId: string,
    docRef: string,
    storeId: string,
    provider: $Enums.Provider
  ) {
    const count = await this.prismaClient.providerStoreDocument.count({
      where: { attachmentId, docRef, provider, storeId }
    });
    return count > 0;
  }
  public async hasProviderStore(userId: string, provider: $Enums.Provider) {
    const count = await this.prismaClient.providerStore.count({
      where: { AND: [{ provider, userId }] }
    });
    return count > 0;
  }
  public async getProviderStoreDoc(attachmentId: string, storeId: string) {
    return this.convertProviderStoreDocBigInt(
      await this.prismaClient.providerStoreDocument.findUniqueOrThrow({
        where: { storeId_attachmentId: { attachmentId, storeId } }
      })
    );
  }
  private urlExtWorkup<const T extends $Enums.Provider>(
    provider: T,
    attachment: AttachmentSingleton<true>
  ) {
    const urlExtRecord = { url: "", ext: "", mime: "" };
    try {
      if (!attachment.compatStatus)
        throw new Error(
          `no compat status provided in attachment record ${attachment.id} for provider ${provider.toLowerCase()}`
        );
      if (
        attachment.compatStatus === "ACTIVE" &&
        attachment.compatExt &&
        attachment.compatCdnUrl &&
        attachment.compatMime
      ) {
        urlExtRecord.ext = attachment.compatExt;
        urlExtRecord.mime = attachment.compatMime;
        urlExtRecord.url = attachment.compatCdnUrl;
      }
      if (
        attachment.compatStatus === "ALIASED" &&
        attachment.ext &&
        attachment.mime &&
        attachment.cdnUrl
      ) {
        urlExtRecord.ext = attachment.ext;
        urlExtRecord.mime = attachment.mime;
        urlExtRecord.url = attachment.cdnUrl;
      }
    } catch (err) {
      throw new Error("error in urlExtWorkup".concat(this.safeErrMsg(err)));
    } finally {
      return urlExtRecord;
    }
  }

  private async filesApiToTmpWorkup<const T extends $Enums.Provider>(
    provider: T,
    {
      assetType,
      compatStatus,
      conversationId,
      messageId,
      id,
      userId,
      ...rest
    }: AttachmentSingleton<true>
  ) {
    const displayName = this.toVectorStoreFilename({
      assetType,
      compatStatus,
      conversationId,
      messageId,
      id,
      userId,
      ...rest
    });
    const { ext, mime, url } = this.urlExtWorkup(provider, {
      ...rest,
      assetType,
      compatStatus,
      conversationId,
      messageId,
      id,
      userId
    });
    const tmpPrefix = `${provider.toLowerCase()}-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;
    const tmpName = this.extractor.uniqueTmpName(tmpPrefix, ext);
    const urlObj = new URL(url);

    let usefulName: string;
    if (conversationId && messageId) {
      // will always be defined as message and convoId for incoming assets are database derived
      // and incoming user messages are persisted fully so AI SDKs always receive db-synced data
      usefulName = provider === "GEMINI" ? `${id}.${ext}` : displayName;
    } else {
      usefulName = urlObj.pathname.replace(/\//gim, "-");
    }
    const safeFilename = usefulName;
    const absTmpPath = resolve(tmpdir(), tmpName);
    return {
      tmpFilenamePrefix: tmpPrefix,
      tmpUniquename: tmpName,
      absTmpPath,
      ext,
      remoteUrl: url,
      safeFilename,
      mime
    };
  }

  public async fetchRemoteToTmp<const T extends $Enums.Provider>(
    provider: T,
    att: AttachmentSingleton<true>
  ) {
    const workup = await this.filesApiToTmpWorkup(provider, att);
    if (!workup)
      throw new Error(
        `${provider.toLowerCase()} workup for ${att.id} not defined`
      );
    const {
      absTmpPath,
      ext,
      tmpUniquename,
      tmpFilenamePrefix,
      safeFilename,
      remoteUrl,
      mime
    } = workup;
    await this.extractor.fetchRemoteWriteLocalLargeFiles(
      remoteUrl,
      absTmpPath,
      false
    );
    if (this.extractor.existsTmp(tmpUniquename)) {
      return {
        tmpUniquename,
        absTmpPath,
        ext,
        tmpFilenamePrefix,
        safeFilename,
        mime
      };
    } else {
      throw new Error(
        `no tmp file exists having filename ${tmpUniquename} at absolute path ${absTmpPath} exist for provider ${provider.toLowerCase()}`
      );
    }
  }

  public cleanupTmpPostupload<const T extends $Enums.Provider>(
    provider: T,
    absTmpPath: string,
    tmpUniquename: string
  ) {
    try {
      if (this.extractor.exists(absTmpPath)) {
        this.extractor.rmFile(absTmpPath);
        console.log(
          `cleaned up tmp file ${tmpUniquename} following ${provider.toLowerCase()} file upload.`
        );
      }
    } catch (err) {
      console.warn(
        `cleanup of tmp file ${tmpUniquename} having path ${absTmpPath} failed following ${provider.toLowerCase()} file upload.`.concat(
          this.safeErrMsg(err)
        )
      );
    }
  }

  public urlExtWorkupEmbeddings(attachment: AttachmentSingleton<true>) {
    const urlExtRecord = { url: "", ext: "", mime: "", embeddedFilename: "" };
    try {
      if (!attachment.compatStatus)
        throw new Error(
          `no compat status provided in attachment record ${attachment.id}`
        );
      if (
        attachment.compatStatus === "ACTIVE" &&
        attachment.compatExt &&
        attachment.compatCdnUrl &&
        attachment.compatMime
      ) {
        urlExtRecord.ext = attachment.compatExt;
        urlExtRecord.mime = attachment.compatMime;
        urlExtRecord.url = attachment.compatCdnUrl;
        urlExtRecord.embeddedFilename = this.toVectorStoreFilename(attachment);
      }
      if (
        attachment.compatStatus === "ALIASED" &&
        attachment.ext &&
        attachment.mime &&
        attachment.cdnUrl
      ) {
        urlExtRecord.ext = attachment.ext;
        urlExtRecord.mime = attachment.mime;
        urlExtRecord.url = attachment.cdnUrl;
        urlExtRecord.embeddedFilename = this.toVectorStoreFilename(attachment);
      }
    } catch (err) {
      throw new Error("error in urlExtWorkup ".concat(this.safeErrMsg(err)));
    } finally {
      return urlExtRecord;
    }
  }
  /**
   * all cdnUrls have a final path prefixed with a timestamp (ms), eg:
   *
   * `https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758334065329-IMG_6695.png`
   *
   *  -> `pathname.slice(14)` simply excises the predictably prefixed `1758334065329-` from the filename
   *
   * that said, converted (comapt) attachments lack the timestamp and have the following shape instead:
   *
   * `https://assets.aicoalesce.com/upload/converted/att_wtywhioyfurelljpivpbgdk3.pdf`
   *
   * so we don't slice when `compatStatus === "ACTIVE"`, we just take the top-level pathname as is
   */
  public filenameToHexExtTuple(
    url: string,
    compatStatus: ("FAILED" | "PENDING" | "ACTIVE" | "ALIASED") | null,
    encoded = true
  ) {
    const urlObj = new URL(url);

    const path = urlObj.pathname;

    const pathname = path.slice(path.lastIndexOf("/") + 1);

    const filename = compatStatus === "ACTIVE" ? pathname : pathname.slice(14);

    const dbFile = filename ?? `file.pdf`;

    const [withoutExt, ext] = [
      dbFile.slice(0, dbFile.lastIndexOf(".")),
      dbFile.slice(dbFile.lastIndexOf(".") + 1)
    ];

    const name = encoded
      ? Buffer.from(withoutExt, "utf-8").toString("hex")
      : withoutExt;
    return [name, ext] as const;
  }

  public toVectorStoreFilename(att: AttachmentSingleton<true>) {
    let url: string;
    if (att.compatStatus === "ACTIVE" && att.compatCdnUrl) {
      url = att.compatCdnUrl;
    } else if (att.compatStatus === "ALIASED" && att.cdnUrl) {
      url = att.cdnUrl;
    } else {
      url = "";
    }
    const [filename, ext] = this.filenameToHexExtTuple(url, att.compatStatus);
    if (att.conversationId && att.messageId) {
      return `${att.conversationId}-${att.messageId}-${att.id}-${filename}.${ext}`;
    } else {
      throw new Error(`no conversationId or messageId set for ${att.id}`);
    }
  }
  public toVectorStoreDocChunkProvenanceId(a: string, chunk: number): string;
  public toVectorStoreDocChunkProvenanceId(
    a: AttachmentSingleton<true>,
    chunk: number
  ): string;
  public toVectorStoreDocChunkProvenanceId(
    a: AttachmentSingleton<true> | string,
    chunk: number
  ) {
    if (typeof a === "string") return `${a}#${chunk}`;
    const provenanceId = this.toVectorStoreFilename(a);
    return `${provenanceId}#${chunk}`;
  }
  public canParseFilename(filename: string) {
    return /^(?:[a-z0-9]+-){3}[a-f0-9]+\.[a-z0-9]+$/.test(filename);
  }

  public parseFilename(filename: string) {
    if (!this.canParseFilename(filename))
      throw new Error(
        "always guard parseFilename with its canParseFilename helper!"
      );

    const [conversationId, messageId, attachmentId, fileNameExt] =
      filename.split("-") as [string, string, string, string];

    const [fileNameHex, extension] = [
      fileNameExt.slice(0, fileNameExt.lastIndexOf(".")),
      fileNameExt.slice(fileNameExt.lastIndexOf(".") + 1)
    ];

    const fileName = Buffer.from(fileNameHex, "hex").toString("utf-8");

    return {
      conversationId,
      messageId,
      attachmentId,
      fileName,
      extension
    };
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

  public bigintToIntProviderStoreDocs(
    data: ProviderStoreSingleton<false | true> & {
      docs: ProviderStoreDocumentSingleton<false | true>[];
    }
  ) {
    const { totalBytes, docs, ...rest } = data;

    const docsMapped = docs.map(t => {
      const { size, attachment: _attachment, store: _store, ...doc } = t;
      return {
        storeRef: rest.storeRef,
        size: size ? Number(size) : null,
        ...doc
      } satisfies StoreDocDbRegistryProps;
    });
    const providerStoreOut = {
      ...rest,
      totalBytes: totalBytes ? Number(totalBytes) : null,
      docs: docsMapped
    } satisfies ProviderStoreSingleton<true> & {
      docs: ProviderStoreDocumentSingleton<true>[];
    };

    return providerStoreOut satisfies ProviderStoreSingleton<true> & {
      docs: StoreDocDbRegistryProps[];
    } as ProviderStoreSingleton<true> & {
      docs: StoreDocDbRegistryProps[];
    };
  }
  public async createManyProviderStoreDocsGemini(
    fssDocs: FssDoc[],
    storeId: string,
    userId: string
  ) {
    const arr = Array.of<{
      readonly storeId: string;
      readonly attachmentId: string;
      readonly docRef: string;
      readonly filename: string;
      readonly mimeType: string;
      readonly provider: "GEMINI";
      readonly createdAt: string;
      readonly updatedAt: string;
      readonly lastAccessed: string;
      readonly size: number;
      readonly docUri: `https://generativelanguage.googleapis.com/v1beta/${string}`;
      readonly state: "ACTIVE" | "FAILED" | "PENDING" | "PROCESSING";
      readonly indexedAt: string;
    }>();
    const provider = "GEMINI";
    const agg = { size: 0 };
    try {
      for (const dd of fssDocs) {
        if (
          dd.displayName &&
          dd.name &&
          dd.createTime &&
          dd.customMetadata &&
          dd.mimeType &&
          dd.sizeBytes &&
          dd.state &&
          dd.updateTime
        ) {
          const filename = dd.displayName;
          const { attachmentId } = this.parseFilename(dd.displayName);
          const docUri =
            `https://generativelanguage.googleapis.com/v1beta/${dd.name}` as const;
          const docRef = dd.name;
          const state =
            dd.state === "STATE_ACTIVE"
              ? "ACTIVE"
              : dd.state === "STATE_FAILED"
                ? "FAILED"
                : dd.state === "STATE_PENDING"
                  ? "PROCESSING"
                  : "PENDING";

          const indexedAt = dd.updateTime;
          const createdAt = dd.createTime;
          const updatedAt = dd.updateTime;
          const lastAccessed = dd.updateTime;
          const size = Number.parseInt(dd.sizeBytes);
          const record = {
            attachmentId,
            docRef,
            docUri,
            state,
            size,
            filename,
            createdAt,
            mimeType: dd.mimeType,
            provider,
            updatedAt,
            indexedAt,
            lastAccessed,
            storeId
          } as const;
          arr.push(record);
          agg.size += size;
        }
      }
      const dataOne =
        await this.prismaClient.providerStoreDocument.createManyAndReturn({
          data: arr
        });
      const data = await this.prismaClient.providerStore.update({
        where: { userId_provider: { userId, provider } },
        data: {
          totalBytes: { increment: BigInt(agg.size) },
          lastSyncedAt: new Date(Date.now()),
          fileCount: { increment: fssDocs.length }
        }
      });
      const r = { docs: dataOne, ...data };
      return this.bigintToIntProviderStoreDocs(r);
    } catch (err) {
      throw new Error(
        `something went wrong in createManyProviderStoreDocsGemini...${this.safeErrMsg(err)}`
      );
    }
  }

  public async createVectorStoreGemini(
    userId: string,
    storeRef: string,
    storeDisplayName: string,
    createdAt: string,
    updatedAt: string,
    documentsCount: number,
    totalBytes = 0n
  ) {
    try {
      const data = await this.prismaClient.providerStore.create({
        data: {
          storeName: storeDisplayName,
          providerStoreCreatedAt: new Date(createdAt),
          totalBytes,
          fileCount: documentsCount,
          provider: "GEMINI",
          storeRef,
          createdAt,
          userId,
          updatedAt,
          lastSyncedAt: new Date(updatedAt)
        },
        select: {
          storeRef: true,
          id: true,
          fileCount: true,
          storeName: true,
          createdAt: true,
          updatedAt: true,
          lastSyncedAt: true,
          userId: true,
          totalBytes: true
        }
      });
      const { totalBytes: size, ...spread } = data;
      return {
        totalBytes: size ? Number(size) : null,
        ...spread
      };
    } catch (err) {
      throw new Error(`something went wrong...${this.safeErrMsg(err)}`);
    }
  }

  public async createGrokVectorStore(
    userId: string,
    storeRef: string,
    storeDisplayName: string,
    createdAt: string,
    updatedAt: string,
    documentsCount: number,
    totalBytes = 0n
  ) {
    try {
      const data = await this.prismaClient.providerStore.create({
        data: {
          storeName: storeDisplayName,
          providerStoreCreatedAt: new Date(createdAt),
          totalBytes,
          fileCount: documentsCount,
          provider: "GROK",
          storeRef,
          createdAt,
          userId,
          updatedAt,
          lastSyncedAt: new Date(updatedAt)
        },
        select: {
          storeRef: true,
          id: true,
          fileCount: true,
          storeName: true,
          createdAt: true,
          updatedAt: true,
          lastSyncedAt: true,
          userId: true,
          totalBytes: true
        }
      });
      const { totalBytes: size, ...spread } = data;
      return {
        totalBytes: size ? Number(size) : null,
        ...spread
      };
    } catch (err) {
      throw new Error(
        `something went wrong creating Grok vector store...${this.safeErrMsg(err)}`
      );
    }
  }
  public async localVectorStoreCheck(
    provider: $Enums.Provider,
    userId: string
  ) {
    const vectorStoreCounts = await this.prismaClient.localVectorStore.count({
      where: { provider, userId }
    });
    return vectorStoreCounts > 0;
  }

  private lsBigintToNum(data: CreateLocalStoreRT<false>) {
    const { totalBytes, ...rest } = data;
    return {
      totalBytes: totalBytes ? Number(totalBytes) : null,
      ...rest
    } satisfies CreateLocalStoreRT<true>;
  }

  public async createLocalVectorStore({
    createdAt,
    provider,
    storeName,
    userId,
    defaultEmbeddingModel = "voyage-multimodal-3.5",
    documentsCount = 0,
    embeddingDim = 1024,
    lastSyncedAt = new Date(Date.now()),
    schemaVersion = "v1_0",
    totalBytes = 0n,
    totalChunks = 0
  }: CreateLocalStoreParams) {
    const select = {
      createdAt: true,
      totalBytes: true,
      totalChunks: true,
      defaultEmbeddingModel: true,
      embeddingDim: true,
      fileCount: true,
      schemaVersion: true,
      storeName: true,
      lastSyncedAt: true,
      provider: true,
      userId: true,
      id: true,
      updatedAt: true
    } as const;

    return await this.prismaClient.$transaction(async prisma => {
      const hasStore = await prisma.localVectorStore.count({
        where: { provider, userId }
      });
      if (hasStore > 0) {
        return this.lsBigintToNum(
          await prisma.localVectorStore.findUniqueOrThrow({
            where: { userId_provider_local: { provider, userId } },
            select
          })
        );
      } else {
        return this.lsBigintToNum(
          await prisma.localVectorStore.create({
            data: {
              provider,
              storeName,
              createdAt,
              userId,
              fileCount: documentsCount,
              embeddingDim,
              lastSyncedAt,
              schemaVersion,
              totalBytes,
              totalChunks,
              defaultEmbeddingModel
            },
            select
          })
        );
      }
    });
  }
  public collapsePageRef(target: (string | number)[]) {
    return target.join("::");
  }

  public expandPageRef(target: string | null) {
    if (target === null) return null;
    return target
      .split("::")
      .map(t => (/[0-9]{1,5}/.test(t) ? Number.parseInt(t) : t));
  }

  public async findManyLocalStoreDocs(
    provider: $Enums.Provider,
    userId: string
  ) {
    return await this.prismaClient.$transaction(async prisma => {
      const localstoreDocsFindMany = await prisma.attachment.findMany({
        where: {
          AND: [{ localVectorStoreDocs: { some: { provider } }, userId }]
        },
        select: {
          id: true,
          compatCdnUrl: true,
          localVectorStoreDocs: {
            where: { provider },
            select: {
              id: true,
              createdAt: true,
              lastAccessed: true,
              provenanceId: true,
              embeddingDim: true,
              embeddingModel: true,
              extractedTextLength: true,
              hasVisualMedia: true,
              pageCount: true,
              annotPages: true,
              imagePages: true,
              ext: true,
              conversationId: true,
              messageId: true,

              schemaVersion: true,
              storeId: true,
              imageCount: true,
              visualMediaHint: true,
              tokenCount: true,
              modelSelectionReason: true,
              updatedAt: true,
              indexedAt: true,
              provider: true,
              errorMessage: true,
              filename: true,
              mimeType: true,
              chunkCount: true,
              state: true,
              size: true,
              store: { select: { id: true, storeName: true } }
            }
          }
        }
      });

      const arr = Array.of<FindManyLocalStoreDocsShape>();
      for (const attachment of localstoreDocsFindMany) {
        const attachmentId = attachment.id;
        if (attachment.localVectorStoreDocs.length > 0) {
          for (const doc of attachment.localVectorStoreDocs) {
            const {
              store,
              annotPages: annotPgs,
              imagePages: imgPgs,
              size,
              provenanceId,
              ...docRest
            } = doc;
            const annotPages = this.expandPageRef(annotPgs) as number[] | null;
            const imagePages = this.expandPageRef(imgPgs) as number[] | null;
            const { conversationId, messageId, extension } =
              this.parseFilename(provenanceId);
            const { storeName, id: storeId } = store;
            const record = {
              ...docRest,
              ext: extension,
              attachmentId,
              conversationId,
              annotPages,
              imagePages,
              messageId,
              storeName,
              storeId,
              provenanceId,
              size: size ? Number(size) : null
            } satisfies FindManyLocalStoreDocsShape;
            arr.push(record);
          }
        }
      }
      return arr;
    });
  }

  public async vectorStoreInfoByProvider(
    userId: string,
    provider: $Enums.Provider
  ): Promise<
    XOR<
      {
        readonly totalBytes: 0;
        readonly storeRef: undefined;
        readonly dbId: undefined;
        readonly hasStore: false;
        readonly storeName: undefined;
        readonly fileCount: 0;
        readonly provider: $Enums.Provider;
      },
      {
        readonly totalBytes: number;
        readonly storeRef: string;
        readonly dbId: string;
        readonly hasStore: true;
        readonly storeName: string;
        readonly provider: $Enums.Provider;
        readonly fileCount: number;
      }
    >
  > {
    const getStore = await this.prismaClient.providerStore.findUnique({
      where: { userId_provider: { provider, userId } },
      select: {
        id: true,
        storeRef: true,
        fileCount: true,
        storeName: true,
        totalBytes: true
      }
    });

    let size = 0;
    if (getStore?.totalBytes) {
      size = Number(getStore.totalBytes);
    }
    if (getStore === null) {
      return {
        totalBytes: 0,
        storeRef: undefined,
        storeName: undefined,
        dbId: undefined,
        hasStore: false,
        fileCount: 0,
        provider
      } as const;
    } else {
      return {
        totalBytes: size,
        storeRef: getStore.storeRef,
        dbId: getStore.id,
        storeName: getStore.storeName,
        hasStore: true,
        provider,
        fileCount: getStore.fileCount
      } as const;
    }
  }
}
