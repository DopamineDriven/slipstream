import { Fs } from "@d0paminedriven/fs";
import type { $Enums } from "@slipstream/db/node/generated/client";

export class ExtractService extends Fs {
  constructor() {
    super(process.cwd());
  }

  private isValidUrl(ss: string) {
    return /(https?|s3|collection)/g.test(ss) && URL.canParse(ss);
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
}
