import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import { ResolverDispatchService } from "@/resolver/dispatch.ts";
import type { S3Storage } from "@slipstream/storage-s3";

export class Resolver extends ResolverDispatchService {
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
}
