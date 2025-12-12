import JSONDATA from "@/test/__out__/xai/inspect/list-files-xai.json" with { type: "json" };
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

const data = JSONDATA as {
  bytes: number;
  created_at: number;
  expires_at: null;
  filename: string;
  id: string;
  object: string;
  purpose: string;
}[];

const file_ids = data.map(f => f.id);
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

async function _removeFileFromCollection(
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

const arr = Array.of<unknown>();

(async (file_ids: string[]) => {
  for (const file_id of file_ids) {
    const del = await deleteFile(true, file_id).then(t => t.json());
    arr.push(del);
  }
  return arr;
})(file_ids).then(value => {
  const toJson = value;

  fs.withWs(
    "src/test/__out__/xai/inspect/delete-files-from-xai-3.json",
    JSON.stringify(toJson, null, 2)
  );
});

console.log(file_ids.length);
