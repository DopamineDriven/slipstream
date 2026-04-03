import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const fs = new Fs(process.cwd());

const apiKey = process.env.X_AI_KEY ?? "";
type FileData = {
  bytes: number;
  created_at: number; // milliseconds
  expires_at: null; // always null
  filename: string; // always `${conversationId}-${messageId}-${attachmentId}-${hexEncodedFilename}.${extension}` format
  id: string; // always prefixed with "file_" + uuid
  object: string; // always "file"
  purpose: string; // always an empty string ""
};

type GetFilesRT = {
  data: FileData[];
  next_token: string | null; // <- make it explicit; it's not optional anymore
};

class GetGrokFilesScript {
  constructor(private apiKey: string) {}

  private async fetchPage(url: URL) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    if (!res.ok)
      throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    const v = await res.json<GetFilesRT>();
    console.log(v);
    return v;
  }

  public async *getAllFilesxAI(limit = 10) {
    let token: string | null = null;
    const seenTokens = new Set<string>();

    for (let pageNumber = 0; ; pageNumber++) {
      const url = new URL("https://api.x.ai/v1/files");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("sort_by", "created_at");
      url.searchParams.set("order", "desc");
      if (token) url.searchParams.set("pagination_token", token);

      const page = await this.fetchPage(url);
      const next = page.next_token;

      // debug prove progress
      const firstId = page.data?.[0]?.id;
      const lastId = page.data?.[page.data.length - 1]?.id;
      console.log({
        pageNumber,
        token,
        next,
        n: page.data.length,
        firstId,
        lastId
      });

      yield page;

      // --- stop conditions ---
      if (next == null) break;
      if (next === token) break;
      if (seenTokens.has(next)) break;
      if (page.data.length === 0) break;
      // -----------------------

      seenTokens.add(next);
      token = next;
    }
  }
}

const grokFiles = new GetGrokFilesScript(apiKey);
const track = { size: 0, count: 0 };
const arr = Array.of<GetFilesRT>();
(async () => {
  for await (const x of grokFiles.getAllFilesxAI(10)) {
    if (x.data.length > 0) {
      for (const document of x.data) {
        track.size += document.bytes;
        track.count += 1;
      }
      // get file data + pagination token
      arr.push(x);
    }
  }
  return { pages: arr, totalBytes: track.size, totalCount: track.count };
})().then(v => {
  fs.withWs(
    "src/test/__out__/xai/inspect/list-files-xai.json",
    JSON.stringify(v, null, 2)
  );
  console.log(v.totalBytes);
});

/**
 this is how I handle it (successfully with 0 issue) for the documents (indexed docs) and collections (all collections) endpoints...not sure if the way we are trying to handle it is fucked or what


    * 2026-01-01
    * xai's pagination_token is broken.
    * paginates in place despite passing in the proper `pagination_token`...
    * this results in infinite looping
    *
    * Temporary workaround: set limit to n=2000 and handle defensively
    *
    * using a Set to track pagination_tokens
    *
    * break if previous_pagination_token = current_pagination_token between two consecutive fetches
```ts
class Workup {
   // ...
   private async *getAllFilesxAI(apiKey = this.xaiKey, limit = 2000) {
     let token: string | null = null;
     const seenTokens = new Set<string>();

     for (let pageNumber = 0; ; pageNumber++) {
       const url = new URL("https://api.x.ai/v1/files");
       url.searchParams.set("limit", String(limit));
       url.searchParams.set("sort_by", "created_at");
       url.searchParams.set("order", "desc");
       if (token) url.searchParams.set("pagination_token", token);

       const page = await this.fetchPage(url, apiKey);
       const next = page.pagination_token;

       const firstId = page.data?.[0]?.id;
       const lastId = page.data?.[page.data.length - 1]?.id;
       this.logger.info(
         {
           pageNumber,
           token,
           next,
           n: page.data.length,
           firstId,
           lastId
         },
         "xaiFetchAllFiles"
       );

       yield page;

       if (next == null) break;
       if (next === token) break;
       if (seenTokens.has(next)) break;
       if (page.data.length === 0) break;

       seenTokens.add(next);
       token = next;
     }
   }

   protected async *getAllCollections(
     limit = 10,
     mgmtKey = this.xaiManagementKey
   ) {
     let has_more = true;
     let count = 0;
     let pagination_token: string | undefined = undefined;
     let page_number = 0;

     while (has_more) {
       const url = pagination_token
         ? `https://management-api.x.ai/v1/collections?limit=${limit}&pagination_token=${pagination_token}`
         : `https://management-api.x.ai/v1/collections?limit=${limit}`;

       const response = await fetch(url, {
         method: "GET",
         headers: {
           "Content-Type": "application/json",
           Authorization: `Bearer ${mgmtKey}`
         }
       });

       const page = await response.json<ListCollectionsResponse>();

       has_more = typeof page.pagination_token !== "undefined";
       pagination_token = page.pagination_token;
       count += page.collections?.length ?? 0;

       yield {
         data: page.collections,
         count,
         page_number,
         has_more
       };

       page_number += 1;
     }
   }

   protected async *getAllCollectionDocuments(
     collection_id: string,
     limit = 10,
     mgmtKey = this.xaiManagementKey
   ) {
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
           Authorization: `Bearer ${mgmtKey}`
         }
       });

       const page = await response.json<GetDocumentsByCollectionId>();

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
  }
}
```
 */
