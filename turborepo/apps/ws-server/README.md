## Node.js WebSocket Server

*details coming soon*


```ts
class GrokCollectionsService{
  // other code...
  private pythonScript(
    xaiCollectionId: string,
    displayFilename: string,
    absTmpPath: string,
    mimeType: string,
    conversationId: string,
    messageId: string,
    attachmentId: string,
    originalFilename: string,
    apiKey?: string,
    mgmtKey?: string
  ) {
    const key = apiKey ?? this.xaiKey;
    const managementKey = mgmtKey ?? this.xaiManagementKey;
    // prettier-ignore
    return  `import asyncio
import os
from xai_sdk import AsyncClient

async def main():
  try:
      client = AsyncClient(
          api_key="${key}",
          management_api_key="${managementKey}"
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
          collection_id="${xaiCollectionId}",
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

  /**
   * NOTE DO NOT USE THIS METHOD
   * IT IMPROPERLY INDEXES FILES -- MUST USE THE `uploadFileAndPromoteToCollection` method instead
   */
  private async uploadFileToCollection(
    xaiCollectionId: string,
    att: AttachmentSingleton<true>,
    apiKey?: string
  ) {
    const key = apiKey ?? this.xaiKey;
    const { tmpUniquename, safeFilename, mimeType, absTmpPath } =
      await this.remoteToTmpWorkup(att);

    const file = this.toXaiFilename(att);
    const { fileName } = this.parseFilename(file);

    const uploadScript = this.pythonScript(
      xaiCollectionId,
      safeFilename,
      absTmpPath,
      mimeType,
      att.conversationId ?? "new-chat",
      att.messageId ?? "new-message",
      att.id,
      fileName ?? `content`,
      key
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
      console.error(this.prisma.safeErrMsg(err));
      throw err;
    } finally {
      this.cleanupTmpPostupload(absTmpPath, tmpUniquename);
    }
  }
}
```
