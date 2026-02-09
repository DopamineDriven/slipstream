import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BigIntToCompatProps } from "@/types/index.ts";
import { ExtractService } from "@/extract/index.ts";
import { ModelService } from "@/models/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { AttachmentSingleton } from "@slipstream/types";
import { PrismaClient, PrismaDbService } from "@slipstream/db/factory";

export class PrismaUtilsService extends ModelService {
  protected readonly prismaClient: PrismaClient;

  public extractor: ExtractService;

  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    public isProd: boolean
  ) {
    super();
    this.prismaClient = prisma.p(false);
    this.extractor = extractor;
  }

  private parseFilenameRegex = /^(?:[a-z0-9]+-){3}[a-f0-9]+\.[a-z0-9]+$/;
  private parseFileWithChunkRegex =
    /[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-[a-f0-9]+\.[a-z0-9]+(#\d+)?/;

  public getEnv() {
    return this.isProd === true ? ("prod" as const) : ("dev" as const);
  }

  public vectorStoreDisplayName(userId: string) {
    const env = this.getEnv();
    return `${env}-${userId}`;
  }

  public defaultUserStoreName(userId: string) {
    const env = this.getEnv();
    return `${env}-${userId}`;
  }

  public localVectorStoreDisplayName(
    userId: string,
    provider: $Enums.Provider
  ) {
    const env = this.getEnv();
    return `${env}-${userId}-${provider.toLowerCase()}`;
  }
  protected parseDraftId(draftId: string) {
    if (/^(?:[A-Za-z0-9_-]+~){3}(?:0|[1-9][0-9]*)$/.test(draftId) === false) {
      throw new Error(`invalid draftId ${draftId}`);
    }
    const toArr = draftId.split("~");

    return toArr.map((v, o) =>
      o !== toArr.length - 1 ? v : Number.parseInt(v, 10)
    ) as [string, string, string, number];
  }

  protected bigintToNumber<
    const T extends "image_gen_request" | "ai_chat_request" =
      | "image_gen_request"
      | "ai_chat_request"
  >(
    _target: T,
    props: BigIntToCompatProps<T>["props"]
  ): BigIntToCompatProps<T>["rt"] {
    const { messages, ...rest } = props;
    const msgArr = messages.map(t => {
      const { attachments, ...rest } = t;

      const cleanAttachments = attachments.map(att => {
        const cleanLinks = att?.providerLinks?.map(v => {
          return {
            ...v,
            size: v.size ? Number(v.size) : null
          };
        });
        const size =
          typeof att.size === "bigint"
            ? att.size === 0n
              ? 0
              : Number(att.size)
            : null;
        const cleaned = {
          ...att,
          size,
          providerLinks: cleanLinks ?? undefined
        };

        return cleaned;
      });
      return { attachments: cleanAttachments, ...rest };
    });
    return { messages: msgArr, ...rest } as BigIntToCompatProps<T>["rt"];
  }

  protected toCompatPropsExtened<
    const T extends "image_gen_request" | "ai_chat_request" =
      | "image_gen_request"
      | "ai_chat_request"
  >(
    _target: T,
    rt: BigIntToCompatProps<T>["rt"],
    assetInfo: {
      /**
       * count of assets bound to the current user messsage
       */
      jobId?: string;
      requestMessageId?: string;
      assetCounts: number;
      assets?: {
        type: $Enums.AssetType;
        compatStatus: $Enums.CompatStatus;
        url: string;
        mime: string;
        ext: string;
      }[];
    }
  ): BigIntToCompatProps<T>["rtExtended"] {
    return {
      ...rt,
      ...assetInfo
    } satisfies BigIntToCompatProps<T>["rtExtended"];
  }

  protected convoId(conversationId?: string | null) {
    return conversationId && conversationId !== "new-chat"
      ? conversationId
      : null;
  }

  private urlLogWorkup(att: AttachmentSingleton<true>, provider?: $Enums.Provider){
    if (provider) {
     return `no compat status provided in attachment record ${att.id} for provider ${provider.toLowerCase()} having cdnUrl ${att.cdnUrl}`
    } else {
      return `no compat status provided in attachment record ${att.id} for user ${att.userId} having cdnUrl ${att.cdnUrl}`
    }
  }
  private urlExtWorkup(
    attachment: AttachmentSingleton<true>,
    provider: $Enums.Provider = "ANTHROPIC",
  ) {
    const urlExtRecord = { url: "", ext: "", mime: "" };


    try {
      if (!attachment.compatStatus)
        throw new Error(
          this.urlLogWorkup(attachment, provider)
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


  private async userStoreToTmpWorkup(
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
    const { ext, mime, url } = this.urlExtWorkup({
      ...rest,
      assetType,
      compatStatus,
      conversationId,
      messageId,
      id,
      userId
    });
    const {timestamp} = this.urlParseNonCompat(url);

    const tmpPrefix = `${timestamp}-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;
    const tmpName = this.extractor.uniqueTmpName(tmpPrefix, ext);
    const urlObj = new URL(url);

    let usefulName: string;
    if (conversationId && messageId) {
      // will always be defined as message and convoId for incoming assets are database derived
      // and incoming user messages are persisted fully so AI SDKs always receive db-synced data
      usefulName = displayName;
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
    const { ext, mime, url } = this.urlExtWorkup({
      ...rest,
      assetType,
      compatStatus,
      conversationId,
      messageId,
      id,
      userId
    }, provider);
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

  public async userStoreAssetToTmp(
    att: AttachmentSingleton<true>
  ) {
    const workup = await this.userStoreToTmpWorkup(att);
    if (!workup)
      throw new Error(
        `user ${att.userId} workup for ${att.id} not defined`
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
        `no tmp file exists having filename ${tmpUniquename} at absolute path ${absTmpPath} exist for user ${att.userId}`
      );
    }
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
    compatStatus: $Enums.CompatStatus | null,
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

  public urlParseCompat(url: string) {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const [toppath, basepaths] = [
      path.slice(path.lastIndexOf("/") + 1),
      path.slice(1, path.lastIndexOf("/"))
    ];
    const [attachmentId, ext] = [
      toppath.slice(4, toppath.lastIndexOf(".")),
      toppath.slice(toppath.lastIndexOf(".") + 1)
    ];
    const [origin, converted] = [
      basepaths.slice(0, basepaths.lastIndexOf("/")).toUpperCase(),
      basepaths.slice(basepaths.lastIndexOf("/") + 1)
    ];
    return {
      compatStatus: "ACTIVE",
      attachmentId,
      ext,
      // always "converted"
      converted,
      origin
    } as const;
  }
  public urlParseNonCompat(url: string) {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const [toppath, basepaths] = [
      path.slice(path.lastIndexOf("/") + 1),
      path.slice(1, path.lastIndexOf("/"))
    ];
    const [origin, userId] = [
      basepaths
        .slice(0, basepaths.lastIndexOf("/"))
        .toUpperCase() as $Enums.AssetOrigin,
      basepaths.slice(basepaths.lastIndexOf("/") + 1)
    ];
    const [timestamp, filename, ext] = [
      toppath.slice(0, 13),
      toppath.slice(14, toppath.lastIndexOf(".")),
      toppath.slice(toppath.lastIndexOf(".") + 1)
    ];
    return {
      compatStatus: "ALIASED",
      origin,
      userId,
      timestamp,
      filename,
      ext
    } as const;
  }

  public toUserStoreProvenanceId(att: AttachmentSingleton<true>) {
    if (!att.cdnUrl) throw new Error("attachment should not exist if cdnUrl is null.");
    let url: string;
    if (att.compatStatus === "ACTIVE" && att.compatCdnUrl) {
      url = att.compatCdnUrl;
    } else {
      url = att.cdnUrl;
    }
    const [filename, ext] = this.filenameToHexExtTuple(url, att.compatStatus);
    if (att.conversationId && att.messageId) {
      return `${att.conversationId}-${att.messageId}-${att.id}-${filename}.${ext}`;
    } else {
      throw new Error(`no conversationId or messageId set for ${att.id}`);
    }
  }
  public toVectorStoreFilename(att: AttachmentSingleton<true>) {
    if (!att.cdnUrl) throw new Error("attachment should not exist if cdnUrl is null.");
    let url: string;
    if (att.compatStatus === "ACTIVE" && att.compatCdnUrl) {
      url = att.compatCdnUrl;
    } else {
      url = att.cdnUrl;
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
    if (typeof a === "string") {
      if (!this.canParseDocname(a)) {
        throw new Error(
          this.safeErrMsg(
            `error in toVectorStoreDocChunkProvenanceId -- invalid provenance id ${a} provided`
          )
        );
      } else {
        return `${a}#${chunk}`;
      }
    }
    const provenanceId = this.toVectorStoreFilename(a);
    return `${provenanceId}#${chunk}`;
  }
  public canParseDocname(filename: string) {
    return this.parseFilenameRegex.test(filename);
  }
  public parseDocname(filename: string) {
    if (!this.canParseDocname(filename)) {
      throw new Error(
        "always guard parseDocname with its canParseDocname helper!"
      );
    }
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

  public canParseVectorStoreChunkProvenanceId(doc: string) {
    return this.parseFileWithChunkRegex.test(doc);
  }
  public parseVectorStoreChunkProvenanceId(doc: string) {
    if (!this.canParseVectorStoreChunkProvenanceId(doc)) {
      throw new Error(
        "always guard parseVectorStoreChunkProvenanceId with its canParseVectorStoreChunkProvenanceId helper!"
      );
    }
    const [conversationId, messageId, attachmentId, fileNameExt] = doc.split(
      "-"
    ) as [string, string, string, string];

    const [fileNameHex, extension, chunkNum] = [
      fileNameExt.slice(0, fileNameExt.lastIndexOf(".")),
      fileNameExt.slice(
        fileNameExt.lastIndexOf(".") + 1,
        fileNameExt.lastIndexOf("#")
      ),
      Number.parseInt(fileNameExt.slice(fileNameExt.lastIndexOf("#") + 1))
    ];
    const filename = Buffer.from(fileNameHex, "hex").toString("utf-8");
    return {
      conversationId,
      messageId,
      attachmentId,
      filename,
      extension,
      chunkNum
    };
  }
}
