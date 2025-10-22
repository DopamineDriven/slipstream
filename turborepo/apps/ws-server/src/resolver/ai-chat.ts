import type { BigIntToCompatProps, UserData } from "@/types/index.ts";
import OpenAI from "openai";
import { ModelService } from "@/models/index.ts";
import { ProviderService } from "@/providers/index.ts";
import { WSServer } from "@/ws-server/index.ts";
import { WebSocket } from "ws";
import type {
  AIChatRequest,
  AIChatRequestImgGenFields,
  AllModelsUnion,
  EventTypeMap,
  ImageGenModels,
  ImageGenProviders,
  ImageGenRequest,
  MessageSingleton,
  Provider
} from "@slipstream/types";
import { RedisChannels } from "@slipstream/redis-service";

export class ResolverAIChat extends ModelService {
  constructor(
    public wsServer: WSServer,
    protected providers: ProviderService
  ) {
    super();
  }

  // Track high-resolution start times for upload progress per attachment
  public sanitizeTitle = (generatedTitle: string) => {
    return generatedTitle.trim().replace(/^(['"])(.*?)\1$/, "$2");
  };

  public async titleGenUtil<
    const T extends "ai_chat_request" | "image_gen_request"
  >(
    type: T,
    {
      messages,
      prompt
    }: BigIntToCompatProps<typeof type>["rt"] & {
      prompt: string;
    }
  ) {
    const content = Array.of<OpenAI.Responses.ResponseInputContent>();
    const msgs = messages?.[0];

    const openaiSvc = this.providers.getInstance("openai");
    const openai = openaiSvc.getClient();

    if (msgs?.attachments) {
      for (const t of msgs.attachments) {
        if (typeof t !== "undefined") {
          const {
            mime,
            compatMime,
            compatCdnUrl,
            compatStatus,
            cdnUrl,
            assetType
          } = t;
          if (compatStatus != null && cdnUrl != null && mime != null) {
            const file_url =
              compatStatus === "ACTIVE" && compatCdnUrl != null
                ? compatCdnUrl
                : cdnUrl;
            const mimeType =
              compatStatus === "ACTIVE" && compatMime != null
                ? compatMime
                : mime;
            if (mimeType === "application/pdf" && assetType === "DOCUMENT") {
              content.push({ type: "input_file", file_url });
            }
            if (mimeType.startsWith("image") && assetType === "IMAGE") {
              content.push({
                type: "input_image",
                image_url: file_url,
                detail: "auto"
              });
            }
          }
        }
        break;
      }
      content.push({ type: "input_text", text: msgs.content });
      try {
        const res = await openai.responses.create({
          model: "gpt-5-mini",
          store: false,
          reasoning: { effort: "minimal" },
          instructions: `Generate a creative & descriptive yet concise title (max 12 words) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes.`,
          temperature: 1,
          input: [{ role: "user", content } as const]
        });
        const title = res.output_text;
        console.log(`1. ` + title);
        return this.sanitizeTitle(title);
      } catch {
        /**fall through */
      }
    }
    content.push({ type: "input_text", text: prompt });
    try {
      const res = await openai.responses.create({
        model: "gpt-5-mini",
        store: false,
        instructions: `Generate a creative & descriptive yet concise title (max 12 words) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes.`,
        temperature: 1,
        input: [{ role: "user", content } as const]
      });
      const title = res.output_text;
      console.log(`2. ` + title);
      return this.sanitizeTitle(title);
    } catch {
      /**fall through */
    }
  }

  private async handleFreeMsgQuota(
    ws: WebSocket,
    userId: string,
    conversationIdInitial: string,
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
          title: this.formatProvider(provider),
          userId,
          done: true,
          message: friendly
        } satisfies EventTypeMap["ai_chat_error"];

        // Notify the requesting client immediately
        ws.send(JSON.stringify(errEvt));

        // Best-effort notify via Redis on the user channel
        void this.wsServer.redis.publishTypedEvent(
          RedisChannels.user(userId),
          "ai_chat_error",
          errEvt
        );

        return; // stop processing
      }
    } catch (e) {
      // If the guardrail check fails for any reason, fall through to normal handling
      console.warn("rate-limit check failed", this.safeErrMsg(e));
    }
  }

  public userLocation(userData?: UserData) {
    return {
      type: "approximate",
      city: userData?.city ?? "Barrington",
      country: userData?.country ?? "US",
      region: userData?.region ?? "Illinois",
      timezone: userData?.tz
        ? decodeURIComponent(userData?.tz)
        : "America/Chicago"
    } as const;
  }

  public normalizeAIChatReqData(
    event: AIChatRequest,
    ws: WebSocket,
    userId: string
  ) {
    const provider = event.provider,
      model = this.getModel(
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
      imgGenEnabled = event.imgGenEnabled,
      isNewChat = event.conversationId.startsWith("new-chat"),
      imgGenFields = event.imgGenFields,
      isImgGenCapable = this.isImgGenCapableModel(provider, model),
      isPureImgGenModel = this.isPureImgGenModel(provider, model);

    if (event.hasProviderConfigured === false) {
      this.handleFreeMsgQuota(
        ws,
        userId,
        conversationIdInitial,
        provider,
        model,
        systemPrompt,
        temperature,
        topP
      );
    }

    return {
      provider,
      model,
      topP,
      temperature,
      systemPrompt,
      max_tokens,
      hasProviderConfigured,
      isDefaultProvider,
      prompt,
      conversationIdInitial,
      batchId,
      imgGenEnabled,
      isNewChat,
      isImgGenCapable,
      isPureImgGenModel,
      imgGenFields
    };
  }

  public async normalizeImgGenReqData(
    event: AIChatRequest,
    ws: WebSocket,
    userId: string,
    imgGenFields: AIChatRequestImgGenFields,
    userData?: UserData
  ) {
    const {
      batchId,
      conversationIdInitial,
      hasProviderConfigured,
      isDefaultProvider,
      isNewChat,
      max_tokens,
      model: eventModel,
      prompt,
      provider: p,
      systemPrompt,
      temperature,
      topP
    } = this.normalizeAIChatReqData(event, ws, userId);

    const data = imgGenFields;
    const provider = p as ImageGenProviders;
    const m = eventModel as ImageGenModels | undefined;
    const model = this.fallbackImgGenModelByProvider(provider, m),
      outputCompression = this.handleImgGenCompression(provider, model, {
        output_compression: data.output_compression,
        output_format: data.output_format
      }),
      outputBackground = this.handleImgGenBg(provider, model, {
        background: data.output_background,
        format:
          (data.output_format as "jpeg" | "png" | "webp" | undefined) ?? "png"
      }),
      moderation = this.handleModeration(provider, model, {
        moderation: data.moderation
      }),
      negativePrompt = data?.negativePrompt ?? undefined,
      seed = data?.seed ?? undefined,
      nRequested = this.handleImgGenCount(model, { n: data.n }),
      inputFidelity = this.handleInputFidelity(provider, model, {
        input_fidelity: data.input_fidelity
      }),
      personGeneration = this.handlePersonGeneration(provider, model, {
        personGeneration: data.personGeneration
      }),
      partialImagesRequested = this.handlePartialImgGen(provider, model, {
        partialImagesRequested: data.output_partial_images
      }),
      outputFormat =
        provider === "grok" ? "png" : (data?.output_format ?? "png"),
      outputSize = this.handleOutputSize(model, {
        output_size: data.output_size
      }),
      outputQuality = this.handleImgGenOutputQuality(provider, model, {
        output_quality: data.output_quality
      });

    const res = await this.wsServer.prisma.handleImageGenRequest({
      userId,
      batchId,
      conversationId: conversationIdInitial,
      prompt,
      provider: provider as "gemini" | "grok" | "openai",
      hasProviderConfigured,
      maxTokens: max_tokens,
      isDefaultProvider,
      systemPrompt,
      temperature,
      topP,
      output_quality: outputQuality,
      input_fidelity: inputFidelity,
      moderation,
      n: nRequested,
      negativePrompt,
      output_background: outputBackground,
      output_compression: outputCompression,
      output_format: outputFormat,
      output_partial_images: partialImagesRequested,
      output_size: outputSize,
      personGeneration,
      seed,
      model: model as ImageGenModels,
      metadata: userData
    });

    const user_location = this.userLocation(userData);

    return { user_location, ...res, isNewChat };
  }

  public async handleAIChatNoImgGen(
    event: AIChatRequest,
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    const {
      batchId,
      conversationIdInitial,
      hasProviderConfigured,
      isDefaultProvider,
      isNewChat,
      max_tokens,
      model,
      prompt,
      provider,
      systemPrompt,
      temperature,
      topP
    } = this.normalizeAIChatReqData(event, ws, userId);
    const res = (await this.wsServer.prisma.handleAiChatRequest({
      userId,
      batchId,
      conversationId: conversationIdInitial,
      prompt,
      provider,
      hasProviderConfigured,
      maxTokens: max_tokens,
      isDefaultProvider,
      systemPrompt,
      temperature,
      topP,
      imgGenEnabled: false,
      model,
      metadata: userData
    })) satisfies BigIntToCompatProps<"ai_chat_request">["rt"];

    const user_location = this.userLocation(userData);

    const msgs = res.messages satisfies MessageSingleton<true>[],
      conversationId = res.id,
      apiKey = res.apiKey ?? undefined,
      keyId = res.userKeyId,
      streamChannel = RedisChannels.conversationStream(conversationId),
      userChannel = RedisChannels.user(userId),
      existingState = await this.wsServer.redis.getStreamState(conversationId),
      createdAt = res.createdAt;

    let chunks = Array.of<string>(),
      thinkingChunks = Array.of<string>(),
      resumedFromChunk = 0,
      thinkingAgg = "",
      thinkingDuration = 0;

    const title =
      res?.title ??
      (await this.titleGenUtil("ai_chat_request", {
        prompt: event.prompt,
        ...res
      }));

    if (existingState && !existingState.metadata.completed) {
      chunks = existingState.chunks;
      resumedFromChunk = chunks.length;
      if (existingState.thinkingChunks)
        thinkingChunks = existingState.thinkingChunks;
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
          chunk: chunks.join(""),
          thinkingText: thinkingAgg,
          thinkingDuration,
          done: false,
          model: existingState.metadata.model,
          provider: existingState.metadata.provider as Provider,
          title: existingState.metadata.title,
          systemPrompt,
          temperature,
          topP,
          imgGenEnabled: false
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
      chunks,
      conversationId,
      isNewChat,
      msgs,
      streamChannel,
      thinkingChunks,
      userId,
      ws,
      apiKey,
      keyId,
      max_tokens,
      model,
      systemPrompt,
      temperature,
      title,
      topP
    };
    try {
      switch (provider) {
        case "gemini": {
          const svc = this.providers.getRequiredInstance("gemini");
          await svc.handleGeminiAiChatRequest({ ...commonProps, userData });
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
          await svc.handleV0AiChatRequest({ ...commonProps });
          break;
        }
        case "meta": {
          const svc = this.providers.getRequiredInstance("meta");
          await svc.handleMetaAiChatRequest({ ...commonProps });
          break;
        }
        case "grok": {
          const svc = this.providers.getRequiredInstance("grok");
          await svc.handleXAIAiChatRequest({ ...commonProps });
          break;
        }
        case "openai":
        default: {
          const svc = this.providers.getRequiredInstance("openai");
          await svc.handleOpenaiAiChatRequest({
            ...commonProps,
            user_location
          });
        }
      }
    } catch (err) {
      console.error(`AI Stream Error`, this.safeErrMsg(err));
      ws.send(
        JSON.stringify({
          type: "ai_chat_error",
          provider: provider,
          conversationId,
          model,
          systemPrompt,
          temperature,
          topP,
          title,
          userId,
          done: true,
          imgGenEnabled: false,
          message: this.safeErrMsg(err)
        } satisfies EventTypeMap["ai_chat_error"])
      );
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "ai_chat_error",
        {
          type: "ai_chat_error",
          provider,
          conversationId,
          model,
          title,
          imgGenEnabled: false,
          systemPrompt,
          temperature,
          topP,
          userId,
          done: true,
          message: this.safeErrMsg(err)
        }
      );
      return await this.wsServer.redis.saveStreamState(
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

  public async handleAIChat(
    event: AIChatRequest,
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    const {
      max_tokens,
      model,
      imgGenEnabled,
      imgGenFields,
      isImgGenCapable,
      isPureImgGenModel,
      provider,
      systemPrompt,
      temperature,
      topP
    } = this.normalizeAIChatReqData(event, ws, userId);

    if (!(imgGenEnabled || isImgGenCapable)) {
      return await this.handleAIChatNoImgGen(event, ws, userId, userData);
    } else if (
      imgGenEnabled === true &&
      isPureImgGenModel === false &&
      imgGenFields
    ) {
      const { user_location, isNewChat, ...res } =
        await this.normalizeImgGenReqData(
          event,
          ws,
          userId,
          imgGenFields,
          userData
        );

      const msgs = res.messages,
        conversationId = res.id,
        apiKey = res.apiKey ?? undefined,
        keyId = res.userKeyId,
        streamChannel = RedisChannels.conversationStream(conversationId),
        userChannel = RedisChannels.user(userId),
        existingState =
          await this.wsServer.redis.getStreamState(conversationId),
        createdAt = res.createdAt,
        _imgs = res.messages.map(t => t.imageGenJob);

      let chunks = Array.of<string>(),
        thinkingChunks = Array.of<string>(),
        resumedFromChunk = 0,
        thinkingAgg = "",
        thinkingDuration = 0;

      const title =
        res?.title ??
        (await this.titleGenUtil("ai_chat_request", {
          prompt: event.prompt,
          ...res
        }));

      if (existingState && !existingState.metadata.completed) {
        chunks = existingState.chunks;
        resumedFromChunk = chunks.length;
        if (existingState.thinkingChunks)
          thinkingChunks = existingState.thinkingChunks;
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
            chunk: chunks.join(""),
            thinkingText: thinkingAgg,
            thinkingDuration,
            done: false,
            model: existingState.metadata.model,
            provider: existingState.metadata.provider as Provider,
            title: existingState.metadata.title,
            systemPrompt,
            temperature,
            topP,
            imgGenEnabled: false
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
        chunks,
        conversationId,
        isNewChat,
        msgs,
        streamChannel,
        thinkingChunks,
        userId,
        ws,
        apiKey,
        keyId,
        max_tokens,
        model,
        systemPrompt,
        temperature,
        title,
        topP,
        imgGenEnabled: true
      };
      try {
        switch (provider) {
          case "gemini": {
            const svc = this.providers.getRequiredInstance("gemini");
            await svc.handleGeminiAiChatRequest({ ...commonProps, userData });
            break;
          }
          case "grok": {
            const svc = this.providers.getRequiredInstance("grok");
            await svc.handleXAIAiChatRequest({ ...commonProps });
            break;
          }
          case "openai":
          default: {
            const svc = this.providers.getRequiredInstance("openai");
            await svc.handleOpenaiAiChatRequest({
              ...commonProps,
              user_location
            });
          }
        }
      } catch (err) {
        console.error(`AI Stream Error`, this.safeErrMsg(err));
        ws.send(
          JSON.stringify({
            type: "ai_chat_error",
            provider: provider,
            conversationId,
            model,
            systemPrompt,
            temperature,
            topP,
            title,
            userId,
            done: true,
            imgGenEnabled: false,
            message: this.safeErrMsg(err)
          } satisfies EventTypeMap["ai_chat_error"])
        );
        void this.wsServer.redis.publishTypedEvent(
          streamChannel,
          "ai_chat_error",
          {
            type: "ai_chat_error",
            provider,
            conversationId,
            model,
            title,
            imgGenEnabled: false,
            systemPrompt,
            temperature,
            topP,
            userId,
            done: true,
            message: this.safeErrMsg(err)
          }
        );
        return await this.wsServer.redis.saveStreamState(
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

  public async handleImageGenRequest(
    event: ImageGenRequest,
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    const provider = event.provider,
      model = this.getModel(
        provider,
        event?.model as ImageGenModels | undefined
      ),
      topP = event.topP,
      temperature = event.temperature,
      systemPrompt = event.systemPrompt;

    const { type: _type, model: _m, ...rest } = event,
      isNewChat = rest.conversationId.startsWith("new-chat");

    const res = await this.wsServer.prisma.handleImageGenRequest({
      userId,
      model,
      ...rest
    });

    const _user_location = {
      type: "approximate",
      city: userData?.city ?? "Barrington",
      country: userData?.country ?? "US",
      region: userData?.region ?? "Illinois",
      timezone: userData?.tz
        ? decodeURIComponent(userData?.tz)
        : "America/Chicago"
    } as const;

    const _msgs = res.messages,
      conversationId = res.id,
      // apiKey = res.apiKey ?? undefined,
      // keyId = res.userKeyId,
      streamChannel = RedisChannels.conversationStream(conversationId),
      // userChannel = RedisChannels.user(userId),
      existingState = await this.wsServer.redis.getStreamState(conversationId),
      // createdAt = res.createdAt,
      _title = isNewChat
        ? await this.titleGenUtil("image_gen_request", {
            prompt: event.prompt,
            ...res
          })
        : (res.title ??
          (await this.titleGenUtil("image_gen_request", {
            prompt: event.prompt,
            ...res
          })));

    let chunks = Array.of<string>(),
      // thinkingChunks = Array.of<string>(),
      resumedFromChunk = 0;
    // thinkingAgg = "",
    // thinkingDuration = 0,
    // partialImageGenOut = Array.of<Buffer>(),
    // partialImageGenAgg: Buffer | null = null,
    // revisedPromptAgg = "",
    // revisedPromptChunks = Array.of<string>(),
    // cdnUrlAgg = "",
    // cdnUrlChunks = Array.of<string>(),
    // imageGenOut = Array.of<Buffer | string>(),
    // imageGenAgg: Buffer | string | null = null;

    if (existingState && !existingState.metadata.completed) {
      chunks = existingState.chunks;
      resumedFromChunk = chunks.length;
      if (existingState.thinkingChunks)
        // thinkingChunks = existingState.thinkingChunks;
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
          type: "image_gen_progress",
          conversationId,
          duration: 0,
          progress: 0,
          requested_count: 1,
          userId,
          done: false,
          model: existingState.metadata.model ?? model,
          provider: existingState.metadata.provider as Provider,
          title: existingState.metadata.title,
          systemPrompt,
          temperature,
          topP
        } satisfies EventTypeMap["image_gen_progress"])
      );
    }
  }
}
