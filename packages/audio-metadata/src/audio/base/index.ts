export class AudioBase {
  protected dv(u8: Uint8Array) {
    return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }

  protected readByte(u8: Uint8Array, offset: number) {
    const value = u8[offset];
    if (typeof value === "undefined") {
      throw new RangeError(
        `byte offset ${offset} is outside a ${u8.length}-byte buffer`
      );
    }
    return value;
  }

  protected fourCC(u8: Uint8Array, offset: number) {
    if (offset < 0 || offset + 4 > u8.length) return null;
    return String.fromCharCode(
      this.readByte(u8, offset),
      this.readByte(u8, offset + 1),
      this.readByte(u8, offset + 2),
      this.readByte(u8, offset + 3)
    );
  }

  protected eq(u8: Uint8Array, offset: number, value: string) {
    if (offset < 0 || offset + value.length > u8.length) {
      return false;
    }
    for (let i = 0; i < value.length; i++) {
      if (this.readByte(u8, offset + i) !== value.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  protected hasOwn<const T extends object, const K extends PropertyKey>(
    object: T,
    key: K
  ): key is K & keyof T {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  /**
   * True MPEG audio sync.
   *
   * MPEG audio uses an 11-bit sync word. AAC ADTS has a 12-bit sync,
   * so the MPEG version/layer checks keep obvious ADTS headers out.
   */
  protected isMpegFrameSync(b0: number, b1: number) {
    if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) {
      return false;
    }
    // MPEG version 01 = reserved.
    if ((b1 & 0x18) === 0x08) {
      return false;
    }
    // MPEG layer 00 = reserved.
    if ((b1 & 0x06) === 0x00) {
      return false;
    }
    return true;
  }

  protected id3v2Size(u8: Uint8Array, offset = 0) {
    if (!this.eq(u8, offset, "ID3") || offset + 10 > u8.length) {
      return null;
    }
    const synch =
      ((this.readByte(u8, offset + 6) & 0x7f) << 21) |
      ((this.readByte(u8, offset + 7) & 0x7f) << 14) |
      ((this.readByte(u8, offset + 8) & 0x7f) << 7) |
      (this.readByte(u8, offset + 9) & 0x7f);
    const footer = (this.readByte(u8, offset + 5) & 0x10) !== 0 ? 10 : 0;
    return 10 + synch + footer;
  }

  protected sniffAudio(u8: Uint8Array) {
    if (u8.length < 2) {
      return null;
    }
    // RIFF / RF64 WAVE needs the full 12-byte signature.
    if (
      u8.length >= 12 &&
      (this.eq(u8, 0, "RIFF") || this.eq(u8, 0, "RF64")) &&
      this.eq(u8, 8, "WAVE")
    ) {
      return "wav";
    }
    /**
     * ID3v2 prefix.
     *
     * A short probe may contain only the ID3 tag, so ID3 itself is
     * sufficient to classify the input as MP3 for this parser.
     */
    if (this.id3v2Size(u8, 0) !== null) {
      return "mp3";
    }
    if (this.isMpegFrameSync(this.readByte(u8, 0), this.readByte(u8, 1))) {
      return "mp3";
    }
    // ID3v1-only files are rare but valid.
    if (u8.length >= 128 && this.eq(u8, u8.length - 128, "TAG")) {
      return "mp3";
    }
    return null;
  }

  protected latin1(u8: Uint8Array, offset: number, length: number) {
    let value = "";
    const end = Math.min(offset + length, u8.length);
    for (let i = offset; i < end; i++) {
      const code = this.readByte(u8, i);
      if (code === 0) {
        break;
      }
      value += String.fromCharCode(code);
    }
    return value.trim();
  }
}
