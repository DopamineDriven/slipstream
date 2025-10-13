import { DocMetadataExtractor } from "../docs/index.ts";
import { ImgMetadataExtractor } from "../index.ts";

class ExtractLocal {
  constructor(
    public meta: ImgMetadataExtractor,
    public docs: DocMetadataExtractor
  ) {}

  public async fetchMinimalBuffer(url: string, size = 16384, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    let r: Response;
    try {
      // 1. Try HEAD request to check if Range is supported
      r = await fetch(url, {
        method: "HEAD",
        signal: controller.signal
      });
      if (!r.ok) {
        r = await fetch(url, { method: "GET", signal: controller.signal });
      }
      const headResponse = r;
      const contentType = headResponse.headers.get("content-type");
      const acceptsRange =
        headResponse.headers.get("accept-ranges") === "bytes";
      const contentLength = parseInt(
        headResponse.headers.get("content-length") ?? "0"
      );

      clearTimeout(timeoutId);

      // 2. Fetch with Range header if supported
      if (acceptsRange) {
        // We only need first 16KB for metadata (even less for most formats)
        const rangeResponse = await fetch(url, {
          headers: {
            Range: `bytes=0-${size}` // First 16KB
          },
          signal: AbortSignal.timeout(timeout)
        });

        if (rangeResponse.status === 206) {
          // Partial Content
          const arrayBuffer = await rangeResponse.arrayBuffer();
          return {
            contentType,
            buffer: Buffer.from(arrayBuffer),
            source: url
          };
        }
      }

      // 3. Fallback: Fetch entire file if small, or first chunk if streaming
      if (contentLength && contentLength < 1024 * 1024) {
        // < 1MB
        const response = await fetch(url, {
          signal: AbortSignal.timeout(timeout)
        });
        const arrayBuffer = await response.arrayBuffer();
        return {
          contentType,
          buffer: Buffer.from(arrayBuffer),
          source: url
        };
      }

      // 4. For large files without Range support, read partial stream
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout)
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      // Read only first 16KB from stream
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      const maxBytes = size;

      while (totalBytes < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;

        const bytesToAdd = Math.min(value.length, maxBytes - totalBytes);
        chunks.push(value.slice(0, bytesToAdd));
        totalBytes += bytesToAdd;

        if (totalBytes >= maxBytes) {
          reader.cancel(); // Stop reading
          break;
        }
      }

      return {
        contentType,
        buffer: Buffer.concat(chunks),
        source: url
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

const extract = new ExtractLocal(
  new ImgMetadataExtractor(),
  new DocMetadataExtractor()
);

async function testPartialVsFull() {
  const url = "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf";

  console.log("Testing with PARTIAL buffer (as in workup.ts):");
  console.log("=" .repeat(50));

  // Test with partial buffer (like workup.ts does)
  const partial = await extract.fetchMinimalBuffer(url, 4096 * 24); // Same as workup.ts line 160
  console.log(`Partial buffer size: ${partial.buffer.length} bytes`);

  const partialResult = extract.docs.getDocumentSpecsWorkup(
    partial.buffer,
    partial.contentType ?? "application/pdf"
  );
  console.log("Created Date:", partialResult.createdDate ?? "null");
  console.log("Modified Date:", partialResult.modifiedDate ?? "null");

  // Check if dates are in the partial buffer
  const partialText = partial.buffer.toString("latin1");
  const hasCreationDate = partialText.includes("CreationDate");
  const hasModDate = partialText.includes("ModDate");
  console.log("CreationDate in partial buffer:", hasCreationDate);
  console.log("ModDate in partial buffer:", hasModDate);

  console.log("\n\nTesting with FULL buffer:");
  console.log("=" .repeat(50));

  // Test with full buffer
  const response = await fetch(url);
  const fullBuffer = Buffer.from(await response.arrayBuffer());
  console.log(`Full buffer size: ${fullBuffer.length} bytes`);

  const fullResult = extract.docs.getDocumentSpecsWorkup(
    fullBuffer,
    "application/pdf"
  );
  console.log("Created Date:", fullResult.createdDate ?? "null");
  console.log("Modified Date:", fullResult.modifiedDate ?? "null");

  // Check where dates are located in full buffer
  const fullText = fullBuffer.toString("latin1");
  const creationIndex = fullText.indexOf("CreationDate");
  const modIndex = fullText.indexOf("ModDate");
  console.log(`\nCreationDate found at byte position: ${creationIndex}`);
  console.log(`ModDate found at byte position: ${modIndex}`);

  if (creationIndex > 4096 * 24) {
    console.log("\n⚠️ PROBLEM: CreationDate is beyond the partial buffer size!");
    console.log(`   It's at position ${creationIndex}, but partial buffer is only ${4096 * 24} bytes`);
  }
}

testPartialVsFull().catch(console.error);
