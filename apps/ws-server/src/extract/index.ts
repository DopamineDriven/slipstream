import type {
  AudioSpecs,
  WaveformOptions,
  WaveformPeaks
} from "@d0paminedriven/audiodown";
import { AudioService as AudioDownService } from "@d0paminedriven/audiodown";
import { Fs } from "@d0paminedriven/fs";
import type { $Enums } from "@slipstream/db/node/generated/client";

export class ExtractService extends Fs {
  constructor(public audiodown: AudioDownService) {
    super(process.cwd());
  }
  private parseTotalContentRange(value: string | null) {
    if (value === null) {
      return;
    }

    // bytes 0-65535/123456
    const match = value.match(/\/(\d+)$/);
    const match1 = match?.[1];
    if (typeof match1 === "undefined") {
      return;
    }

    const total = Number.parseInt(match1, 10);

    return Number.isFinite(total) ? total : undefined;
  }
  private async readAtMost(response: Response, maxBytes: number) {
    if (response.body === null) {
      return new Uint8Array();
    }

    const reader = response.body.getReader();
    const chunks = Array.of<Uint8Array>();

    let totalBytes = 0;

    try {
      while (totalBytes < maxBytes) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const remaining = maxBytes - totalBytes;

        const take = Math.min(value.byteLength, remaining);

        chunks.push(value.subarray(0, take));

        totalBytes += take;

        if (take < value.byteLength) {
          break;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    return this.concatUint8(chunks, totalBytes);
  }
  public async fetchAudio(url: string, maxBytes?: number, timeoutMs = 15000) {
    if (maxBytes !== undefined && maxBytes <= 0) {
      throw new RangeError(
        `maxBytes must be greater than 0; received ${maxBytes}`
      );
    }
    const headers = new Headers({
      "Accept-Encoding": "identity"
    });

    if (maxBytes !== undefined) {
      headers.set("Range", `bytes=0-${maxBytes - 1}`);
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`audio fetch failed with HTTP ${response.status}`);
    }

    const contentType =
      response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? null;

    const rangeTotal = this.parseTotalContentRange(
      response.headers.get("content-range")
    );

    const contentLengthHeader = response.headers.get("content-length");

    const contentLength =
      contentLengthHeader !== null
        ? Number.parseInt(contentLengthHeader, 10)
        : null;

    const reportedTotalBytes =
      rangeTotal ??
      (contentLength !== null && Number.isFinite(contentLength)
        ? contentLength
        : null);

    /*
     * No cap:
     *
     * This is your normal background-task path.
     * Read the entire resource.
     */
    if (maxBytes === undefined) {
      const bytes = new Uint8Array(await response.arrayBuffer());

      return {
        bytes,
        fetchedBytes: bytes.byteLength,
        reportedTotalBytes,
        contentType,
        partial: false
      };
    }

    /*
     * Explicit cap:
     *
     * Stream instead of arrayBuffer() so that even if the origin
     * ignores Range and responds 200 with the entire object,
     * we still consume at most maxBytes.
     */
    const bytes = await this.readAtMost(response, maxBytes);

    return {
      bytes,
      fetchedBytes: bytes.byteLength,
      reportedTotalBytes,
      contentType,

      partial:
        reportedTotalBytes !== null
          ? bytes.byteLength < reportedTotalBytes
          : response.status === 206
    };
  }

  private concatUint8(chunks: readonly Uint8Array[], totalBytes: number) {
    const output = new Uint8Array(totalBytes);

    let offset = 0;

    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return output;
  }

  /**
   * Header-level specs (no decoding). Safe on a ranged prefix: `truncated`
   * and `durationSource` on the result say how much to trust `durationSec`.
   */
  public async parseRemote(url: string, maxBytes?: number, timeoutMs = 15000) {
    const { bytes } = await this.fetchAudio(url, maxBytes, timeoutMs);

    return this.audiodown.parseAudioAsync(bytes, url);
  }

  /**
   * Specs plus a decoded waveform from one snapshot. If the stream will not
   * decode (truncated or corrupt), falls back to header-only specs with no
   * waveform instead of failing the whole persist.
   */
  public async analyzeBuffer(
    bytes: Uint8Array,
    options?: WaveformOptions,
    source?: string
  ): Promise<{ specs: AudioSpecs; waveform: WaveformPeaks | null }> {
    try {
      return await this.audiodown.analyzeAudioAsync(bytes, options, source);
    } catch {
      return {
        specs: await this.audiodown.parseAudioAsync(bytes, source),
        waveform: null
      };
    }
  }

  /** Full fetch, then `analyzeBuffer`. Decoding needs the whole file. */
  public async analyzeRemote(
    url: string,
    options?: WaveformOptions,
    timeoutMs = 15000
  ) {
    const { bytes } = await this.fetchAudio(url, undefined, timeoutMs);

    return this.analyzeBuffer(bytes, options, url);
  }

  /** Prisma `AudioMetadata.waveformPeaks` wants `Int[]`: 0..100 per bucket. */
  public waveformPeaksColumn(waveform: WaveformPeaks | null) {
    return waveform
      ? Array.from(waveform.envelope, v =>
          Math.round(Math.min(1, Math.max(0, v)) * 100)
        )
      : [];
  }

  public handleCompatStatus(assetType: $Enums.AssetType, ext: string | null) {
    switch (assetType) {
      case "DOCUMENT": {
        if (ext === "pdf") {
          return "ALIASED" as const satisfies $Enums.CompatStatus;
        } else {
          return "PENDING" as const satisfies $Enums.CompatStatus;
        }
      }
      case "IMAGE": {
        if (
          ext === "jpg" ||
          ext === "jpeg" ||
          ext === "png" ||
          ext === "webp"
        ) {
          return "ALIASED" as const satisfies $Enums.CompatStatus;
        } else return "PENDING" as const satisfies $Enums.CompatStatus;
      }
      case "AUDIO": {
        if (ext === "mp3" || ext === "wav") {
          return "ALIASED" as const satisfies $Enums.CompatStatus;
        } else return "PENDING" as const satisfies $Enums.CompatStatus;
      }
      case "VIDEO": {
        if (ext === "mp4") {
          return "ALIASED" as const satisfies $Enums.CompatStatus;
        } else return "PENDING" as const satisfies $Enums.CompatStatus;
      }
    }
  }
}
