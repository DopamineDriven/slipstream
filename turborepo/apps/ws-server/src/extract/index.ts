import { ImageSpecs, ImgMetadataExtractor } from "@slipstream/metadata";

export class Extract {
  constructor(public meta: ImgMetadataExtractor) {}

  private async fetchMinimalBuffer(
    url: string,
    size = 16384,
    timeout = 5000
  ): Promise<Buffer> {
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
          return Buffer.from(arrayBuffer);
        }
      }

      // 3. Fallback: Fetch entire file if small, or first chunk if streaming
      if (contentLength && contentLength < 1024 * 1024) {
        // < 1MB
        const response = await fetch(url, {
          signal: AbortSignal.timeout(timeout)
        });
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
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

      return Buffer.concat(chunks);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async extractRemote(
    source: Buffer | string,
    size = 16384,
    timeout = 5000
  ) {
    let buffer: Buffer;
    if (Buffer.isBuffer(source)) {
      buffer = source;
      return this.meta.getImageSpecsWorkup(buffer, size);
    } else {
      // Remote URL - smart fetch with Range
      buffer = await this.fetchMinimalBuffer(source, size, timeout);
      return this.meta.getImageSpecsWorkup(buffer, size);
    }
  }

  public grokMapper(
    data: {
      url: string;
      revised_prompt: string;
    }[]
  ) {
    return data.map(({ url, revised_prompt }, i) => {
      return { index: i, url, md: `![${revised_prompt}](${url})` };
    });
  }

  public grokContent(
    input: {
      index: number;
      url: string;
      md: string;
    }[]
  ) {
    return input
      .map(t => {
        return t.md;
      })
      .join("\n");
  }

  public imgSpecs = async (
    data: {
      index: number;
      url: string;
      md: string;
    }[]
  ) => {
    const arr = Array.of<{ imgSpecs: ImageSpecs; index: number }>();
    const expandedData = data
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758866145748-aicoalesce-og-final-II-scaled.png",
        index: 5,
        md: "testing"
      })
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1757123632828-IMG_3922.png",
        md: "iphone screen shot",
        index: 6
      })
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759114340631-grok-video-ba76af9e-7820-4007-b9bd-0ea4f16dfdd9.png",
        md: "apng test one",
        index: 7
      })
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758923529552-aicoalesce-vivified.png",
        md: "apng test two",
        index: 8
      })
      .concat({
        url: "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759051021488-grok-video-7b9c6db1-6ff8-4da7-9278-f29837c6ca44.png",
        md: "apng test three",
        index: 9
      })
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758924156875-nice.gif",
        md: "gif test",
        index: 10
      });
    for (const d of expandedData) {
      const specs = await this.extractRemote(d.url, 64 * 1024);
      arr.push({ index: d.index, imgSpecs: specs });
    }
    return arr;
  };
}
