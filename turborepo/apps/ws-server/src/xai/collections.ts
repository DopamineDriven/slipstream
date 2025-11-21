import { join, resolve } from "path";
import type { Logger } from "pino";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Fs } from "@d0paminedriven/fs";
import { Extract } from "@d0paminedriven/metadata";
import * as dotenv from "dotenv";
import { python } from "pythonia";

const fs = new Fs(process.cwd());
const meta = new Extract();

dotenv.config({ quiet: true });

// NOW get the environment variables - and verify they're loaded
const X_AI_KEY = process.env.X_AI_KEY ?? "";
const X_AI_MANAGEMENT_API_KEY = process.env.X_AI_MANAGEMENT_API_KEY ?? "";
const X_AI_COLLECTION = process.env.X_AI_COLLECTION ?? "";

interface XAIReturnedDocMetadata {
  file_id: string;
  name: string;
  size_bytes: number;
  content_type: string;
  created_at_nanos: number;
  created_at: number; // unix timestamp (seconds)
  hash: string;
  status: number;
}

export class GrokCollectionsService extends Fs {
  protected logger: Logger;
  private assetCache = new Map<
    string,
    { fileUri: string; expiresAt: Date; databaseId: string }
  >();
  private fileRegistry = new Map<string, XAIReturnedDocMetadata>();
  private lastRegistrySync: Date | null = null;

  constructor(
    logger: LoggerService,
    protected extract: ExtractService,
    protected prisma: PrismaService,
    protected xaiKey: string,
    protected xaiManagementKey: string,
    protected xaiCollection: string
  ) {
    super(process.cwd());
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[grok] " }
      );
  }
}
export async function uploadToCollections(
  filePath: string,
  filename?: string,
  contentType = "text/markdown"
) {
  const buffer = fs.fileToBuffer(filePath);

  const specs = await meta.extractRemote(buffer, 4096 * 96);
  contentType = specs.contentType ?? "text/markdown";
  console.log(`File buffer size: ${buffer.length} bytes`);

  // Create a single Python script that does everything in one async context
  const uploadScript = `
import asyncio
from xai_sdk import AsyncClient

async def main():
  try:
      # Create client
      client = AsyncClient(
          api_key="${X_AI_KEY}",
          management_api_key="${X_AI_MANAGEMENT_API_KEY}"
      )

      # Convert buffer data
      data = file_data
      if isinstance(data, dict):
          if 'data' in data:
              data = bytes(data['data'])
          else:
              data = bytes(list(data.values()))
      elif not isinstance(data, bytes):
          data = bytes(data)

      print(f"Uploading {len(data)} bytes to collection")

      # Upload document
      result = await client.collections.upload_document(
          collection_id="${X_AI_COLLECTION}",
          name="${filename ?? "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VII.md"}",
          data=data,
          content_type="${contentType}"
      )

      await client.close()

      # --- SNEK TRANSLATION LAYER ---
      # Node can't read SNEK protobufs -- extract protobuf to return readable JSON

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
  interface GlobalConfig {
    [key: string]: string | number | boolean;
  }
  // Inject the file data and execute
  const builtins = (await python("builtins")) as {
    exec: (
      uploadScript: unknown,
      global_dict: {
        __setitem__: (key: string, value: unknown) => Promise<unknown>;
        upload_result: Promise<XAIReturnedDocMetadata>;
      }
    ) => unknown;
    globals: () => Promise<GlobalConfig>;
  };
  // eslint-disable-next-line
  const exec_func = (await builtins.exec) as (
    uploadScript: unknown,
    global_dict: {
      __setitem__: (key: string, value: unknown) => Promise<unknown>;
      upload_result: Promise<XAIReturnedDocMetadata>;
    }
  ) => Promise<unknown>;
  // eslint-disable-next-line
  const globals_func = (await builtins.globals) as () => Promise<unknown>;

  const global_dict = (await globals_func()) as {
    __setitem__: (key: string, value: unknown) => Promise<unknown>;
    upload_result: Promise<XAIReturnedDocMetadata>;
  };

  // set file_data variables
  await global_dict.__setitem__("file_data", buffer);

  // exe the script
  await exec_func(uploadScript, global_dict);

  // extract result
  const doc = (await global_dict.upload_result) as XAIReturnedDocMetadata;
  if (!doc) {
    throw new Error("xAI Upload file to collections error (SNEK Bridge)");
  }
  return doc;
  // // extract known properties (translated from snek protobuf)
  // try {
  //   const result: Record<string, any> = {};
  //   // Try different property names
  //   for (const prop of [
  //     "created_at_nanos",
  //     "file_id",
  //     "content_type",
  //     "hash",
  //     "size_bytes",
  //     "name",
  //     "status",
  //     "created_at"
  //   ]) {
  //     try {
  //       const value = await doc[prop];
  //       if (typeof value !== "undefined") {
  //         result[prop] = value;
  //         // eslint-disable-next-line
  //         console.log(`  ${prop}: ${value}`);
  //       }
  //     } catch {
  //       console.log(`  ${prop}: not found`);
  //     }
  //   }

  //   return result;
  // } catch {
  //   console.log("Could not extract properties, returning raw doc");
  //   return { raw: doc };
  // }
}

(async () => {
  return await uploadToCollections(
    resolve(
      join(
        process.cwd(),
        "src/test/__out__/condensed/The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VII.md"
      )
    ),
    "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VII.md",
    "text/markdown"
  );
})()
  .then(res => {
    console.log("✅ Upload complete! Result:", res);
    return;
  })
  .catch(err => {
    console.error("❌ Upload failed:", err);
  });
