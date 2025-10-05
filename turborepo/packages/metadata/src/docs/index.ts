import { inflateSync } from "fflate";

export interface PdfDocSpecs {
  pdfVersion: string | null;
  isEncrypted: boolean | null;
  isSearchable: boolean | null;
  isLinearized: boolean | null;
  hasForm: boolean | null;
  hasSignatures: boolean | null;
  hasAttachments: boolean | null;
  hasJavaScript: boolean | null;
  permissions: {
    printing: boolean;
    modifying: boolean;
    copying: boolean;
    annotating: boolean;
  } | null;
}

export interface SpreadSheetDocSpecs {
  sheetCount: number | null;
  sheetNames: string[] | null;
  hasFormulas: boolean | null;
  hasMacros: boolean | null;
  hasPivotTables: boolean | null;
  hasCharts: boolean | null;
  activeSheet: number | null;
}

export interface PresentationDocSpecs {
  slideCount: number | null;
  hasAnimations: boolean | null;
  hasTransitions: boolean | null;
  hasNotes: boolean | null;
  hasMasterSlides: boolean | null;
  presentationFormat: "standard" | "widescreen" | null;
}

export interface DocSpecs {
  type: "DOCUMENT";
  format: string | null;
  mimeType: string | null;
  pageCount: number | null;
  wordCount: number | null;
  lineCount: number | null;
  language: string | null;
  encoding: string | null;
  author: string | null;
  subject: string | null;
  keywords: string[] | null;
  pdfVersion: string | null;
  isEncrypted: boolean | null;
  isSearchable: boolean | null;
  isLinearized: boolean | null;
  textPreview: string | null;
  createdDate: string | null;
  modifiedDate: string | null;
}

export type ZipEntry = {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number; // 0 = store, 8 = deflate
  localHeaderOffset: number;
};

export class DocMetadataExtractor {
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
  public parsePdf(buffer: Buffer, mime: string): DocSpecs {
    // Use latin1 for stable byte->char mapping during regex scans
    const text = buffer.toString("latin1");
    const headerMatch = text.match(/^%PDF-([0-9.]+)/);
    const pdfVersion = headerMatch?.[1] ?? null;
    const isLinearized = /Linearized/i.test(text);
    const isEncrypted = /\/Encrypt\b/.test(text);

    // Count pages via '/Type /Page' occurrences — heuristic
    const pageCount = (text.match(/\/Type\s*\/Page\b/g) ?? []).length || null;

    // Heuristic: searchable if we see text operators or ToUnicode maps
    const isSearchable = /\b(BT|ToUnicode)\b/.test(text);

    // Simple Info dictionary extraction (heuristic)
    const getInfo = (key: string) => {
      const m = text.match(new RegExp(`${key}\\s*\x28([^\x29]*)\x29`)); // /Key (Value)
      return m?.[1] ?? null;
    };
    const author = getInfo("/Author");
    const subject = getInfo("/Subject");
    const title = getInfo("/Title");
    const keywordsRaw = getInfo("/Keywords");
    const keywords = keywordsRaw
      ? keywordsRaw
          .split(/[,;]/)
          .map(s => s.trim())
          .filter(Boolean)
      : null;

    // Dates usually like D:YYYYMMDDHHmmSS...
    const dateVal = (key: string) => {
      const m = text.match(new RegExp(`${key}\\s*\x28([^\x29]*)\x29`));
      const v = m?.[1] ?? null;
      if (!v) return null;
      if (/^D:\\d{14}/.test(v)) {
        const yyyy = v.slice(2, 6);
        const MM = v.slice(6, 8);
        const dd = v.slice(8, 10);
        const hh = v.slice(10, 12);
        const mm = v.slice(12, 14);
        const ss = v.slice(14, 16);
        return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}`;
      }
      return v;
    };
    const createdDate = dateVal("/CreationDate");
    const modifiedDate = dateVal("/ModDate");

    return {
      type: "DOCUMENT",
      format: "pdf",
      mimeType: mime ?? "application/pdf",
      pageCount,
      wordCount: null,
      lineCount: null,
      language: null,
      encoding: null,
      author: author ?? (title ? null : null),
      subject: subject ?? title ?? null,
      keywords,
      pdfVersion,
      isEncrypted,
      isSearchable,
      isLinearized,
      textPreview: null,
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
    const { encoding, offset } = this.detectTextEncodingPrefix(u8);
    const text = this.toSafeString(u8.subarray(offset), encoding);
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
    const eocd = this.findEOCD(buffer);
    if (eocd < 0) return [];
    const totalEntries = buffer.readUInt16LE(eocd + 10);
    const _cdirSize = buffer.readUInt32LE(eocd + 12);
    const cdirOffset = buffer.readUInt32LE(eocd + 16);
    const entries: ZipEntry[] = [];
    let p = cdirOffset;
    const CEN_SIG = 0x02014b50;
    for (let i = 0; i < totalEntries; i++) {
      if (buffer.readUInt32LE(p) !== CEN_SIG) break;
      // central header fixed fields
      // skip sig(4) + ver(2) + verNeeded(2) + flag(2)
      const compression = buffer.readUInt16LE(p + 10);
      const compSize = buffer.readUInt32LE(p + 20);
      const uncompSize = buffer.readUInt32LE(p + 24);
      const nameLen = buffer.readUInt16LE(p + 28);
      const extraLen = buffer.readUInt16LE(p + 30);
      const commentLen = buffer.readUInt16LE(p + 32);
      const localHeaderOffset = buffer.readUInt32LE(p + 42);
      const name = buffer.subarray(p + 46, p + 46 + nameLen).toString("utf-8");
      entries.push({
        name,
        compressedSize: compSize,
        uncompressedSize: uncompSize,
        compressionMethod: compression,
        localHeaderOffset
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    // cdirSize is not strictly required; entries length should match totalEntries
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
    }

    return {
      type: "DOCUMENT",
      format: kind,
      mimeType: mime,
      pageCount,
      wordCount,
      lineCount: null,
      language: null,
      encoding: null,
      author,
      subject,
      keywords,
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
