import { tmpdir } from "os";
import { resolve } from "path";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { python } from "pythonia";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { AttachmentSingleton, UserKeySingleton } from "@slipstream/types";

dotenv.config({ quiet: true, path: ".env" });

export type MaybePromise<T> = T | Promise<T>;

export interface UrlExtWorkupProps {
  id: string;
  compatStatus: $Enums.CompatStatus | null;
  ext: string | null;
  compatExt: string | null;
  cdnUrl: string | null;
  compatCdnUrl: string | null;
  mime: string | null;
  compatMime: string | null;
}

export interface AssetToTmpWorkupProps extends UrlExtWorkupProps {
  userId: string;
  conversationId: string | null;
  origin: $Enums.AssetOrigin;
  messageId: string | null;
  assetType: $Enums.AssetType;
}

export type XAIReturnedDocMetadata = {
  file_id: string;
  name: string;
  size_bytes: number;
  content_type: string;
  created_at_nanos: number;
  created_at: number; // unix timestamp (seconds)
  hash: string;
  status: number;
  error: undefined;
};

export type GlobalDictProps = {
  upload_result: Promise<XAIReturnedDocMetadata>;
};

export type PythonExecType = (
  uploadScript: string,
  global_dict: {
    upload_result: Promise<XAIReturnedDocMetadata>;
  }
) => MaybePromise<unknown>;

export type PythonGlobalsType = () => Promise<GlobalDictProps>;

export type PythonBuiltIns = {
  exec: Promise<PythonExecType>;
  globals: Promise<PythonGlobalsType>;
};

export class GrokFileServiceWorkup {
  protected fs: Fs;

  private assetCache = new Map<
    string,
    { fileUri: string; expiresAt: Date; databaseId: string }
  >();
  private fileRegistry = new Map<string, XAIReturnedDocMetadata>();
  private lastRegistrySync: Date | null = null;
  constructor(
    fs: Fs,
    protected xaiKey: string,
    protected xaiManagementKey: string,
    protected xaiCollection: string
  ) {
    this.fs = fs;
  }
  protected safeErrMsg(err: unknown) {
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

  private urlExtWorkup(attachment: AttachmentSingleton<true>) {
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

  protected async getCollectionByUserId(userId: string) {
    return await fetch(
      `https://management-api.x.ai/v1/collections?filter=collection_name:${userId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.xaiManagementKey}`
        }
      }
    );
  }

  private filenameToHex(url: string) {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const pathname = path.slice(path.lastIndexOf("/") + 1);
    const filename = pathname.slice(14);
    const dbFile = filename ?? `file.pdf`;

    const withoutExt = dbFile.slice(0, dbFile.lastIndexOf("."));

    return Buffer.from(withoutExt, "utf-8").toString("hex");
  }

  private toXaiFilename(att: AttachmentSingleton<true>) {
    let url: string;
    if (att.compatStatus === "ACTIVE" && att.compatCdnUrl) {
      url = att.compatCdnUrl;
    } else if (att.compatStatus === "ALIASED" && att.cdnUrl) {
      url = att.cdnUrl;
    } else {
      url = "";
    }
    if (att.conversationId && att.messageId && att.compatExt) {
      return `${att.conversationId}-${att.messageId}-${att.id}-${this.filenameToHex(url)}.${att.compatExt}`;
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

    toTmpWorkupObj.tmpName = this.fs.uniqueTmpName(
      toTmpWorkupObj.tmpPrefix,
      ext
    );

    const urlObj = new URL(url);

    let usefulName: string;

    if (conversationId && messageId) {
      // will always be defined as message and convoId for incoming assets are database derived and incoming user messages are persisted fully so AI SDKs always receive db-synced data
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

  private async remoteToTmpWorkup(att: AttachmentSingleton<true>) {
    const {
      absTmpPath,
      ext,
      tmpUniquename,
      tmpFilenamePrefix,
      safeFilename,
      remoteUrl,
      mime: mimeType
    } = await this.assetToTmpWorkup(att);

    await this.fs.fetchRemoteWriteLocalLargeFiles(remoteUrl, absTmpPath, false);
    if (this.fs.exists(absTmpPath)) {
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
      if (this.fs.exists(absTmpPath)) {
        this.fs.rmFile(absTmpPath);
        console.log(
          `cleaned up tmp file ${tmpUniquename} following xai file upload.`
        );
      }
    } catch (err) {
      console.warn(
        `cleanup of tmp file ${tmpUniquename} having path ${absTmpPath} failed following xai file upload.`.concat(
          this.safeErrMsg(err)
        )
      );
    }
  }
  protected canParseFilename(filename: string) {
    return /^(?:[a-z0-9]+-){3}[a-f0-9]+\.[a-z]+$/.test(filename);
  }

  protected parseFilename(filename: string) {
    if (!this.canParseFilename(filename))
      throw new Error(
        "always guard parseFilename with its canParseFilename helper!"
      );

    const [conversationId, messageId, attachmentId, fileNameExt] =
      filename.split("-") as [string, string, string, string];
    const [fileNameHex, extension] = fileNameExt.split(".") as [string, string];

    const fileName = Buffer.from(fileNameHex, "hex").toString("utf-8");

    return {
      conversationId,
      messageId,
      attachmentId,
      fileName,
      extension
    };
  }

  private pythonScript(
    displayFilename: string,
    absTmpPath: string,
    mimeType: string,
    conversationId: string,
    messageId: string,
    attachmentId: string,
    originalFilename: string
  ) {
    // prettier-ignore
    return  `import asyncio
import os
from xai_sdk import AsyncClient

async def main():
  try:
      client = AsyncClient(
          api_key="${this.xaiKey}",
          management_api_key="${this.xaiManagementKey}"
      )

      file_path = r"${absTmpPath}"

      if not os.path.exists(file_path):
          return {"error": f"File not found at {file_path}"}

      with open(file_path, "rb") as file:
          data = file.read()

      print(f"[Python] Uploading {len(data)} bytes from disk to xAI collection...")

      fields = {
          "conversationId": "${conversationId}",
          "messageId": "${messageId}",
          "attachmentId": "${attachmentId}",
          "originalFilename": "${originalFilename}"
      }

      # Upload document
      result = await client.collections.upload_document(
          collection_id="${this.xaiCollection}",
          name="${displayFilename}",
          data=data,
          content_type="${mimeType}",
          fields=fields
      )

      await client.close()

      # --- SNEK TRANSLATION LAYER ---
      # Node can't read snek's protobuf -- extract protobuf to return readable JSON

      meta = result.file_metadata
      print(f"[Python] upload result {meta}")
      return {
          "file_id": meta.file_id,
          "name": meta.name,
          "size_bytes": meta.size_bytes,
          "content_type": meta.content_type,
          "created_at": meta.created_at.seconds, # Extract raw timestamp
          "hash": meta.hash,
          "created_at_nanos": meta.created_at.nanos,
          "status": result.status
      }
  except Exception as e:
      return {"error": str(e)}
# Run the upload
upload_result = asyncio.run(main())
`;
  }

  public async exeScript(att: AttachmentSingleton<true>) {
    const { tmpUniquename, safeFilename, mimeType, absTmpPath } =
      await this.remoteToTmpWorkup(att);
    console.log(safeFilename);

    const uploadScript = this.pythonScript(
      safeFilename,
      absTmpPath,
      mimeType,
      att.conversationId ?? "new-chat",
      att.messageId ?? "new-message",
      att.id,
      att.filename ?? `content`
    );
    try {
      const builtins = (await python("builtins")) as PythonBuiltIns;

      const exec_func = await builtins.exec;

      const globals_func = await builtins.globals;

      const global_dict = await globals_func();

      await exec_func(uploadScript, global_dict);

      const doc = await global_dict.upload_result;

      if (!doc) {
        throw new Error("xAI Upload file to collections error (SNEK Bridge)");
      } else {
        return doc;
      }
    } catch (err) {
      console.error(this.safeErrMsg(err));
      throw err;
    } finally {
      this.cleanupTmpPostupload(absTmpPath, tmpUniquename);
    }
  }
}

const data = async () => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const datasourceUrl = await p.get("DIRECT_URL");
  const _datasource = process.env.DIRECT_URL ?? datasourceUrl;
  const { PrismaDbService } = await import("@slipstream/db/factory");
  const prismaClient = new PrismaDbService({
    connectionString: datasourceUrl
  }).p(false);
  prismaClient.$connect();
  try {
    const data = await prismaClient.attachment.findMany({
      where: { assetType: "DOCUMENT" },
      take: 10,
      skip: 30,
      orderBy: { createdAt: "desc" },
      include: {
        providerLinks: { include: { userKey: true } },
        document: true,
        image: true,
        imageGenOutput: true
      }
    });
    return data.map(t => {
      const { size, ...p } = t;
      const mapProviderSingleton = p?.providerLinks?.map(v => {
        const { size, userKey, ...s } = v;
        return {
          userKey: userKey as undefined | UserKeySingleton<true>,
          size: size ? Number(size) : null,
          ...s
        };
      });

      return {
        ...p,
        size: size ? Number(size) : null,
        providerLinks: mapProviderSingleton
      };
    });
  } catch (err) {
    throw new Error(
      typeof err === "string"
        ? err
        : err instanceof Error
          ? err.message
          : "there was a problem in providerLinks test query..."
    );
  } finally {
    prismaClient.$disconnect();
  }
};
const fs = new Fs(process.cwd());

const grokFileService = new GrokFileServiceWorkup(
  fs,
  process.env.X_AI_KEY ?? "",
  process.env.X_AI_MANAGEMENT_API_KEY ?? "",
  "collection_b338d912-6f45-4c57-9646-4dfe957974d9"
);

(async () => {
  const vv = await data();
  const start = performance.now();
  const arr = Array.of<XAIReturnedDocMetadata>();
  for (const v of vv) {
    const d = await grokFileService.exeScript(v);
    arr.push(d);
  }
  console.log(`duration: ${performance.now() - start}`);
  return arr;
})().then(res => {
  console.log(res);
  python.exit();
  return;
});
