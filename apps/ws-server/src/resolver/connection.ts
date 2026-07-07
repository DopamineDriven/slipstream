import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverAssetCompleteService } from "@/resolver/asset-complete.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { ClientContextWorkupProps, EventTypeMap } from "@slipstream/types";

export class ResolverConnectionService extends ResolverAssetCompleteService {
  protected userStoreDocStatus = new Map<string, boolean>();
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
  // xai's collections api is broken
  protected async postHandleConnectionEstablishedJob(userId: string) {
    //  delete previous entry by userId on connect or reconnect
    this.userStoreDocStatus.delete(userId);

    // const gemini = this.providers.getInstance("gemini");
    const anthropic = this.providers.getInstance("anthropic");
    // const grok = this.providers.getInstance("grok");
    return await Promise.all([
      this.userVectorStore.syncUserStoreByName(userId),
      anthropic.syncFileRegistry(userId, true),
      // gemini.syncFileRegistry(userId, true),
      // grok.syncGrokWithGuard(userId, this.xaiManagementApikey),
      this.ttsService.syncTTSCache(userId),
      this.wsServer.prisma.hasUserStoreDocs(userId).then(t => {
        this.userStoreDocStatus.set(userId, t);
        return t;
      })
    ]);
  }

  /** no-op at this layer — ResolverConvoListService overrides with the real push */
  protected sendInitialConversationList(_ws: WebSocket, _userId: string) {}

  public async handleConnectionEstablished(
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    try {
      let providerContext: ClientContextWorkupProps;
      console.log(_userData);
      const userData = this.wsServer.userDataMap.get(userId);
      if (typeof userData?.providerContext === "undefined") {
        providerContext =
          await this.wsServer.prisma.injectClientApiKeyProps(userId);
      } else {
        providerContext = userData?.providerContext;
      }
      const payload = {
        type: "connection_established",
        providerContext
      } satisfies EventTypeMap["connection_established"];

      ws.send(JSON.stringify(payload));
      // overridden in ResolverConvoListService (below in the chain) — the
      // conversation index pushes unprompted, mirroring providerContext
      this.sendInitialConversationList(ws, userId);
      void this.postHandleConnectionEstablishedJob(userId);
    } catch (err) {
      this.wsServer.prisma.safeErrMsg(err);
    }
  }
  protected async handleProviderContextPing(
    _event: EventTypeMap["provider_context_ping"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    let providerContext: ClientContextWorkupProps;
    if (typeof userData?.providerContext === "undefined") {
      providerContext =
        await this.wsServer.prisma.injectClientApiKeyProps(userId);
    } else {
      providerContext = userData?.providerContext;
    }

    const payload = {
      type: "provider_context_pong",
      providerContext
    } satisfies EventTypeMap["provider_context_pong"];
    ws.send(JSON.stringify(payload));
  }

  protected async handleProviderContextUpdate(
    _event: EventTypeMap["provider_context_update"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const providerContext =
      await this.wsServer.prisma.injectClientApiKeyProps(userId);
    const userRecord = this.wsServer.userDataMap.get(userId);

    const payload = {
      type: "provider_context_update_ack",
      providerContext
    } satisfies EventTypeMap["provider_context_update_ack"];
    ws.send(JSON.stringify(payload));
    if (userRecord?.providerContext) {
      userRecord.providerContext = providerContext;
      this.wsServer.userDataMap.set(userId, userRecord);
      return;
    }
  }
}
