import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const fs = new Fs(process.cwd());

const managementApiKey = process.env.X_AI_MANAGEMENT_API_KEY ?? "";

type RT = {
  documents: {
    file_metadata: {
      file_id: string;
      name: string;
      size_bytes: string;
      content_type: string;
      created_at: string;
      expires_at: null;
      hash: string;
      upload_status: string;
      processing_status: string;
      file_path: string;
    };
    fields: {
      attachmentId: string;
      conversationId: string;
      messageId: string;
      originalFilename: string;
    };
    status: string;
  }[];
  pagination_token?: string;
};

async function* getAllGrokFiles(collection_id: string, limit = 10) {
  let has_more = true;
  let count = 0;
  let pagination_token: string | undefined = undefined;
  let page_number = 0;

  while (has_more) {
    const url = pagination_token
      ? `https://management-api.x.ai/v1/collections/${collection_id}/documents?limit=${limit}&pagination_token=${pagination_token}`
      : `https://management-api.x.ai/v1/collections/${collection_id}/documents?limit=${limit}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managementApiKey}`
      }
    });

    const page = await response.json<RT>();

    has_more = typeof page.pagination_token !== "undefined";
    pagination_token = page.pagination_token;
    count += page.documents?.length ?? 0;

    yield {
      data: page.documents,
      count,
      page_number,
      has_more
    };

    page_number += 1;
  }
}
const arr = Array.of<{
  file_metadata: {
    file_id: string;
    name: string;
    size_bytes: string;
    content_type: string;
    created_at: string;
    expires_at: null;
    hash: string;
    upload_status: string;
    processing_status: string;
    file_path: string;
  };
  fields: {
    attachmentId: string;
    conversationId: string;
    messageId: string;
    originalFilename: string;
  };
  status: string;
}>();
const sizeTrack = { size: 0 };
for await (const x of getAllGrokFiles(
  "collection_5934cf24-b069-47c1-8964-7e495696c3b4"
)) {
  if (x.data) {
    for (const document of x.data) {
      sizeTrack.size += Number.parseInt(document.file_metadata.size_bytes);
      arr.push(document);
      console.log(document.fields);
    }
  }
}

fs.withWs(
  "src/test/__out__/xai/inspect/list-collections-documents.json",
  JSON.stringify(arr, null, 2)
);
// nrr6h4r4480f6kviycyo1zhf
// (async () => {
//   return await fetch(
//     "https://management-api.x.ai/v1/collections/collection_09c83c12-e569-4303-a84e-1793f8c57432/documents?limit=10&pagination_token=file_62f6c3f6-cdb4-4a0c-ba0c-26c2fa676f63",
//     {
//       method: "GET",
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Bearer ${managementApiKey}`
//       }
//     }
//   );
// })().then(async res => {
//   const toJson = await res.json();

// });
console.log(sizeTrack)
