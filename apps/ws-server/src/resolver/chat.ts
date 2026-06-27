import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type {
  HandleAiChatRequestRT,
  ProviderChatRequestEntity,
  UserData
} from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverTTSService } from "@/resolver/tts.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AllModelsUnion,
  EventTypeMap,
  MessageSingleton,
  Provider
} from "@slipstream/types";

export class ResolverChatService extends ResolverTTSService {
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

  protected async handleAIChat(
    event: EventTypeMap["ai_chat_request"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    const provider = event.provider,
      model = this.wsServer.prisma.getModel(
        provider,
        event?.model as AllModelsUnion | undefined
      ),
      topP = event.topP,
      temperature = event.temperature,
      systemPrompt = event.systemPrompt,
      max_tokens = event.maxTokens,
      hasProviderConfigured = event.hasProviderConfigured,
      isDefaultProvider = event.isDefaultProvider,
      prompt = event.prompt,
      conversationIdInitial = event.conversationId,
      batchId = event.batchId,
      isImgGenEnabled = event.imgGenEnabled,
      imgGenFields = event.imgGenFields;

    // Quick server-side guardrail: limit free-tier (fallback key) usage
    // Trust client-provided hasProviderConfigured to avoid extra lookups.
    if (event.hasProviderConfigured === false) {
      this.handleFreeMsgQuota(
        ws,
        userId,
        conversationIdInitial,
        "no-msg-id-yet",
        provider,
        model,
        systemPrompt,
        temperature,
        topP
      );
    }

    const reqObj = {
      userId,
      batchId,
      conversationId: conversationIdInitial,
      prompt,
      provider,
      imgGenEnabled: isImgGenEnabled,
      hasProviderConfigured,
      maxTokens: max_tokens,
      isDefaultProvider,
      systemPrompt,
      imgGenFields,
      temperature,
      topP,
      model,
      metadata: userData
    };
    let res: HandleAiChatRequestRT, hasUserStoreDocs: boolean;
    const getStatus = this.userStoreDocStatus.get(userId);
    if (typeof getStatus === "undefined" || getStatus === false) {
      [res, hasUserStoreDocs] = await Promise.all([
        this.wsServer.prisma.handleAiChatRequest(reqObj),
        this.wsServer.prisma.hasUserStoreDocs(userId)
      ]);
      this.userStoreDocStatus.set(userId, hasUserStoreDocs);
    } else {
      hasUserStoreDocs = getStatus;
      res = await this.wsServer.prisma.handleAiChatRequest(reqObj);
    }

    const { docCounts, imgCounts } = this.getCurrentMsgAttCounts(res);

    const user_location = {
      type: "approximate",
      city: userData?.city ?? "Barrington",
      country: userData?.country ?? "US",
      region: userData?.region ?? "Illinois",
      timezone: userData?.tz
        ? decodeURIComponent(userData.tz)
        : "America/Chicago"
    } as const;

    const isNewChat = conversationIdInitial.startsWith("new-chat"),
      msgs = res.messages satisfies MessageSingleton<true>[],
      userMsgId = res.messages.at(-1)?.id ?? "",
      conversationId = res.id,
      apiKey = res.apiKey ?? undefined,
      jobId = res.jobId,
      requestMessageId = res.requestMessageId,
      keyId = res.userKeyId,
      streamChannel = this.redisChannels.conversationStream(conversationId),
      userChannel = this.redisChannels.user(userId),
      existingState = await this.wsServer.redis.getStreamState(conversationId),
      createdAt = res.createdAt;

    void this.handleAIChatRequestIndexing(msgs, requestMessageId);

    let chunks = Array.of<string>(),
      thinkingChunks = Array.of<string>(),
      resumedFromChunk = 0,
      thinkingAgg = "",
      thinkingDuration = 0;
    let tit: string | undefined;
    if (!res.title) {
      tit = await this.titleGenUtil("ai_chat_request", {
        apiKey,
        prompt: event.prompt,
        ...res
      });
    } else {
      tit = res.title;
    }
    const title = tit;

    if (existingState && !existingState.metadata.completed) {
      chunks = existingState.chunks;
      resumedFromChunk = chunks.length;
      if (existingState.thinkingChunks) {
        thinkingChunks = existingState.thinkingChunks;
        thinkingAgg = existingState.thinkingChunks.join("");
      }
      const replayChunk = chunks.join("");
      const replayMessageBlock =
        replayChunk.length > 0
          ? ({
              type: "TEXT",
              content: replayChunk,
              ordinal: 0,
              conversationId,
              durationMs: 0
            } as const)
          : thinkingAgg.length > 0
            ? ({
                type: "THINKING",
                content: thinkingAgg,
                ordinal: 0,
                conversationId,
                durationMs: 0
              } as const)
            : undefined;
      // Send resume event
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "stream:resumed",
        {
          type: "stream:resumed",
          conversationId,
          resumedAt: resumedFromChunk,
          chunks,
          title: existingState.metadata.title,
          model: existingState.metadata.model,
          provider: existingState.metadata.provider
        }
      );

      // Send the accumulated chunks as a single ai_chat_chunk to catch up
      ws.send(
        JSON.stringify({
          type: "ai_chat_chunk",
          conversationId,
          userId,
          userMsgId,
          imgGenEnabled: isImgGenEnabled,
          chunk: replayChunk.length > 0 ? replayChunk : undefined,
          thinkingText: thinkingAgg.length > 0 ? thinkingAgg : undefined,
          thinkingDuration: thinkingDuration > 0 ? thinkingDuration : undefined,
          isThinking: replayMessageBlock?.type === "THINKING",
          messageBlocks: replayMessageBlock,
          done: false,
          model: existingState.metadata.model,
          provider: existingState.metadata.provider as Provider,
          title: existingState.metadata.title,
          systemPrompt,
          temperature,
          topP
        } satisfies EventTypeMap["ai_chat_chunk"])
      );
    }

    if (isNewChat) {
      void this.wsServer.redis.publishTypedEvent(
        userChannel,
        "conversation:created",
        {
          type: "conversation:created",
          conversationId,
          userId,
          title: title ?? "New Chat",
          timestamp: createdAt.getTime() ?? Date.now()
        }
      );
    }
    console.log(`key looked up for ${provider}, ${keyId ?? "no key"}`);
    const commonProps = {
      hasUserStoreDocs,
      chunks,
      conversationId,
      userMsgId,
      isNewChat,
      msgs,
      imgGenFields,
      imgGenEnabled: isImgGenEnabled,
      streamChannel,
      thinkingChunks,
      userId,
      ws,
      apiKey,
      docCounts,
      imgCounts,
      jobId,
      requestMessageId,
      keyId,
      max_tokens,
      model,
      systemPrompt,
      temperature,
      title,
      topP
    } satisfies ProviderChatRequestEntity;
    try {
      switch (provider) {
        case "gemini": {
          const svc = this.providers.getRequiredInstance("gemini");
          await svc.routeGemini({ ...commonProps, userData });
          break;
        }
        case "mistral": {
          const svc = this.providers.getRequiredInstance("mistral");
          await svc.handleMistralAiChatRequest(commonProps);
          break;
        }
        case "cohere": {
          const svg = this.providers.getRequiredInstance("cohere");
          await svg.handleCohereAIChatRequest(commonProps);
          break;
        }
        case "anthropic": {
          const svc = this.providers.getRequiredInstance("anthropic");
          await svc.handleAnthropicAiChatRequest({
            ...commonProps,
            user_location
          });
          break;
        }
        case "vercel": {
          const svc = this.providers.getRequiredInstance("vercel");
          await svc.handleV0AiChatRequest(commonProps);
          break;
        }
        case "deepseek": {
          const svc = this.providers.getRequiredInstance("deepseek");
          await svc.handleDeepSeekAiChatRequest(commonProps);
          break;
        }
        case "moonshotai": {
          const svc = this.providers.getRequiredInstance("moonshotai");
          await svc.handleKimiAiChatRequest(commonProps);
          break;
        }
        case "zai": {
          const svc = this.providers.getRequiredInstance("zai");
          await svc.handleZaiAiChatRequest(commonProps);
          break;
        }
        case "meta": {
          const svc = this.providers.getRequiredInstance("meta");
          await svc.handleMetaAiChatRequest(commonProps);
          break;
        }
        case "grok": {
          const svc = this.providers.getRequiredInstance("grok");
          await svc.routeXai(commonProps);
          break;
        }
        case "alibaba": {
          const svc = this.providers.getRequiredInstance("alibaba");
          await svc.handleAlibabaAiChatRequest(commonProps);
          break;
        }
        case "minimax": {
          const svc = this.providers.getRequiredInstance("minimax");
          await svc.handleMiniMaxAiChatRequest(commonProps);
          break;
        }
        case "sakana": {
          const svc = this.providers.getRequiredInstance("sakana");
          await svc.routeSakana({ ...commonProps, user_location });
          break;
        }
        case "openai":
        default: {
          const svc = this.providers.getRequiredInstance("openai");
          await svc.routeOpenAI({
            ...commonProps,
            user_location
          });
          break;
        }
      }
    } catch (err) {
      console.error(`AI Stream Error`, this.wsServer.prisma.safeErrMsg(err));
      ws.send(
        JSON.stringify({
          type: "ai_chat_error",
          provider: provider,
          conversationId,
          model,
          systemPrompt,
          userMsgId,
          temperature,
          imgGenEnabled: false,
          imgGenFields: undefined,
          topP,
          title,
          userId,
          done: true,
          message: this.wsServer.prisma.safeErrMsg(err)
        } satisfies EventTypeMap["ai_chat_error"])
      );
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "ai_chat_error",
        {
          type: "ai_chat_error",
          provider,
          conversationId,
          userMsgId,
          model,
          imgGenEnabled: false,
          imgGenFields: undefined,
          title,
          systemPrompt,
          temperature,
          topP,
          userId,
          done: true,
          message: this.wsServer.prisma.safeErrMsg(err)
        }
      );
      void this.wsServer.redis.saveStreamState(
        conversationId,
        chunks,
        {
          model,
          provider,
          title,
          totalChunks: chunks.length,
          completed: false,
          systemPrompt,
          temperature,
          topP
        },
        thinkingChunks
      );
    }
  }
}
