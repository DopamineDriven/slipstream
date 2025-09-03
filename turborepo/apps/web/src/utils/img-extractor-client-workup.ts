import type { BoxInfo, ImageSpecs } from "@/utils/img-extractor-client";

export class ImgMetadataExtractorWorkup {
  public parseExif(
    buffer: Buffer,
    app1Pos: number,
    app1Size: number
  ): { orientation: number | null; dateTimeOriginal: string | null } {
    // APP1 segment structure:
    // - 2 bytes: 0xFF 0xE1 (marker - already read)
    // - 2 bytes: segment size (includes these 2 bytes but not marker)
    // - 6 bytes: "Exif\0\0" identifier
    // - Rest: TIFF data structure

    const segmentStart = app1Pos + 4; // Skip marker (2) and size (2)
    const segmentEnd = app1Pos + 2 + app1Size; // Marker not included in size

    // Minimum viable EXIF: 6 (header) + 8 (TIFF header) + 2 (IFD count) = 16 bytes
    if (segmentEnd - segmentStart < 16 || segmentEnd > buffer.length) {
      return { orientation: null, dateTimeOriginal: null };
    }

    // Verify EXIF header
    const headerEnd = Math.min(segmentStart + 6, segmentEnd, buffer.length);
    if (headerEnd - segmentStart < 6) {
      return { orientation: null, dateTimeOriginal: null };
    }

    const exifHeader = buffer.toString("ascii", segmentStart, headerEnd);
    if (exifHeader !== "Exif\0\0") {
      return { orientation: null, dateTimeOriginal: null };
    }

    // TIFF data starts after EXIF header
    const tiffStart = segmentStart + 6;
    const tiffEnd = segmentEnd;

    // Need at least 8 bytes for TIFF header
    if (tiffEnd - tiffStart < 8) {
      return { orientation: null, dateTimeOriginal: null };
    }

    // Read byte order (2 bytes)
    const byteOrder = buffer.toString("ascii", tiffStart, tiffStart + 2);
    const littleEndian = byteOrder === "II";
    const bigEndian = byteOrder === "MM";

    if (!littleEndian && !bigEndian) {
      return { orientation: null, dateTimeOriginal: null };
    }

    // Create bounded read functions
    const readUInt16 = (pos: number): number | null => {
      if (pos < 0 || pos + 2 > tiffEnd || pos + 2 > buffer.length) return null;
      return littleEndian ? buffer.readUInt16LE(pos) : buffer.readUInt16BE(pos);
    };

    const readUInt32 = (pos: number): number | null => {
      if (pos < 0 || pos + 4 > tiffEnd || pos + 4 > buffer.length) return null;
      return littleEndian ? buffer.readUInt32LE(pos) : buffer.readUInt32BE(pos);
    };

    // Verify TIFF magic number (0x002A)
    const magic = readUInt16(tiffStart + 2);
    if (magic !== 0x002a) {
      return { orientation: null, dateTimeOriginal: null };
    }

    // Get IFD0 offset (relative to TIFF start)
    const ifd0Offset = readUInt32(tiffStart + 4);
    if (ifd0Offset === null || ifd0Offset < 8) {
      return { orientation: null, dateTimeOriginal: null };
    }

    // IFD0 position (absolute in buffer)
    const ifd0Pos = tiffStart + ifd0Offset;

    // Need at least 2 bytes for entry count
    if (ifd0Pos + 2 > tiffEnd) {
      return { orientation: null, dateTimeOriginal: null };
    }

    const numEntries = readUInt16(ifd0Pos);
    if (numEntries === null || numEntries === 0 || numEntries > 500) {
      // 500 is a sanity check - no valid IFD should have that many entries
      return { orientation: null, dateTimeOriginal: null };
    }

    let orientation: number | null = null;
    let dateTimeOriginal: string | null = null;

    // Each IFD entry is 12 bytes
    const ifdDataStart = ifd0Pos + 2;
    const ifdDataEnd = ifdDataStart + numEntries * 12;

    if (ifdDataEnd > tiffEnd) {
      // IFD extends beyond segment - process what's possible
      const maxEntries = Math.floor((tiffEnd - ifdDataStart) / 12);
      if (maxEntries <= 0) {
        return { orientation, dateTimeOriginal };
      }
      // Process only complete entries that fit
      for (let i = 0; i < maxEntries; i++) {
        const entryPos = ifdDataStart + i * 12;

        const tag = readUInt16(entryPos);
        const type = readUInt16(entryPos + 2);
        const count = readUInt32(entryPos + 4);

        if (tag === null || type === null || count === null) continue;

        // Tag 0x0112: Orientation (SHORT type=3, count=1)
        if (tag === 0x0112 && type === 3 && count === 1) {
          // SHORT (2 bytes) with count=1 fits in the 4-byte value field
          orientation = readUInt16(entryPos + 8);
          if (orientation && (orientation < 1 || orientation > 8)) {
            orientation = null; // Invalid orientation value
          }
        }

        // Tag 0x9003: DateTimeOriginal (ASCII type=2, count=20)
        if (tag === 0x9003 && type === 2 && count === 20) {
          // ASCII strings > 4 bytes use offset pointer
          const offset = readUInt32(entryPos + 8);
          if (offset !== null) {
            const stringPos = tiffStart + offset;
            const stringEnd = stringPos + 19; // 19 chars + null terminator

            if (stringEnd <= tiffEnd && stringEnd <= buffer.length) {
              try {
                dateTimeOriginal = buffer.toString(
                  "ascii",
                  stringPos,
                  stringEnd
                );
                // Validate format: "YYYY:MM:DD HH:MM:SS"
                if (
                  !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(dateTimeOriginal)
                ) {
                  dateTimeOriginal = null;
                }
              } catch {
                dateTimeOriginal = null;
              }
            }
          }
        }

        // Could also look for EXIF IFD pointer (tag 0x8769) for more data
        // but orientation and date are usually in IFD0
      }
    } else {
      // Normal case - all entries fit
      for (let i = 0; i < numEntries; i++) {
        const entryPos = ifdDataStart + i * 12;

        const tag = readUInt16(entryPos);
        const type = readUInt16(entryPos + 2);
        const count = readUInt32(entryPos + 4);

        if (tag === null || type === null || count === null) continue;

        if (tag === 0x0112 && type === 3 && count === 1) {
          orientation = readUInt16(entryPos + 8);
          if (orientation && (orientation < 1 || orientation > 8)) {
            orientation = null;
          }
        } else if (tag === 0x9003 && type === 2 && count === 20) {
          const offset = readUInt32(entryPos + 8);
          if (offset !== null) {
            const stringPos = tiffStart + offset;
            const stringEnd = stringPos + 19;

            if (stringEnd <= tiffEnd && stringEnd <= buffer.length) {
              try {
                const extracted = buffer.toString(
                  "ascii",
                  stringPos,
                  stringEnd
                );
                if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(extracted)) {
                  dateTimeOriginal = extracted;
                }
              } catch {
                console.warn("invalid ascii data");
              }
            }
          }
        }
      }
    }

    return { orientation, dateTimeOriginal };
  }
  public parseXmpFromAvif(
    buffer: Buffer,
    meta: BoxInfo,
    _ipco: BoxInfo
  ): string | null {
    // Find iinf (Item Info Box)
    const iinf = this.findBox(
      buffer,
      "iinf",
      meta.pos + 4,
      meta.pos + meta.size
    );
    if (!iinf) return null;

    // Parse iinf: version/flags (skip), then item_count (u16 or u32 based on version)
    let pos = iinf.pos;

    const version = buffer[pos++];
    // const flags = (buffer[pos++]  << 16) | (buffer[pos++] << 8) | buffer[pos++]; // Skip flags
    const itemCount =
      version === 0 ? buffer.readUInt16BE(pos) : buffer.readUInt32BE(pos);
    pos += version === 0 ? 2 : 4;

    let xmpItemId: number | undefined;
    for (let i = 0; i < itemCount; i++) {
      // Each infe (Item Info Entry)
      const infeStart = pos;
      const infeSize = buffer.readUInt32BE(pos);
      if (buffer.toString("ascii", pos + 4, pos + 8) !== "infe") break; // Not infe
      pos += 8; // size + type
      const infeVersion = buffer?.[pos++];

      // const infeFlags = (buffer[pos++] << 16) | (buffer[pos++] << 8) | buffer[pos++]; // Skip
      if (!infeVersion) return null;
      const itemId =
        infeVersion < 2 ? buffer.readUInt16BE(pos) : buffer.readUInt32BE(pos);
      pos += infeVersion < 2 ? 2 : 4;
      pos += 2; // item_protection_index (u16, skip)
      const itemType = buffer.toString("ascii", pos, pos + 4);
      pos += 4;
      // item_name (null-terminated string) - skip over it
      let nameEnd = pos;
      while (buffer[nameEnd] !== 0 && nameEnd < infeStart + infeSize) nameEnd++;
      pos = nameEnd + 1;
      if (itemType === "mime") {
        // content_type (null-terminated)
        let ctEnd = pos;
        while (buffer[ctEnd] !== 0 && ctEnd < infeStart + infeSize) ctEnd++;
        const contentType = buffer.toString("ascii", pos, ctEnd);
        if (contentType === "application/rdf+xml") {
          xmpItemId = itemId;
          break; // Found XMP item
        }
        pos = ctEnd + 1; // Skip optional content_encoding if present
      }
      pos = infeStart + infeSize; // Jump to next infe
    }

    if (!xmpItemId) return null;

    // Find iloc (Item Location Box)
    const iloc = this.findBox(
      buffer,
      "iloc",
      meta.pos + 4,
      meta.pos + meta.size
    );
    if (!iloc) return null;

    // Parse iloc: version, flags (skip), offset_size (4bits), length_size (4bits), base_offset_size (4bits), etc.
    pos = iloc.pos;
    const ilocVersion = buffer[pos++];
    // const ilocFlags = (buffer[pos++] << 16) | (buffer[pos++] << 8) | buffer[pos++]; // Skip
    const sizes = buffer?.[pos++];
    if (!sizes) return null;
    const offsetSize = (sizes >> 4) & 0xf;
    const lengthSize = sizes & 0xf;
    let indexSize = 0;
    if (ilocVersion === 1 || ilocVersion === 2) {
      const indexSizes = buffer?.[pos++];
      if (!indexSizes) return null;
      // index_size (4bits), reserved (4bits) - but simplified, assume no construction_method
      indexSize = (indexSizes >> 4) & 0xf;
    }
    if (!ilocVersion) return null;
    const buffpos = buffer?.[pos++];
    if (!buffpos) return null;
    const baseOffsetSize = ilocVersion < 2 ? 0 : (buffpos >> 4) & 0xf; // Simplified
    const itemCountIloc =
      ilocVersion < 2 ? buffer.readUInt16BE(pos) : buffer.readUInt32BE(pos);
    pos += ilocVersion < 2 ? 2 : 4;

    let xmpOffset = 0;
    let xmpLength = 0;
    for (let i = 0; i < itemCountIloc; i++) {
      const curItemId =
        ilocVersion < 2 ? buffer.readUInt16BE(pos) : buffer.readUInt32BE(pos);
      pos += ilocVersion < 2 ? 2 : 4;
      if (curItemId !== xmpItemId) {
        // Skip this item: construction_method (u16 if v1+), data_reference_index (u16), base_offset, extent_count (u16), then per extent: [index] offset length
        if (ilocVersion === 1 || ilocVersion === 2) pos += 2; // construction_method (assume 0: file offset)
        pos += 2; // data_reference_index (u16, assume 0: this file)
        pos += baseOffsetSize; // base_offset
        const extentCount = buffer.readUInt16BE(pos);
        pos += 2;
        for (let e = 0; e < extentCount; e++) {
          if (indexSize > 0) pos += indexSize; // extent_index if present
          pos += offsetSize + lengthSize; // Skip offset + length
        }
        continue;
      }
      // Found XMP item: Assume construction_method=0 (file offset), data_ref=0, extent_count=1 (common for XMP)
      if (ilocVersion === 1 || ilocVersion === 2) {
        const constructionMethod = buffer.readUInt16BE(pos);
        pos += 2;
        if (constructionMethod !== 0) return null; // Unsupported (e.g., idat or item)
      }
      pos += 2; // data_reference_index (assume 0)
      const baseOffset = this.readVarSize(buffer, pos, baseOffsetSize);
      pos += baseOffsetSize;
      const extentCount = buffer.readUInt16BE(pos);
      pos += 2;
      if (extentCount !== 1) return null; // Multi-extent rare, handle single for simplicity
      if (indexSize > 0) pos += indexSize; // Skip index if present
      const extentOffset = this.readVarSize(buffer, pos, offsetSize);
      pos += offsetSize;
      const extentLength = this.readVarSize(buffer, pos, lengthSize);
      xmpOffset = baseOffset + extentOffset;
      xmpLength = extentLength;
      break;
    }

    if (
      xmpOffset === 0 ||
      xmpLength === 0 ||
      xmpOffset + xmpLength > buffer.length
    )
      return null;

    // Extract XMP XML string (UTF-8 assumed)
    return buffer.toString("utf8", xmpOffset, xmpOffset + xmpLength);
  }
  public readVarSize(buffer: Buffer, pos: number, size: number) {
    if (size === 0) return 0;
    if (size === 1 && buffer?.[pos]) return buffer?.[pos];
    if (size === 2) return buffer.readUInt16BE(pos);
    if (size === 3) {
      const pos1 = buffer?.[pos + 1],
        pos2 = buffer?.[pos + 2];
      if (buffer?.[pos] && pos1 && pos2) {
        return (buffer[pos] << 16) | (pos1 << 8) | pos2;
      }
      throw new Error("Invalid var size");
    }
    if (size === 4) return buffer.readUInt32BE(pos);
    if (size === 8) return Number(buffer.readBigUInt64BE(pos));
    throw new Error("Invalid var size");
  }
  public findBox(
    buffer: Buffer,
    type: string,
    start = 0,
    end: number = buffer.length
  ): BoxInfo | null {
    let pos = start;
    while (pos < end) {
      let boxSize = buffer.readUInt32BE(pos);
      const boxType = buffer.toString("ascii", pos + 4, pos + 8);
      let hdrSize = 8;
      if (boxSize === 1) {
        boxSize = Number(buffer.readBigUInt64BE(pos + 8));
        hdrSize = 16;
      } else if (boxSize === 0) {
        boxSize = end - pos;
      }
      if (boxType === type) {
        return { pos: pos + hdrSize, size: boxSize - hdrSize };
      }
      pos += boxSize;
    }
    return null;
  }
  public mapChrmToColorSpace(
    chrm: {
      white_x: number;
      white_y: number;
      red_x: number;
      red_y: number;
      green_x: number;
      green_y: number;
      blue_x: number;
      blue_y: number;
    },
    fallback: ImageSpecs["colorSpace"]
  ) {
    const tol = 100; // Small tolerance for int rounding (out of 100000)
    // sRGB / Rec.709
    if (
      Math.abs(chrm.white_x - 31270) < tol &&
      Math.abs(chrm.white_y - 32900) < tol &&
      Math.abs(chrm.red_x - 64000) < tol &&
      Math.abs(chrm.red_y - 33000) < tol &&
      Math.abs(chrm.green_x - 30000) < tol &&
      Math.abs(chrm.green_y - 60000) < tol &&
      Math.abs(chrm.blue_x - 15000) < tol &&
      Math.abs(chrm.blue_y - 6000) < tol
    )
      return "srgb";
    // Adobe RGB
    if (
      Math.abs(chrm.white_x - 31270) < tol &&
      Math.abs(chrm.white_y - 32900) < tol &&
      Math.abs(chrm.red_x - 64000) < tol &&
      Math.abs(chrm.red_y - 33000) < tol &&
      Math.abs(chrm.green_x - 21000) < tol &&
      Math.abs(chrm.green_y - 71000) < tol &&
      Math.abs(chrm.blue_x - 15000) < tol &&
      Math.abs(chrm.blue_y - 6000) < tol
    )
      return "adobe_rgb";
    // Display P3
    if (
      Math.abs(chrm.white_x - 31270) < tol &&
      Math.abs(chrm.white_y - 32900) < tol &&
      Math.abs(chrm.red_x - 68000) < tol &&
      Math.abs(chrm.red_y - 32000) < tol &&
      Math.abs(chrm.green_x - 26500) < tol &&
      Math.abs(chrm.green_y - 69000) < tol &&
      Math.abs(chrm.blue_x - 15000) < tol &&
      Math.abs(chrm.blue_y - 6000) < tol
    )
      return "display_p3";
    // ProPhoto RGB
    if (
      Math.abs(chrm.white_x - 34590) < tol &&
      Math.abs(chrm.white_y - 35850) < tol && // D50 white point
      Math.abs(chrm.red_x - 73470) < tol &&
      Math.abs(chrm.red_y - 26530) < tol &&
      Math.abs(chrm.green_x - 15960) < tol &&
      Math.abs(chrm.green_y - 85040) < tol &&
      Math.abs(chrm.blue_x - 3600) < tol &&
      Math.abs(chrm.blue_y - 1000) < tol
    )
      return "prophoto_rgb";
    // Rec.2020
    if (
      Math.abs(chrm.white_x - 31270) < tol &&
      Math.abs(chrm.white_y - 32900) < tol &&
      Math.abs(chrm.red_x - 70800) < tol &&
      Math.abs(chrm.red_y - 29200) < tol &&
      Math.abs(chrm.green_x - 17000) < tol &&
      Math.abs(chrm.green_y - 79700) < tol &&
      Math.abs(chrm.blue_x - 13100) < tol &&
      Math.abs(chrm.blue_y - 4600) < tol
    )
      return "rec2020";
    return fallback; // No match, keep default
  }
  public xmpToColorSpaceWorkup<
    const T extends
      | ImageSpecs["colorSpace"]
      | "prophoto rgb"
      | "display p3"
      | "adobe rgb (1998)"
      | "rgb"
      | "grayscale",
    const V extends "iccprofile" | "colormode"
  >(space: T, target: V) {
    return `<photoshop:${target}>${space}</photoshop:${target}>` as const;
  }
  public mapXmpToColorSpace(
    xmpText: string,
    fallback: ImageSpecs["colorSpace"]
  ) {
    const lower = xmpText.toLowerCase();
    // Look for common tags like <photoshop:ICCProfile> or <xmpG:icc-profile-name>
    if (lower.includes(this.xmpToColorSpaceWorkup("srgb", "iccprofile")))
      return "srgb";
    if (
      lower.includes(
        this.xmpToColorSpaceWorkup("adobe rgb (1998)", "iccprofile")
      )
    )
      return "adobe_rgb";
    if (lower.includes(this.xmpToColorSpaceWorkup("display p3", "iccprofile")))
      return "display_p3";
    if (
      lower.includes(this.xmpToColorSpaceWorkup("prophoto rgb", "iccprofile"))
    )
      return "prophoto_rgb";
    // Or color mode hints
    if (
      lower.includes(this.xmpToColorSpaceWorkup("rgb", "colormode")) &&
      lower.includes("adobe rgb")
    )
      return "adobe_rgb";
    if (lower.includes(this.xmpToColorSpaceWorkup("grayscale", "colormode")))
      return "gray";
    return fallback;
  }
  public mapProfileToColorSpace(
    profileName: string | null,
    fallback: ImageSpecs["colorSpace"]
  ) {
    if (
      !profileName ||
      profileName === "embedded" ||
      profileName.toLowerCase().includes("icc profile")
    )
      return fallback; // Generic names preserve default
    const lower = profileName.toLowerCase();
    if (
      lower.includes("srgb") ||
      lower.includes("iec61966") ||
      lower.includes("srgb2014")
    )
      return "srgb";
    if (
      lower.includes("display p3") ||
      lower.includes("display-p3") ||
      lower.includes("dci-p3") ||
      lower.includes("p3")
    )
      return "display_p3";
    if (
      lower.includes("adobe rgb") ||
      lower.includes("adobergb") ||
      lower.includes("adobe rgb (1998)")
    )
      return "adobe_rgb";
    if (
      lower.includes("prophoto rgb") ||
      lower.includes("prophoto") ||
      lower.includes("romm rgb") ||
      lower.includes("romm") ||
      lower.includes("iso 22028")
    )
      return "prophoto_rgb";
    if (
      lower.includes("rec2020") ||
      lower.includes("bt.2020") ||
      lower.includes("bt2020") ||
      lower.includes("bt.2100") ||
      lower.includes("itur_2100")
    )
      return "rec2020";
    if (
      lower.includes("rec709") ||
      lower.includes("bt.709") ||
      lower.includes("bt709")
    )
      return "rec709";
    if (lower.includes("cmyk")) return "cmyk";
    if (lower.includes("lab")) return "lab";
    if (lower.includes("xyz")) return "xyz";
    if (
      lower.includes("gray") ||
      lower.includes("grey") ||
      lower.includes("monochrome") ||
      lower.includes("gamma") ||
      lower.includes("gamma 2.2") ||
      lower.includes("dot gain")
    )
      return "gray";
    return fallback; // Preserve d
  }
}
