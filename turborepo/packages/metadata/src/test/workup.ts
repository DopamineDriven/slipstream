import type { DocSpecs, ImageSpecs } from "@/types/index.ts";
import { Extract } from "@/extract/index.ts";

import { Fs } from "@d0paminedriven/fs";
import { cdnUrls } from "./data.ts";

interface ExpandedImgSpecs extends ImageSpecs {
  source?: string;
}
interface ExpandedDocSpecs extends DocSpecs {
  source?: string;
}

const extract = new Extract({ debug: false, });
const fs = new Fs(process.cwd());

(async (mapper: string[]) => {
  const arr = Array.of<ExpandedDocSpecs | ExpandedImgSpecs>();

  for (const target of mapper) {
    // For TIFF files, we need to read the entire file
    // coffee.tif is 184,509 bytes, so let's read it all
    arr.push(await extract.extractRemote(target, 48*4096));
  }
  return arr;
})([...cdnUrls]).then(v => {
  if (!v) {
    throw new Error("no value returned");
  } else {
    console.log(v);
    let i = 0;
    i < v.length;
    for (const vv of v) {
      i++;
      fs.withWs(
        `src/test/output/batch/${vv.type.toLowerCase()}/${vv.format}/${i}.json`,
        JSON.stringify(vv, null, 2)
      );
    }
  }
});
// codex resume 0199e5e3-7938-73f0-8afd-a95181ab5af2
/**
 [extractor 2025-10-15T03:59:21.101Z] extractRemote:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  size: 98304,
  timeout: 5000
}
[extractor 2025-10-15T03:59:21.101Z] fetchMinimalBuffer:probe:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  size: 98304,
  timeout: 5000
}
[extractor 2025-10-15T03:59:21.101Z] probeFirstChunk:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  bytes: 98304,
  deadlineMs: 2500,
  idleMs: 1200
}
[extractor 2025-10-15T03:59:21.122Z] probeFirstChunk:done {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  status: 206,
  total: 98304
}
[extractor 2025-10-15T03:59:21.122Z] fetchMinimalBuffer:probe:ok {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  status: 206
}
[extractor 2025-10-15T03:59:21.123Z] fetchMinimalBuffer:post-probe {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  contentType: 'image/jpeg',
  supportsRange: true,
  contentLength: 234825
}
[extractor 2025-10-15T03:59:21.123Z] fetch:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  method: 'GET',
  deadlineMs: 5000,
  range: 'bytes=0-98303'
}
[extractor 2025-10-15T03:59:21.137Z] fetch:done {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  method: 'GET',
  status: 206
}
[extractor 2025-10-15T03:59:21.140Z] fetchMinimalBuffer:range:first-bytes {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  size: 98304
}
[extractor 2025-10-15T03:59:21.140Z] extractRemote:buf {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  contentType: 'image/jpeg',
  bytes: 98304
}
[extractor 2025-10-15T03:59:21.140Z] imageWorkup:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  size: 98304,
  contentType: 'image/jpeg'
}
[extractor 2025-10-15T03:59:21.140Z] imageWorkup:done {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg',
  w: 1184,
  h: 864,
  fmt: 'jpeg'
}
[extractor 2025-10-15T03:59:21.140Z] extractRemote:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  size: 98304,
  timeout: 5000
}
[extractor 2025-10-15T03:59:21.140Z] fetchMinimalBuffer:probe:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  size: 98304,
  timeout: 5000
}
[extractor 2025-10-15T03:59:21.140Z] probeFirstChunk:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  bytes: 98304,
  deadlineMs: 2500,
  idleMs: 1200
}
[extractor 2025-10-15T03:59:21.159Z] probeFirstChunk:done {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  status: 206,
  total: 98304
}
[extractor 2025-10-15T03:59:21.160Z] fetchMinimalBuffer:probe:ok {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  status: 206
}
[extractor 2025-10-15T03:59:21.160Z] fetchMinimalBuffer:post-probe {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  contentType: 'image/png',
  supportsRange: true,
  contentLength: 562232
}
[extractor 2025-10-15T03:59:21.160Z] fetch:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  method: 'GET',
  deadlineMs: 5000,
  range: 'bytes=0-98303'
}
[extractor 2025-10-15T03:59:21.174Z] fetch:done {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  method: 'GET',
  status: 206
}
[extractor 2025-10-15T03:59:21.177Z] fetchMinimalBuffer:range:first-bytes {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  size: 98304
}
[extractor 2025-10-15T03:59:21.177Z] extractRemote:buf {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  contentType: 'image/png',
  bytes: 98304
}
[extractor 2025-10-15T03:59:21.177Z] imageWorkup:start {
  url: 'https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png',
  size: 98304,
  contentType: 'image/png'
}
 */
