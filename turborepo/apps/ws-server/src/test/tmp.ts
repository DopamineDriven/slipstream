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

  private urlExtWorkup({
    cdnUrl,
    compatCdnUrl,
    compatStatus,
    ext,
    compatExt,
    id,
    mime,
    compatMime
  }: UrlExtWorkupProps) {
    const urlExtRecord = { url: "", ext: "", mime: "" };
    try {
      if (!compatStatus)
        throw new Error(
          `no compat status associated with attachmentId ${id}; something went wrong...`
        );
      if (
        compatStatus === "ACTIVE" &&
        compatCdnUrl &&
        compatExt &&
        compatMime
      ) {
        urlExtRecord.url = compatCdnUrl;
        urlExtRecord.ext = compatExt;
        urlExtRecord.mime = compatMime;
      }
      if (compatStatus === "ALIASED" && cdnUrl && ext && mime) {
        urlExtRecord.url = cdnUrl;
        urlExtRecord.ext = ext;
        urlExtRecord.mime = mime;
      }
    } finally {
      return urlExtRecord;
    }
  }

  private assetToTmpWorkup({
    cdnUrl,
    compatCdnUrl,
    compatExt,
    assetType,
    compatStatus,
    conversationId,
    ext,
    messageId,
    compatMime,
    mime,
    id,
    userId
  }: AssetToTmpWorkupProps) {
    const {
      ext: extension,
      url,
      mime: mimeType
    } = this.urlExtWorkup({
      cdnUrl,
      compatCdnUrl,
      compatStatus,
      compatExt,
      ext,
      id,
      mime,
      compatMime
    });
    const tmpPrefix = `xai-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;
    const tmpName = this.fs.uniqueTmpName(tmpPrefix, extension);
    const urlObj = new URL(url);

    let usefulName: string;
    if (conversationId && messageId) {
      // will always be defined as message and convoId for incoming assets are database derived and incoming user messages are persisted fully so AI SDKs always receive db-synced data
      usefulName = `${conversationId}-${messageId}-${id}-${assetType.toLowerCase()}.${extension}`;
    } else {
      usefulName = urlObj.pathname.replace(/\//gim, "-");
    }
    const safeFilename = usefulName;
    const absTmpPath = resolve(tmpdir(), tmpName);
    return {
      tmpFilenamePrefix: tmpPrefix,
      tmpUniquename: tmpName,
      absTmpPath,
      ext: extension,
      remoteUrl: url,
      safeFilename,
      mimeType
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
      mimeType
    } = this.assetToTmpWorkup(att);

    await this.fs.fetchRemoteWriteLocalLargeFiles(remoteUrl, absTmpPath, false);
    if (this.fs.existsTmp(tmpUniquename)) {
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
  protected canParseFilename(filename: string) {
    return /^(?:[a-z0-9]+-){3}[a-z]+.[a-z]+$/.test(filename);
  }

  protected parseFilename(filename: string) {
    const toArr = filename.split("-");
    const splitFinal = toArr?.at(-1)?.split(".") ?? [""];

    const combined = [...toArr.slice(0, toArr.length - 1), ...splitFinal];
    // it's certain that these values exist since this method
    // should *only* be accessed after passing the canParseFilename helper first
    return {
      conversationId: combined?.[0] ?? "",
      messageId: combined?.[1] ?? "",
      attachmentId: combined?.[2] ?? "",
      assetType: (combined?.[3] ?? "").toUpperCase() as $Enums.AssetType,
      extension: combined?.[4] ?? ""
    };
  }

  protected toFilenameFormat(att: AttachmentSingleton<true>) {
    const { ext } = this.urlExtWorkup(att);
    if (att.conversationId && att.messageId) {
      return `${att.userId}-${att.conversationId}-${att.messageId}-${att.id}-${att.assetType.toLowerCase()}.${ext}`;
    } else return undefined;
  }

  private pythonScript(
    displayFilename: string,
    absTmpPath: string,
    mimeType: string
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

      # Upload document
      result = await client.collections.upload_document(
          collection_id="${this.xaiCollection}",
          name="${displayFilename}",
          data=data,
          content_type="${mimeType}"
      )

      await client.close()

      # --- SNEK TRANSLATION LAYER ---
      # Node can't read snek's protobuf -- extract protobuf to return readable JSON

      meta = result.file_metadata
      # print(f"[Python] upload result {meta}")
      return {
          "file_id": meta.file_id,
          "name": meta.name,
          "size_bytes": meta.size_bytes,
          "content_type": meta.content_type,
          "created_at": meta.created_at.seconds, # Extract raw timestamp
          "hash": meta.hash,
          "created_at_nanos": meta.created_at.nanos,
          "status": result.status # Capture status from parent object
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
    const uploadScript = this.pythonScript(safeFilename, absTmpPath, mimeType);
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
      try {
        if (this.fs.exists(absTmpPath)) {
          this.fs.rmFile(absTmpPath);
          console.log(`cleaned up tmp file ${tmpUniquename}`);
        }
      } catch (err) {
        console.warn(
          `cleanup of tmp file ${tmpUniquename} having path ${absTmpPath} failed following xAI file upload.`.concat(
            this.safeErrMsg(err)
          )
        );
      }
    }
  }
}

const data = async () => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const datasourceUrl = await p.get("DIRECT_URL");
  const { PrismaClient } = await import("@slipstream/db/node/generated/client");
  const prismaClient = new PrismaClient({
    datasourceUrl
  });
  prismaClient.$connect();
  try {
    const data = await prismaClient.attachment.findMany({
      where: { assetType: "DOCUMENT" },
      take: 10,
      skip: 40,
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
  process.env.X_AI_COLLECTION ?? ""
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
