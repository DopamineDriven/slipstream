import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import { ResolverAssetCompatService } from "@/resolver/asset-compat.ts";
import type { UserData } from "@/types/index.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";
import type { WebSocket } from "ws";

export class ResolverAttachmentHydrationService extends ResolverAssetCompatService {
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

  protected async hydrateAttachments(
    _event: EventTypeMap["hydrate_attachments"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}

  protected async hydrateAttachmentById(
    _event: EventTypeMap["hydrate_attachment_by_id"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}

  protected async hydrateAttachmentByConversationId(
    _event: EventTypeMap["hydrate_attachments_by_conversation_id"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}
}
