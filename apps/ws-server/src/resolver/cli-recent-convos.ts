import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverCliConfigHydrate } from "@/resolver/cli-config-hydrate.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";

export class ResolverCliRecentConvos extends ResolverCliConfigHydrate {
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
   * the resume lens's read lane (config-planning doc §5.5) — recency
   * emerges from the [userId, lastActiveAt desc] index; ids only, the
   * convo picker's index already carries the metadata. Re-request IS the
   * refresh trigger (/resume on machine B sees machine A's turns).
   */
  protected async cliRecentConvos(
    _event: EventTypeMap["cli_recent_convos"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const conversationIds =
      await this.wsServer.prisma.recentCliConversationIds(userId);
    ws.send(
      JSON.stringify({
        type: "cli_recent_convos_ack",
        conversationIds
      } satisfies EventTypeMap["cli_recent_convos_ack"])
    );
  }
}
