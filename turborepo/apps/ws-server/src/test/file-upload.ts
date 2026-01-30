import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { AttachmentSingleton } from "@slipstream/types";

dotenv.config({ quiet: true });

const _fs = new Fs(process.cwd());
const managementApiKey = process.env.X_AI_MANAGEMENT_API_KEY ?? "";
const apiKey = process.env.X_AI_KEY ?? "";
const teamId = process.env.X_AI_TEAM_ID ?? "";

// "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1765428155650-AI_Mythology__Doge_s_Digital_Pantheon.pdf"

export const fileData = {
  file_metadata: {
    file_id: "file_c6ecf02c-ec51-4e1b-865a-3d42cadb6eea",
    name: "otar363xasfkinkfpfyeyqz6-mllb0ie3eo5l9uitwwc8nn3x-b245re7lh9qp2nxp3v0kayo4-41495f4d7974686f6c6f67795f5f446f67655f735f4469676974616c5f50616e7468656f6e.pdf",
    size_bytes: "213817",
    content_type: "application/pdf",
    created_at: "2025-12-11T04:43:19.398417Z",
    expires_at: null,
    hash: "e2f5258b7103bf701b826ace37ddd8405ca28b6495be7056dbf7b88a45abb287",
    upload_status: "Complete",
    processing_status: "Processing",
    file_path: ""
  },
  fields: {
    attachmentId: "b245re7lh9qp2nxp3v0kayo4",
    conversationId: "otar363xasfkinkfpfyeyqz6",
    messageId: "mllb0ie3eo5l9uitwwc8nn3x",
    originalFilename: "AI_Mythology__Doge_s_Digital_Pantheon"
  },
  status: "DOCUMENT_STATUS_FAILED",
  error_message: "File conversion was not completed after max retries.",
  last_indexed_at: null
};

const attToUpload = {
  size: 110869,
  id: "h12l20d6hxnwnmzeuph6ted7",
  conversationId: "voxbi8kj9gm75mmiuxb7g4i9",
  draftId: "nrr6h4r4480f6kviycyo1zhf~voxbi8kj9gm75mmiuxb7g4i9~batch_mh0dleex~0",
  batchId: "batch_mh0dleex",
  generationGroupId: null,
  seriesId: null,
  userId: "nrr6h4r4480f6kviycyo1zhf",
  messageId: "ba7x7dogsafmazjfrjj8dte4",
  s3ObjectId:
    "s3://ws-server-assets-dev/upload/nrr6h4r4480f6kviycyo1zhf/1761039743324-Deep_Analysis_of_The_Claudtullus_Chronicles_-_Chapters_5_through_10.pdf#dnzrTH3bEGb6ioeeNqErRt2CW72GWtbb",
  origin: "UPLOAD",
  status: "READY",
  uploadMethod: "PRESIGNED",
  assetType: "DOCUMENT",
  uploadDuration: 681,
  cdnUrl:
    "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1761039743324-Deep_Analysis_of_The_Claudtullus_Chronicles_-_Chapters_5_through_10.pdf",
  publicUrl:
    "https://ws-server-assets-dev.s3.us-east-1.amazonaws.com/upload/nrr6h4r4480f6kviycyo1zhf/1761039743324-Deep_Analysis_of_The_Claudtullus_Chronicles_-_Chapters_5_through_10.pdf",
  sourceUrl:
    "https://ws-server-assets-dev.s3.us-east-1.amazonaws.com/upload/nrr6h4r4480f6kviycyo1zhf/1761039743324-Deep_Analysis_of_The_Claudtullus_Chronicles_-_Chapters_5_through_10.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA3MSF7Z3NS5XCR5MM%2F20251021%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20251021T094224Z&X-Amz-Expires=604800&X-Amz-Signature=31e55b203e2cb440f318c1e12e52ad9c323939a6479bdaf6a5cde3a06110dcf0&X-Amz-SignedHeaders=host&versionId=dnzrTH3bEGb6ioeeNqErRt2CW72GWtbb&x-amz-checksum-mode=ENABLED&x-id=GetObject",
  thumbnailKey: null,
  compatMime: "application/pdf",
  compatExt: "pdf",
  compatVersionId: "dnzrTH3bEGb6ioeeNqErRt2CW72GWtbb",
  compatKey:
    "upload/nrr6h4r4480f6kviycyo1zhf/1761039743324-Deep_Analysis_of_The_Claudtullus_Chronicles_-_Chapters_5_through_10.pdf",
  compatS3ObjectId:
    "s3://ws-server-assets-dev/upload/nrr6h4r4480f6kviycyo1zhf/1761039743324-Deep_Analysis_of_The_Claudtullus_Chronicles_-_Chapters_5_through_10.pdf#dnzrTH3bEGb6ioeeNqErRt2CW72GWtbb",
  compatStatus: "ALIASED",
  compatReadyAt: "2025-10-21T09:42:25.000Z",
  compatCdnUrl:
    "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1761039743324-Deep_Analysis_of_The_Claudtullus_Chronicles_-_Chapters_5_through_10.pdf",
  bucket: "ws-server-assets-dev",
  key: "upload/nrr6h4r4480f6kviycyo1zhf/1761039743324-Deep_Analysis_of_The_Claudtullus_Chronicles_-_Chapters_5_through_10.pdf",
  versionId: "dnzrTH3bEGb6ioeeNqErRt2CW72GWtbb",
  region: "us-east-1",
  cacheControl: null,
  contentDisposition: null,
  contentEncoding: null,
  expiresAt: "2025-10-28T09:42:24.676Z",
  filename:
    "Deep Analysis of The Claudtullus Chronicles - Chapters 5 through 10.pdf",
  ext: "pdf",
  mime: "application/pdf",
  etag: "eed44c91a83d5e416c064e4ce908607e",
  checksumAlgo: "CRC64NVME",
  checksumSha256: "xVhnmeAPAOU=",
  storageClass: null,
  sseAlgorithm: null,
  sseKmsKeyId: null,
  s3LastModified: "2025-10-21T09:42:25.000Z",
  deletedAt: null,
  createdAt: "2025-10-21T09:42:23.327Z",
  updatedAt: "2025-10-21T09:42:50.336Z",
  imageGenOutput: null,
  document: {
    attachmentId: "h12l20d6hxnwnmzeuph6ted7",
    format: "pdf",
    pageCount: 4,
    wordCount: null,
    language: null,
    title: null,
    author: null,
    subject: null,
    keywords: [""],
    pdfVersion: "1.7",
    isEncrypted: false,
    isSearchable: false,
    isLinearized: false,
    encoding: null,
    lineCount: null,
    textPreview: null,
    createdAt: "2025-10-21T09:42:25.028Z",
    updatedAt: "2025-12-07T06:08:07.050Z"
  }
} as const;
const {
  createdAt,
  updatedAt,
  s3LastModified,
  expiresAt,
  compatReadyAt,
  document: { createdAt: docCreatedAt, updatedAt: docUpdatedAt, ...doc },
  ...rest
} = attToUpload;

const sDoc = {
  ...rest,
  expiresAt: new Date(expiresAt),
  compatReadyAt: new Date(compatReadyAt),
  s3LastModified: new Date(s3LastModified),
  createdAt: new Date(createdAt),
  updatedAt: new Date(updatedAt),
  image: null,
  imageGenOutput: null,
  document: {
    ...doc,
    keywords: [""],
    createdAt: new Date(docCreatedAt),
    updatedAt: new Date(docUpdatedAt)
  }
} satisfies AttachmentSingleton<true>;

class FileUpload extends Fs {
  constructor(
    protected xaiKey: string,
    protected xaiManagementKey: string,
    protected xaiTeamId: string
  ) {
    super(process.cwd());
  }
  public safeErrMsg(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return String(err);
  }

  protected urlExtWorkup(attachment: AttachmentSingleton<true>) {
    const urlExtRecord = { url: "", ext: "", mime: "", xaiFilename: "" };
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
        urlExtRecord.xaiFilename = this.toXaiFilename(attachment);
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
        urlExtRecord.xaiFilename = this.toXaiFilename(attachment);
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
  protected filenameToHexExtTuple(
    url: string,
    compatStatus: ("FAILED" | "PENDING" | "ACTIVE" | "ALIASED") | null,
    encoded = true
  ) {
    const urlObj = new URL(url);

    const path = urlObj.pathname;

    const pathname = path.slice(path.lastIndexOf("/") + 1);

    const filename = compatStatus === "ACTIVE" ? pathname : pathname.slice(14);

    const dbFile = filename ?? `file.pdf`;

    const withoutExt = dbFile.slice(0, dbFile.lastIndexOf("."));

    const ext = dbFile.slice(dbFile.lastIndexOf(".") + 1);

    const name = encoded
      ? Buffer.from(withoutExt, "utf-8").toString("hex")
      : withoutExt;
    return [name, ext] as const;
  }

  protected toXaiFilename(att: AttachmentSingleton<true>) {
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

  protected async assetToTmpWorkup({
    assetType,
    compatStatus,
    conversationId,
    messageId,
    id,
    userId,
    ...rest
  }: AttachmentSingleton<true>) {
    const { ext, mime, url, xaiFilename } = this.urlExtWorkup({
      ...rest,
      assetType,
      compatStatus,
      conversationId,
      messageId,
      id,
      userId
    });

    const toTmpWorkupObj = {
      absTmpPath: "",
      tmpPrefix: "",
      tmpName: "",
      safeFilename: ""
    };

    toTmpWorkupObj.tmpPrefix = `xai-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;

    toTmpWorkupObj.tmpName = this.uniqueTmpName(toTmpWorkupObj.tmpPrefix, ext);

    const urlObj = new URL(url);

    let usefulName: string;

    if (conversationId && messageId) {
      // will always be defined as message and convoId for incoming assets are
      // database derived and incoming user messages are persisted fully so AI SDKs always receive db-synced data
      usefulName = xaiFilename;
    } else {
      usefulName = urlObj.pathname.replace(/\//gim, "-");
    }
    toTmpWorkupObj.safeFilename = usefulName;
    toTmpWorkupObj.absTmpPath = resolve(tmpdir(), toTmpWorkupObj.tmpName);
    return {
      tmpFilenamePrefix: toTmpWorkupObj.tmpPrefix,
      tmpUniquename: toTmpWorkupObj.tmpName,
      absTmpPath: toTmpWorkupObj.absTmpPath,
      ext,
      remoteUrl: url,
      safeFilename: toTmpWorkupObj.safeFilename,
      mime
    };
  }
  protected canParseFilename(filename: string) {
    return /^(?:[a-z0-9]+-){3}[a-f0-9]+\.[a-z0-9]+$/.test(filename);
  }

  protected parseFilename(filename: string) {
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

  protected async remoteToTmpWorkup(att: AttachmentSingleton<true>) {
    const {
      absTmpPath,
      ext,
      tmpUniquename,
      tmpFilenamePrefix,
      safeFilename,
      remoteUrl,
      mime: mimeType
    } = await this.assetToTmpWorkup(att);

    await this.fetchRemoteWriteLocalLargeFiles(remoteUrl, absTmpPath, false);
    if (this.exists(absTmpPath)) {
      return {
        tmpUniquename,
        absTmpPath,
        ext,
        tmpFilenamePrefix,
        safeFilename,
        mimeType
      };
    } else {
      throw new Error(
        `no tmp file exists having filename ${tmpUniquename} at absolute path ${absTmpPath}`
      );
    }
  }

  protected cleanupTmpPostupload(absTmpPath: string, tmpUniquename: string) {
    try {
      if (this.exists(absTmpPath)) {
        this.rmFile(absTmpPath);
        console.log(
          `cleaned up tmp file ${tmpUniquename} following xAI file upload.`
        );
      }
    } catch (err) {
      console.warn(
        `cleanup of tmp file ${tmpUniquename} having path ${absTmpPath} failed following xAI file upload.`.concat(
          this.safeErrMsg(err)
        )
      );
    }
  }
  public async uploadFile(formData: FormData, apiKey?: string) {
    const key = apiKey ?? this.xaiKey;
    return await fetch("https://api.x.ai/v1/files", {
      headers: {
        Authorization: `Bearer ${key}`
      },
      method: "POST",
      body: formData
    });
  }

  public async uploadFileJson(att: AttachmentSingleton<true>) {
    const { absTmpPath, safeFilename, tmpUniquename } =
      await this.remoteToTmpWorkup(att);
    const { mime, xaiFilename } = this.urlExtWorkup(att);

    console.log(xaiFilename);
    try {
      const formData = new FormData();

      const arr = Array.of<Buffer>();

      const rs = createReadStream(absTmpPath);

      const iterate = rs.iterator() as NodeJS.AsyncIterator<
        Buffer,
        undefined,
        any
      >;

      for await (const chunk of iterate) {
        arr.push(chunk);
      }

      const buf = Buffer.concat(arr);

      const file = new File([buf], safeFilename, { type: mime });

      formData.set("file", file, safeFilename);
      return await fetch("https://api.x.ai/v1/files", {
        headers: {
          Authorization: `Bearer ${this.xaiKey}`
        },
        method: "POST",
        body: formData
      });
    } catch (err) {
      console.error(this.safeErrMsg(err));
      throw new Error(this.safeErrMsg(err));
    } finally {
      this.wait(2000).then(() =>
        this.cleanupTmpPostupload(absTmpPath, tmpUniquename)
      );
    }
  }

  public async getMeta(file_id: string) {
    return await fetch(`https://api.x.ai/v1/files/${file_id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.xaiKey}`
      }
    });
  }

  public async promoteToCollection(
    documentId: string,
    collectionId: string,
    xaiFilename: string,
    mgmtKey?: string
  ) {
    const key = mgmtKey ?? this.xaiManagementKey;
    const {
      attachmentId,
      conversationId,
      fileName: originalFilename,
      messageId
    } = this.parseFilename(xaiFilename);
    return await fetch(
      `https://management-api.x.ai/v1/collections/${collectionId}/documents/${documentId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          fields: {
            conversationId,
            messageId,
            attachmentId,
            originalFilename
          }
        })
      }
    );
  }
}

const att = {
  id: "b245re7lh9qp2nxp3v0kayo4",
  conversationId: "otar363xasfkinkfpfyeyqz6",
  draftId: "nrr6h4r4480f6kviycyo1zhf~new-chat~batch_mj0ycazm~0",
  batchId: "batch_mj0ycazm",
  generationGroupId: null,
  seriesId: null,
  userId: "nrr6h4r4480f6kviycyo1zhf",
  messageId: "mllb0ie3eo5l9uitwwc8nn3x",
  s3ObjectId:
    "s3://ws-server-assets-dev/upload/nrr6h4r4480f6kviycyo1zhf/1765428155650-AI_Mythology__Doge_s_Digital_Pantheon.pdf#GOBxwMcZEiTIB3GkPdNJ2vu7M3PeHkhq",
  origin: "UPLOAD",
  status: "READY",
  uploadMethod: "PRESIGNED",
  assetType: "DOCUMENT",
  uploadDuration: 842,
  cdnUrl:
    "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1765428155650-AI_Mythology__Doge_s_Digital_Pantheon.pdf",
  publicUrl:
    "https://ws-server-assets-dev.s3.us-east-1.amazonaws.com/upload/nrr6h4r4480f6kviycyo1zhf/1765428155650-AI_Mythology__Doge_s_Digital_Pantheon.pdf",
  sourceUrl:
    "https://ws-server-assets-dev.s3.us-east-1.amazonaws.com/upload/nrr6h4r4480f6kviycyo1zhf/1765428155650-AI_Mythology__Doge_s_Digital_Pantheon.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA3MSF7Z3NS5XCR5MM%2F20251211%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20251211T044237Z&X-Amz-Expires=604800&X-Amz-Signature=eb245d240068241222f95c076c3ea55d151dc22762c9f115381c30f1686963c8&X-Amz-SignedHeaders=host&versionId=GOBxwMcZEiTIB3GkPdNJ2vu7M3PeHkhq&x-amz-checksum-mode=ENABLED&x-id=GetObject",
  thumbnailKey: null,
  compatMime: "application/pdf",
  compatExt: "pdf",
  compatVersionId: "GOBxwMcZEiTIB3GkPdNJ2vu7M3PeHkhq",
  compatKey:
    "upload/nrr6h4r4480f6kviycyo1zhf/1765428155650-AI_Mythology__Doge_s_Digital_Pantheon.pdf",
  compatS3ObjectId:
    "s3://ws-server-assets-dev/upload/nrr6h4r4480f6kviycyo1zhf/1765428155650-AI_Mythology__Doge_s_Digital_Pantheon.pdf#GOBxwMcZEiTIB3GkPdNJ2vu7M3PeHkhq",
  compatStatus: "ALIASED",
  compatReadyAt: new Date("2025-12-11T04:42:37.000Z"),
  compatCdnUrl:
    "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1765428155650-AI_Mythology__Doge_s_Digital_Pantheon.pdf",
  bucket: "ws-server-assets-dev",
  key: "upload/nrr6h4r4480f6kviycyo1zhf/1765428155650-AI_Mythology__Doge_s_Digital_Pantheon.pdf",
  versionId: "GOBxwMcZEiTIB3GkPdNJ2vu7M3PeHkhq",
  region: "us-east-1",
  cacheControl: null,
  contentDisposition: null,
  contentEncoding: null,
  expiresAt: new Date("2025-12-18T04:42:37.185Z"),
  filename: "AI Mythology_ Doge's Digital Pantheon.pdf",
  ext: "pdf",
  mime: "application/pdf",
  etag: "feff679df59a76aa09d2d6e42215dce1",
  checksumAlgo: "CRC64NVME",
  checksumSha256: "LD6m1UOdE+I=",
  storageClass: null,
  sseAlgorithm: null,
  sseKmsKeyId: null,
  s3LastModified: new Date("2025-12-11T04:42:37.000Z"),
  deletedAt: null,
  createdAt: new Date("2025-12-11T04:42:35.680Z"),
  updatedAt: new Date("2025-12-11T04:43:11.675Z"),
  providerLinks: [],
  document: {
    attachmentId: "b245re7lh9qp2nxp3v0kayo4",
    format: "pdf",
    pageCount: 8,
    wordCount: null,
    language: null,
    title: null,
    author: "(Skia/PDF m144 Google Docs Renderer",
    subject: "(AI Mythology: Doge's Digital Pantheon",
    keywords: ["(Skia/PDF m144 Google Docs Renderer"],
    pdfVersion: "1.4",
    isEncrypted: false,
    isSearchable: true,
    isLinearized: false,
    encoding: null,
    lineCount: null,
    textPreview: null,
    createdAt: new Date("2025-12-11T04:42:37.923Z"),
    updatedAt: new Date("2025-12-11T04:42:37.923Z")
  },
  image: null,
  imageGenOutput: null,
  size: 213817
} as const satisfies AttachmentSingleton<true>;

const fileUpload = new FileUpload(apiKey, managementApiKey, teamId);
async () => {
  return await fileUpload.uploadFileJson(att).then(v => {
    if (v.ok) {
      return v.json();
    } else return v.statusText;
  });
};

(async () => {
  return await fileUpload
    .promoteToCollection(
      "file_c8b7adf3-a033-4847-bbc0-cd19b0847d95",
      "collection_b338d912-6f45-4c57-9646-4dfe957974d9",
      "otar363xasfkinkfpfyeyqz6-mllb0ie3eo5l9uitwwc8nn3x-b245re7lh9qp2nxp3v0kayo4-41495f4d7974686f6c6f67795f5f446f67655f735f4469676974616c5f50616e7468656f6e.pdf",
      managementApiKey
    )
    .then(v => {
      if (v.ok) {
        return v.json();
      } else return v.statusText;
    });
})().then(data => {
  console.log(data);
});
