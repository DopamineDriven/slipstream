import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  AssetToTmpWorkupProps,
  PythonBuiltIns,
  UrlExtWorkupProps,
  XAIReturnedDocMetadata
} from "@/xai/types.ts";
import type { Logger } from "pino";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Fs } from "@d0paminedriven/fs";
import { python } from "pythonia";
import type { AttachmentSingleton } from "@slipstream/types";
import { $Enums } from "@slipstream/db/node/generated/client";

export class GrokCollectionsService {
  protected logger: Logger;
  protected fs: Fs;
  private assetCache = new Map<
    string,
    { fileUri: string; expiresAt: Date; databaseId: string }
  >();
  private fileRegistry = new Map<string, XAIReturnedDocMetadata>();
  private lastRegistrySync: Date | null = null;

  constructor(
    logger: LoggerService,
    fs: Fs,
    protected extract: ExtractService,
    protected prisma: PrismaService,
    protected xaiKey: string,
    protected xaiManagementKey: string,
    protected xaiCollection: string
  ) {
    this.fs = fs;
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[grok] " }
      );
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
    compatStatus,
    ext,
    compatMime,
    mime,
    id,
    assetType,
    conversationId,
    messageId,
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
      usefulName = `${userId}-${conversationId}-${messageId}-${id}-${assetType.toLowerCase()}.${extension}`;
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

  protected canParseFilename(filename: string) {
    return /^(?:[a-z0-9]+-){4}[a-z]+.[a-z]+$/.test(filename);
  }

  protected parseFilename(filename: string) {
    const toArr = filename.split("-");
    const splitFinal = toArr?.at(-1)?.split(".") ?? [""];

    const combined = [...toArr.slice(0, toArr.length - 1), ...splitFinal];
    // it's certain that these values exist since this method should
    // *only* be accessed after passing the canParseFilename check first
    return {
      userId: combined?.[0] ?? "",
      conversationId: combined?.[1] ?? "",
      messageId: combined?.[2] ?? "",
      attachmentId: combined?.[3] ?? "",
      assetType: (combined?.[4] ?? "").toUpperCase() as $Enums.AssetType,
      extension: combined?.[5] ?? ""
    };
  }

  protected toFilenameFormat(att: AttachmentSingleton<true>) {
    const { ext } = this.urlExtWorkup(att);
    if (att.conversationId && att.messageId) {
      return `${att.userId}-${att.conversationId}-${att.messageId}-${att.id}-${att.assetType.toLowerCase()}.${ext}`;
    } else return undefined;
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
      # Node can't read snek protobuf -- extract protobuf to return readable JSON

      meta = result.file_metadata

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
    const { tmpUniquename, safeFilename, mimeType, absTmpPath, ext } =
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
      console.error(this.prisma.safeErrMsg(err));
      throw err;
    } finally {
      try {
        if (this.fs.exists(absTmpPath)) {
          this.fs.rmFile(absTmpPath);
          console.log(`cleaned up tmp file ${tmpUniquename.slice(0,37)}...(${ext})`);
        }
      } catch (err) {
        console.warn(
          `cleanup of tmp file ${tmpUniquename} thought to be located at ${absTmpPath} failed following xAI file upload.`.concat(
            this.prisma.safeErrMsg(err)
          )
        );
      }
    }
  }
}
