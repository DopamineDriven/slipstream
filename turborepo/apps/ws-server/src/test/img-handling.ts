import { Fs } from "@d0paminedriven/fs";
import type { ImageSpecs } from "@slipstream/metadata";
import { ImgMetadataExtractor } from "@slipstream/metadata";

const res = {
  data: [
    {
      url: "https://imgen.x.ai/xai-imgen/xai-tmp-imgen-2ac71b41-916d-4edf-a16d-1fc88dd6e411.jpeg",
      revised_prompt:
        "A high-resolution photograph of a snowy alpine scene at twilight, featuring a serene lake with a Roman legion crossing in the background. The legionnaires are dressed in traditional armor, and their boats are visible on the lake, which reflects the surrounding snow-covered mountains. The sky is overcast, adding to the dramatic yet peaceful atmosphere. Sparse trees with snow-laden branches line the shore, and the distant mountains are partially obscured by soft, diffused light. The focus is primarily on the lake and the crossing legion, with the snowy landscape and mountains providing a majestic backdrop. The scene conveys a sense of historical movement and tranquility in a natural, wintry setting."
    },
    {
      url: "https://imgen.x.ai/xai-imgen/xai-tmp-imgen-b77f681c-3337-4db1-a629-fecc2772acb1.jpeg",
      revised_prompt:
        "A high-resolution photograph of a snowy alpine scene at twilight, featuring a serene lake with a Roman legion crossing in the background. The legionnaires are dressed in traditional armor, and their boats are visible on the lake, which reflects the surrounding snow-covered mountains. The sky is overcast, adding to the dramatic yet peaceful atmosphere. Sparse trees with snow-laden branches line the shore, and the distant mountains are partially obscured by soft, diffused light. The focus is primarily on the lake and the crossing legion, with the snowy landscape and mountains providing a majestic backdrop. The scene conveys a sense of historical movement and tranquility in a natural, wintry setting."
    },
    {
      url: "https://imgen.x.ai/xai-imgen/xai-tmp-imgen-6a9706d2-ec38-4d7a-9a80-c9f61eeac695.jpeg",
      revised_prompt:
        "A high-resolution photograph of a snowy alpine scene at twilight, featuring a serene lake with a Roman legion crossing in the background. The legionnaires are dressed in traditional armor, and their boats are visible on the lake, which reflects the surrounding snow-covered mountains. The sky is overcast, adding to the dramatic yet peaceful atmosphere. Sparse trees with snow-laden branches line the shore, and the distant mountains are partially obscured by soft, diffused light. The focus is primarily on the lake and the crossing legion, with the snowy landscape and mountains providing a majestic backdrop. The scene conveys a sense of historical movement and tranquility in a natural, wintry setting."
    },
    {
      url: "https://imgen.x.ai/xai-imgen/xai-tmp-imgen-97ec75c9-068a-42e9-a2a6-fe657fa57364.jpeg",
      revised_prompt:
        "A high-resolution photograph of a snowy alpine scene at twilight, featuring a serene lake with a Roman legion crossing in the background. The legionnaires are dressed in traditional armor, and their boats are visible on the lake, which reflects the surrounding snow-covered mountains. The sky is overcast, adding to the dramatic yet peaceful atmosphere. Sparse trees with snow-laden branches line the shore, and the distant mountains are partially obscured by soft, diffused light. The focus is primarily on the lake and the crossing legion, with the snowy landscape and mountains providing a majestic backdrop. The scene conveys a sense of historical movement and tranquility in a natural, wintry setting."
    },
    {
      url: "https://imgen.x.ai/xai-imgen/xai-tmp-imgen-99215efa-7868-42e7-b10b-c078e083a100.jpeg",
      revised_prompt:
        "A high-resolution photograph of a snowy alpine scene at twilight, featuring a serene lake with a Roman legion crossing in the background. The legionnaires are dressed in traditional armor, and their boats are visible on the lake, which reflects the surrounding snow-covered mountains. The sky is overcast, adding to the dramatic yet peaceful atmosphere. Sparse trees with snow-laden branches line the shore, and the distant mountains are partially obscured by soft, diffused light. The focus is primarily on the lake and the crossing legion, with the snowy landscape and mountains providing a majestic backdrop. The scene conveys a sense of historical movement and tranquility in a natural, wintry setting."
    }
  ]
};

function mapper(
  data: {
    url: string;
    revised_prompt: string;
  }[]
) {
  return data.map(({ url, revised_prompt }, i) => {
    return { index: i, url, md: `![${revised_prompt}](${url})` };
  });
}

const data = mapper(res.data);

console.log(data);

class Extract {
  constructor(public meta: ImgMetadataExtractor) {}
  private knownToBlock(inputUrl: string) {
    if (inputUrl.startsWith("https://github.com")) {
      return "GET" as const;
    } else if (inputUrl.startsWith("https://raw.githubusercontent.com")) {
      return "GET" as const;
    } else {
      return "HEAD" as const;
    }
  }
  private async fetchMinimalBuffer(
    url: string,
    size = 16384,
    timeout = 5000
  ): Promise<Buffer> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // 1. Try HEAD request to check if Range is supported
      const headResponse = await fetch(url, {
        method: this.knownToBlock(url),
        signal: controller.signal
      });

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
}

const extract = new Extract(new ImgMetadataExtractor());
const imgSpecs = async () => {
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
    const specs = await extract.extractRemote(d.url, 64*1024);
    arr.push({ index: d.index, imgSpecs: specs });
  }
  return arr;
};

imgSpecs().then(v => {
  const vv = v.map(t => {
    const { metadata, ...rest } = t.imgSpecs;
    const tt =
      typeof metadata !== "undefined"
        ? Object.entries(metadata).map(([t, l]) => [t, l])
        : undefined;
    return {
      index: t.index,
      imgSpecs: { metadata: tt, ...rest }
    };
  });
  const fs = new Fs(process.cwd());

  fs.withWs(
    "src/test/__out__/img-extraction/test-two.json",
    JSON.stringify(v, null, 2)
  );
  console.log(vv);
  return vv;
});
