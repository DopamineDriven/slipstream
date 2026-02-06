import type {
  CreateLocalStoreParams,
  CreateLocalStoreRT,
  FindManyLocalStoreDocsShape
} from "@/prisma/types.ts";
import type { Voyage } from "@/voyage/types.ts";
import { ExtractService } from "@/extract/index.ts";
import { PrismaProviderStoreService } from "@/prisma/provider-store.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { Rm, Unenumerate } from "@slipstream/types";
import { PrismaDbService } from "@slipstream/db/factory";
import {
  searchLocalDocChunksByStore,
  updateLocalDocChunkState,
  updateLocalDocState
} from "@slipstream/db/sql-node";

export class PrismaLocalStoreService extends PrismaProviderStoreService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  public async hasLocalVectorStoreDocs(
    userId: string,
    provider: $Enums.Provider
  ) {
    const count = await this.prismaClient.attachment.count({
      where: { AND: [{ localVectorStoreDocs: { some: { provider } }, userId }] }
    });
    return count > 0;
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
              chunks: {
                select: {
                  chunkProvenanceId: true,
                  chunkIndex: true,
                  startOffset: true,
                  errorMessage: true,
                  content: true,
                  endOffset: true,
                  state: true,
                  contentHash: true,
                  id: true
                }
              }
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
              chunks,
              chunkCount,
              annotPages: annotPgs,
              imagePages: imgPgs,
              size,
              provenanceId,
              ...docRest
            } = doc;

            const annotPages = this.expandPageRef(annotPgs) as number[] | null;

            const imagePages = this.expandPageRef(imgPgs) as number[] | null;

            const { conversationId, messageId, extension } =
              this.parseDocname(provenanceId);

            const localStoreName = this.localVectorStoreDisplayName(
              userId,
              "ANTHROPIC"
            );
            const chunkArr =
              Array.of<
                Rm<Unenumerate<typeof chunks>, "content" | "errorMessage">
              >();

            const chunkErrArr = Array.of<Unenumerate<typeof chunks>>();

            // TODO REPROCESS FAILED CHUNKS IN THE BACKGROUND VIA A VOID CALL BEFORE RETURN
            for (const t of chunks) {
              const { errorMessage, content, ...chunkRest } = t;
              if (t.state === "ERROR") {
                chunkErrArr.push({
                  errorMessage,
                  content,
                  ...chunkRest
                });
              } else {
                chunkArr.push({
                  ...chunkRest
                });
              }
            }

            const record = {
              ...docRest,
              ext: extension,
              attachmentId,
              chunkCount,
              conversationId,
              annotPages,
              imagePages,
              messageId,
              chunks,
              storeName: localStoreName,
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

  public async findLocalVectorStore(userId: string, provider: $Enums.Provider) {
    const exists = await this.localVectorStoreCheck(provider, userId);
    if (exists) {
      return this.lsBigintToNum(
        await this.prismaClient.localVectorStore.findUniqueOrThrow({
          where: { userId_provider_local: { provider, userId } }
        })
      );
    } else {
      return await this.createLocalVectorStore({
        storeName: this.localVectorStoreDisplayName(userId, provider),
        createdAt: new Date(),
        provider,
        userId
      });
    }
  }

  public async hasLocalStoreDocument(
    provider: $Enums.Provider,
    provenanceId: string,
    storeId: string
  ) {
    const count = await this.prismaClient.localVectorStoreDoc.count({
      where: {
        provenanceId,
        provider,
        storeId
      }
    });
    return count > 0;
  }

  public async upsertLocalStoreDoc({
    storeId,
    attachmentId,
    conversationId,
    messageId,
    provider,
    provenanceId,
    filename,
    mimeType,
    ext,
    size = null,
    embeddingModel = "voyage-multimodal-3.5",
    embeddingDim = 1024,
    hasVisualMedia = false,
    visualMediaHint = null,
    pageCount = null,
    imagePages = null,
    annotPages = null,
    modelSelectionReason = null,
    state = "PENDING"
  }: {
    storeId: string;
    attachmentId: string;
    conversationId: string;
    messageId: string;
    provider: $Enums.Provider;
    provenanceId: string;
    filename: string;
    mimeType: string;
    ext: string;

    size?: bigint | null;
    embeddingModel?: Voyage.ModelUnion;
    embeddingDim?: Voyage.EmbeddingDims;
    hasVisualMedia?: boolean;
    visualMediaHint?: $Enums.VisualMediaHint | null;
    pageCount?: number | null;
    imagePages?: string | null;
    annotPages?: string | null;
    modelSelectionReason?: string | null;
    state?: $Enums.ProviderDocState;
  }) {
    return await this.prismaClient.localVectorStoreDoc.upsert({
      where: { storeId_provenanceId: { storeId, provenanceId } },
      create: {
        storeId,
        attachmentId,
        conversationId,
        messageId,
        provider,
        provenanceId,
        filename,
        mimeType,
        ext,
        size,
        embeddingModel,
        embeddingDim,
        hasVisualMedia,
        visualMediaHint,
        pageCount,
        imagePages,
        annotPages,
        modelSelectionReason,
        state
      },
      update: {
        embeddingModel,
        hasVisualMedia,
        visualMediaHint,
        pageCount,
        imagePages,
        annotPages,
        modelSelectionReason,
        state,
        updatedAt: new Date(Date.now())
      },
      select: {
        id: true,
        provenanceId: true,
        state: true,
        storeId: true,
        attachmentId: true
      }
    });
  }

  public async createLocalDocChunk(
    provenanceId: string,
    storeId: string,
    docId: string,
    chunkIndex: number,
    content: string,
    contentHash: string,
    startOffset: number | null = null,
    endOffset: number | null = null,
    schemaVersion: $Enums.LocalStoreSchemaVersion = "v1_0"
  ) {
    const { attachmentId, conversationId, messageId } =
      this.parseDocname(provenanceId);
    const chunkProvenanceId = this.toVectorStoreDocChunkProvenanceId(
      provenanceId,
      chunkIndex
    );
    return await this.prismaClient.localVectorStoreDocChunk.create({
      data: {
        docId,
        storeId,
        chunkProvenanceId,
        chunkIndex,
        provenanceId,
        conversationId,
        messageId,
        attachmentId,
        state: "QUEUED",
        content: content.replace(/\0/g, ""),
        contentHash,
        startOffset,
        endOffset,
        tokenCount: 0, // placeholder, update this post-chunk completion
        schemaVersion
      }
    });
  }

  public async insertLocalDocChunkTyped(
    ...args: updateLocalDocChunkState.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      updateLocalDocChunkState(...args)
    );
  }

  public async searchLocalStoreChunks(
    storeId: string,
    embedding: string,
    limit: number,
    threshold: number
  ) {
    return await this.prismaClient.$queryRawTyped(
      searchLocalDocChunksByStore(storeId, embedding, limit, threshold)
    );
  }

  public async updateLocalStoreDocState(
    ...args: updateLocalDocState.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(updateLocalDocState(...args));
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
}
