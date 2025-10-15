import type { ExtractorOptions } from "@/mixins/index.ts";
import type { ExpandedDocSpecs, ExpandedImgSpecs } from "@/types/index.ts";
import { DocMixin, ImgMixin } from "@/mixins/index.ts";

export interface ExtractorHardenedOptions extends ExtractorOptions {
  /** Given a CF URL, return an origin (S3/R2) URL for the same object. */
  originFallback?: (cfUrl: string) => Promise<string> | string;
  /** Invalidate one CF key (path or full URL OK; implementer can map to key). */
  invalidateCloudFrontKey?: (urlOrKey: string) => Promise<void>;
  /** Quarantine duration for suspect URLs (ms). Default: 6h */
  quarantineTtlMs?: number;
  /** Custom UA string for diagnostics */
  userAgent?: string;
  /** Enable verbose debug logging */
  debug?: boolean;
}

class Base {
  constructor(_opts?: ExtractorOptions) {}
}

const Unified = ImgMixin(DocMixin(Base));

export class Extract extends Unified {
  private badUrls = new Map<string, number>(); // url -> expiry
  private readonly originFallback?: ExtractorHardenedOptions["originFallback"];
  private readonly invalidateCF?: ExtractorHardenedOptions["invalidateCloudFrontKey"];
  private readonly quarantineTtl: number;
  private readonly ua: string;
  private readonly debug: boolean;

  constructor(opts?: ExtractorHardenedOptions) {
    super(opts);
    this.originFallback = opts?.originFallback;
    this.invalidateCF = opts?.invalidateCloudFrontKey;
    this.quarantineTtl = opts?.quarantineTtlMs ?? 6 * 60 * 60 * 1000; // 6h
    this.ua = opts?.userAgent ?? "slipstream-extractor/1.0";
    this.debug = !!opts?.debug;
  }

  private dlog(...args: any[]) {
    if (!this.debug) return;
    const ts = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    console.log(`[extractor ${ts}]`, ...args);
  }

  // ---------- Quarantine helpers ----------
  private isQuarantined(url: string): boolean {
    const t = this.badUrls.get(url);
    if (!t) return false;
    if (t < Date.now()) {
      this.badUrls.delete(url);
      return false;
    }
    return true;
  }
  private markQuarantined(url: string, ttl = this.quarantineTtl) {
    this.badUrls.set(url, Date.now() + ttl);
  }

  // ---------- Minimal MIME sniffing from first bytes (avoid trusting headers) ----------
  private sniffMime(buf: Buffer): string | undefined {
    if (
      buf.length >= 8 &&
      buf
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return "image/png";
    if (
      buf.length >= 4 &&
      buf[0] === 0xff &&
      buf[1] === 0xd8 &&
      buf[2] === 0xff
    )
      return "image/jpeg";
    if (
      buf.length >= 12 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    )
      return "image/webp";
    if (buf.length >= 6 && buf.toString("ascii", 0, 3) === "GIF")
      return "image/gif";
    if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-")
      return "application/pdf";
    return undefined;
  }

  // ---------- Safe probe that never blocks batch ----------
  private async probeFirstChunk(
    url: string,
    bytes = 65536,
    deadlineMs = 2500,
    idleMs = 1200
  ): Promise<
    | { ok: true; buf: Buffer; status: number; headers: Headers }
    | { ok: false; reason: string; status?: number }
  > {
    const ctrl = new AbortController();
    const deadline = setTimeout(() => ctrl.abort(), deadlineMs).unref();

    try {
      this.dlog("probeFirstChunk:start", { url, bytes, deadlineMs, idleMs });
      const res = await fetch(url, {
        headers: {
          Range: `bytes=0-${bytes - 1}`,
          "Accept-Encoding": "identity",
          "User-Agent": this.ua
        },
        signal: ctrl.signal
      });
      if (!(res.ok || res.status === 206))
        return { ok: false, reason: `HTTP_${res.status}`, status: res.status };
      if (!res.body)
        return { ok: false, reason: "NO_BODY", status: res.status };

      // stream only first N bytes; bail on idle
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;

      try {
        for (;;) {
          const read = reader.read();
          const idle = new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("IDLE")), idleMs)
          );
          const { done, value } = (await Promise.race([
            read,
            idle
          ])) as ReadableStreamReadResult<Uint8Array>;
          if (done) break;
          const n = Math.min(value.length, bytes - total);
          chunks.push(value.subarray(0, n));
          total += n;
          if (total >= bytes) break;
        }
      } finally {
        try {
          reader.cancel();
        } catch (e) {
          console.error(e);
        }
      }
      this.dlog("probeFirstChunk:done", { url, status: res.status, total });
      return {
        ok: true,
        buf: Buffer.concat(chunks, total),
        status: res.status,
        headers: res.headers
      };
    } catch (e) {
      this.dlog("probeFirstChunk:error", {
        url,
        error: e instanceof Error ? e.message : e
      });
      return {
        ok: false,
        reason:
          e instanceof Error
            ? e?.name === "AbortError"
              ? "DEADLINE"
              : JSON.stringify(e?.message ?? e.stack)
            : "error in extractor"
      };
    } finally {
      clearTimeout(deadline);
    }
  }

  // ---------- Helpers ----------
  private parseContentRangeTotal(h: string | null): number {
    // e.g. "bytes 0-1023/123456"
    const m = h?.match(/\/(\d+)$/);
    return m?.[1] ? parseInt(m[1], 10) : 0;
  }

  private async head(url: string, timeout: number) {
    return this.fetchWithDeadline(
      url,
      {
        method: "HEAD",
        headers: { "Accept-Encoding": "identity", "User-Agent": this.ua }
      },
      timeout
    );
  }

  // Unified fetch with explicit AbortController-based deadline
  private async fetchWithDeadline(
    url: string,
    init: RequestInit,
    deadlineMs: number
  ): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), deadlineMs).unref();
    try {
      const method = (init.method ?? "GET").toString();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const range =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (init.headers as any)?.["Range"] ??
        (init.headers instanceof Headers
          ? init.headers.get("Range")
          : undefined);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.dlog("fetch:start", { url, method, deadlineMs, range });
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      this.dlog("fetch:done", { url, method, status: res.status });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  private async readFirstBytesWithIdle(
    res: Response,
    maxBytes: number,
    idleMs: number
  ): Promise<Buffer> {
    if (!res.body) throw new Error("No response body");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      this.dlog("stream:first-bytes:start", { maxBytes, idleMs });
      for (;;) {
        const read = reader.read();
        const idle = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("IDLE")), idleMs)
        );
        const { done, value } = (await Promise.race([
          read,
          idle
        ])) as ReadableStreamReadResult<Uint8Array>;
        if (done) break;
        const n = Math.min(value.length, maxBytes - total);
        chunks.push(value.subarray(0, n));
        total += n;
        if (total >= maxBytes) break;
      }
      const out = Buffer.concat(chunks, total);
      this.dlog("stream:first-bytes:done", { total });
      return out;
    } finally {
      try {
        reader.cancel();
      } catch (e) {
        console.error(e);
      }
    }
  }

  // ---------- Hardened minimal buffer fetch ----------
  public async fetchMinimalBuffer(url: string, size = 16384, timeout = 5000) {
    if (this.isQuarantined(url)) {
      throw new Error(`QUARANTINED: ${url}`);
    }

    // 0) Fast probe (never blocks more than ~2.5s)
    this.dlog("fetchMinimalBuffer:probe:start", { url, size, timeout });
    const probe = await this.probeFirstChunk(
      url,
      Math.max(size, 65536),
      Math.min(timeout, 2500),
      Math.min(1200, Math.max(600, Math.floor(timeout * 0.6)))
    );

    if (!probe.ok) {
      this.dlog("fetchMinimalBuffer:probe:fail", { url, reason: probe.reason });
      // Optional origin fallback: if origin works, auto-invalidate CF and proceed
      if (this.originFallback) {
        try {
          const originUrl = await this.originFallback(url);
          this.dlog("fetchMinimalBuffer:probe:originFallback", {
            url,
            originUrl
          });
          const alt = await this.probeFirstChunk(
            originUrl,
            Math.max(size, 65536),
            2500,
            1200
          );
          if (alt.ok) {
            this.dlog("fetchMinimalBuffer:probe:originSuccess", {
              url,
              originUrl
            });
            if (this.invalidateCF) {
              try {
                await this.invalidateCF(url);
              } catch (e) {
                this.dlog("fetchMinimalBuffer:invalidateCF:error", {
                  url,
                  error: e instanceof Error ? e.message : e
                });
              }
            }
            // we have enough head bytes already for routing; continue with originUrl
            return {
              contentType:
                this.sniffMime(alt.buf) ??
                alt.headers.get("content-type") ??
                undefined,
              buffer: alt.buf,
              source: originUrl
            };
          }
        } catch {
          /* ignore */
        }
      }
      // mark bad, bail
      this.markQuarantined(url);
      throw new Error(`PROBE_FAIL ${probe.reason}`);
    }

    try {
      this.dlog("fetchMinimalBuffer:probe:ok", { url, status: probe.status });
      const headers = probe.headers;
      const contentTypeHdr = headers.get("content-type") ?? undefined;
      const contentType =
        contentTypeHdr?.split(";")?.[0] ?? this.sniffMime(probe.buf);
      const supportsRange = probe.status === 206;
      let contentLength = supportsRange
        ? this.parseContentRangeTotal(headers.get("content-range"))
        : 0;
      this.dlog("fetchMinimalBuffer:post-probe", {
        url,
        contentType,
        supportsRange,
        contentLength
      });

      if (!supportsRange) {
        // Some edges ignore Range on first request; try HEAD (still identity)
        try {
          const head = await this.head(url, Math.min(timeout, 2500));
          const ce = head.headers.get("content-encoding") ?? "";
          // Red flag: compressed image — mark but continue (we already have head bytes)
          if (/gzip|br|deflate/i.test(ce))
            this.markQuarantined(url, 30 * 60 * 1000);
          contentLength = parseInt(head.headers.get("content-length") ?? "0");
          this.dlog("fetchMinimalBuffer:head", {
            url,
            contentLength,
            contentEncoding: ce
          });
        } catch {
          /* ignore; proceed with what we have */
        }
      }

      // 1) PDFs: need head + tail when big and ranged
      if (
        contentType &&
        contentType === "application/pdf" &&
        supportsRange &&
        contentLength > size * 2
      ) {
        const startSize = Math.min(16384, size);
        const endSize = Math.min(400000, contentLength);
        const endStart = Math.max(0, contentLength - endSize);

        const [startRes, endRes] = await Promise.all([
          this.fetchWithDeadline(
            url,
            {
              headers: {
                Range: `bytes=0-${startSize - 1}`,
                "Accept-Encoding": "identity",
                "User-Agent": this.ua
              }
            },
            timeout
          ),
          this.fetchWithDeadline(
            url,
            {
              headers: {
                Range: `bytes=${endStart}-${contentLength - 1}`,
                "Accept-Encoding": "identity",
                "User-Agent": this.ua
              }
            },
            timeout
          )
        ]);

        if (startRes.status === 206 && endRes.status === 206) {
          const [startBuf, endBuf] = await Promise.all([
            startRes.arrayBuffer(),
            endRes.arrayBuffer()
          ]);
          this.dlog("fetchMinimalBuffer:pdf:ranged", {
            url,
            startSize,
            endSize
          });
          return {
            contentType,
            buffer: Buffer.concat([Buffer.from(startBuf), Buffer.from(endBuf)]),
            source: url
          };
        }
        // fall through if ranges misbehave
      }

      // 2) Non-PDF with Range support: fetch exactly first 'size' bytes
      if (supportsRange) {
        const rr = await this.fetchWithDeadline(
          url,
          {
            headers: {
              Range: `bytes=0-${size - 1}`,
              "Accept-Encoding": "identity",
              "User-Agent": this.ua
            }
          },
          timeout
        );
        if (rr.status === 206) {
          const ab = await rr.arrayBuffer();
          this.dlog("fetchMinimalBuffer:range:first-bytes", { url, size });
          return { contentType, buffer: Buffer.from(ab), source: url };
        }
        // if we get 200, we'll stream below
      }

      // 3) Small files: safe to GET fully (identity) with deadline
      if (contentLength && contentLength < 1 * 1024 * 1024) {
        const res = await this.fetchWithDeadline(
          url,
          { headers: { "Accept-Encoding": "identity", "User-Agent": this.ua } },
          timeout
        );
        const ab = await res.arrayBuffer();
        this.dlog("fetchMinimalBuffer:get:small", { url, contentLength });
        return { contentType, buffer: Buffer.from(ab), source: url };
      }

      // 4) Large / no-range: stream only first 'size' bytes with idle guard
      const res = await this.fetchWithDeadline(
        url,
        { headers: { "Accept-Encoding": "identity", "User-Agent": this.ua } },
        timeout
      );
      const buf = await this.readFirstBytesWithIdle(
        res,
        size,
        Math.min(1500, Math.max(600, Math.floor(timeout * 0.6)))
      );
      this.dlog("fetchMinimalBuffer:stream:first-bytes", { url, size });
      return { contentType, buffer: buf, source: url };
    } catch (e) {
      // Any downstream failure after a successful probe marks URL as suspect
      this.dlog("fetchMinimalBuffer:error", {
        url,
        error: e instanceof Error ? e.message : e
      });
      this.markQuarantined(url);
      throw e;
    }
  }

  // ---------- Public API ----------
  public async extractRemote(
    source: Buffer | string,
    size = 16384,
    timeout = 5000
  ): Promise<ExpandedDocSpecs | ExpandedImgSpecs> {
    let buffer: Buffer;
    let contentType: string | undefined;
    let url: string | undefined;

    if (Buffer.isBuffer(source)) {
      buffer = source;
      contentType = this.sniffMime(buffer);
    } else {
      this.dlog("extractRemote:start", { url: source, size, timeout });
      const out = await this.fetchMinimalBuffer(source, size, timeout);
      buffer = out.buffer;
      contentType = out.contentType;
      url = out.source;
      this.dlog("extractRemote:buf", {
        url,
        contentType,
        bytes: buffer.length
      });
    }

    // Route to image/doc pipelines
    if (contentType?.startsWith("image/")) {
      // Prefer the full image workup (header-based, non-blocking). If it fails, fall back to dims-only.
      try {
        this.dlog("imageWorkup:start", { url, size, contentType });
        const imgSpecs = this.img.getImageSpecsWorkup(buffer, size);
        this.dlog("imageWorkup:done", {
          url,
          w: imgSpecs.width,
          h: imgSpecs.height,
          fmt: imgSpecs.format
        });
        return { source: url ?? "buffer", ...imgSpecs };
      } catch {
        this.dlog("imageWorkup:fallback", { url, contentType });
        // FAST FALLBACK: header-only dimension sniffers for common formats
        let dims: { width: number; height: number } | null = null;
        let format: ExpandedImgSpecs["format"] | undefined;
        switch (contentType) {
          case "image/png":
            dims = this.sniffPngDims(buffer);
            format = "png";
            break;
          case "image/jpeg":
            dims = this.sniffJpegDims(buffer);
            format = "jpeg";
            break;
          case "image/webp":
            dims = this.sniffWebpDims(buffer);
            format = "webp";
            break;
          case "image/gif":
            dims = this.sniffGifDims(buffer);
            format = "gif";
            break;
        }
        if (dims && format) {
          const { width, height } = dims;
          return {
            type: "IMAGE",
            source: url ?? "buffer",
            width,
            height,
            format,
            frames: 1,
            animated: false,
            hasAlpha: null,
            orientation: null,
            aspectRatio: height ? width / height : 0,
            colorModel: "unknown",
            colorSpace: "unknown",
            iccProfile: null,
            exifDateTimeOriginal: null,
            metadata: {}
          } satisfies ExpandedImgSpecs;
        }
        // If we can't sniff either, rethrow to surface the error
        throw new Error("IMAGE_PARSE_FAILED");
      }
    } else {
      const docSpecs = this.docs.getDocumentSpecsWorkup(
        buffer,
        contentType ?? "application/pdf"
      );
      return { source: url ?? "buffer", ...docSpecs };
    }
  }

  // --- tiny image-dimension sniffers (header-only) ---
  private sniffPngDims(buf: Buffer) {
    const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) return null;
    if (buf.readUInt32BE(8) !== 13 || buf.toString("ascii", 12, 16) !== "IHDR")
      return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  private sniffGifDims(buf: Buffer) {
    if (buf.length < 10 || buf.toString("ascii", 0, 3) !== "GIF") return null;
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  private sniffJpegDims(buf: Buffer) {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd8 || marker === 0xd9) {
        i += 2;
        continue;
      }
      if (i + 4 > buf.length) break;
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      if (
        marker &&
        ((marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf))
      ) {
        if (i + 9 < buf.length) {
          const height = buf.readUInt16BE(i + 5);
          const width = buf.readUInt16BE(i + 7);
          return { width, height };
        }
        break;
      }
      i += 2 + len;
    }
    return null;
  }

  private sniffWebpDims(buf: Buffer) {
    if (
      buf.length < 30 ||
      buf.toString("ascii", 0, 4) !== "RIFF" ||
      buf.toString("ascii", 8, 12) !== "WEBP"
    )
      return null;
    const fourcc = buf.toString("ascii", 12, 16); // VP8X | VP8 | VP8L
    if (
      fourcc === "VP8X" &&
      buf.length >= 30 &&
      buf[24] &&
      buf[25] &&
      buf[26] &&
      buf[27] &&
      buf[28] &&
      buf[29]
    ) {
      const w = 1 + (buf?.[24] | (buf[25] << 8) | (buf[26] << 16));
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width: w, height: h };
    }
    if (fourcc === "VP8 " && buf.length >= 30) {
      if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
        const width = buf.readUInt16LE(26);
        const height = buf.readUInt16LE(28);
        return { width, height };
      }
    }
    if (
      fourcc === "VP8L" &&
      buf.length >= 25 &&
      buf[21] &&
      buf[22] &&
      buf[23] &&
      buf[24]
    ) {
      const b0 = buf[21],
        b1 = buf[22],
        b2 = buf[23],
        b3 = buf[24];

      const width = (b0 | ((b1 & 0x3f) << 8)) + 1;
      const height = ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) + 1;
      return { width, height };
    }
    return null;
  }
}
