import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverConvoListService } from "@/resolver/convo-list.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";

export class ResolverLocalToolResultService extends ResolverConvoListService {
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

  /**
   * Inbound half of the local tool bridge — hands the CLI's reply to the
   * socket-scoped broker, which settles the provider loop's pending
   * promise. Unmatched results (stale turn, expired deadline, foreign
   * socket) are logged and dropped: the broker already synthesized the
   * terminal for whatever was pending, so there is nothing to answer.
   */
  protected async localToolResult(
    event: EventTypeMap["local_tool_result"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const accepted = this.wsServer.localToolBroker.acceptResult(ws, event);
    if (!accepted) {
      console.warn(
        `unmatched local_tool_result ${event.turnId}:${event.toolCallId} (${event.name}) from ${userId} — dropped`
      );
    }
  }
}
