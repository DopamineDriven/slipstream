import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ExtractService } from "@/extract/index.ts";
import { PrismaUtilsService } from "@/prisma/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AttachmentProviderSingleton,
  AttachmentSingleton,
  ProviderStoreDocumentSingleton,
  XOR
} from "@slipstream/types";
import { DbService } from "@slipstream/db/node";

export interface AttachmentSingletonWithProvider<
  T extends $Enums.Provider
> extends AttachmentSingleton<true> {
  provider: T;
}

export type AttachmentSingletonProviderWorkup<T extends $Enums.Provider> =
  AttachmentSingleton<true> & { provider: T };
export class PrismaAttachmentProviderService extends PrismaUtilsService {
  public extractor: ExtractService;
  constructor(prisma: DbService, extractor: ExtractService, isProd: boolean) {
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

  public async updateGrokStore(
    userId: string,
    fileCount: number,
    totalSize: number,
    lastSyncedAt: Date
  ) {
    return await this.prismaClient.providerStore.update({
      data: { fileCount, lastSyncedAt, totalBytes: BigInt(totalSize) },
      where: { userId_provider: { userId, provider: "GROK" } },
      select: { id: true }
    });
  }

  public async createGeminiStoreDoc(
    userId: string,
    attachmentId: string,
    storeId: string,
    docRef: string,
    docUri: string,
    storeRef: string,
    filename: string,
    indexedAt: Date,
    mimeType: string,
    state: $Enums.ProviderDocState,
    size?: bigint
  ) {
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
            id: true,
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
          select: { storeRef: true, id: true }
        })
      ]);

      return {
        attachmentId: doc.attachmentId,
        docRef: doc.docRef,
        docUri: doc.docUri,
        state: doc.state,
        storeName: store.storeRef,
        docDbId: doc.id,
        storeDbId: store.id,
        lastAccessedAt: doc.lastAccessed ?? new Date(Date.now())
      };
    });
  }

  public async createGrokCollectionDocument(
    userId: string,
    attachmentId: string,
    storeId: string,
    storeRef: string,
    keyFingerprint = "server",
    mime: string,
    fileId: string,
    keyId?: string,
    size?: bigint,
    created_at?: string
  ) {
    return await this.prismaClient.$transaction(async prisma => {
      const [create, store] = await Promise.all([
        prisma.attachmentProvider.create({
          data: {
            state: "ACTIVE",
            errorCode: null,
            errorMessage: null,
            size,
            userKeyId: keyId,
            providerUri: `collections://${storeRef}/files/${fileId}`,
            provider: "GROK",
            keyFingerprint,
            attachmentId,
            storeId,
            mime,
            providerRef: fileId,
            readyAt: created_at,
            lastCheckedAt: created_at
          },
          select: {
            id: true,
            attachmentId: true,
            providerRef: true,
            lastCheckedAt: true
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
          select: { storeRef: true, id: true }
        })
      ]);

      return {
        attachmentId: create.attachmentId,
        fileId: create.providerRef ?? fileId,
        collectionId: store.storeRef,
        databaseId: create.id,
        storeDbId: store.id,
        lastAccessedAt: create.lastCheckedAt ?? new Date(Date.now())
      };
    });
  }

  public async upsertGrokAssetMapping(
    userId: string,
    attachmentId: string,
    storeId: string,
    storeRef: string,
    keyFingerprint = "server",
    mime: string,
    fileId: string,
    expirationTime: string,
    keyId?: string,
    size?: bigint,
    created_at?: string
  ) {
    const record = await this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId,
          provider: "GROK",
          keyFingerprint
        }
      },
      select: {
        id: true,
        attachmentId: true,
        providerRef: true,
        storeId: true,
        lastCheckedAt: true
      },
      update: {
        state: "ACTIVE",
        errorCode: null,
        errorMessage: null,
        size,
        userKeyId: keyId,
        providerUri: undefined,
        provider: "GROK",
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
        storeId,
        size,
        expiresAt: new Date(expirationTime),
        userKeyId: keyId,
        providerUri: undefined,
        provider: "GROK",
        keyFingerprint,
        attachmentId,
        mime,
        providerRef: fileId,
        readyAt: created_at,
        lastCheckedAt: created_at
      }
    });

    return {
      attachmentId: record.attachmentId,
      fileId: record.providerRef ?? fileId,
      collectionId: storeRef,
      databaseId: record.id,
      storeDbId: record.storeId ?? storeId,
      lastAccessedAt: record.lastCheckedAt ?? new Date()
    };
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

  // public async findManyStoreDocsByProvider(
  //   provider: $Enums.Provider,
  //   userId: string
  // ) {
  //   const storeName = this.vectorStoreDisplayName(userId);
  //   const prismaTransaction = await this.prismaClient.$transaction(
  //     async prisma => {
  //       const docsFindManyRes = await prisma.providerStore.findFirst({
  //         where: {
  //           AND: [{ docs: { some: { provider } }, storeName }]
  //         },
  //         include: {docs: true}
  //       });
  //     }
  //   );
  // }

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
                createdAt: true,
                store: {
                  where: { provider },
                  select: { id: true, storeRef: true }
                }
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
          storeId?: string | null;
          storeRef?: string | null;
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
                    lastCheckedAt: providerLink.lastCheckedAt,
                    storeId: providerLink.store?.id,
                    storeRef: providerLink.store?.storeRef
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
                    /**
                     * 120-year window for xAI
                     */
                    isExpired:
                      120 * 365.25 * 24 * 60 * 60 * 1000 <
                      Date.now() -
                        (providerLink.lastCheckedAt?.getTime() ??
                          providerLink.createdAt.getTime()),
                    userKeyId: providerLink.userKeyId,
                    providerUri: providerLink.providerUri,
                    lastCheckedAt: providerLink.lastCheckedAt,
                    storeId: providerLink.store?.id,
                    storeRef: providerLink.store?.storeRef
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
                    lastCheckedAt: providerLink.lastCheckedAt,
                    storeId: providerLink.store?.id,
                    storeRef: providerLink.store?.storeRef
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
    return count > 0 ? true : false;
  }

  public async hasProviderStore(userId: string, provider: $Enums.Provider) {
    const count = await this.prismaClient.providerStore.count({
      where: { AND: [{ provider, userId }] }
    });
    return count > 0 ? true : false;
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
      usefulName =
        provider === "GEMINI"
          ? `${id}.${ext}`
          : `${conversationId}-${messageId}-${id}-${assetType.toLowerCase()}.${ext}`;
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

  public async createVectorStoreGemini(
    userId: string,
    storeRef: string,
    storeDisplayName: string,
    createdAt: string,
    documentsCount: number
  ) {
    const data = await this.prismaClient.providerStore.create({
      data: {
        storeName: storeDisplayName,
        providerStoreCreatedAt: new Date(createdAt),
        totalBytes: 0n,
        fileCount: documentsCount,
        provider: "GEMINI",
        storeRef,
        userId,
        lastSyncedAt: new Date(createdAt)
      },
      select: {
        docs: {
          where: { provider: "GEMINI" },
          select: {
            attachmentId: true,
            lastAccessed: true,
            docRef: true,
            id: true,
            docUri: true,
            size: true,
            createdAt: true,
            provider: true,
            indexedAt: true,
            updatedAt: true,
            state: true,
            filename: true,
            errorMessage: true,
            storeId: true,
            mimeType: true
          }
        },
        storeRef: true,
        id: true,
        fileCount: true,
        storeName: true,
        lastSyncedAt: true,
        userId: true,
        totalBytes: true
      }
    });
    const { docs, totalBytes, ...spread } = data;
    const o = docs.map(v => {
      const { size, ...rest } = v;

      return {
        size: size ? Number(size) : null,
        ...rest
      };
    });
    return {
      totalBytes: totalBytes ? Number(totalBytes) : null,
      docs: o satisfies ProviderStoreDocumentSingleton<true>[],
      ...spread
    };
  }

  public async createVectorStoreGrok(
    userId: string,
    storeId: string,
    storeName: string,
    createdAt: string,
    documentsCount: number
  ) {
    return await this.prismaClient.$transaction(async prisma => {
      const data = await prisma.providerStore.create({
        data: {
          storeName,
          providerStoreCreatedAt: new Date(createdAt),
          totalBytes: 0n,
          fileCount: documentsCount,
          provider: "GROK",
          storeRef: storeId,
          userId,
          lastSyncedAt: new Date(createdAt)
        },
        select: {
          files: {
            where: { provider: "GROK" },
            select: {
              attachmentId: true,
              lastCheckedAt: true,
              providerRef: true,
              id: true,
              expiresAt: true,
              size: true,
              providerUri: true,
              keyFingerprint: true,
              userKeyId: true,
              createdAt: true,
              errorCode: true,
              errorMessage: true,
              provider: true,
              readyAt: true,
              updatedAt: true,
              state: true,
              storeId: true,
              mime: true
            }
          },
          storeRef: true,
          id: true,
          fileCount: true,
          lastSyncedAt: true,
          userId: true,
          totalBytes: true,
          provider: true
        }
      });
      const { files, totalBytes, ...spread } = data;
      const o = files.map(v => {
        const { size, ...rest } = v;

        return {
          size: size ? Number(size) : null,
          ...rest
        };
      });
      return {
        totalBytes: totalBytes ? Number(totalBytes) : null,
        files: o satisfies AttachmentProviderSingleton<true>[],
        ...spread
      };
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
