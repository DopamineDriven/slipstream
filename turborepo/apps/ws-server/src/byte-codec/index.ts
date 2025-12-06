export class ByteCodec {
  static readonly #encoder = new TextEncoder();
  static readonly #decoder = new TextDecoder();
  static encode(text: string) {
    return this.#encoder.encode(text);
  }
  static decode(bytes: Uint8Array | NodeJS.NonSharedUint8Array) {
    return this.#decoder.decode(bytes);
  }
}
