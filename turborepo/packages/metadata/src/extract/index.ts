// extract.ts
import type { ExtractorOptions } from "@/mixins/index.ts";
import type { ExpandedDocSpecs, ExpandedImgSpecs } from "@/types/index.ts";
import { DocMixin, ImgMixin } from "@/mixins/index.ts";

class Base {
  constructor(_opts?: ExtractorOptions) {}
}

const Unified = ImgMixin(DocMixin(Base));

export class Extract extends Unified {
  constructor(opts?: ExtractorOptions) {
    super(opts);
  }

  // keep your fetchMinimalBuffer implementation verbatim here...
  public async fetchMinimalBuffer(url: string, size = 16384, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // 1. Try a small range request first to detect support (CloudFront doesn't advertise in HEAD)
      const testRangeResponse = await fetch(url, {
        headers: { Range: "bytes=0-1023" },
        signal: controller.signal
      });

      const contentType = testRangeResponse.headers.get("content-type");
      let supportsRange = testRangeResponse.status === 206;
      let contentLength = 0;

      if (supportsRange) {
        // Extract total size from Content-Range header
        const contentRange = testRangeResponse.headers.get("content-range");
        const totalMatch = contentRange?.match(/bytes \d+-\d+\/(\d+)/);
        contentLength = totalMatch?.[1] ? parseInt(totalMatch[1], 10) : 0;
      } else {
        // Fallback to HEAD request for servers that don't support Range
        const headResponse = await fetch(url, {
          method: "HEAD",
          signal: controller.signal
        });
        contentLength = parseInt(
          headResponse.headers.get("content-length") ?? "0"
        );
      }

      clearTimeout(timeoutId);

      // 2. Special handling for PDFs - need to read both beginning AND end
      if (
        contentType === "application/pdf" &&
        supportsRange &&
        contentLength > size * 2
      ) {
        // For PDFs, we need beginning for version/header and a larger chunk from end for metadata
        // PDF metadata is often 200-400KB before EOF in linearized PDFs
        const startSize = Math.min(16384, size); // 16KB from start is enough for header
        const endSize = Math.min(400000, contentLength); // Up to 400KB from end for metadata

        // Fetch beginning
        const startResponse = await fetch(url, {
          headers: {
            Range: `bytes=0-${startSize - 1}`
          },
          signal: AbortSignal.timeout(timeout)
        });

        // Fetch end (metadata often 200-400KB before EOF)
        const endStart = Math.max(0, contentLength - endSize);
        const endResponse = await fetch(url, {
          headers: {
            Range: `bytes=${endStart}-${contentLength - 1}`
          },
          signal: AbortSignal.timeout(timeout)
        });

        if (startResponse.status === 206 && endResponse.status === 206) {
          const startBuffer = Buffer.from(await startResponse.arrayBuffer());
          const endBuffer = Buffer.from(await endResponse.arrayBuffer());
          // Combine start and end for PDF parsing
          return {
            contentType,
            buffer: Buffer.concat([startBuffer, endBuffer]),
            source: url
          };
        }
      }

      // 3. Regular fetch with Range header if supported (for non-PDFs or fallback)
      if (supportsRange) {
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

      // 4. Fallback: Fetch entire file if small, or first chunk if streaming
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

      // 5. For large files without Range support, read partial stream
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

  public async extractRemote(
    source: Buffer | string,
    size = 16384,
    timeout = 5000
  ): Promise<ExpandedDocSpecs | ExpandedImgSpecs> {
    let buffer: Buffer;
    if (Buffer.isBuffer(source)) {
      buffer = source;
      return this.img.getImageSpecsWorkup(buffer, size);
    } else {
      // Remote URL - smart fetch with Range
      const {
        buffer: buf,
        contentType,
        source: url
      } = await this.fetchMinimalBuffer(source, size, timeout);
      buffer = buf;
      if (contentType?.startsWith("image/")) {
        const imgSpecs = this.img.getImageSpecsWorkup(buffer, size);
        return { source: url, ...imgSpecs };
      } else {
        const docSpecs = this.docs.getDocumentSpecsWorkup(
          buffer,
          contentType ?? "application/pdf"
        );
        return {
          source: url,
          ...docSpecs
        };
      }
    }
  }
}

/**
 // extract.ts
import type { ExtractorOptions } from "@/mixins/index.ts";
import type { ExpandedDocSpecs, ExpandedImgSpecs } from "@/types/index.ts";
import { DocMixin, ImgMixin } from "@/mixins/index.ts";

class Base {
  constructor(_opts?: ExtractorOptions) {}
}

const Unified = ImgMixin(DocMixin(Base));

export class Extract extends Unified {
  constructor(opts?: ExtractorOptions) {
    super(opts);
  }
  public readWithTimeout(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    timeoutMs: number
  ): Promise<ReadableStreamReadResult<Uint8Array>> {
    return Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Read timeout")), timeoutMs)
      )
    ]);
  }
  // keep your fetchMinimalBuffer implementation verbatim here...
  public async fetchMinimalBuffer(url: string, size = 16384, timeout = 5000) {
    try {
      // 1. Test range support with its own timeout
      const testRangeResponse = await fetch(url, {
        headers: { Range: "bytes=0-1023" },
        signal: AbortSignal.timeout(timeout) // Use AbortSignal.timeout consistently
      });

      console.log(url);
      console.log(`Status: ${testRangeResponse.status}`);

      const contentType = testRangeResponse.headers.get("content-type");
      let supportsRange = testRangeResponse.status === 206;
      let contentLength = 0;

      if (supportsRange) {
        const contentRange = testRangeResponse.headers.get("content-range");
        const totalMatch = contentRange?.match(/bytes \d+-\d+\/(\d+)/);
        contentLength = totalMatch?.[1] ? parseInt(totalMatch[1], 10) : 0;

        // IMPORTANT: Close the response body to release the connection
        await testRangeResponse.arrayBuffer(); // Consume the test response
      } else {
        // If not 206, consume and close this response too
        await testRangeResponse.arrayBuffer();

        // Fallback to HEAD
        const headResponse = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(timeout)
        });
        contentLength = parseInt(
          headResponse.headers.get("content-length") ?? "0"
        );
      }

      // 2. PDF handling with fresh requests
      if (
        contentType === "application/pdf" &&
        supportsRange &&
        contentLength > size * 2
      ) {
        const startSize = Math.min(16384, size);
        const endSize = Math.min(400000, contentLength);

        // Parallel fetch with Promise.all for efficiency
        const [startResponse, endResponse] = await Promise.all([
          fetch(url, {
            headers: { Range: `bytes=0-${startSize - 1}` },
            signal: AbortSignal.timeout(timeout)
          }),
          fetch(url, {
            headers: {
              Range: `bytes=${Math.max(0, contentLength - endSize)}-${contentLength - 1}`
            },
            signal: AbortSignal.timeout(timeout)
          })
        ]);

        if (startResponse.status === 206 && endResponse.status === 206) {
          const [startBuffer, endBuffer] = await Promise.all([
            startResponse.arrayBuffer(),
            endResponse.arrayBuffer()
          ]);

          return {
            contentType,
            buffer: Buffer.concat([
              Buffer.from(startBuffer),
              Buffer.from(endBuffer)
            ]),
            source: url
          };
        }
      }

      // 3. Regular range fetch for other files
      if (supportsRange) {
        const rangeResponse = await fetch(url, {
          headers: { Range: `bytes=0-${size - 1}` }, // Fix: should be size-1
          signal: AbortSignal.timeout(timeout)
        });

        if (rangeResponse.status === 206) {
          const arrayBuffer = await rangeResponse.arrayBuffer();
          return {
            contentType,
            buffer: Buffer.from(arrayBuffer),
            source: url
          };
        }
      }

      // 4. Small file fallback
      if (contentLength && contentLength < 1024 * 1024) {
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

      // 5. Stream reading for large files
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout)
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (totalBytes < size) {
          const result = await this.readWithTimeout(reader, 1000);

          if (result.done || !result.value) break;

          const bytesToAdd = Math.min(result.value.length, size - totalBytes);
          chunks.push(result.value.slice(0, bytesToAdd));
          totalBytes += bytesToAdd;
        }
      } finally {
        await reader.cancel();
      }

      return {
        contentType,
        buffer: Buffer.concat(chunks),
        source: url
      };
    } catch (error) {
      console.error(`Error fetching ${url}:`, error);
      throw error;
    }
  }

  public async extractRemote(
    source: Buffer | string,
    size = 16384,
    timeout = 5000
  ): Promise<ExpandedDocSpecs | ExpandedImgSpecs> {
    let buffer: Buffer;
    if (Buffer.isBuffer(source)) {
      buffer = source;
      return this.img.getImageSpecsWorkup(buffer, size);
    } else {
      // Remote URL - smart fetch with Range
      const {
        buffer: buf,
        contentType,
        source: url
      } = await this.fetchMinimalBuffer(source, size, timeout);
      buffer = buf;
      if (contentType?.startsWith("image/")) {
        const imgSpecs = this.img.getImageSpecsWorkup(buffer, size);
        return { source: url, ...imgSpecs };
      } else {
        const docSpecs = this.docs.getDocumentSpecsWorkup(
          buffer,
          contentType ?? "application/pdf"
        );
        return {
          source: url,
          ...docSpecs
        };
      }
    }
  }
}

 */
