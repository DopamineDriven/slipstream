import type { DocSpecs, ZipEntry } from "@/types/index.ts";
import { inflateSync } from "fflate";

export class DocMetadataExtractor {
  // Safer decoding with fallback paths
  private toSafeString(buf: Uint8Array, encoding = "utf-8"): string {
    try {
      // TextDecoder is available in browsers and modern runtimes
      return new TextDecoder(encoding, { fatal: false }).decode(buf);
    } catch {
      // Fallback to latin1-ish if decoder fails
      return Array.from(buf)
        .map(b => String.fromCharCode(b))
        .join("");
    }
  }

  private detectTextEncodingPrefix(buffer: Uint8Array): {
    encoding: string;
    offset: number;
  } {
    // BOM detection for common encodings
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf
    )
      return { encoding: "utf-8", offset: 3 };
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe)
      return { encoding: "utf-16le", offset: 2 };
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff)
      return { encoding: "utf-16be", offset: 2 };
    return { encoding: "utf-8", offset: 0 };
  }

  // Best-effort text detection/decoding with UTF-8 validation and Windows-1252 fallback
  private detectAndDecodeText(buffer: Uint8Array): string {
    const { encoding, offset } = this.detectTextEncodingPrefix(buffer);
    const body = buffer.subarray(offset);
    if (encoding === "utf-8" && offset === 0) {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(body);
      } catch {
        return new TextDecoder("windows-1252", { fatal: false }).decode(body);
      }
    }
    return this.toSafeString(body, encoding);
  }

  private _stripXmlTags(xml: string): string {
    return xml
      .replace(/<\/?[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  private getExtFromFilename(filename?: string): string | null {
    if (!filename) return null;
    const i = filename.lastIndexOf(".");
    if (i === -1) return null;
    return filename.slice(i + 1).toLowerCase();
  }

  private firstN(text: string | null | undefined, n = 240): string | null {
    if (!text) return null;
    const t = text.slice(0, n);
    return t.length < text.length ? `${t}…` : t;
  }

  private countWords(text: string): number {
    const words = text.trim().match(/[\p{L}\p{N}_]+/gu);
    return words ? words.length : 0;
  }

  private countLines(text: string): number {
    if (!text) return 0;
    // Normalise CRLF
    return text.replace(/\r\n/g, "\n").split("\n").length;
  }
  private extToLanguage(ext: string | null): string | null {
    if (!ext) return null;
    const map: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      py: "python",
      rb: "ruby",
      rs: "rust",
      go: "go",
      java: "java",
      c: "c",
      h: "c",
      cpp: "cpp",
      hpp: "cpp",
      cs: "csharp",
      php: "php",
      swift: "swift",
      kotlin: "kotlin",
      kt: "kotlin",
      m: "objective-c",
      mm: "objective-c++",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      json: "json",
      yml: "yaml",
      yaml: "yaml",
      md: "markdown",
      markdown: "markdown",
      html: "html",
      css: "css",
      scss: "scss",
      less: "less",
      sql: "sql",
      csv: "csv",
      txt: "text",
      tex: "tex"
    };
    return map[ext] ?? null;
  }

  // -------- PDF helpers --------
  private countPDFPages(buffer: Buffer): number | null {
    try {
      const text = buffer.toString("latin1");
      // Strategy 1: /Pages /Count
      const pagesMatch = text.match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/);

      if (pagesMatch?.[1]) {
        const count = parseInt(pagesMatch[1], 10);
        if (count > 0 && count < 100000) {
          return count;
        }
      }
      // Strategy 2: Catalog -> Pages ref -> Count
      const catalogMatch = text.match(
        /\/Type\s*\/Catalog[^>]*?\/Pages\s+(\d+)\s+\d+\s+R/
      );
      if (catalogMatch?.[1]) {
        const objNum = catalogMatch[1];
        const pagesObjRegex = new RegExp(
          `${objNum}\\s+\\d+\\s+obj[\\s\\S]*?\\/Type\\s*\\/Pages[\\s\\S]*?\\/Count\\s+(\\d+)`
        );
        const pagesObjMatch = text.match(pagesObjRegex);
        if (pagesObjMatch?.[1]) {
          const count = parseInt(pagesObjMatch[1], 10);
          if (count > 0 && count < 100000) return count;
        }
      }
      // Strategy 3: Linearized dictionary /N
      if (/Linearized/i.test(text)) {
        const linearMatch = text.match(
          /<<[\s\S]*?\/Linearized[\s\S]*?\/N\s+(\d+)/
        );
        if (linearMatch?.[1]) {
          const count = parseInt(linearMatch[1], 10);
          if (count > 0 && count < 100000) return count;
        }
      }
      // Strategy 4: Kids refs -> unique pages
      const pageRefs = new Set<string>();
      const kidsMatches = text.matchAll(/\/Kids\s*\[([\s\S]*?)\]/g);
      for (const match of kidsMatches) {
        if (match[1]) {
          const refs = match[1].matchAll(/(\d+)\s+\d+\s+R/g);
          for (const ref of refs) {
            if (ref[1]) {
              pageRefs.add(ref[1]);
            }
          }
        }
      }
      const count = pageRefs.size;
      if (count > 0) return count;
      // Strategy 5: Fallback: count Page objects (with MediaBox/Parent preferred)
      const fallback =
        (
          text.match(
            /obj[\s\S]*?\/Type\s*\/Page\b(?![s])[\s\S]*?(?:\/MediaBox|\/Parent)/g
          ) ?? []
        ).length || (text.match(/\/Type\s*\/Page\b/g) ?? []).length;
      return fallback || null;
    } catch {
      return null;
    }
  }

  private extractPDFText(buffer: Buffer, maxLength = 500): string | null {
    try {
      const text = buffer.toString("latin1");
      const textBlocks = Array.of<string>();
      const btMatches = text.matchAll(/BT([\s\S]*?)ET/g);
      for (const m of btMatches) {
        const body = m[1];
        // Tj with () strings
        if (body) {
          for (const tj of body.matchAll(/\(([^)]*)\)\s*Tj/g)) {
            if (tj[1]) textBlocks.push(this.decodePdfString(tj[1]));
            if (textBlocks.join(" ").length > maxLength) break;
          }
          // Tj with <hex>
          for (const hex of body.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
            if (hex[1]) textBlocks.push(this.decodeHexString(hex[1]));
            if (textBlocks.join(" ").length > maxLength) break;
          }
          // TJ arrays
          for (const tja of body.matchAll(/\[(.*?)\]\s*TJ/g)) {
            const arr = tja[1];
            if (arr) {
              for (const str of arr.matchAll(/\(([^)]*)\)/g)) {
                if (str[1]) textBlocks.push(this.decodePdfString(str[1]));
                if (textBlocks.join(" ").length > maxLength) break;
              }
              for (const hx of arr.matchAll(/<([0-9A-Fa-f]+)>/g)) {
                if (hx[1]) textBlocks.push(this.decodeHexString(hx[1]));
                if (textBlocks.join(" ").length > maxLength) break;
              }
            }
          }
        }
        if (textBlocks.join(" ").length > maxLength) break;
      }
      if (!textBlocks.length) return null;
      let result = textBlocks
        .join(" ")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!result) return null;
      if (result.length > maxLength) result = result.slice(0, maxLength) + "…";
      return result;
    } catch {
      return null;
    }
  }
  private decodePdfString(str: string): string {
    if (!str) return "";
    let out = str.replace(/\\(\d{1,3})/g, (_, oct: string) => {
      const code = parseInt(oct, 8);
      return code < 256 ? String.fromCharCode(code) : "";
    });
    out = out
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\b/g, "\b")
      .replace(/\\f/g, "\f")
      .replace(/\\([()\\])/g, "$1");
    return out;
  }
  private decodeHexString(hex: string): string {
    if (!hex) return "";

    // Remove spaces and ensure even length
    hex = hex.replace(/\s/g, "");
    if (hex.length % 2) hex += "0";

    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substring(i, 2), 16);
      if (!isNaN(code)) {
        result += String.fromCharCode(code);
      }
    }
    return result;
  }
  /**
   * Parse PDF date format into ISO 8601
   * PDF Format: D:YYYYMMDDHHmmSSOHH'mm'
   * Your implementation is good but needs small fixes
   */
  private parsePdfDate(value: string): string | null {
    if (!value) return null;

    // Clean the input
    const v = value.startsWith("D:") ? value.slice(2) : value;

    // Fixed regex - make timezone optional and handle variations
    const re =
      /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z|[+\-])(\d{2})'?(\d{2})'?)?/;
    const m = v.match(re);
    if (!m) return null;

    const [_, Y, Mo, D, H, Mi, S, tzIndicator, tzHours, tzMinutes] = m;

    // Build date components with defaults
    const yyyy = Y;
    const mm = Mo ?? "01";
    const dd = D ?? "01";
    const hh = H ?? "00";
    const mi = Mi ?? "00";
    const ss = S ?? "00";

    // Build timezone string
    let tz = "";
    if (tzIndicator) {
      if (tzIndicator === "Z") {
        tz = "Z";
      } else {
        // Handle +/- timezone
        const tzH = tzHours ?? "00";
        const tzM = tzMinutes ?? "00";
        tz = `${tzIndicator}${tzH.padStart(2, "0")}:${tzM.padStart(2, "0")}`;
      }
    }

    // Return ISO 8601 format
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${hh.padStart(2, "0")}:${mi.padStart(2, "0")}:${ss.padStart(2, "0")}${tz}`;
  }
  private getPdfInfoString(text: string, key: string): string | null {
    // Parenthesis format
    let m = text.match(new RegExp(`\/${key}\\s*\(([^)]*)\)`));
    if (m?.[1]) return this.decodePdfString(m[1]);
    // Hex format
    m = text.match(new RegExp(`\/${key}\\s*<([0-9A-Fa-f]+)>`));
    if (m?.[1]) return this.decodeHexString(m[1]);
    return null;
  }

  /**
   * Extract date fields from PDF - handles all encoding formats
   * This is what you need to call from your main PDF parser
   */
  private extractPdfDate(text: string, fieldName: string): string | null {
    // Method 1: Parentheses format (most common)
    // Example: /CreationDate (D:20241225120000+05'00')
    let match = text.match(new RegExp(`\/${fieldName}\\s*\\(([^)]+)\\)`));
    if (match?.[1]) {
      // Decode PDF string escapes first
      const decoded = this.decodePdfString(match[1]);
      return this.parsePdfDate(decoded);
    }

    // Method 2: Hexadecimal format
    // Example: /CreationDate <443A32303234313232353132303030302B30352730302720>
    match = text.match(new RegExp(`\/${fieldName}\\s*<([0-9A-Fa-f]+)>`));
    if (match?.[1]) {
      const decoded = this.decodeHexString(match[1]);
      return this.parsePdfDate(decoded);
    }

    // Method 3: Direct string (rare but possible)
    // Example: /CreationDate D:20241225120000Z
    match = text.match(new RegExp(`\/${fieldName}\\s+(D:[^\\s/>]+)`));
    if (match?.[1]) {
      return this.parsePdfDate(match[1]);
    }

    return null;
  }

  /**
   * Extract dates from XMP metadata packet
   * Used as fallback when traditional PDF Info dictionary lacks dates
   */
  private extractXmpDates(text: string): {
    createdDate: string | null;
    modifiedDate: string | null;
  } {
    // Look for XMP packet
    const xmpMatch = text.match(/<\?xpacket[^>]*\?>([\s\S]*?)<\/x:xmpmeta>/);
    if (!xmpMatch?.[1]) {
      return { createdDate: null, modifiedDate: null };
    }

    const xmpContent = xmpMatch[1];
    let createdDate: string | null = null;
    let modifiedDate: string | null = null;

    // Try various XMP date field formats
    // Format 1: <xmp:CreateDate>2025-09-25T03:22:11-04:00</xmp:CreateDate>
    let match = xmpContent.match(/<xmp:CreateDate>([^<]+)<\/xmp:CreateDate>/);
    if (match?.[1]) {
      createdDate = match[1];
    }

    match = xmpContent.match(/<xmp:ModifyDate>([^<]+)<\/xmp:ModifyDate>/);
    if (match?.[1]) {
      modifiedDate = match[1];
    }

    // Format 2: xmp:CreateDate="2025-09-25T03:22:11-04:00"
    if (!createdDate) {
      match = xmpContent.match(/xmp:CreateDate=["']([^"']+)["']/);
      if (match?.[1]) {
        createdDate = match[1];
      }
    }

    if (!modifiedDate) {
      match = xmpContent.match(/xmp:ModifyDate=["']([^"']+)["']/);
      if (match?.[1]) {
        modifiedDate = match[1];
      }
    }

    // Also check for PDF-specific XMP fields
    if (!createdDate) {
      match = xmpContent.match(/<pdf:CreationDate>([^<]+)<\/pdf:CreationDate>/);
      if (match?.[1]) {
        createdDate = match[1];
      }
    }

    if (!modifiedDate) {
      match = xmpContent.match(/<pdf:ModDate>([^<]+)<\/pdf:ModDate>/);
      if (match?.[1]) {
        modifiedDate = match[1];
      }
    }

    return { createdDate, modifiedDate };
  }

  public parsePdf(buffer: Buffer, mime: string): DocSpecs {
    // Use latin1 for stable byte->char mapping during regex scans
    const text = buffer.toString("latin1");
    const headerMatch = text.match(/^%PDF-([0-9.]+)/);
    const pdfVersion = headerMatch?.[1] ?? null;
    const isLinearized = /Linearized/i.test(text);
    const isEncrypted = /\/Encrypt\b/.test(text);

    // Better page counting: prefer /Pages /Count, then Kids refs, then fallback
    const pageCount = this.countPDFPages(buffer);

    // Basic text extraction for preview
    const textPreview = this.extractPDFText(buffer, 500);
    const isSearchable =
      !!textPreview || /\bToUnicode\b/.test(text) || /\/Font\b/.test(text);

    // Info dictionary extraction with () and <hex> handling
    const author = this.getPdfInfoString(text, "Author");
    const subject = this.getPdfInfoString(text, "Subject");
    const title = this.getPdfInfoString(text, "Title");
    const creator = this.getPdfInfoString(text, "Creator");
    const producer = this.getPdfInfoString(text, "Producer");
    const keywordsRaw = this.getPdfInfoString(text, "Keywords");
    let keywords = keywordsRaw
      ? keywordsRaw
          .split(/[,;]/)
          .map(s => s.trim())
          .filter(Boolean)
      : null;
    // Best-effort: include creator/producer as keywords if present
    if (creator || producer) {
      const extra = [creator, producer].filter(Boolean) as string[];
      keywords = (keywords ?? []).concat(extra);
    }

    // Dates: robust parsing of various PDF date shapes
    // Try traditional PDF Info dictionary first
    let createdDate = this.extractPdfDate(text, "CreationDate");
    let modifiedDate = this.extractPdfDate(text, "ModDate");

    // If no dates found in traditional format, try XMP metadata
    if (!createdDate && !modifiedDate) {
      const xmpDates = this.extractXmpDates(text);
      createdDate = xmpDates.createdDate;
      modifiedDate = xmpDates.modifiedDate;
    }

    return {
      type: "DOCUMENT",
      format: "pdf",
      mimeType: mime ?? "application/pdf",
      pageCount,
      wordCount: textPreview ? this.countWords(textPreview) : null,
      lineCount: null,
      language: null,
      encoding: null,
      author: author ?? creator ?? producer ?? null,
      subject: subject ?? title ?? null,
      keywords,
      pdfVersion,
      isEncrypted,
      isSearchable,
      isLinearized,
      textPreview,
      createdDate,
      modifiedDate
    } satisfies DocSpecs;
  }
  public parseRtf(buffer: Buffer, mime: string): DocSpecs {
    const latin = buffer.toString("latin1");
    // Extremely naive RTF to text: remove control words and groups
    const text = latin
      .replace(/\\'[0-9a-fA-F]{2}/g, " ")
      .replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
      .replace(/[{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = this.countWords(text);
    const lines = this.countLines(text);
    return {
      type: "DOCUMENT",
      format: "rtf",
      mimeType: mime,
      pageCount: null,
      wordCount: words,
      lineCount: lines,
      language: null,
      encoding: "rtf",
      author: null,
      subject: null,
      keywords: null,
      pdfVersion: null,
      isEncrypted: null,
      isSearchable: true,
      isLinearized: null,
      textPreview: this.firstN(text),
      createdDate: null,
      modifiedDate: null
    } satisfies DocSpecs;
  }

  public parsePlainText(
    buffer: Buffer,
    mime: string,
    filename?: string
  ): DocSpecs {
    const u8 = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
    const { encoding } = this.detectTextEncodingPrefix(u8);
    const text = this.detectAndDecodeText(u8);
    const ext = this.getExtFromFilename(filename);
    const language = this.extToLanguage(ext);
    const words = this.countWords(text);
    const lines = this.countLines(text);
    return {
      type: "DOCUMENT",
      format:
        ext === "md"
          ? "markdown"
          : ext === "csv"
            ? "csv"
            : ext === "json"
              ? "json"
              : ext === "html"
                ? "html"
                : "txt",
      mimeType: mime,
      pageCount: null,
      wordCount: words,
      lineCount: lines,
      language,
      encoding,
      author: null,
      subject: null,
      keywords: null,
      pdfVersion: null,
      isEncrypted: null,
      isSearchable: true,
      isLinearized: null,
      textPreview: this.firstN(text),
      createdDate: null,
      modifiedDate: null
    } satisfies DocSpecs;
  }
  /** ---- Minimal ZIP reader utilities (central directory based) ---- */
  private findEOCD(buffer: Buffer): number {
    // EOCD signature: 0x06054b50
    const sig = 0x06054b50;
    const maxSearch = Math.min(buffer.length, 0xffff + 22); // comment <= 65535
    for (let i = buffer.length - 22; i >= buffer.length - maxSearch; i--) {
      if (i < 0) break;
      if (buffer.readUInt32LE(i) === sig) return i;
    }
    return -1;
  }
  public readCentralDirectory(buffer: Buffer): ZipEntry[] {
    try {
      const eocd = this.findEOCD(buffer);
      if (eocd < 0 || eocd + 22 > buffer.length) return [];
      const sig = buffer.readUInt32LE(eocd);
      if (sig !== 0x06054b50) return [];

      const diskNumber = buffer.readUInt16LE(eocd + 4);
      const diskWithCD = buffer.readUInt16LE(eocd + 6);
      if (diskNumber !== 0 || diskWithCD !== 0) return [];

      const totalEntries = buffer.readUInt16LE(eocd + 10);
      const cdirSize = buffer.readUInt32LE(eocd + 12);
      const cdirOffset = buffer.readUInt32LE(eocd + 16);

      if (cdirOffset + cdirSize > buffer.length) {
        return this.recoverCentralDirectory(buffer, cdirOffset, totalEntries);
      }
      return this.parseCentralDirectory(buffer, cdirOffset, totalEntries);
    } catch {
      return [];
    }
  }

  private parseCentralDirectory(
    buffer: Buffer,
    offset: number,
    totalEntries: number
  ): ZipEntry[] {
    const entries: ZipEntry[] = [];
    let p = offset;
    const CEN_SIG = 0x02014b50;
    for (let i = 0; i < totalEntries; i++) {
      if (p + 46 > buffer.length) break;
      if (buffer.readUInt32LE(p) !== CEN_SIG) break;
      const compression = buffer.readUInt16LE(p + 10);
      const compSize = buffer.readUInt32LE(p + 20);
      const uncompSize = buffer.readUInt32LE(p + 24);
      const nameLen = buffer.readUInt16LE(p + 28);
      const extraLen = buffer.readUInt16LE(p + 30);
      const commentLen = buffer.readUInt16LE(p + 32);
      const localHeaderOffset = buffer.readUInt32LE(p + 42);
      const nameStart = p + 46;
      const nameEnd = nameStart + nameLen;
      if (nameEnd > buffer.length) break;
      const name = buffer.subarray(nameStart, nameEnd).toString("utf-8");
      entries.push({
        name,
        compressedSize: compSize,
        uncompressedSize: uncompSize,
        compressionMethod: compression,
        localHeaderOffset
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  private recoverCentralDirectory(
    buffer: Buffer,
    startOffset: number,
    maxEntries: number
  ): ZipEntry[] {
    const entries: ZipEntry[] = [];
    const CEN_SIG = 0x02014b50;
    let p = Math.max(0, startOffset);
    while (p + 46 <= buffer.length && entries.length < maxEntries) {
      if (buffer.readUInt32LE(p) === CEN_SIG) {
        const compression = buffer.readUInt16LE(p + 10);
        const compSize = buffer.readUInt32LE(p + 20);
        const uncompSize = buffer.readUInt32LE(p + 24);
        const nameLen = buffer.readUInt16LE(p + 28);
        const extraLen = buffer.readUInt16LE(p + 30);
        const commentLen = buffer.readUInt16LE(p + 32);
        const localHeaderOffset = buffer.readUInt32LE(p + 42);
        const nameStart = p + 46;
        const nameEnd = nameStart + nameLen;
        if (nameEnd > buffer.length) break;
        const name = buffer.subarray(nameStart, nameEnd).toString("utf-8");
        entries.push({
          name,
          compressedSize: compSize,
          uncompressedSize: uncompSize,
          compressionMethod: compression,
          localHeaderOffset
        });
        p += 46 + nameLen + extraLen + commentLen;
        continue;
      }
      p += 1;
    }
    return entries;
  }
  public readLocalFileData(buffer: Buffer, entry: ZipEntry): Uint8Array | null {
    // Local file header signature 0x04034b50
    const LH_SIG = 0x04034b50;
    const p = entry.localHeaderOffset;
    if (buffer.readUInt32LE(p) !== LH_SIG) return null;
    const _generalFlag = buffer.readUInt16LE(p + 6);
    const method = buffer.readUInt16LE(p + 8);
    const nameLen = buffer.readUInt16LE(p + 26);
    const extraLen = buffer.readUInt16LE(p + 28);
    const dataStart = p + 30 + nameLen + extraLen;

    // If bit 3 set, sizes are in data descriptor after data; but central dir gave us sizes
    const compSize = entry.compressedSize;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.length) return null;
    const comp = buffer.subarray(dataStart, dataEnd);
    if (method === 0) {
      return new Uint8Array(comp);
    }
    if (method === 8) {
      try {
        return inflateSync(new Uint8Array(comp));
      } catch {
        return null;
      }
    }
    // Unsupported method
    return null;
  }
  public parseOpenXml(
    buffer: Buffer,
    mime: string,
    kind: "docx" | "pptx" | "xlsx"
  ): DocSpecs {
    const entries = this.readCentralDirectory(buffer);
    const byName = new Map(entries.map(e => [e.name, e] as const));
    const core = byName.get("docProps/core.xml");
    const app = byName.get("docProps/app.xml");
    const coreXml = core ? this.readLocalFileData(buffer, core) : null;
    const appXml = app ? this.readLocalFileData(buffer, app) : null;

    let author: string | null = null;
    let subject: string | null = null;
    let keywords: string[] | null = null;
    let createdDate: string | null = null;
    let modifiedDate: string | null = null;

    if (coreXml) {
      const s = this.toSafeString(coreXml);
      const get = (tag: string) =>
        s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      author = get("dc:creator")?.[1]?.trim() ?? null;
      subject = get("dc:subject")?.[1]?.trim() ?? null;
      const kw = get("cp:keywords")?.[1]?.trim() ?? null;
      keywords = kw
        ? kw
            .split(/[,;]/)
            .map(x => x.trim())
            .filter(Boolean)
        : null;
      createdDate = get("dcterms:created")?.[1]?.trim() ?? null;
      modifiedDate = get("dcterms:modified")?.[1]?.trim() ?? null;
    }

    let pageCount: number | null = null;
    let wordCount: number | null = null;
    if (appXml) {
      const s = this.toSafeString(appXml);
      const getNum = (tag: string) => {
        const m = s.match(new RegExp(`<${tag}[^>]*>([0-9]+)<\\/${tag}>`));
        return m?.[1] ? Number.parseInt(m[1], 10) : null;
      };
      if (kind === "docx") {
        pageCount = getNum("Pages");
        wordCount = getNum("Words");
      } else if (kind === "pptx") {
        const slides = getNum("Slides");
        pageCount = slides ?? null;
      } else if (kind === "xlsx") {
        const sheets = getNum("Worksheets");
        pageCount = sheets ?? null;
      }
    }

    // Optional: quick text preview from primary document part (best effort)
    let textPreview: string | null = null;
    let extraKeywords = Array.of<string>();
    if (kind === "docx") {
      const docEntry = byName.get("word/document.xml");
      if (docEntry) {
        const data = this.readLocalFileData(buffer, docEntry);
        if (data) {
          const xml = this.toSafeString(data);
          // Extract text from w:t nodes
          const t = xml
            .replace(/<w:\w+[^>]*>/g, " ")
            .replace(/<\/w:\w+>/g, " ")
            .replace(/<\/?[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          textPreview = this.firstN(t, 280);
          if (textPreview) {
            const words = this.countWords(textPreview);
            wordCount ??= words;
          }
        }
      }
    } else if (kind === "xlsx") {
      // Count worksheets by listing entries and parse sheet names
      const worksheetCount = entries.filter(e =>
        e.name.startsWith("xl/worksheets/sheet")
      ).length;
      if (worksheetCount) pageCount = worksheetCount;

      const workbook = byName.get("xl/workbook.xml");
      let hasHiddenSheets = false;
      if (workbook) {
        const data = this.readLocalFileData(buffer, workbook);
        if (data) {
          const xml = this.toSafeString(data);
          const sheets = Array.from(
            xml.matchAll(/<sheet[^>]+name="([^"]+)"/g),
            m => m?.[1] ?? ""
          );
          if (sheets.length) extraKeywords = sheets;
          if (/state="(?:hidden|veryHidden)"/.test(xml)) hasHiddenSheets = true;
        }
      }

      // Use shared strings for preview and rough word count
      const sharedStrings = byName.get("xl/sharedStrings.xml");
      if (sharedStrings) {
        const data = this.readLocalFileData(buffer, sharedStrings);
        if (data) {
          const xml = this.toSafeString(data);
          const textNodes = Array.from(
            xml.matchAll(/<t[^>]*>([^<]+)<\/t>/g),
            m => m[1]
          );
          if (textNodes.length) {
            wordCount = textNodes.join(" ").split(/\s+/).filter(Boolean).length;
            const preview = textNodes.slice(0, 10).join(" ");
            textPreview = this.firstN(preview, 200);
          }
        }
      }

      // Analyze first few worksheets for dimensions and formulas
      let totalRows = 0;
      let hasFormulas = false;
      const worksheetEntries = entries.filter(
        e => e.name.startsWith("xl/worksheets/sheet") && e.name.endsWith(".xml")
      );
      for (const entry of worksheetEntries.slice(0, 3)) {
        const data = this.readLocalFileData(buffer, entry);
        if (!data) continue;
        const xml = this.toSafeString(data);
        const dim = xml.match(/<dimension\s+ref="([A-Z]+\d+):([A-Z]+\d+)"/);
        if (dim?.[2]) {
          const end = dim[2];
          const m = end.match(/^([A-Z]+)(\d+)$/);
          if (m?.[2]) {
            const row = Number.parseInt(m[2], 10);
            if (!Number.isNaN(row)) totalRows = Math.max(totalRows, row);
          }
        }
        if (!hasFormulas && (xml.includes("<f>") || xml.includes("<f ")))
          hasFormulas = true;
      }

      // Detect features from entry names
      const entryNames = new Set(entries.map(e => e.name));
      const hasPivotTables = entries.some(e => e.name.includes("pivotTable"));
      const hasCharts = entries.some(e => e.name.includes("/charts/"));
      const hasMacros = entryNames.has("xl/vbaProject.bin");
      const hasConnections = entryNames.has("xl/connections.xml");
      const hasCustomXml = entries.some(e => e.name.startsWith("customXml/"));

      if (hasHiddenSheets) extraKeywords.push("hidden-sheets");
      if (hasFormulas) extraKeywords.push("formulas");
      if (hasPivotTables) extraKeywords.push("pivot-tables");
      if (hasCharts) extraKeywords.push("charts");
      if (hasMacros) extraKeywords.push("macros");
      if (hasConnections) extraKeywords.push("connections");
      if (hasCustomXml) extraKeywords.push("custom-xml");

      // Use rows as lineCount if available
      if (totalRows > 0) {
        // Thread through via closure variable in return below using local capture
        // We'll set lineCount after keywords merge below
      }
    }

    return {
      type: "DOCUMENT",
      format: kind,
      mimeType: mime,
      pageCount,
      wordCount,
      lineCount: (() => {
        if (kind === "xlsx") {
          // recompute minimal rows using same small scan to avoid storing temp across branches
          const worksheetEntries = entries.filter(
            e =>
              e.name.startsWith("xl/worksheets/sheet") &&
              e.name.endsWith(".xml")
          );
          let totalRows = 0;
          for (const entry of worksheetEntries.slice(0, 3)) {
            const data = this.readLocalFileData(buffer, entry);
            if (!data) continue;
            const xml = this.toSafeString(data);
            const dim = xml.match(/<dimension\s+ref="([A-Z]+\d+):([A-Z]+\d+)"/);
            if (dim?.[2]) {
              const end = dim[2];
              const m = end.match(/^([A-Z]+)(\d+)$/);
              if (m?.[2]) {
                const row = Number.parseInt(m[2], 10);
                if (!Number.isNaN(row)) totalRows = Math.max(totalRows, row);
              }
            }
          }
          return totalRows || null;
        }
        return null;
      })(),
      language: null,
      encoding: null,
      author,
      subject,
      keywords: (() => {
        const base = keywords ?? [];
        return base.concat(extraKeywords).filter(Boolean).length
          ? base.concat(extraKeywords)
          : keywords;
      })(),
      pdfVersion: null,
      isEncrypted: null,
      isSearchable: null,
      isLinearized: null,
      textPreview,
      createdDate,
      modifiedDate
    } satisfies DocSpecs;
  }

  public getDocumentSpecsWorkup(
    rawbuffer: Buffer<ArrayBufferLike>,
    mime: string,
    filename?: string
  ): DocSpecs {
    const buffer = rawbuffer;
    const ext = this.getExtFromFilename(filename);

    // PDF
    if (
      mime === "application/pdf" ||
      (buffer?.length >= 5 && buffer.toString("latin1", 0, 5) === "%PDF-")
    ) {
      return this.parsePdf(buffer, mime);
    }

    // RTF
    if (
      mime === "application/rtf" ||
      (buffer?.length >= 5 && buffer.toString("latin1", 0, 5) === "{\\rtf")
    ) {
      return this.parseRtf(buffer, mime);
    }

    // OpenXML containers (docx, pptx, xlsx) start with PK\x03\x04 and have specific Content_Types
    const isZip = buffer?.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
    if (isZip) {
      const kindFromMime: Record<string, "docx" | "pptx" | "xlsx" | undefined> =
        {
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            "docx",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation":
            "pptx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            "xlsx"
        };
      const kind =
        kindFromMime[mime] ??
        (ext === "docx"
          ? "docx"
          : ext === "pptx"
            ? "pptx"
            : ext === "xlsx"
              ? "xlsx"
              : undefined);
      if (kind) {
        return this.parseOpenXml(buffer, mime, kind);
      }
    }

    // Plain text-ish and code files
    if (
      mime.startsWith("text/") ||
      [
        "application/json",
        "application/xml",
        "application/javascript"
      ].includes(mime) ||
      (ext &&
        ["txt", "md", "markdown", "csv", "json", "html", "xml"].includes(ext))
    ) {
      return this.parsePlainText(buffer, mime, filename);
    }

    // Legacy Office (doc/xls/ppt) or unknown binary: basic stub
    const fallbackFormat =
      ext === "doc"
        ? "doc"
        : ext === "xls"
          ? "xls"
          : ext === "ppt"
            ? "ppt"
            : "bin";
    return {
      type: "DOCUMENT",
      format: fallbackFormat,
      mimeType: mime,
      pageCount: null,
      wordCount: null,
      lineCount: null,
      language: null,
      encoding: null,
      author: null,
      subject: null,
      keywords: null,
      pdfVersion: null,
      isEncrypted: null,
      isSearchable: null,
      isLinearized: null,
      textPreview: null,
      createdDate: null,
      modifiedDate: null
    } satisfies DocSpecs;
  }
}
