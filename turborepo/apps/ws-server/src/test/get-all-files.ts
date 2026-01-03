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
  pagination_token: string | null; // <- make it explicit; it's not optional anymore
};

class GetGrokFilesScript {
  constructor(private apiKey: string) {}

  private async fetchPage(url: URL): Promise<GetFilesRT> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    return (await res.json()) as GetFilesRT;
  }

  public async *getAllFilesxAI(limit = 1000) {
    let token: string | null = null;
    const seenTokens = new Set<string>();

    for (let pageNumber = 0; ; pageNumber++) {
      const url = new URL("https://api.x.ai/v1/files");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("sort_by", "created_at");
      url.searchParams.set("order", "desc");
      if (token) url.searchParams.set("pagination_token", token);

      const page = await this.fetchPage(url);
      const next = page.pagination_token;

      // debug prove progress
      const firstId = page.data?.[0]?.id;
      const lastId = page.data?.[page.data.length - 1]?.id;
      console.log({ pageNumber, token, next, n: page.data.length, firstId, lastId });

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
  for await (const x of grokFiles.getAllFilesxAI(2000)) {
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
