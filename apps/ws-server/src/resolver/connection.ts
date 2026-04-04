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
import type {
  ClientContextWorkupProps,
  EventTypeMap,
  Provider
} from "@slipstream/types";

export class ResolverConnectionService extends ResolverAssetCompleteService {
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

  protected async postHandleConnectionEstablishedJob(userId: string) {
    const gemini = this.providers.getInstance("gemini");
    const anthropic = this.providers.getInstance("anthropic");
    const grok = this.providers.getInstance("grok");
    return await Promise.all([
      this.userVectorStore.syncUserStoreByName(userId),
      anthropic.syncFileRegistry(userId, true),
      gemini.syncFileRegistry(userId, true),
      grok.syncFileRegistry(userId, false, this.xaiManagementApikey),
      this.ttsService.syncTTSCache(userId)
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

  protected async handleFreeMsgQuota(
    ws: WebSocket,
    userId: string,
    conversationIdInitial: string,
    userMsgId: string,
    provider?: Provider,
    model?: string,
    systemPrompt?: string,
    temperature?: number,
    topP?: number
  ) {
    try {
      const MAX_FREE_MSGS_PER_24H = 25;
      const used = await this.wsServer.prisma.countFallbackUserMessages(
        userId,
        24 * 60 * 60 * 1000
      );
      if (used >= MAX_FREE_MSGS_PER_24H) {
        const friendly =
          `Free tier limit reached: You have sent ${used} messages in the last 24 hours using default API keys. ` +
          `To continue without limits, add your own API key in Settings.`;
        const errEvt = {
          type: "ai_chat_error" as const,
          provider,
          conversationId: conversationIdInitial,
          model,
          systemPrompt,
          temperature,
          topP,
          title: this.wsServer.prisma.formatProvider(provider),
          userId,
          userMsgId,
          done: true,
          message: friendly
        } satisfies EventTypeMap["ai_chat_error"];

        // Notify the requesting client immediately
        ws.send(JSON.stringify(errEvt));

        // Best-effort notify via Redis on the user channel
        void this.wsServer.redis.publishTypedEvent(
          this.redisChannels.user(userId),
          "ai_chat_error",
          errEvt
        );

        return; // stop processing
      }
    } catch (e) {
      // If the guardrail check fails for any reason, fall through to normal handling
      console.warn(
        "rate-limit check failed",
        this.wsServer.prisma.safeErrMsg(e)
      );
    }
  }
}
