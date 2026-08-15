import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverCliRecentConvos } from "@/resolver/cli-recent-convos.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { ClientContextWorkupProps, EventTypeMap } from "@slipstream/types";

export class ResolverConnectionService extends ResolverCliRecentConvos {
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
  protected async postHandleConnectionEstablishedJob(
    ws: WebSocket,
    userId: string
  ) {
    //  delete previous entry by userId on connect or reconnect
    this.userStoreDocStatus.delete(userId);

    // const gemini = this.providers.getInstance("gemini");
    const anthropic = this.providers.getInstance("anthropic");
    // const grok = this.providers.getInstance("grok");
    void this.sendInitialConversationList(ws, userId);
    return await Promise.all([
      // ensure BEFORE sync: a brand-new user has no UserStore row until
      // first upload — ensureUserStore is the check-first get-or-create the
      // upload paths already ride (creation stays at the orchestration
      // layer; sync-named methods never create)
      this.userVectorStore
        .ensureUserStore(userId)
        .then(() => this.userVectorStore.syncUserStoreByName(userId)),
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
      // void marks fire-and-forget but does NOT absorb rejections — an
      // uncaught throw in this job crashed the whole server when a new user
      // connected with no UserStore row (P2025, 2026-07-17). The connection
      // stays up regardless of what the background sync fleet does.
      void this.postHandleConnectionEstablishedJob(ws, userId).catch(err => {
        this.logger.warn(
          { userId, err: this.wsServer.prisma.safeErrMsg(err) },
          "post-connection sync job failed; connection unaffected"
        );
      });
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
