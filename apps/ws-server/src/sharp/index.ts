type SharpFactory = typeof import("sharp").default;

export class SharpService {
  public readonly sharp: Promise<SharpFactory>;

  constructor() {
    this.sharp = import("sharp").then(d => d.default);
  }

  public calcDims(width: number, height: number, maxDimension = 1920) {
    const maxSide = Math.max(width, height);
    if (maxSide <= maxDimension) {
      return [Math.round(width), Math.round(height)] as const;
    }
    const scaleFactor = maxDimension / maxSide;
    return [
      Math.max(1, Math.round(width * scaleFactor)),
      Math.max(1, Math.round(height * scaleFactor))
    ] as const;
  }

  public async getDimsFromBuffer(buf: Buffer) {
    const sharpInstance = await this.sharp;
    const metadata = await sharpInstance(buf, {
      limitInputPixels: false,
      sequentialRead: true
    }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new Error("Failed to derive valid image dimensions from buffer");
    }
    return { width, height } as const;
  }

  async resizeToBuffer(buf: Buffer, [w, h]: [number, number]) {
    const sharpInstance = await this.sharp;
    const img = sharpInstance(buf, {
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
}
