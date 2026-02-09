import type {
  CreateUserStoreParams,
  CreateUserStoreRT
} from "@/prisma/types.ts";
import type { Voyage } from "@/voyage/types.ts";
import { ExtractService } from "@/extract/index.ts";
import { PrismaLocalStoreService } from "@/prisma/local-store.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import { PrismaDbService } from "@slipstream/db/factory";
import {
  searchUserStoreChunksByStore,
  updateUserStoreChunkState,
  updateUserStoreDocState
} from "@slipstream/db/sql-node";

export class PrismaUserStoreService extends PrismaLocalStoreService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  public async hasUserStoreDocs(userId: string) {
    const count = await this.prismaClient.attachment.count({
      where: {
        userId,
        userStoreDoc: { isNot: null }
      }
    });
    return count > 0;
  }

  public async getAllUserStores(userId: string) {
    const allStores = await this.prismaClient.userStore.findMany({
      where: { userId },
      select: { storeName: true, id: true }
    });
    return allStores;
  }

  private userStoreBigIntToNum(data: CreateUserStoreRT<false>) {
    const { totalBytes, ...rest } = data;
    return {
      totalBytes: totalBytes ? Number(totalBytes) : 0,
      ...rest
    } satisfies CreateUserStoreRT<true>;
  }

  private get selectForUserStore() {
    return {
      createdAt: true,
      defaultEmbeddingDim: true,
      defaultEmbeddingModel: true,
      fileCount: true,
      id: true,
      lastSyncedAt: true,
      schemaVersion: true,
      storeName: true,
      totalBytes: true,
      totalChunks: true,
      updatedAt: true,
      userId: true
    } as const;
  }

  public async getUserStoreUnique(userId: string, storeName: string) {
    return this.userStoreBigIntToNum(
      await this.prismaClient.userStore.findUniqueOrThrow({
        where: { userId_storeName: { userId, storeName } },
        select: this.selectForUserStore
      })
    ) satisfies CreateUserStoreRT<true>;
  }

  public async createUserStore({
    storeName: inputName,
    userId,
    defaultEmbeddingDim = 1024,
    defaultEmbeddingModel = "voyage-multimodal-3.5",
    schemaVersion = "v1_0"
  }: CreateUserStoreParams) {
    return this.userStoreBigIntToNum(
      await this.prismaClient.userStore.create({
        data: {
          storeName: inputName,
          userId,
          defaultEmbeddingDim,
          defaultEmbeddingModel,
          schemaVersion,
          lastSyncedAt: new Date(Date.now())
        },
        select: this.selectForUserStore
      })
    );
  }

  public collapsePageRefEnumerable(target: (string | number)[]) {
    return target.join("::");
  }

  public expandPageRefEnumreable(target: string | null) {
    if (target === null) return null;
    return target
      .split("::")
      .map(t => (/\d+/.test(t) ? Number.parseInt(t) : t));
  }

  public async findManyUserStoreDocs(userId: string) {
    const docs = await this.prismaClient.userStoreDoc.findMany({
      where: { store: { userId } },
      include: { chunks: true }
    });
    return docs.map(({ size, ...rest }) => ({
      ...rest,
      size: Number(size)
    }));
  }

  public async hasUserStoreDoc(attachmentId: string) {
    const count = await this.prismaClient.userStoreDoc.count({
      where: { attachmentId }
    });
    return count > 0;
  }

  public async upsertUserStoreDoc({
    storeId,
    attachmentId,
    conversationId,
    messageId,
    originatingUrl,
    originatingModel,
    originatingProvider,
    provenanceId,
    filename,
    mimeType,
    ext,
    size,
    embeddingModel = "voyage-multimodal-3.5",
    embeddingDim = 1024,
    hasVisualMedia = false,
    visualMediaSource = null,
    visualMediaContent = null,
    pageCount = null,
    modelSelectionReason = null,
    state = "QUEUED",
    extractedTextLength = null,
    imageCount = null,
    imagePages = null,
    annotPages = null,
    tokenCount = 0,
    annots = null
  }: {
    storeId: string;
    attachmentId: string;
    conversationId: string;
    messageId: string;
    originatingUrl: string;
    originatingModel: string;
    originatingProvider: $Enums.Provider;
    provenanceId: string;
    filename: string;
    mimeType: string;
    ext: string;
    size: bigint;
    embeddingModel?: Voyage.ModelUnion;
    embeddingDim?: Voyage.EmbeddingDims;
    hasVisualMedia?: boolean;
    visualMediaSource?: $Enums.VisualMediaSource | null;
    visualMediaContent?: $Enums.VisualMediaContent | null;
    pageCount?: number | null;
    modelSelectionReason?: string | null;
    state?: $Enums.UserStoreDocState;
    extractedTextLength?: number | null;
    imageCount?: number | null;
    imagePages?: string | null;
    annotPages?: string | null;
    tokenCount?: number;
    annots?: {
      subtype: $Enums.AnnotSubtype;
      uri: string;
      rect: number[];
      startOffset: number;
      endOffset: number;
      pageNumber?: number | null;
      isCdnLink?: boolean;
      linkedDocId?: string | null;
      attachmentId?: string | null;
    }[] | null;
  }) {
    const annotsCreate = annots?.map(a => ({
      subtype: a.subtype,
      uri: a.uri,
      rect: a.rect,
      startOffset: a.startOffset,
      endOffset: a.endOffset,
      pageNumber: a.pageNumber ?? null,
      isCdnLink: a.isCdnLink ?? false,
      linkedDocId: a.linkedDocId ?? null,
      attachmentId: a.attachmentId ?? null
    }));
    return await this.prismaClient.userStoreDoc.upsert({
      where: { attachmentId },
      create: {
        storeId,
        attachmentId,
        conversationId,
        messageId,
        originatingUrl,
        originatingModel,
        originatingProvider,
        provenanceId,
        filename,
        mimeType,
        ext,
        size,
        embeddingModel,
        embeddingDim,
        hasVisualMedia,
        visualMediaSource,
        visualMediaContent,
        pageCount,
        modelSelectionReason,
        state,
        extractedTextLength,
        imageCount,
        imagePages,
        annotPages,
        tokenCount,
        ...(annotsCreate?.length ? { annots: { create: annotsCreate } } : {})
      },
      update: {
        embeddingModel,
        hasVisualMedia,
        visualMediaSource,
        visualMediaContent,
        pageCount,
        modelSelectionReason,
        state,
        extractedTextLength,
        imageCount,
        imagePages,
        annotPages,
        tokenCount,
        updatedAt: new Date(Date.now()),
        ...(annotsCreate?.length
          ? { annots: { deleteMany: {}, create: annotsCreate } }
          : {})
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

  public async createUserStoreChunk(
    provenanceId: string,
    storeId: string,
    docId: string,
    chunkIndex: number,
    content: string,
    contentHash: string,
    startOffset: number,
    endOffset: number,
    hasVisualContent: boolean,
    pageStartOffset: number | null = null,
    pageEndOffset: number | null = null,
    schemaVersion: $Enums.UserStoreSchemaVersion = "v1_0"
  ) {
    const { attachmentId, conversationId, messageId } =
      this.parseDocname(provenanceId);
    const chunkProvenanceId = this.toVectorStoreDocChunkProvenanceId(
      provenanceId,
      chunkIndex
    );
    return await this.prismaClient.userStoreDocChunk.create({
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
        hasVisualContent,
        pageStartOffset,
        pageEndOffset,
        tokenCount: 0,
        schemaVersion
      }
    });
  }

  public async updateUserStoreChunkTyped(
    ...args: updateUserStoreChunkState.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      updateUserStoreChunkState(...args)
    );
  }

  public async searchUserStoreChunks(
    storeId: string,
    embedding: string,
    limit: number,
    threshold: number
  ) {
    return await this.prismaClient.$queryRawTyped(
      searchUserStoreChunksByStore(storeId, embedding, limit, threshold)
    );
  }

  public async updateUserStoreDocStateTyped(
    ...args: updateUserStoreDocState.Parameters
  ) {
    return await this.prismaClient.$queryRawTyped(
      updateUserStoreDocState(...args)
    );
  }

  public async userStoreCheck(userId: string, storeName?: string) {
    const count = await this.prismaClient.userStore.count({
      where: storeName ? { userId, storeName } : { userId }
    });
    return count > 0;
  }

  public async findAttachmentByCdnUrl(uri: string) {
    return await this.prismaClient.attachment.findFirst({
      where: { OR: [{ cdnUrl: uri }, { compatCdnUrl: uri }] },
      select: {
        id: true,
        userStoreDoc: { select: { id: true } }
      }
    });
  }

  public async findUserStoreDocByAttachmentId(attachmentId: string) {
    return await this.prismaClient.userStoreDoc.findUnique({
      where: { attachmentId },
      select: { id: true }
    });
  }

  public async findDocumentAttachmentsForCdnCache(userId: string) {
    return await this.prismaClient.attachment.findMany({
      where: { userId, assetType: "DOCUMENT" },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        compatCdnUrl: true,
        compatStatus: true,
        conversationId: true,
        messageId: true,
        filename: true,
        ext: true,
        mime: true,
        compatExt: true,
        compatMime: true,
        userStoreDoc: { select: { id: true } }
      }
    });
  }
}
