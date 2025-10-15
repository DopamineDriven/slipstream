import type { DocSpecs, ImageSpecs } from "@/types/index.ts";
import { Fs } from "@d0paminedriven/fs";
import { Extract } from "@/extract/index.ts";

interface ExpandedImgSpecs extends ImageSpecs {
  source?: string;
}
interface ExpandedDocSpecs extends DocSpecs {
  source?: string;
}

const extract = new Extract();


(async (mapper: string[]) => {
  const arr = Array.of<ExpandedDocSpecs | ExpandedImgSpecs>();
  for (const target of mapper) {
    arr.push(await extract.extractRemote(target, 4096 * 24));
  }
  return arr;
})([
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759612202052-pollingplaces_6_28_2022_19_13_50.xlsx",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758924156875-nice.gif",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759573423056-Poem_29_notes.docx",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759132826137-1759114340631-grok-video-ba76af9e-7820-4007-b9bd-0ea4f16dfdd9_1_.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758866145748-aicoalesce-og-final-II-scaled.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758787287505-Catullus_and_Lucan_on_Pompey_and_Caesar.docx",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758923529552-aicoalesce-vivified.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759137029117-IMG_4038.jpg",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759114340631-grok-video-ba76af9e-7820-4007-b9bd-0ea4f16dfdd9.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758787287506-Lucans_Pharsalia_1.129-157.docx",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760192077067-many-dildos.webp",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759640772691-minotaur.pdf",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759136462353-grok-video-7b9c6db1-6ff8-4da7-9278-f29837c6ca44.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759051021488-grok-video-7b9c6db1-6ff8-4da7-9278-f29837c6ca44.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758789194213-A_Day_in_Grokina_Grokamole_s_Truthful_Catullan_Vibe.pdf",
  "https://plus.unsplash.com/premium_photo-1680087014917-904bb37c5191?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=1335",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760156026798-scheming.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760156412369-claudtullus-ball-gag.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760156789890-geminsea-II.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760158409284-geminsea-grok_d.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760160195558-1758473236247-doge-troubleshoot.jpg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760162246260-doge-404.jpg",
  "https://assets-dev.aicoalesce.com/pasted/nrr6h4r4480f6kviycyo1zhf/1760162621832-Untitled-1.jpg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164229431-claudtullus-worships-at-the-alter.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164229435-claudtullus-dominated-2.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164229435-claudtullus-drowns-in-guac.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164229435-claudtullus-odi-et-amo.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164623698-claudtullus-no-no-2.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164623698-claudtullus-no-no.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164854906-grokina-gucced.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164854909-geminsea-unleashed.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164854910-geminsea-vivified-wow-such-latex.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164854910-geminsea-vivified-2.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164854910-geminsea-vivified.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760164854909-grokina-manic.jpeg",
  "https://assets-dev.aicoalesce.com/pasted/nrr6h4r4480f6kviycyo1zhf/1760190986084-1c85a346b669b283e6bdda710cc8a91ff516cc8bd3a1cc3c60abc7e7d945664b.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760191413672-yes-this-is-doge.jpg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760191949178-1758533078923-IMG_1430.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760192077067-many-dildos.webp",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760193375810-1758533078922-IMG_1724.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760348723889-Claudtullus-Chronicles-ToC.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760348928802-AI_Persona_Myth-Making_Micro-Play.pdf",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760349645436-__Deep_Analysis_of__The_Claudtullus_Chronicles___Chapters_5_10___.pdf",
  "https://assets-dev.aicoalesce.com/pasted/nrr6h4r4480f6kviycyo1zhf/1760351792619-image.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760427922153-geminsea-claudtullus.jpeg",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155286279-grokina-suprema.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760433860219-geminsea-claudtullus.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760350248694-worship-guac117.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760155732674-geminsea.png"
]).then(v => {
  const fs = new Fs(process.cwd());
  if (!v) {
    throw new Error("no value returned");
  } else {
    console.log(v);
    fs.withWs(`src/test/output/${Date.now()}.json`, JSON.stringify(v, null, 2));
    return v;
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
