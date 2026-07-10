// import JSONDATA from "@/test/__out__/xai/inspect/list-collections-documents.json" with { type: "json" };
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
  for (const s of [
    {
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
    }
  ]) {
    const fileId = s.file_metadata.file_id;
    const filename = s.file_metadata.name;
    await p
      .promoteToCollection(fileId, collectionId, filename, p.xaiManagementKey)
      .then(t => {
        if (!t.ok) {
          console.log(t.status);
          console.log(t.statusText);
        } else {
          t.json().then(v => {
            console.log(v);
          });
        }
      });
  }
})();
