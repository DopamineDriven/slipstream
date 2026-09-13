import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { STTService } from "@/stt/index.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverChatUtilsService } from "@/resolver/chat-utils.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";

export class ResolverSTTService extends ResolverChatUtilsService {
  constructor(
    wsServer: WSServer,
    providers: ProviderService,
    s3Service: S3Storage,
    region: string,
    imgCompatService: ImageCompatService,
    userVectorStore: UserStoreVectorService,
    xaiManagementApikey: string,
    logger: LoggerService,
    ttsService: TTSService,
    protected sttService: STTService
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

  protected async sttUserBinaryFrame(
    _event: EventTypeMap["stt_user_binary_frame"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}

  protected async sttUserCancel(
    _event: EventTypeMap["stt_user_cancel"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}

  protected async sttUserConnect(
    _event: EventTypeMap["stt_user_connect"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}
  protected async sttUserFinish(
    _event: EventTypeMap["stt_user_finish"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}

  protected async sttUserPresent(
    _event: EventTypeMap["stt_user_present"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}

  protected async sttUserRecover(
    _event: EventTypeMap["stt_user_recover"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}
  protected async sttUserRestore(
    _event: EventTypeMap["stt_user_restore"],
    _ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {}
}
