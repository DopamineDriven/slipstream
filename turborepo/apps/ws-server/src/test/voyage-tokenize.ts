import { VoyageEmbeddingService } from "@/voyage/index.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

async function countBulkMultimodal() {
  const { tmpdir } = await import("os");
  const { resolve } = await import("path");
  const { Credentials } = await import("@slipstream/credentials");
  const creds = new Credentials();
  const voyageApiKey = await creds.get("VOYAGE_API_KEY");
  const voyage = new VoyageEmbeddingService(voyageApiKey);
  const fs = new Fs(process.cwd());
  const { PdfDown } = await import("@d0paminedriven/pdfdown");

  const paths = [
    "Geminastics-Pt-I",
    "Geminastics-Pt-II",
    "Geminastics-Pt-III"
  ] as const;

  // Each PDF becomes one input sequence: [text, img, img, text, img, ...]
  const allInputs = Array.of<({ t: string } | { f: string })[]>();
  const tmpFiles = Array.of<string>();

  for (const p of paths) {
    const buf = fs.fileToBuffer(`src/test/__out__/condensed/${p}.pdf`);
    const pdfdown = new PdfDown(buf);

    const [_meta, text, imgs] = await Promise.all([
      pdfdown.metadataAsync(),
      pdfdown.structuredTextAsync(),
      pdfdown.imagesPerPageAsync()
    ]);

    // Build page-image index
    const imagesByPage = new Map<number, typeof imgs>();
    for (const img of imgs) {
      const existing = imagesByPage.get(img.page);
      existing ? existing.push(img) : imagesByPage.set(img.page, [img]);
    }

    // Build interleaved sequence: text chunk, then its page images
    const sequence = Array.of<{ t: string } | { f: string }>();
    for (const page of text) {
      if (page.body && page.body.trim().length > 0) {
        sequence.push({ t: page.body });
      }
      const pageImgs = imagesByPage.get(page.page);
      if (pageImgs) {
        for (const img of pageImgs) {
          const tmpName = fs.uniqueTmpName(
            `${p}-img-${img.page}-${img.imageIndex}`,
            "png"
          );

          const absTmpPath = resolve(tmpdir(), tmpName);
          fs.writeTmp(tmpName, img.data);
          sequence.push({ f: absTmpPath });
          tmpFiles.push(tmpName);
        }
      }
    }

    if (sequence.length > 0) allInputs.push(sequence);
  }

  console.log(
    `Built ${allInputs.length} input sequences, ${tmpFiles.length} tmp image files`
  );

  try {
    const result = await voyage.countUsageFromPaths(
      allInputs,
      "voyage-multimodal-3.5"
    );

    fs.withWs(
      "src/test/voyage/__out__/multimodal.json",
      JSON.stringify(result, null, 2)
    );
    console.log(result);
    console.log("countUsage result:", JSON.stringify(result, null, 2));
    return result;
  } finally {
    // Clean up tmp image files
    for (const tmpName of tmpFiles) {
      try {
        fs.rmTmpFile(tmpName);
      } catch {
        // best-effort cleanup
      }
    }
    console.log(`Cleaned up ${tmpFiles.length} tmp files`);
    await voyage.exitPython();
  }
}
if (process.argv[3] === "multimodal") {
  countBulkMultimodal();
}
// if (process.argv[3] === "contextual") {
//   const fs = new Fs(process.cwd());
//   const apiKey = process.env.VOYAGE_API_KEY ?? "";
//   const voyage = new VoyageEmbeddingService(apiKey);
//   (async () => {
//     const paths = [
//       "src/test/__out__/condensed/Geminastics-Pt-I.pdf",
//       "src/test/__out__/condensed/Geminastics-Pt-II.pdf",
//       "src/test/__out__/condensed/Geminastics-Pt-III.pdf"
//     ] as const;
//     const docArr = Array.of<readonly string[]>();
//     const anotherOne = Array.of<string>();
//     for (const p of paths.entries()) {
//       const content = fs.fileToBuffer(p[1]);
//       const { PdfDown } = await import("@d0paminedriven/pdfdown");
//       const pdfdown = new PdfDown(content);
//       const [_meta, text, imgs, _annots] = await Promise.all([
//         pdfdown.metadataAsync(),
//         pdfdown.structuredTextAsync(),
//         pdfdown.imagesPerPageAsync(),
//         pdfdown.annotationsPerPageAsync()
//       ]);

//       const imgPages = imgs.map((v) =>v.page);

//       const body = text.map((o)=>o.body).join("\n\n");

//       if (p[0] === 0) docArr.push([body]);
//       else if (p[0] === 1) anotherOne.push(body);
//       else if (p[0] === 2) anotherOne.push(body);
//       else continue;
//     }

//     docArr.push(anotherOne);
//     return await voyage.embedChunksContextual({
//       inputs: docArr,
//       input_type: "document",
//       model: "voyage-context-3"
//     });
//   })()
//     .then(r => {
//       const toJson = JSON.stringify(r);
//       console.log(r.usage);
//       fs.withWs(
//         "src/test/__out__/voyage/contextualized/testing-4.json",
//         toJson
//       );
//     })
//     .finally(() => {});
// }
/**
 * ephemeral code below for a quick exe demo
 */

// const apiKey = process.env.VOYAGE_API_KEY ?? "";
// const voyage = new VoyageEmbeddingService(apiKey);
