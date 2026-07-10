import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverHydrateConvoService } from "@/resolver/convo-hydration.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";

export class ResolverConvoListService extends ResolverHydrateConvoService {
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
   * One conversation_list_ack PER generator page — the client's index warms
   * with the 25 most-recent conversations milliseconds after the request,
   * while the deep archive trickles in behind (idempotent Map upserts
   * client-side make page ordering/overlap harmless).
   */
  protected async conversationList(
    event: EventTypeMap["conversation_list"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    for await (const conversations of this.wsServer.prisma.convoListGenerator(
      userId,
      event.take
    )) {
      const payload = {
        type: "conversation_list_ack",
        userId,
        conversations
      } satisfies EventTypeMap["conversation_list_ack"];
      ws.send(JSON.stringify(payload));
    }
  }

  /**
   * The connection.ts post-handshake hook, made real: the conversation index
   * pushes unprompted right after connection_established, mirroring the
   * providerContext bootstrap — session starts with autocomplete warm.
   */
  protected async sendInitialConversationList(ws: WebSocket, userId: string) {
    return await this.conversationList(
      { type: "conversation_list" },
      ws,
      userId
    ).catch(err => {
      this.wsServer.prisma.safeErrMsg(err);
    });
  }
}
