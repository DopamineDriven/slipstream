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
  pagination_token?: string;
};

class GetGrokFilesScript {
  constructor(protected apiKey: string) {}

  public async *getAllFilesxAI(limit = 50) {
    let has_more = true;
    let count = 0;
    let pagination_token: string | undefined = undefined;
    let page_number = 0;

    while (has_more) {
      const url = pagination_token
        ? `https://api.x.ai/v1/files?limit=${limit}&pagination_token=${pagination_token}`
        : `https://api.x.ai/v1/files?limit=${limit}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        }
      });
      console.log(response);

      const page = await response.json<GetFilesRT>();
      console.log(page);

      has_more = typeof page.pagination_token !== "undefined";
      pagination_token = page.pagination_token;
      count += page.data?.length ?? 0;

      yield {
        page,
        count,
        page_number,
        has_more
      };

      page_number += 1;
    }
  }
}

const grokFiles = new GetGrokFilesScript(apiKey);
const track = { size: 0, count: 0 };
const arr = Array.of<GetFilesRT>();
(async () => {
  for await (const x of grokFiles.getAllFilesxAI(50)) {
    if (x.page.data.length > 0) {
      for (const document of x.page.data) {
        track.size += document.bytes;
        track.count += 1;
      }
      // get file data + pagination token
      arr.push(x.page);
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
