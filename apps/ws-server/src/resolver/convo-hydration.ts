import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverChatService } from "@/resolver/chat.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap, HydrateConversationPage } from "@slipstream/types";

export class ResolverHydrateConvoService extends ResolverChatService {
  public userStoreDocStatus = new Map<string, boolean>();
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

  protected async hydrateConversationAck(
    event: EventTypeMap["hydrate_conversation"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const pages = Array.of<HydrateConversationPage>();

    for await (const page of this.wsServer.prisma.getConversationHydrationPages(
      {
        userId,
        conversationId: event.conversationId,
        lowestLoadedOrdinal: event.lowestLoadedOrdinal,
        take: event.take
      }
    )) {
      pages.push(page);
    }

    const payload = {
      type: "hydrate_conversation_ack",
      userId,
      conversationId: event.conversationId,
      pages
    } satisfies EventTypeMap["hydrate_conversation_ack"];

    ws.send(JSON.stringify(payload));
  }
}
