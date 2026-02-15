import { VoyageEmbeddingService } from "@/voyage/index.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

async function countBulkMultimodal() {
  const { tmpdir } = await import("os");
  const { resolve } = await import("path");
  const voyage = new VoyageEmbeddingService(process.env.VOYAGE_API_KEY ?? "");
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
async function countBulkTextTokens() {
  const voyage = new VoyageEmbeddingService(process.env.VOYAGE_API_KEY ?? "");
  const fs = new Fs(process.cwd());
  const { PdfDown } = await import("@d0paminedriven/pdfdown");

  const paths = [
    "Geminastics-Pt-I",
    "Geminastics-Pt-II",
    "Geminastics-Pt-III"
  ] as const;

  const texts = Array.of<string>();

  for (const p of paths) {
    const buf = fs.fileToBuffer(`src/test/__out__/condensed/${p}.pdf`);
    const pdfdown = new PdfDown(buf);
    const structured = await pdfdown.structuredTextAsync();

    for (const page of structured) {
      if (page.body && page.body.trim().length > 0) {
        texts.push(page.body);
      }
    }
  }

  console.log(`Collected ${texts.length} text chunks from ${paths.length} PDFs`);

  try {
    const result = await voyage.countTokens(texts, "voyage-context-3");

    fs.withWs(
      "src/test/voyage/__out__/text-tokens.json",
      JSON.stringify(result, null, 2)
    );
    console.log(result);
    console.log("countTokens result:", JSON.stringify(result, null, 2));
    return result;
  } finally {
    await voyage.exitPython();
  }
}

if (process.argv[3] === "contextual") {
  countBulkTextTokens();
}
