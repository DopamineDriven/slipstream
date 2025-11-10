import { Extract } from "@d0paminedriven/metadata";
import { $Enums } from "@slipstream/db/node/generated/client";

export class ExtractService extends Extract {
  constructor() {
    super();
  }

  private isValidUrl(ss: string) {
    return /(https?|s3)/g.test(ss) && URL.canParse(ss);
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
        if (ext === "mp3") {
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

  public async deriveExactMeta(cdnUrl: string) {
    const meta = await this.extractRemote(cdnUrl, 4096 * 32);
    const status = this.handleCompatStatus(meta.type, meta.format);

    switch (meta.type) {
      case "DOCUMENT": {
        switch (status) {
          case "PENDING": {
            return [status, meta] as const;
          }
          default:
          case "ALIASED": {
            return ["ALIASED", meta] as const;
          }
        }
      }
      default:
      case "IMAGE": {
        switch (status) {
          case "PENDING": {
            return [status, meta] as const;
          }
          default:
          case "ALIASED": {
            return ["ALIASED", meta] as const;
          }
        }
      }
    }
  }
}
