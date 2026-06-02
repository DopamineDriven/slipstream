import type { ExtractService } from "@/extract/index.ts";
import type { FssDoc, StoreDocDbRegistryProps } from "@/gemini/types.ts";
import type {
  CreateGeminiDocParams,
  CreateManyGeminiDocsAgg,
  FindManyProviderStoreDocsAgg,
  VectorStoreInfoByProviderProps
} from "@/prisma/types.ts";
import type {
  CreateGrokProviderStoreDocParams,
  CreateManyGrokProviderStoreDocsProps,
  xAIDocDbRegistryProps
} from "@/xai/types.ts";
import { PrismaAttachmentProviderService } from "@/prisma/attachment-provider.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  ProviderStoreDocumentSingleton,
  ProviderStoreSingleton
} from "@slipstream/types";

export class PrismaProviderStoreService extends PrismaAttachmentProviderService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
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

  public async hasProviderStoreDocs(userId: string, provider: $Enums.Provider) {
    const count = await this.prismaClient.attachment.count({
      where: { AND: [{ providerStoreDocs: { some: { provider } }, userId }] }
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
    const arr = Array.of<CreateManyGeminiDocsAgg>();
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
          const { attachmentId } = this.parseDocname(dd.displayName);
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

  public async createProviderVectorStore(
    provider: $Enums.Provider,
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
          provider,
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
        `something went wrong creating ${provider.toLowerCase()} vector store...${this.safeErrMsg(err)}`
      );
    }
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
  }: CreateGeminiDocParams) {
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

      const arr = Array.of<FindManyProviderStoreDocsAgg>();

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
  public async vectorStoreInfoByProvider(
    userId: string,
    provider: $Enums.Provider
  ): Promise<VectorStoreInfoByProviderProps> {
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
