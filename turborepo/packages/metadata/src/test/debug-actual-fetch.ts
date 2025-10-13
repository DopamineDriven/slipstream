import { Extract } from "@/extract/index.ts";

// Create a modified version with debugging
class DebugExtract extends Extract {
  public async fetchMinimalBufferDebug(
    url: string,
    size = 16384,
    timeout = 5000
  ) {
    console.log("=== fetchMinimalBuffer called ===");
    console.log("URL:", url);
    console.log("Size:", size);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // 1. Try a small range request first
      console.log("\n1. Testing Range support with small request...");
      const testRangeResponse = await fetch(url, {
        headers: { Range: "bytes=0-1023" },
        signal: controller.signal
      });

      const contentType = testRangeResponse.headers.get("content-type");
      let supportsRange = testRangeResponse.status === 206;
      let contentLength = 0;

      console.log("   Status:", testRangeResponse.status);
      console.log("   Content-Type:", contentType);
      console.log("   Supports Range:", supportsRange);

      if (supportsRange) {
        const contentRange = testRangeResponse.headers.get("content-range");
        const totalMatch = contentRange?.match(/bytes \d+-\d+\/(\d+)/);
        contentLength = totalMatch?.[1] ? parseInt(totalMatch[1], 10) : 0;
        console.log("   Content-Range:", contentRange);
        console.log("   Extracted length:", contentLength);
      }

      clearTimeout(timeoutId);

      // 2. Check for PDF special handling
      const isPDF = contentType === "application/pdf";
      const isLarge = contentLength > size * 2;

      console.log("\n2. Checking PDF special handling conditions:");
      console.log("   Is PDF?", isPDF);
      console.log("   Supports Range?", supportsRange);
      console.log(
        "   Is large file?",
        isLarge,
        `(${contentLength} > ${size * 2})`
      );

      if (isPDF && supportsRange && isLarge) {
        console.log("\n3. ✓ Using PDF special handling!");

        const halfSize = Math.floor(size / 2);
        console.log(
          `   Will fetch: 0-${halfSize} and ${contentLength - halfSize}-${contentLength - 1}`
        );

        // Fetch beginning
        console.log("   Fetching beginning...");
        const startResponse = await fetch(url, {
          headers: {
            Range: `bytes=0-${halfSize}`
          },
          signal: AbortSignal.timeout(timeout)
        });
        console.log("   Start response status:", startResponse.status);

        // Fetch end
        const endStart = Math.max(0, contentLength - halfSize);
        console.log(`   Fetching end from ${endStart}...`);
        const endResponse = await fetch(url, {
          headers: {
            Range: `bytes=${endStart}-${contentLength - 1}`
          },
          signal: AbortSignal.timeout(timeout)
        });
        console.log("   End response status:", endResponse.status);

        if (startResponse.status === 206 && endResponse.status === 206) {
          const startBuffer = Buffer.from(await startResponse.arrayBuffer());
          const endBuffer = Buffer.from(await endResponse.arrayBuffer());

          console.log("   Start buffer size:", startBuffer.length);
          console.log("   End buffer size:", endBuffer.length);

          const combined = Buffer.concat([startBuffer, endBuffer]);
          console.log("   Combined buffer size:", combined.length);

          // Check what we got
          const text = combined.toString("latin1");
          console.log(
            "   Contains 'CreationDate':",
            text.includes("CreationDate")
          );
          console.log("   Contains 'ModDate':", text.includes("ModDate"));
          console.log("   Contains '%%EOF':", text.includes("%%EOF"));

          return {
            contentType,
            buffer: combined,
            source: url
          };
        } else {
          console.log("   ✗ Range requests failed, falling back");
        }
      } else {
        console.log("\n3. Using regular fetch (not PDF or small file)");
      }

      // Fallback...
      console.log("\n4. Fallback to regular range request");
      return {
        contentType,
        buffer: Buffer.from("fallback"),
        source: url
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

async function test() {
  const extract = new DebugExtract();

  const url =
    "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf";
  const result = await extract.fetchMinimalBufferDebug(url, 4096 * 24);

  console.log("\nFinal result:");
  console.log("Buffer size:", result.buffer.length);
  console.log("Content type:", result.contentType);
}

test().catch(console.error);
