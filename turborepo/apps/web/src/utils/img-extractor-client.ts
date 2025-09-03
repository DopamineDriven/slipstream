import { ImgMetadataExtractorWorkup } from "@/utils/img-extractor-client-workup";
import { inflateSync } from "fflate";

export interface ImageSpecs {
  width: number;
  height: number;
  format:
    | "apng"
    | "png"
    | "jpeg"
    | "gif"
    | "bmp"
    | "webp"
    | "avif"
    | "svg"
    | "ico"
    | "heic"
    | "tiff"
    | "unknown";
  frames: number;
  animated: boolean;
  hasAlpha: boolean | null;
  orientation: number | null; // EXIF orientation (1-8) or null
  aspectRatio: number;
  colorModel:
    | "rgb"
    | "rgba"
    | "grayscale"
    | "grayscale-alpha"
    | "indexed"
    | "cmyk"
    | "ycbcr"
    | "ycck"
    | "vector"
    | "lab"
    | "unknown";
  colorSpace:
    | "unknown"
    | "srgb"
    | "display_p3"
    | "adobe_rgb"
    | "prophoto_rgb"
    | "rec2020"
    | "rec709"
    | "cmyk"
    | "lab"
    | "xyz"
    | "gray";
  iccProfile: string | null; // Profile name/description if available, or 'embedded' if present but unnamed, null otherwise
  exifDateTimeOriginal: string | null; // ISO-like string or null
}

// Helper for AVIF box finding
export interface BoxInfo {
  pos: number;
  size: number;
}

export class ImgMetadataExtractor extends ImgMetadataExtractorWorkup {
  public getImageSpecsWorkup(
    rawbuffer: Buffer<ArrayBufferLike>,
    size = 4096 * 6
  ) {
    // 8KB handles most JPEGs with metadata while minimizing memory usage
    // Professional photos with EXIF + Photoshop data typically need 6-7KB
    const MAX_HEADER_SIZE = size;
    const buffer = rawbuffer.subarray(
      0,
      Math.min(rawbuffer.length, MAX_HEADER_SIZE)
    );
    // PNG: Signature is 89 50 4E 47 0D 0A 1A 0A, width/height in IHDR at offsets 16/20 (big-endian)
    if (
      buffer?.length >= 24 &&
      buffer?.[0] === 0x89 &&
      buffer?.[1] === 0x50 &&
      buffer?.[2] === 0x4e &&
      buffer?.[3] === 0x47 &&
      buffer?.[4] === 0x0d &&
      buffer?.[5] === 0x0a &&
      buffer?.[6] === 0x1a &&
      buffer?.[7] === 0x0a
    ) {
      if (
        buffer.readUInt32BE(8) !== 13 ||
        buffer?.[12] !== 0x49 ||
        buffer?.[13] !== 0x48 ||
        buffer?.[14] !== 0x44 ||
        buffer?.[15] !== 0x52
      ) {
        throw new Error("IHDR Chunk of png not found or incorrect.");
      }
      const colorType = buffer[25]; // Offset 16 (width) + 4 (height) + 4 (bit depth) + 1 = 25
      let colorModel = "unknown" as ImageSpecs["colorModel"],
        colorSpace = "unknown" as ImageSpecs["colorSpace"],
        hasAlpha = false;

      switch (colorType) {
        case 0:
          colorModel = "grayscale";
          colorSpace = "gray";
          break;
        case 2:
          colorModel = "rgb";
          colorSpace = "srgb";
          break;
        case 3:
          colorModel = "indexed";
          colorSpace = "srgb";
          break;
        case 4:
          colorModel = "grayscale-alpha";
          colorSpace = "gray";
          hasAlpha = true;
          break;
        case 6:
          colorModel = "rgba";
          colorSpace = "srgb";
          hasAlpha = true;
          break;
        default:
          colorModel = "unknown";
      }
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      // For PNG, no native animation (APNG extension via acTL chunk)
      let frames = 1;
      let animated = false;
      let iccProfile: string | null = null;
      let exifDateTimeOriginal: string | null = null;
      const orientation: number | null = null;
      // Scan chunks for extras
      let pos = 33; // After IHDR (8 sig + 4 len + 4 type + 13 data + 4 crc)
      while (pos < buffer.length - 12) {
        const chunkLen = buffer.readUInt32BE(pos);
        const chunkType = buffer.toString("ascii", pos + 4, pos + 8);
        const chunkData = pos + 8;
        if (chunkType === "acTL") {
          animated = true;
          frames = buffer.readUInt32BE(chunkData); // num_frames
        } else if (chunkType === "iCCP") {
          // ICC profile: name (null-terminated) + compression + data
          const nameEnd = buffer.indexOf(0, chunkData);
          const profileName = buffer.toString("ascii", chunkData, nameEnd);
          iccProfile = profileName || "embedded";
          colorSpace = this.mapProfileToColorSpace(profileName, colorSpace);
        } else if (chunkType === "sRGB") {
          if (iccProfile === null) {
            iccProfile = "sRGB";
            colorSpace = "srgb";
          }
        } else if (chunkType === "cHRM") {
          if (
            iccProfile === null &&
            colorModel !== "grayscale" &&
            colorModel !== "grayscale-alpha"
          ) {
            const white_x = buffer.readUInt32BE(chunkData),
              white_y = buffer.readUInt32BE(chunkData + 4),
              red_x = buffer.readUInt32BE(chunkData + 8),
              red_y = buffer.readUInt32BE(chunkData + 12),
              green_x = buffer.readUInt32BE(chunkData + 16),
              green_y = buffer.readUInt32BE(chunkData + 20),
              blue_x = buffer.readUInt32BE(chunkData + 24),
              blue_y = buffer.readUInt32BE(chunkData + 28);
            colorSpace = this.mapChrmToColorSpace(
              {
                white_x,
                white_y,
                red_x,
                red_y,
                green_x,
                green_y,
                blue_x,
                blue_y
              },
              colorSpace
            );
          }
        } else if (chunkType === "iTXt") {
          // Parse iTXt: keyword\0 compression_flag compression_method language\0 translated_keyword\0 text
          let offset = chunkData;
          const keywordEnd = buffer.indexOf(0, offset);
          const keyword = buffer.toString("ascii", offset, keywordEnd);
          offset = keywordEnd + 1;
          const compressionFlag = buffer[offset];
          const _compressionMethod = buffer[offset + 1]; // Always 0 (zlib) if compressed
          offset += 2;
          const langEnd = buffer.indexOf(0, offset);
          offset = langEnd + 1; // Skip lang and translated keyword
          const transEnd = buffer.indexOf(0, offset);
          offset = transEnd + 1;
          let textBuffer = buffer.subarray(offset, chunkData + chunkLen - 8); // Text starts here
          if (compressionFlag === 1) {
            try {
              textBuffer = Buffer.from(inflateSync(textBuffer));
            } catch (e) {
              console.error("Failed to decompress iTXt:", e);
              // Skip if decompression fails
            }
          }
          const text = textBuffer.toString("utf8");
          if (keyword === "XML:com.adobe.xmp" && !iccProfile) {
            colorSpace = this.mapXmpToColorSpace(text, colorSpace);
          }
        } else if (chunkType === "tIME") {
          const month = buffer?.[chunkData + 2],
            day = buffer?.[chunkData + 3],
            hour = buffer?.[chunkData + 4],
            minute = buffer?.[chunkData + 5],
            second = buffer?.[chunkData + 6];

          // Last modification time, but not DateTimeOriginal; approximate if no EXIF
          if (
            typeof month !== "undefined" &&
            typeof day !== "undefined" &&
            typeof hour !== "undefined" &&
            typeof minute !== "undefined" &&
            typeof second !== "undefined"
          ) {
            const year = buffer.readUInt16BE(chunkData);
            exifDateTimeOriginal = `${year}:${month.toString().padStart(2, "0")}:${day.toString().padStart(2, "0")} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}`;
          }
        } else if (chunkType === "IDAT") {
          break; // Data starts, no need to scan further for basics
        }
        pos += 12 + chunkLen; // len + type + data + crc
      }
      return {
        width,
        height,
        format: animated === true ? "apng" : "png",
        frames,
        animated,
        hasAlpha,
        colorModel,
        orientation,
        aspectRatio: width / height,
        colorSpace,
        iccProfile,
        exifDateTimeOriginal
      } satisfies ImageSpecs;
    }

    // JPEG: Starts with FF D8, dimensions in SOF marker (FF C0-FF CF, excluding some)
    if (buffer.length >= 10 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      const colorSpace = "unknown" as ImageSpecs["colorSpace"],
        hasAlpha = false;
      let pos = 2,
        colorModel = "unknown" as ImageSpecs["colorModel"],
        width = 0,
        height = 0,
        iccProfile: string | null = null,
        orientation: number | null = null,
        exifDateTimeOriginal: string | null = null;

      while (pos < buffer.length - 10) {
        if (buffer[pos] !== 0xff) {
          // try to resync to next 0xFF
          const nextFF = buffer.indexOf(0xff, pos + 1);
          if (nextFF === -1 || nextFF >= buffer.length - 4) break;
          pos = nextFF;
          continue;
        }
        const marker = buffer[pos + 1];
        if (marker === 0xda) break; // Start of Scan, no more headers
        if (pos + 4 > buffer.length) break;
        const segmentSize = buffer.readUInt16BE(pos + 2);

        if (segmentSize < 2) {
          pos += 2; // Skip invalid segment
          continue;
        }
        const segmentEnd = pos + 2 + segmentSize;
        if (segmentEnd > buffer.length) {
          // Truncated segment - salvage what can be salvaged
          if (
            marker &&
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc
          ) {
            // Try to extract dimensions if we have enough data
            if (pos + 9 <= buffer.length) {
              const numComponents = buffer[pos + 4];
              switch (numComponents) {
                case 1:
                  colorModel = "grayscale";
                  break;
                case 3:
                  colorModel = "ycbcr";
                  break;
                case 4:
                  colorModel = "ycck";
                  break;
                default:
                  colorModel = "unknown";
              }
              if (pos + 7 <= buffer.length - 2) {
                width = buffer.readUInt16BE(pos + 7);
              }
              if (pos + 5 <= buffer.length - 2) {
                height = buffer.readUInt16BE(pos + 5);
              }
            }
          }
          break; // Can't continue past truncated segment
        }
        if (
          marker &&
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          const numComponents = buffer[pos + 4]; // After length (2 bytes) + precision (1) = pos + 4
          switch (numComponents) {
            case 1:
              colorModel = "grayscale";
              break;
            case 3:
              colorModel = "ycbcr";
              break; // Most common for RGB JPEGs (stored as YCbCr)
            case 4:
              colorModel = "ycck";
              break; // YCCK for CMYK with alpha-like, but no true alpha
            default:
              colorModel = "unknown";
          }
          width = buffer.readUInt16BE(pos + 7);
          height = buffer.readUInt16BE(pos + 5);
        } else if (marker === 0xe1) {
          // APP1 for EXIF
          const { orientation: ori, dateTimeOriginal } = this.parseExif(
            buffer,
            pos,
            segmentSize
          );
          orientation = ori;
          exifDateTimeOriginal = dateTimeOriginal;
        } else if (marker === 0xe2) {
          // APP2 for ICC
          if (pos + 18 <= buffer.length) {
            const iccHeader = buffer.toString("ascii", pos + 4, pos + 18);
            if (iccHeader.startsWith("ICC_PROFILE")) {
              iccProfile = "embedded";
            }
          }
        } else if (marker === 0xff) {
          pos++;
          continue;
        }
        pos = segmentEnd;

        while (pos < buffer.length && buffer[pos] === 0x00) {
          pos++;
        }

        while (
          pos < buffer.length - 1 &&
          buffer[pos] === 0xff &&
          buffer[pos + 1] === 0xff
        ) {
          pos++;
        }
      }

      if (width === 0) throw new Error("No dimensions found in JPEG file");
      return {
        width,
        height,
        format: "jpeg",
        frames: 1,
        animated: false, // JPEG not animated
        hasAlpha,
        orientation,
        aspectRatio: width / height,
        colorSpace,
        colorModel,
        iccProfile,
        exifDateTimeOriginal
      } satisfies ImageSpecs;
    }

    // GIF: Signature GIF87a or GIF89a, width/height at offsets 6/8 (little-endian)
    const gifHeader = buffer.toString("ascii", 0, 6);
    if (
      buffer.length >= 10 &&
      (gifHeader === "GIF87a" || gifHeader === "GIF89a")
    ) {
      const width = buffer.readUInt16LE(6),
        height = buffer.readUInt16LE(8);
      let frames = 0;
      let pos = 13; // After header (10) + screen descriptor (3 if no GCT, but skip GCT)
      const bufTen = buffer?.[10];
      if (typeof bufTen === "undefined") {
        pos = 13;
        frames = 0;
      } else if (bufTen & 0x80) pos += 3 << ((bufTen & 0x07) + 1); // Skip global color table if present
      while (pos < buffer.length) {
        if (buffer[pos] === 0x21) {
          // Extension
          pos += 2; // Label + size
          let subSize = buffer?.[pos];

          while (subSize && subSize > 0) {
            pos += subSize + 1;
            subSize = buffer?.[pos];
          }
          pos++; // Next block
        } else if (buffer?.[pos] && buffer?.[pos] === 0x2c) {
          frames++;
          pos += 10; // Image descriptor
          const b = buffer?.[pos - 1];

          if (typeof b !== "undefined" && b & 0x80)
            pos += 3 << ((b & 0x07) + 1); // Local color table
          pos++; // LZW min size
          let dataSize = buffer?.[pos];
          while (dataSize && dataSize > 0) {
            pos += dataSize + 1;
            dataSize = buffer[pos];
          }
          pos++; // Terminator
        } else if (buffer[pos] === 0x3b) {
          break; // Trailer
        } else {
          pos++;
        }
      }
      return {
        width,
        height,
        format: "gif",
        frames,
        animated: frames > 1,
        hasAlpha: null, // GIF transparency is per-pixel binary, not full alpha; set null or true if transparent color exists, but complex
        orientation: null, // No orientation in GIF
        aspectRatio: width / height,
        colorModel: "indexed",
        colorSpace: "unknown",
        iccProfile: null, // No ICC in GIF
        exifDateTimeOriginal: null // No EXIF in GIF
      } satisfies ImageSpecs;
    }

    // BMP: Signature BM, width/height at offsets 18/22 (little-endian, height can be negative for top-down)
    if (buffer.length >= 26 && buffer?.[0] === 0x42 && buffer?.[1] === 0x4d) {
      const width = buffer.readInt32LE(18);
      const height = Math.abs(buffer.readInt32LE(22));
      const bitDepth = buffer.readUInt16LE(28);
      const colorModel = (
        bitDepth <= 8 ? "indexed" : "rgb"
      ) as ImageSpecs["colorModel"];
      return {
        width,
        height,
        format: "bmp",
        frames: 1,
        animated: false,
        hasAlpha: null, // Some BMP have alpha in 32bpp, check if bitDepth===32 && compression===3 (bitfields with alpha)
        orientation: buffer.readInt32LE(22) < 0 ? 1 : 6, // Negative height means top-down (orientation 1), positive bottom-up (like 6, but simplified)
        aspectRatio: width / height,
        colorModel,
        colorSpace: "unknown",
        iccProfile: null, // Rare in BMP
        exifDateTimeOriginal: null
      } satisfies ImageSpecs;
    }

    // WebP: RIFF container with WEBP, then VP8/VP8L/VP8X chunks
    if (
      buffer.length >= 30 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      const chunkType = buffer.toString("ascii", 12, 16);
      const colorSpace = "unknown" as ImageSpecs["colorSpace"];
      let colorModel = "unknown" as ImageSpecs["colorModel"],
        hasAlpha = false,
        width = 0,
        height = 0,
        frames = 1,
        animated = false,
        iccProfile: string | null = null;
      if (chunkType === "VP8X") {
        const flags = buffer?.[20]; // Feature flags
        colorModel = flags ? (flags & 0x02 ? "rgba" : "rgb") : "unknown"; // Bit 1 alpha
        hasAlpha = flags ? !!(flags & 0x02) : false;
        animated = flags ? !!(flags & 0x01) : false; // Bit 0 animation
        let widthSubtractOne = 0;
        let heightSubtractOne = 0;
        if (buffer?.[24] && buffer?.[25] && buffer?.[26]) {
          widthSubtractOne =
            buffer[24] | (buffer[25] << 8) | (buffer[26] << 16);
        }
        if (buffer?.[27] && buffer?.[28] && buffer?.[29]) {
          heightSubtractOne =
            buffer[27] | (buffer[28] << 8) | (buffer[29] << 16);
        }
        width = widthSubtractOne + 1;
        height = heightSubtractOne + 1;
        // Count frames if animated: Scan for ANMF chunks
        if (animated) {
          let pos = 30; // After VP8X
          frames = 0;
          while (pos < buffer.length - 8) {
            const subChunkType = buffer.toString("ascii", pos, pos + 4);
            const subChunkSize = buffer.readUInt32LE(pos + 4);
            if (subChunkType === "ICCP") {
              iccProfile = "embedded";
            } else if (subChunkType === "ANMF") {
              frames++;
            }
            pos += 8 + subChunkSize + (subChunkSize % 2); // Padded to even
          }
        }
      } else if (chunkType === "VP8 ") {
        // Lossy simple: Always RGB (no alpha in simple VP8)
        colorModel = "rgb";
        hasAlpha = false;
        const dataStart = 20;
        if (
          buffer?.[dataStart + 3] !== 0x9d ||
          buffer?.[dataStart + 4] !== 0x01 ||
          buffer?.[dataStart + 5] !== 0x2a
        ) {
          throw new Error("Invalid VP8 keyframe");
        }
        width = buffer.readUInt16LE(dataStart + 6) & 0x3fff;
        height = buffer.readUInt16LE(dataStart + 8) & 0x3fff;
      } else if (chunkType === "VP8L") {
        // Lossless simple
        const dataStart = 20;
        if (buffer?.[dataStart] !== 0x2f) {
          throw new Error("Invalid VP8L signature");
        }
        const bits = buffer.readUInt32LE(dataStart + 1);
        if (bits >>> 29 !== 0) {
          throw new Error("Invalid VP8L version");
        }
        colorModel = bits & (1 << 8) ? "rgba" : "rgb"; // Bit 8 indicates alpha
        hasAlpha = !!(bits & (1 << 8));
        width = 1 + (bits & 0x3fff);
        height = 1 + ((bits >> 14) & 0x3fff);
      } else {
        throw new Error("Unsupported WebP chunk");
      }
      return {
        width,
        height,
        format: "webp",
        frames,
        animated,
        hasAlpha,
        colorModel,
        orientation: null, // No standard orientation in WebP
        aspectRatio: width / height,
        colorSpace,
        iccProfile,
        exifDateTimeOriginal: null // Can have EXIF chunk, but rare; add if needed
      } satisfies ImageSpecs;
    }

    // AVIF: ISOBMFF with ftyp avif/avis, dimensions in meta > iprp > ipco > ispe
    if (buffer.length >= 32 && buffer.toString("ascii", 4, 8) === "ftyp") {
      const ftyp = this.findBox(buffer, "ftyp");
      if (!ftyp) throw new Error("Invalid AVIF: No ftyp");
      const brands = buffer.toString("ascii", ftyp.pos, ftyp.pos + ftyp.size);
      const isAvif = brands.includes("avif");
      const isAvis = brands.includes("avis");
      if (!isAvif && !isAvis) throw new Error("Not an AVIF file");

      const meta = this.findBox(buffer, "meta");
      if (!meta) throw new Error("Invalid AVIF: No meta");
      const metaSubStart = meta.pos + 4; // Skip version + flags
      const metaSubEnd = meta.pos + meta.size;

      const iprp = this.findBox(buffer, "iprp", metaSubStart, metaSubEnd);
      if (!iprp) throw new Error("Invalid AVIF: No iprp");
      const ipco = this.findBox(buffer, "ipco", iprp.pos, iprp.pos + iprp.size);
      if (!ipco) throw new Error("Invalid AVIF: No ipco");
      const ispe = this.findBox(buffer, "ispe", ipco.pos, ipco.pos + ipco.size);
      if (!ispe) throw new Error("Invalid AVIF: No ispe");

      if (buffer[ispe.pos] !== 0) throw new Error("Invalid ispe version");
      const width = buffer.readUInt32BE(ispe.pos + 4);
      const height = buffer.readUInt32BE(ispe.pos + 8);

      // For color space, look for 'colr' box in ipco (simple color info) or assume RGB if no ICC
      let colorSpace = "rgb" as ImageSpecs["colorSpace"],
        colorModel = "rgb" as ImageSpecs["colorModel"],
        hasAlpha = false,
        iccProfile: string | null = null;
      const colr = this.findBox(buffer, "colr", ipco.pos, ipco.pos + ipco.size);
      if (colr) {
        const colrType = buffer.toString("ascii", colr.pos, colr.pos + 4);
        if (colrType === "nclx") {
          // nclx profile: color primaries, transfer, matrix
          // Simplified: We can check matrix coefficient for YUV vs RGB, but for now, flag as ycbcr if not RGB
          const matrix = buffer.readUInt16BE(colr.pos + 6);
          colorModel = matrix === 2 ? "rgb" : "ycbcr"; // 2 is RGB identity
        } else if (colrType === "rICC" || colrType === "prof") {
          colorSpace = "unknown"; // ICC profile present
          iccProfile = "embedded";
        }
      }
      // Check for alpha: Look for 'auxC' box with alpha URI
      const auxC = this.findBox(buffer, "auxC", ipco.pos, ipco.pos + ipco.size);
      if (
        auxC &&
        buffer
          .toString("ascii", auxC.pos, auxC.pos + auxC.size)
          .includes("alpha")
      ) {
        hasAlpha = true;
        if (colorModel === "rgb") {
          colorModel = "rgba";
        } else if (colorModel === "ycbcr") {
          colorModel = "ycck";
        } else if (colorModel === "grayscale" || colorModel === "unknown") {
          colorModel = "grayscale-alpha";
        }
      }
      const xmpXml = this.parseXmpFromAvif(buffer, meta, ipco);
      let exifDateTimeOriginal: string | null = null;
      if (xmpXml) {
        // Simple native parse: Find xmp:CreateDate or photoshop:DateCreated (common for original date)
        // This is regex-free; use string search for robustness
        let dateStart = xmpXml.indexOf('xmp:CreateDate="');
        if (dateStart === -1)
          dateStart = xmpXml.indexOf('photoshop:DateCreated="');
        if (dateStart !== -1) {
          dateStart += 16; // Skip to value
          const dateEnd = xmpXml.indexOf('"', dateStart);
          if (dateEnd !== -1) {
            exifDateTimeOriginal = xmpXml.substring(dateStart, dateEnd);
          }
        }
        // If needed, add more tags like dc:date, but this covers basics
      }
      // Animated/frames: If 'avis', it's sequence; count primary + alpha items or moov tracks, but simplified count iloc items
      let frames = 1;
      const animated = isAvis;
      if (animated) {
        const iloc = this.findBox(buffer, "iloc", metaSubStart, metaSubEnd);
        if (iloc) {
          // Simplified: Count items (full parse complex, assume frames = item count / 2 if alpha)
          const version = buffer?.[iloc.pos] ?? 0;
          const itemCountPos = iloc.pos + (version < 2 ? 4 : 6);
          let itemCount = buffer?.readUInt16BE(itemCountPos) ?? 0;
          if (version >= 2) itemCount = buffer?.readUInt32BE(itemCountPos) ?? 0; // Override for v2+
          frames = Math.max(1, Math.floor(itemCount / (hasAlpha ? 2 : 1))); // Approx: Divide by 2 if alpha layers
        }
      }

      return {
        width,
        height,
        format: "avif",
        frames,
        animated,
        colorModel,
        hasAlpha: hasAlpha ? true : null,
        orientation: null, // Can have 'irot' or 'imir' transforms, but rare
        aspectRatio: width / height,
        colorSpace,
        iccProfile,
        exifDateTimeOriginal // Can have 'XMP' box, but parse XMP for date if needed
      } satisfies ImageSpecs;
    }
    // Add HEIC parsing (after AVIF check, before SVG)
    // HEIC/HEIF: Similar to AVIF, ISOBMFF with ftyp heic/heix/etc.
    if (buffer.length >= 32 && buffer.toString("ascii", 4, 8) === "ftyp") {
      const ftyp = this.findBox(buffer, "ftyp");
      if (!ftyp) throw new Error("Invalid HEIC: No ftyp");
      const brands = buffer
        .toString("ascii", ftyp.pos, ftyp.pos + ftyp.size)
        .toLowerCase();
      const isHeic =
        brands.includes("heic") ||
        brands.includes("heix") ||
        brands.includes("heim") ||
        brands.includes("heis") ||
        brands.includes("hevc") ||
        brands.includes("hevx") ||
        brands.includes("mif1"); // Common HEIF brands, focusing on HEVC-based (HEIC)
      if (!isHeic) throw new Error("Not a HEIC file");

      const meta = this.findBox(buffer, "meta");
      if (!meta) throw new Error("Invalid HEIC: No meta");
      const metaSubStart = meta.pos + 4; // Skip version + flags
      const metaSubEnd = meta.pos + meta.size;

      const iprp = this.findBox(buffer, "iprp", metaSubStart, metaSubEnd);
      if (!iprp) throw new Error("Invalid HEIC: No iprp");
      const ipco = this.findBox(buffer, "ipco", iprp.pos, iprp.pos + iprp.size);
      if (!ipco) throw new Error("Invalid HEIC: No ipco");
      const ispe = this.findBox(buffer, "ispe", ipco.pos, ipco.pos + ipco.size);
      if (!ispe) throw new Error("Invalid HEIC: No ispe");

      if (buffer[ispe.pos] !== 0) throw new Error("Invalid ispe version");
      const width = buffer.readUInt32BE(ispe.pos + 4);
      const height = buffer.readUInt32BE(ispe.pos + 8);

      // For color space, look for 'colr' box in ipco (simple color info) or assume RGB if no ICC
      let colorSpace = "rgb" as ImageSpecs["colorSpace"],
        colorModel = "rgb" as ImageSpecs["colorModel"],
        hasAlpha = false,
        iccProfile: string | null = null;
      const colr = this.findBox(buffer, "colr", ipco.pos, ipco.pos + ipco.size);
      if (colr) {
        const colrType = buffer.toString("ascii", colr.pos, colr.pos + 4);
        if (colrType === "nclx") {
          // nclx profile: color primaries, transfer, matrix
          // Simplified: We can check matrix coefficient for YUV vs RGB, but for now, flag as ycbcr if not RGB
          const matrix = buffer.readUInt16BE(colr.pos + 6);
          colorModel = matrix === 2 ? "rgb" : "ycbcr"; // 2 is RGB identity
        } else if (colrType === "rICC" || colrType === "prof") {
          colorSpace = "unknown"; // ICC profile present
          iccProfile = "embedded";
        }
      }
      // Check for alpha: Look for 'auxC' box with alpha URI
      const auxC = this.findBox(buffer, "auxC", ipco.pos, ipco.pos + ipco.size);
      if (
        auxC &&
        buffer
          .toString("ascii", auxC.pos, auxC.pos + auxC.size)
          .includes("alpha")
      ) {
        hasAlpha = true;
        if (colorModel === "rgb") {
          colorModel = "rgba";
        } else if (colorModel === "ycbcr") {
          colorModel = "ycck";
        } else if (colorModel === "grayscale" || colorModel === "unknown") {
          colorModel = "grayscale-alpha";
        }
      }
      const xmpXml = this.parseXmpFromAvif(buffer, meta, ipco); // Reuse AVIF XMP parser, as structure is identical
      let exifDateTimeOriginal: string | null = null;
      if (xmpXml) {
        // Simple native parse: Find xmp:CreateDate or photoshop:DateCreated (common for original date)
        // This is regex-free; use string search for robustness
        let dateStart = xmpXml.indexOf('xmp:CreateDate="');
        if (dateStart === -1)
          dateStart = xmpXml.indexOf('photoshop:DateCreated="');
        if (dateStart !== -1) {
          dateStart += 16; // Skip to value
          const dateEnd = xmpXml.indexOf('"', dateStart);
          if (dateEnd !== -1) {
            exifDateTimeOriginal = xmpXml.substring(dateStart, dateEnd);
          }
        }
        // If needed, add more tags like dc:date, but this covers basics
      }
      // Animated/frames: For HEIF sequences (e.g., bursts), check brands like 'heim'/'heis' for multi-image
      let frames = 1;
      const animated = brands.includes("heim") || brands.includes("heis");
      if (animated) {
        const iloc = this.findBox(buffer, "iloc", metaSubStart, metaSubEnd);
        if (iloc) {
          // Simplified: Count items (full parse complex, assume frames = item count / 2 if alpha)
          const version = buffer?.[iloc.pos] ?? 0;
          const itemCountPos = iloc.pos + (version < 2 ? 4 : 6);
          let itemCount = buffer?.readUInt16BE(itemCountPos) ?? 0;
          if (version >= 2) itemCount = buffer?.readUInt32BE(itemCountPos) ?? 0; // Override for v2+
          frames = Math.max(1, Math.floor(itemCount / (hasAlpha ? 2 : 1))); // Approx: Divide by 2 if alpha layers
        }
      }

      return {
        width,
        height,
        format: "heic",
        frames,
        animated,
        colorModel,
        hasAlpha: hasAlpha ? true : null,
        orientation: null, // Can have 'irot' or 'imir' transforms, or EXIF; add parsing if needed
        aspectRatio: width / height,
        colorSpace,
        iccProfile,
        exifDateTimeOriginal // Can have dedicated 'Exif' item; add parser similar to XMP if required
      } satisfies ImageSpecs;
    }
    const headerText = buffer
      .toString("utf-8", 0, Math.min(1024, buffer.length))
      .trim();
    if (
      headerText.startsWith("<svg") ||
      (headerText.startsWith("<?xml") && headerText.includes("<svg"))
    ) {
      const widthMatch = headerText.match(
        /width\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/i
      );
      const heightMatch = headerText.match(
        /height\s*=\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/i
      );
      const viewBoxMatch = headerText.match(
        /viewBox\s*=\s*["']?(\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?)["']?/i
      );
      let width = 0;
      let height = 0;

      if (widthMatch?.[1] && heightMatch?.[1]) {
        width = parseFloat(widthMatch[1]);
        height = parseFloat(heightMatch[1]);
      } else if (viewBoxMatch) {
        const [_x0, _y0, vbWidth, vbHeight] = viewBoxMatch?.[1]
          ?.split(/\s+/)
          .map(t => Number.parseFloat(t)) as [number, number, number, number];
        width = vbWidth;
        height = vbHeight;
      } else {
        // Default to intrinsic size if not specified (e.g., 100% but for metadata, assume 0 or fallback)
        width = 0; // Or throw if no dims
        height = 0;
        throw new Error("SVG has no defined width/height or viewBox");
      }
      const animated =
        headerText.includes("<animate") ||
        headerText.includes("<animation") ||
        headerText.includes("<motion."); // Rough check for SMIL
      const frames = 1;

      return {
        width,
        height,
        format: "svg",
        frames,
        animated,
        hasAlpha: true, // SVG supports transparency
        orientation: null,
        aspectRatio: width / height || 1, // Fallback if 0
        colorModel: "vector",
        colorSpace: "srgb", // Typically sRGB for web SVGs
        iccProfile: null, // Rare, but can embed ICC in <color-profile>
        exifDateTimeOriginal: null // No standard EXIF
      } satisfies ImageSpecs;
    }
    // Add ICO parsing (after SVG check)
    // ICO: Starts with 00 00 01 00 (reserved + type=1), then numImages (u16LE)
    if (
      buffer.length >= 6 &&
      buffer[0] === 0x00 &&
      buffer[1] === 0x00 &&
      buffer[2] === 0x01 &&
      buffer[3] === 0x00
    ) {
      const frames = buffer.readUInt16LE(4); // Number of icons
      if (frames === 0) throw new Error("Invalid ICO: No images");

      // Each entry: width (u8, 0=256), height (u8, 0=256), colors (u8), reserved (u8), planes/hotspotX (u16), bpp/hotspotY (u16), size (u32), offset (u32)
      let maxWidth = 0;
      let maxHeight = 0;
      let hasAlpha: boolean | null = null;
      let colorModel = "unknown" as ImageSpecs["colorModel"];

      for (let i = 0; i < frames; i++) {
        const entryPos = 6 + i * 16;
        if (entryPos + 16 > buffer.length) break; // Truncated

        let entryWidth = buffer[entryPos];
        let entryHeight = buffer[entryPos + 1];
        entryWidth = entryWidth === 0 ? 256 : entryWidth;
        entryHeight = entryHeight === 0 ? 256 : entryHeight;

        const bpp = buffer.readUInt16LE(entryPos + 6); // Bits per pixel
        const _size = buffer.readUInt32LE(entryPos + 8);
        const offset = buffer.readUInt32LE(entryPos + 12);

        // Rough color model based on bpp (common: 1,4,8 indexed; 24 rgb; 32 rgba)
        if (bpp <= 8) colorModel = "indexed";
        else if (bpp === 24) colorModel = "rgb";
        else if (bpp === 32) {
          colorModel = "rgba";
          hasAlpha = true;
        }

        // To detect embedded PNG: If data at offset starts with PNG sig
        if (
          offset + 8 <= rawbuffer.length && // Use full buffer for data
          rawbuffer[offset] === 0x89 &&
          rawbuffer[offset + 1] === 0x50 &&
          rawbuffer[offset + 2] === 0x4e &&
          rawbuffer[offset + 3] === 0x47 &&
          rawbuffer[offset + 4] === 0x0d &&
          rawbuffer[offset + 5] === 0x0a &&
          rawbuffer[offset + 6] === 0x1a &&
          rawbuffer[offset + 7] === 0x0a
        ) {
          // Embedded PNG: Could have alpha
          hasAlpha = true;
          colorModel = "rgba"; // Assume possible
        }

        // Track largest size
        if (entryWidth && entryWidth > maxWidth) maxWidth = entryWidth;
        if (entryHeight && entryHeight > maxHeight) maxHeight = entryHeight;
      }

      return {
        width: maxWidth,
        height: maxHeight,
        format: "ico",
        frames,
        animated: false, // ICO not animated
        hasAlpha,
        orientation: null,
        aspectRatio: maxWidth / maxHeight,
        colorModel,
        colorSpace: "srgb", // Typically
        iccProfile: null,
        exifDateTimeOriginal: null
      } satisfies ImageSpecs;
    }
    // TIFF/TIF (classic TIFF only; BigTIFF is detected and rejected)
    if (
      buffer.length >= 8 &&
      // "II*\0" (little-endian classic TIFF)
      ((buffer[0] === 0x49 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x2a &&
        buffer[3] === 0x00) ||
        // "MM\0*" (big-endian classic TIFF)
        (buffer[0] === 0x4d &&
          buffer[1] === 0x4d &&
          buffer[2] === 0x00 &&
          buffer[3] === 0x2a) ||
        // BigTIFF magic "II+\0" or "MM\0+"
        (buffer[0] === 0x49 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x2b &&
          buffer[3] === 0x00) ||
        (buffer[0] === 0x4d &&
          buffer[1] === 0x4d &&
          buffer[2] === 0x00 &&
          buffer[3] === 0x2b))
    ) {
      const little = buffer[0] === 0x49; // "II" vs "MM"
      const isBigTiff = buffer[2] === 0x2b || buffer[3] === 0x2b;

      // We intentionally don't parse BigTIFF (64-bit offsets). Fail loudly so you can bump your reader when you hit one.
      if (isBigTiff) {
        throw new Error(
          "BigTIFF (0x2B) detected — not supported in lightweight header parser."
        );
      }

      // Use the *full* raw buffer here (IFDs can sit beyond your header window).
      const src = rawbuffer;
      const readU16 = (off: number) =>
        little ? src.readUInt16LE(off) : src.readUInt16BE(off);
      const readU32 = (off: number) =>
        little ? src.readUInt32LE(off) : src.readUInt32BE(off);

      const TIFF_START = 0;
      const firstIFDOff = readU32(4);
      let ifdOff = TIFF_START + firstIFDOff;

      let frames = 0;
      let width: number | null = null;
      let height: number | null = null;
      let samplesPerPixel: number | null = null;
      let extraSamples: number[] = [];
      let photometric: number | null = null;
      let orientation: number | null = null;
      let iccPresent = false;
      let exifIFDOffset: number | null = null;

      const TAG = {
        ImageWidth: 256,
        ImageLength: 257,
        BitsPerSample: 258, // not strictly needed here
        Compression: 259, // not strictly needed here
        PhotometricInterpretation: 262,
        StripOffsets: 273, // not needed for metadata
        Orientation: 274,
        SamplesPerPixel: 277,
        RowsPerStrip: 278, // not needed for metadata
        PlanarConfiguration: 284, // not needed for metadata
        ExtraSamples: 338,
        ICCProfile: 34675,
        ExifIFDPointer: 34665,
        // EXIF IFD:
        DateTimeOriginal: 0x9003
      } as const;

      // TIFF field types (classic)
      const TYPE = {
        BYTE: 1,
        ASCII: 2,
        SHORT: 3,
        LONG: 4,
        RATIONAL: 5,
        SBYTE: 6,
        UNDEFINED: 7,
        SSHORT: 8,
        SLONG: 9,
        SRATIONAL: 10,
        FLOAT: 11,
        DOUBLE: 12
      } as const;

      // Helper to extract values from an IFD entry (classic TIFF 12-byte entries)
      function readIFDValue(
        entryOff: number,
        type: number,
        count: number
      ): number | number[] | string | null {
        // For classic TIFF, the "value or offset" is 4 bytes at entryOff+8
        const valueOrOff = readU32(entryOff + 8);

        // Inline-value size threshold is 4 bytes
        const valueFitsInline =
          ((type === TYPE.BYTE ||
            type === TYPE.SBYTE ||
            type === TYPE.UNDEFINED ||
            type === TYPE.ASCII) &&
            count <= 4) ||
          (type === TYPE.SHORT && count <= 2) ||
          (type === TYPE.LONG && count <= 1);

        let dataOff = valueOrOff;
        if (valueFitsInline) {
          dataOff = entryOff + 8;
        } else {
          dataOff = TIFF_START + valueOrOff;
        }

        // Bounds guard
        if (dataOff < 0 || dataOff >= src.length) return null;

        const readShortN = (o: number) => readU16(o);
        const readLongN = (o: number) => readU32(o);

        switch (type) {
          case TYPE.ASCII: {
            const end = Math.min(
              src.indexOf(0, dataOff) === -1
                ? dataOff + count
                : src.indexOf(0, dataOff),
              src.length
            );
            try {
              return src.toString("ascii", dataOff, end);
            } catch {
              return null;
            }
          }
          case TYPE.BYTE:
          case TYPE.SBYTE:
          case TYPE.UNDEFINED: {
            const out: number[] = [];
            for (let i = 0; i < count; i++) {
              const off = dataOff + i;
              if (off >= src.length || !src[off]) break;
              out.push(src[off]);
            }
            return count === 1 ? (out[0] ?? null) : out;
          }
          case TYPE.SHORT: {
            const out: number[] = [];
            for (let i = 0; i < count; i++) {
              const off = dataOff + i * 2;
              if (off + 2 > src.length) break;
              out.push(readShortN(off));
            }
            return count === 1 ? (out[0] ?? null) : out;
          }
          case TYPE.LONG: {
            const out: number[] = [];
            for (let i = 0; i < count; i++) {
              const off = dataOff + i * 4;
              if (off + 4 > src.length) break;
              out.push(readLongN(off));
            }
            return count === 1 ? (out[0] ?? null) : out;
          }
          case TYPE.RATIONAL: {
            // two LONGs per value (num/den)
            const out: number[] = [];
            for (let i = 0; i < count; i++) {
              const off = dataOff + i * 8;
              if (off + 8 > src.length) break;
              const num = readLongN(off);
              const den = readLongN(off + 4);
              out.push(den ? num / den : 0);
            }
            return count === 1 ? (out[0] ?? null) : out;
          }
          default:
            return null; // Unsupported type; fine for our metadata use
        }
      }

      // Traverse IFD chain, record metadata from the first page, count frames
      const MAX_IFDS = 32; // sanity ceiling
      while (ifdOff > 0 && ifdOff + 2 <= src.length && frames < MAX_IFDS) {
        const numEntries = readU16(ifdOff);
        const entriesBase = ifdOff + 2;

        for (let i = 0; i < numEntries; i++) {
          const entry = entriesBase + i * 12;
          if (entry + 12 > src.length) break;

          const tag = readU16(entry);
          const type = readU16(entry + 2);
          const count = readU32(entry + 4);

          // Narrow to tags we care about
          if (tag === TAG.ImageWidth && width == null) {
            const v = readIFDValue(entry, type, count);
            if (typeof v === "number") width = v;
            if (Array.isArray(v) && typeof v[0] === "number") width = v[0];
          } else if (tag === TAG.ImageLength && height == null) {
            const v = readIFDValue(entry, type, count);
            if (typeof v === "number") height = v;
            if (Array.isArray(v) && typeof v[0] === "number") height = v[0];
          } else if (tag === TAG.SamplesPerPixel && samplesPerPixel == null) {
            const v = readIFDValue(entry, type, count);
            if (typeof v === "number") samplesPerPixel = v;
          } else if (tag === TAG.ExtraSamples) {
            const v = readIFDValue(entry, type, count);
            if (typeof v === "number") extraSamples = [v];
            else if (Array.isArray(v))
              extraSamples = v.filter(n => typeof n === "number") as number[];
          } else if (
            tag === TAG.PhotometricInterpretation &&
            photometric == null
          ) {
            const v = readIFDValue(entry, type, count);
            if (typeof v === "number") photometric = v;
          } else if (tag === TAG.Orientation && orientation == null) {
            const v = readIFDValue(entry, type, count);
            if (typeof v === "number") orientation = v;
          } else if (tag === TAG.ICCProfile) {
            iccPresent = true;
          } else if (tag === TAG.ExifIFDPointer && exifIFDOffset == null) {
            const v = readIFDValue(entry, type, count);
            if (typeof v === "number") exifIFDOffset = TIFF_START + v;
          }
        }

        frames++;

        // Next IFD offset is 4 bytes right after the entries
        const nextPtrOff = entriesBase + numEntries * 12;
        if (nextPtrOff + 4 > src.length) break;
        const nextRel = readU32(nextPtrOff);
        ifdOff = nextRel ? TIFF_START + nextRel : 0;
      }

      // Basic EXIF DateTimeOriginal if EXIF IFD is present (classic TIFF)
      let exifDateTimeOriginal: string | null = null;
      if (exifIFDOffset && exifIFDOffset + 2 <= src.length) {
        try {
          const num = readU16(exifIFDOffset);
          const base = exifIFDOffset + 2;
          for (let i = 0; i < num; i++) {
            const entry = base + i * 12;
            if (entry + 12 > src.length) break;
            const tag = readU16(entry);
            if (tag === TAG.DateTimeOriginal) {
              const type = readU16(entry + 2);
              const count = readU32(entry + 4);
              const val = readIFDValue(entry, type, count);
              if (
                typeof val === "string" &&
                /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(val)
              ) {
                exifDateTimeOriginal = val;
              }
              break;
            }
          }
        } catch {
          // ignore EXIF parse failures
        }
      }

      if (!width || !height) {
        throw new Error(
          "Invalid TIFF: missing ImageWidth/ImageLength in first IFD (consider reading more than header)."
        );
      }

      // Map color model/space
      let colorModel = "unknown" as ImageSpecs["colorModel"];
      let colorSpace = "unknown" as ImageSpecs["colorSpace"];

      // PhotometricInterpretation common values:
      // 0=WhiteIsZero (gray), 1=BlackIsZero (gray), 2=RGB, 3=Palette, 5=CMYK, 6=YCbCr, 8=CIELab
      switch (photometric) {
        case 0:
        case 1:
          colorModel =
            samplesPerPixel === 2 || extraSamples.length
              ? "grayscale-alpha"
              : "grayscale";
          colorSpace = "gray";
          break;
        case 2:
          colorModel =
            samplesPerPixel === 4 || extraSamples.length ? "rgba" : "rgb";
          colorSpace = "srgb"; // sane default unless we parse the ICC "desc"
          break;
        case 3:
          colorModel = "indexed";
          colorSpace = "srgb";
          break;
        case 5:
          colorModel = "cmyk";
          colorSpace = "cmyk";
          break;
        case 6:
          colorModel = "ycbcr"; // matches your JPEG branch semantics
          colorSpace = "srgb"; // typical working space assumption
          break;
        case 8:
          colorModel = "lab";
          colorSpace = "lab";
          break;
        default:
          // unknown photometric; leave defaults
          break;
      }

      const hasAlpha =
        extraSamples.some(v => v === 1 || v === 2) || // 1: associated alpha, 2: unassociated
        (photometric === 2 && samplesPerPixel === 4) ||
        ((photometric === 0 || photometric === 1) && samplesPerPixel === 2);

      return {
        width,
        height,
        format: "tiff",
        frames,
        animated: false,
        hasAlpha,
        orientation: orientation ?? null,
        aspectRatio: width / height,
        colorModel,
        colorSpace,
        iccProfile: iccPresent ? "embedded" : null,
        exifDateTimeOriginal
      } satisfies ImageSpecs;
    }

    throw new Error("Unsupported image format or invalid file");
  }
}
