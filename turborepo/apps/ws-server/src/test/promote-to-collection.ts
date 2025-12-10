import JSONDATA from "@/test/__out__/xai/inspect/list-collections-documents.json" with { type: "json" };
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const _fs = new Fs(process.cwd());

class Promotion {
  constructor(public xaiManagementKey: string) {}

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
  async promoteToCollection(
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

const p = new Promotion(process.env.X_AI_MANAGEMENT_API_KEY ?? "");
const collectionId = "collection_b338d912-6f45-4c57-9646-4dfe957974d9";

(async () => {
  console.log(JSONDATA.length);
  for (const s of JSONDATA) {
    const fileId = s.file_metadata.file_id;
    const filename = s.file_metadata.name;
    await p.promoteToCollection(
      fileId,
      collectionId,
      filename,
      p.xaiManagementKey
    );
  }
})();
