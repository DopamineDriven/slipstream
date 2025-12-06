import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { PythonBuiltIns, XAIReturnedDocMetadata } from "@/xai/types.ts";
import type { Logger } from "pino";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Fs } from "@d0paminedriven/fs";
import { python } from "pythonia";
import type { AttachmentSingleton } from "@slipstream/types";

export class GrokFilesService {
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
  }: AttachmentSingleton<true>) {
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

 protected async toTmpWorkup({
    assetType,
    compatStatus,
    conversationId,
    messageId,
    id,
    userId,
    ...rest
  }: AttachmentSingleton<true>) {
    const { ext, mime, url } = this.urlExtWorkup({
      ...rest,
      assetType,
      compatStatus,
      conversationId,
      messageId,
      id,
      userId
    });

    const tmpPrefix = `xai-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;
    const tmpName = this.fs.uniqueTmpName(tmpPrefix, ext);

    const urlObj = new URL(url);

    const path = urlObj.pathname.slice(urlObj.pathname.lastIndexOf("/") + 1);

    const filename = path
      .split(/(-)/gim)
      .filter((_, o) => o >= 2)
      .join("");

    const withoutExt = filename.split(".")?.[0] ?? "";

    const toHex = Buffer.from(withoutExt, "utf-8").toString("hex");

    let usefulName: string;

    if (conversationId && messageId) {
      // will always be defined as message and convoId for incoming assets are database derived and incoming user messages are persisted fully so AI SDKs always receive db-synced data
      usefulName = `${conversationId}-${messageId}-${id}-${toHex}.${ext}`;
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
          this.prisma.safeErrMsg(err)
        )
      );
    }
  }

  protected async uploadToFilesApi(att: AttachmentSingleton<true>, apiKey: string) {
    const { absTmpPath, tmpUniquename, mime, safeFilename } =
      await this.fetchRemoteToTmp(att);
    try {
      const F = new FormData();

      const fileSource = this.fs.fileToBuffer(absTmpPath);

      const file = new File([fileSource], safeFilename, { type: mime });

      F.set("file", file, safeFilename);

      const fetcher = await fetch(
        "https://api.x.ai/v1/files",
        {
          headers: {
            Authorization: `Bearer ${apiKey}`
          },
          method: "POST",
          body: F
        }
      );
      return await fetcher.json();
    } catch (err) {
      console.error(this.prisma.safeErrMsg(err));
    } finally {
      this.cleanupTmpPostupload(absTmpPath, tmpUniquename);
    }
  }


  private async fetchRemoteToTmp(att: AttachmentSingleton<true>) {
    const workup = await this.toTmpWorkup(att);
    if (!workup) throw new Error(`xai workup for ${att.id} not defined`);
    const {
      absTmpPath,
      ext,
      tmpUniquename,
      tmpFilenamePrefix,
      safeFilename,
      remoteUrl,
      mime
    } = workup;
    await this.fs.fetchRemoteWriteLocalLargeFiles(remoteUrl, absTmpPath, false);
    if (this.fs.existsTmp(tmpUniquename)) {
      return {
        tmpUniquename,
        absTmpPath,
        remoteUrl,
        ext,
        tmpFilenamePrefix,
        safeFilename,
        mime
      };
    } else {
      throw new Error(
        `no tmp file exists having filename ${tmpUniquename} at absolute path ${absTmpPath} exist for provider xAI`
      );
    }
  }

  private uploadToCollectionsApi(
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
    const {
      tmpUniquename,
      safeFilename,
      mime: mimeType,
      absTmpPath,
      ext
    } = await this.fetchRemoteToTmp(att);
    const uploadScript = this.uploadToCollectionsApi(safeFilename, absTmpPath, mimeType);
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
          console.log(
            `cleaned up tmp file ${tmpUniquename.slice(0, 37)}...(${ext})`
          );
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
