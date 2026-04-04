import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { ExpandedDocSpecs, ExpandedImgSpecs } from "@d0paminedriven/fs";
import { ResolverUtilsService } from "@/resolver/utils.ts";
import type { S3Storage } from "@slipstream/storage-s3";

export class ResolverAssetCompatService extends ResolverUtilsService {
  constructor(
    wsServer: WSServer,
    providers: ProviderService,
    s3Service: S3Storage,
    region: string,
    imgCompatService: ImageCompatService,
    userVectorStore: UserStoreVectorService,
    xaiManagementApikey: string,
    logger: LoggerService,
    ttsService: TTSService
  ) {
    super(
      wsServer,
      providers,
      s3Service,
      region,
      imgCompatService,
      userVectorStore,
      xaiManagementApikey,
      logger,
      ttsService
    );
  }

  protected imgExtSupported(s: string | undefined | null) {
    if (!s)
      throw new Error(
        "extension should always be known, it was just promoted to cloudfront..."
      );
    return s === "jpg" || s === "png" || s === "jpeg" || s === "webp";
  }
  protected docExtSupported(s: string | undefined | null) {
    if (!s)
      throw new Error(
        "extension should always be known, it was just promoted to cloudfront..."
      );
    return s === "pdf" || s === "txt" || s === "md";
  }

  protected docMimeSupported(mimeType: string | null | undefined) {
    return (
      mimeType === "application/pdf" ||
      // cursed but used by browsers
      mimeType === "application/text" ||
      mimeType === "text/markdown" ||
      mimeType === "text/plain"
    );
  }

  protected handleCompatStatus(
    specs: ExpandedDocSpecs | ExpandedImgSpecs,
    extension: string | undefined
  ) {
    if (specs.type === "DOCUMENT") {
      if (
        this.docExtSupported(extension) &&
        this.docExtSupported(specs.format) &&
        this.docMimeSupported(specs.mimeType)
      ) {
        return "ALIASED" as const;
      } else return "PENDING" as const;
    } else {
      if (
        specs.width < 2000 &&
        specs.height < 2000 &&
        this.imgExtSupported(extension)
      ) {
        return "ALIASED" as const;
      } else return "PENDING" as const;
    }
  }
}
