import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const fs = new Fs(process.cwd());
const managementApiKey = process.env.X_AI_MANAGEMENT_API_KEY ?? "";
const apiKey = process.env.X_AI_KEY ?? "";

async function deleteFile(ok: boolean, file_id: string) {
  if (ok) {
    return await fetch(`https://api.x.ai/v1/files/${file_id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      }
    });
  } else {
    throw new Error(
      `removeFileFromCollection error: file_id ${file_id} unable to be unlinked from associated collection, delete file operation aborted`
    );
  }
}

async function removeFileFromCollection(
  file_id: string,
  collection_id: string
) {
  return await fetch(
    `https://management-api.x.ai/v1/collections/${collection_id}/documents/${file_id}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managementApiKey}`
      }
    }
  );
}

(async (collection_id: string, file_id: string) => {
  const {
    promise,
    resolve,
    reject: _reject
  } = Promise.withResolvers<Response>();
  resolve(removeFileFromCollection(file_id, collection_id));
  return promise.then(res => deleteFile(res.ok, file_id));
})(
  "collection_09c83c12-e569-4303-a84e-1793f8c57432",
  "file_020e71e0-131a-4cef-8dce-05867f5d915a"
).then(async res => {
  const toJson = await res.json<{
    id: string;
    deleted: boolean;
    object: "file";
  }>();

  fs.withWs(
    "src/test/__out__/xai/inspect/delete-file-from-xai.json",
    JSON.stringify(toJson, null, 2)
  );
});
