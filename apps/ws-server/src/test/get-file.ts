import { FileErrorRT, UploadFileRT } from "@/xai/types.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

const fs = new Fs(process.cwd());
dotenv.config({ quiet: true });

const apiKey = process.env.X_AI_KEY ?? "";

async function _getFileById(file_id: string, apiKey: string) {
  const res = await fetch(`https://api.x.ai/v1/files/${file_id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  });
  if (res.ok) {
    const file = await res.json<UploadFileRT>();
    return {
      ok: true,
      file
    } as const;
  } else {
    const file = await res.json<FileErrorRT>();
    return {
      ok: false,
      file
    } as const;
  }
}

async function getFileContent(file_id: string, apiKey: string) {
  const res = await fetch(`https://api.x.ai/v1/files/${file_id}/content`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  });
  if (res.ok) {
    const file = res.body as ReadableStream<Uint8Array> | null;
    if (!file) return await res.text();
    const reader = file.getReader();
    const arrUint8 = Array.of<Uint8Array>();
    while (true) {
      const { done, value } = await reader.read();
      if (value) arrUint8.push(value);
      if (done) break;
    }
    return Buffer.concat(arrUint8);
  } else {
    const file = await res.text();
    return file;
  }
}

getFileContent("file_1d0fd1b5-45f7-4db7-90b7-d238399b411c", apiKey).then(v => {
  fs.withWs(
    "src/test/xai/__out__/files/content/file_1d0fd1b5-45f7-4db7-90b7-d238399b411c.pdf",
    Buffer.from(v)
  );
  return v;
});
