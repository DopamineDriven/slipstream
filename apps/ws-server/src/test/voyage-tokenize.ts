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

interface ContextualSuccess {
  object: string;
  data: {
    index: number;
    data: { embedding: number[]; index: number }[];
  }[];
  model: string;
  usage: { total_tokens: number };
  chunker_version?: string;
}

interface ContextualError {
  detail: string;
}

/**
 * Empirically probe voyage-context-4's documented limits: 32k tokens per
 * inner list, 120k tokens per request, and the blog's claim that oversized
 * docs are auto-partitioned internally. Raw fetch (not the service) so 4XX
 * detail bodies are captured instead of thrown away.
 */
async function probeContextualLimits() {
  const voyage = new VoyageEmbeddingService(process.env.VOYAGE_API_KEY ?? "");
  const fs = new Fs(process.cwd());

  const seed =
    "the quick brown fox jumps over the lazy dog while the architect files another carmen in the archive and the chow chow compresses the findings into laminated canon ";
  const block = seed.repeat(300);

  // exact counts only — measure the filler, never assume
  const counted = await voyage.countTokens([block], "voyage-context-4");
  const blockTokens = counted.counts[0] ?? 0;
  console.log(`filler block = ${blockTokens} exact tokens`);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(
      "https://api.voyageai.com/v1/contextualizedembeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY ?? ""}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
    const parsed = await res.json<ContextualSuccess | ContextualError>();
    if ("detail" in parsed) {
      return { status: res.status, detail: parsed.detail } as const;
    }
    return {
      status: res.status,
      innerResults: parsed.data.length,
      embeddingsPerResult: parsed.data.map(d => d.data.length),
      totalTokensBilled: parsed.usage.total_tokens,
      chunkerVersion: parsed.chunker_version ?? null
    } as const;
  };

  const blocksFor = (targetTokens: number) =>
    Math.ceil(targetTokens / blockTokens);

  const results: Record<string, unknown> = { blockTokens };

  // P0 control — a valid ~3-block family, should succeed with 3 embeddings
  const familyOk = Array.from({ length: 3 }, () => block);
  console.log(`P0 control: 1 inner list × 3 chunks ≈ ${3 * blockTokens} tokens`);
  results.p0_valid_family = await post({
    inputs: [familyOk],
    input_type: "document",
    model: "voyage-context-4"
  });
  console.log(results.p0_valid_family);

  // P1 — single inner list exceeding 32k tokens
  const innerOverCount = blocksFor(34_000);
  const innerOver = Array.from({ length: innerOverCount }, () => block);
  console.log(
    `P1 inner>32k: 1 inner list × ${innerOverCount} chunks ≈ ${innerOverCount * blockTokens} tokens`
  );
  results.p1_inner_list_over_32k = await post({
    inputs: [innerOver],
    input_type: "document",
    model: "voyage-context-4"
  });
  console.log(results.p1_inner_list_over_32k);

  // P2 — request total exceeding 120k tokens, each inner list legal (<32k)
  const perList = Math.max(1, Math.floor(30_000 / blockTokens));
  const listsNeeded = Math.ceil(130_000 / (perList * blockTokens));
  const requestOver = Array.from({ length: listsNeeded }, () =>
    Array.from({ length: perList }, () => block)
  );
  console.log(
    `P2 request>120k: ${listsNeeded} inner lists × ${perList} chunks ≈ ${listsNeeded * perList * blockTokens} tokens`
  );
  results.p2_request_over_120k = await post({
    inputs: requestOver,
    input_type: "document",
    model: "voyage-context-4"
  });
  console.log(results.p2_request_over_120k);

  // P3 — the blog claim: one mega-document >120k tokens with backend
  // auto-chunking; does voyage partition internally or reject?
  const megaBlocks = blocksFor(126_000);
  const megaDoc = Array.from({ length: megaBlocks }, () => block).join("\n\n");
  console.log(
    `P3 auto-chunk mega-doc: 1 flat doc ≈ ${megaBlocks * blockTokens} tokens, enable_auto_chunking=true`
  );
  results.p3_autochunk_mega_doc = await post({
    inputs: [megaDoc],
    input_type: "document",
    model: "voyage-context-4",
    enable_auto_chunking: true,
    chunk_size: 512,
    chunk_overlap: 0
  });
  console.log(results.p3_autochunk_mega_doc);

  // P4 — same mega-doc as a single-element inner list, NO auto-chunking:
  // does a pre-chunked lane doc >32k get partitioned or rejected?
  console.log(`P4 mega-doc, pre-chunked lane (no auto-chunking)`);
  results.p4_mega_doc_prechunked_lane = await post({
    inputs: [[megaDoc]],
    input_type: "document",
    model: "voyage-context-4"
  });
  console.log(results.p4_mega_doc_prechunked_lane);

  fs.withWs(
    "src/test/voyage/__out__/context-limits.json",
    JSON.stringify(results, null, 2)
  );
  console.log("wrote src/test/voyage/__out__/context-limits.json");
  await voyage.exitPython();
}

if (process.argv[3] === "limits") {
  probeContextualLimits();
}
