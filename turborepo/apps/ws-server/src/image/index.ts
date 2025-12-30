import { ReadableStreamReadResult } from "node:stream/web";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import { PrismaService } from "@/prisma/index.ts";
import sharp from "sharp";
import type { $Enums } from "@slipstream/db/node/generated/client";
import { S3Storage } from "@slipstream/storage-s3";

type PhotoHeuristic = {
  minPhotoMP?: number; // below this, discount as “likely UI/icon”
  alphaPenalty?: number;
  tinyIconPx?: number; // square <= this dimension suggests icon/UI
  threshold?: number; // >= threshold ⇒ photographic
};

export class ImageCompatService {
  constructor(
    private s3: S3Storage,
    private prisma: PrismaService
  ) {}
  private async urlToBuff(cdnUrl: string) {
    const response = await fetch(cdnUrl, { method: "GET" });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch asset: ${response.statusText}`);
    }
    const reader = response.body.getReader();

    const chunks = Array.of<Uint8Array>();

    while (true) {
      const { done, value } =
        (await reader.read()) as ReadableStreamReadResult<Uint8Array>;
      if (done) break;
      if (value) {
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks);
  }

  /**
   * default max dimension -> 1920px (HD)
   */
  private calcDims(width: number, height: number, maxDimension = 1920) {
    const scaleFactor = Math.min(1, maxDimension / Math.max(width, height));
    return [
      Math.round(width * scaleFactor),
      Math.round(height * scaleFactor)
    ] as const;
  }

  private isPhotographic(
    s: ExpandedImgSpecs,
    opts: PhotoHeuristic = {
      alphaPenalty: 1.5,
      minPhotoMP: 0.7,
      tinyIconPx: 96,
      threshold: 2
    }
  ) {
    const {
      alphaPenalty = 1.5,
      minPhotoMP = 0.7,
      tinyIconPx = 96,
      threshold = 2
    } = opts;
    const mp = (s.width * s.height) / 1_000_000;

    let score = 0;

    // strong priors
    switch (s.format) {
      case "heic":
      case "avif":
      case "jpeg":
        score += 3;
        break;
      case "tiff":
        score += 1;
        break; // could be scan or camera
      case "png":
        score += 0;
        break; // neutral; PNG used for both
      case "bmp":
      case "ico":
      case "gif":
      case "apng":
      case "svg":
        score -= 2;
        break;
      case "webp":
        score += 0;
        break; // neutral; used for both
      default:
        break;
    }

    // Color model / space hints
    if (s.colorModel === "ycbcr" || s.colorModel === "ycck") score += 3; // camera pipelines
    if (s.colorModel === "cmyk") score += 1; // print scans/photos
    if (s.colorModel === "indexed" || s.colorModel === "vector") score -= 3; // graphics/UI
    if (
      s.colorSpace === "display_p3" ||
      s.colorSpace === "adobe_rgb" ||
      s.colorSpace === "prophoto_rgb" ||
      s.colorSpace === "rec2020"
    )
      score += 1; // wide-gamut hints camera

    // EXIF capture time = camera-ish -- ?? photoshop, etc?
    if (s.exifDateTimeOriginal) score += 2;

    // Resolution / aspect cues
    if (mp >= minPhotoMP) score += 2;
    else score -= 1;
    const minSide = Math.min(s.width, s.height);
    if (minSide <= tinyIconPx) score -= 2;
    // phone camera -> tall or wide ~ 4:3–20:9, not decisive but gentle nudge
    if (s.aspectRatio > 1.2 && s.aspectRatio < 2.6) score += 0.5;

    // Alpha -> uncommon for photos
    if (s.hasAlpha) score -= alphaPenalty;

    // Animation -> not a single photo
    if (s.animated || s.frames > 1) score -= 3;

    return score >= threshold;
  }

  private pickCompatExt(specs: ExpandedImgSpecs) {
    switch (specs.format) {
      case "avif":
      case "webp":
      case "heic": {
        return "webp" as const;
      }
      case "ico":
      case "png":
      case "svg": {
        return "png" as const;
      }
      case "jpeg": {
        return "jpeg" as const;
      }
      case "apng":
      case "bmp":
      case "gif":
      case "tiff":
      case "unknown":
      default: {
        const photo = this.isPhotographic(specs);
        if (specs.hasAlpha) {
          return photo ? ("webp" as const) : ("png" as const);
        }
        return photo ? ("webp" as const) : ("png" as const);
      }
    }
  }

  private ENCODE = {
    webpPhoto: {
      quality: 82,
      effort: 5,
      smartSubsample: true,
      nearLossless: false
    },
    webpGraphic: { lossless: true, effort: 5 }, // or near-lossless: true for smaller w/ tiny edge softening
    pngGraphic: { compressionLevel: 9, effort: 10, palette: true, colors: 256 }, // great for UI/text
    pngDefault: { compressionLevel: 9, effort: 10 },
    jpegPhoto: { quality: 82, mozjpeg: true, progressive: true } // legacy fallback if you ever need it
  } as const;

  private async sharpWorkup(buf: Buffer<ArrayBuffer>, specs: ExpandedImgSpecs) {
    if (
      !(
        specs.format === "png" ||
        specs.format === "jpeg" ||
        specs.format === "webp"
      )
    ) {
      const target = this.pickCompatExt(specs);
      if (specs.width >= 2000 || specs.height >= 2000) {
        const [w, h] = this.calcDims(specs.width, specs.height);
        const isPhotographic = this.isPhotographic(specs);
        const img = sharp(buf, {
          limitInputPixels: false,
          sequentialRead: true
        })
          .rotate()
          .resize({
            fit: "inside",
            withoutEnlargement: false,
            width: w,
            height: h
          })
          .toColorspace("srgb");
        switch (target) {
          case "jpeg": {
            return await img.jpeg(this.ENCODE.jpegPhoto).toBuffer();
          }
          case "png": {
            if (isPhotographic) {
              return await img.png(this.ENCODE.pngDefault).toBuffer();
            } else {
              return await img.png(this.ENCODE.pngGraphic).toBuffer();
            }
          }
          case "webp":
          default: {
            if (isPhotographic) {
              return await img.webp(this.ENCODE.webpPhoto).toBuffer();
            } else {
              return await img.webp(this.ENCODE.webpGraphic).toBuffer();
            }
          }
        }
      } else {
        const isPhotographic = this.isPhotographic(specs);
        const img = sharp(buf, {
          limitInputPixels: false,
          sequentialRead: true
        })
          .rotate()
          .toColorspace("srgb");
        switch (target) {
          case "jpeg": {
            return await img.jpeg(this.ENCODE.jpegPhoto).toBuffer();
          }
          case "png": {
            if (isPhotographic) {
              return await img.png(this.ENCODE.pngDefault).toBuffer();
            } else {
              return await img.png(this.ENCODE.pngGraphic).toBuffer();
            }
          }
          case "webp":
          default: {
            if (isPhotographic) {
              return await img.webp(this.ENCODE.webpPhoto).toBuffer();
            } else {
              return await img.webp(this.ENCODE.webpGraphic).toBuffer();
            }
          }
        }
      }
    } else {
      if (specs.width >= 2000 || specs.height >= 2000) {
        const [w, h] = this.calcDims(specs.width, specs.height);
        const img = sharp(buf, {
          limitInputPixels: false,
          sequentialRead: true
        })
          .rotate()
          .resize({
            fit: "inside",
            withoutEnlargement: false,
            width: w,
            height: h
          })
          .toColorspace("srgb");

        return await img.toBuffer();
      }
      return undefined;
    }
  }

  public async convertImage({
    cdnUrl,
    filename,
    id,
    specs,
    userId,
    conversationId,
    origin
  }: {
    id: string;
    cdnUrl: string;
    conversationId?: string;
    origin: $Enums.AssetOrigin;
    specs: ExpandedImgSpecs;
    userId: string;
    filename: string;
  }) {
    const buf = await this.urlToBuff(cdnUrl);
    const target = this.pickCompatExt(specs);
    const transformed = await this.sharpWorkup(buf, specs);
    if (!transformed) return;

    const toS3 = await this.s3.uploadCompatGenerated(transformed, this.prisma.isProd, {
      attachmentId: id,
      target,
      contentType: `image/${target}`,
      filename,
      origin,
      userId,
      conversationId,
      messageId: undefined, // this happens before a user hits send on a prompt or parallel to them hittng send on a prompt --- no message id yet
      size: transformed.byteLength
    });

    await this.prisma.updateImgAttachmentCompat({
      attachmentId: id,
      compatCdnUrl: toS3.cdnUrl,
      compatKey: toS3.key,
      compatReadyAt: toS3.lastModified
        ? new Date(toS3.lastModified)
        : new Date(Date.now()),
      compatStatus: "ACTIVE",
      cacheControl: toS3.cacheControl,
      checksumAlgo: toS3.checksum?.algo,
      checksumSha256: toS3.checksum?.value,
      compatExt: target,
      compatMime: `image/${target}`,
      compatS3ObjectId: toS3.s3ObjectId,
      compatVersionId: toS3.versionId,
      contentDisposition: toS3.contentDisposition,
      s3LastModified: toS3.lastModified
    });
  }
}
