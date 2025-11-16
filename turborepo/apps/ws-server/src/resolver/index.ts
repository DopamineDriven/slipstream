import { PassThrough, Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import type {
  BigIntToCompatProps,
  BufferLike,
  ProviderChatRequestEntity,
  UserData
} from "@/types/index.ts";
import OpenAI from "openai";
import { ExtractService } from "@/extract/index.ts";
import { ImageCompatService } from "@/image/index.ts";
import { ModelService } from "@/models/index.ts";
import { ProviderService } from "@/providers/index.ts";
import { WSServer } from "@/ws-server/index.ts";
import { WebSocket } from "ws";
import type {
  AllModelsUnion,
  AnyEvent,
  AnyEventTypeUnion,
  ClientContextWorkupProps,
  DocSpecs,
  DocumentSingleton,
  EventTypeMap,
  ImageSingleton,
  ImageSpecs,
  MessageSingleton,
  Provider,
  RTC
} from "@slipstream/types";
import { RedisChannels } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class Resolver extends ModelService {
  constructor(
    public wsServer: WSServer,
    private providers: ProviderService,
    private s3Service: S3Storage,
    private region: string,
    private isProd: boolean,
    private extract: ExtractService,
    private imgCompatService: ImageCompatService
  ) {
    super();
  }

  // Track high-resolution start times for upload progress per attachment
  private uploadTimers = new Map<string, bigint>();

  private makeProgressKey(
    conversationId: string,
    attachmentId?: string,
    draftId?: string,
    batchId?: string,
    userId?: string
  ) {
    const att =
      attachmentId && attachmentId.length > 0 ? attachmentId : "no-att";
    const d = draftId ?? "no-draft";
    const b = batchId ?? "no-batch";
    const u = userId ?? "no-user";
    return `${conversationId}::${att}::${d}::${b}::${u}`;
  }

  public registerAll() {
    this.wsServer.on("typing", this.handleTyping.bind(this));
    this.wsServer.on("ping", this.handlePing.bind(this));
    this.wsServer.on("asset_paste", this.handleAssetPaste.bind(this));
    this.wsServer.on(
      "asset_fetch_request",
      this.handleAssetFetchRequest.bind(this)
    );
    this.wsServer.on("ai_chat_request", this.handleAIChat.bind(this));
    this.wsServer.on(
      "asset_upload_complete",
      this.handleAssetUploadComplete.bind(this)
    );
    this.wsServer.on("asset_attached", this.handleAssetAttached.bind(this));
    this.wsServer.on(
      "asset_upload_progress",
      this.handleAssetProgress.bind(this)
    );
    this.wsServer.on(
      "provider_context_ping",
      this.handleProviderContextPing.bind(this)
    );
    this.wsServer.on(
      "provider_context_update",
      this.handleProviderContextUpdate.bind(this)
    );
  }

  public sanitizeTitle = (generatedTitle: string) => {
    return generatedTitle.trim().replace(/^(['"])(.*?)\1$/, "$2");
  };
  private contentTypeToExt(contentType?: string) {
    return contentType
      ? this.wsServer.prisma.mimeToExt[
          contentType as keyof typeof this.wsServer.prisma.mimeToExt
        ][0]
      : undefined;
  }

  private extToContentType(metadata?: ImageSpecs | DocSpecs) {
    return metadata?.format && metadata.format !== "unknown"
      ? metadata.type === "IMAGE"
        ? this.extToMime[
            metadata.format === "heic" ? "avif" : metadata.format
          ][0]
        : metadata.type === "DOCUMENT"
          ? (metadata.mimeType ?? "")
          : ""
      : "";
  }

  private resolveChannel(conversationId: string, userId: string) {
    return conversationId === "new-chat"
      ? RedisChannels.user(userId)
      : RedisChannels.conversationStream(conversationId);
  }
  private async titleGenUtil<
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
          model: "gpt-5-nano",
          store: false,
          reasoning: { effort: "minimal" },
          instructions: `Generate a creative & descriptive yet concise title  ( **MAX 12 words** ) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes.`,
          temperature: 1,
          input: [
            {
              role: "system",
              content:
                "Generate a creative & descriptive yet concise title ( **MAX 12 words** ) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes."
            },
            { role: "user", content } as const
          ]
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
        model: "gpt-5-nano",
        store: false,
        reasoning: { effort: "minimal" },
        instructions: `Generate a creative & descriptive yet concise title ( **MAX 12 words** ) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes.`,
        temperature: 1,
        input: [
          {
            role: "system",
            content:
              "Generate a creative & descriptive yet concise title ( **MAX 12 words** ) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes."
          },
          { role: "user", content } as const
        ]
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
          title: this.formatProvider(provider),
          userId,
          userMsgId,
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

  public async handleProviderContextPing(
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

  public async handleProviderContextUpdate(
    _event: EventTypeMap["provider_context_update"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const providerContext =
      await this.wsServer.refreshUserProviderConfig(userId);
    const payload = {
      type: "provider_context_update_ack",
      providerContext
    } satisfies EventTypeMap["provider_context_update_ack"];
    ws.send(JSON.stringify(payload));
  }

  public async handleAIChat(
    event: EventTypeMap["ai_chat_request"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
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

    const res = await this.wsServer.prisma.handleAiChatRequest({
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
    });

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
          userMsgId,
          imgGenEnabled: isImgGenEnabled,
          chunk: chunks.join(""),
          thinkingText: thinkingAgg,
          thinkingDuration,
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
          await svc.routeOpenAI({
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
          userMsgId,
          temperature,
          imgGenEnabled: false,
          imgGenFields: undefined,
          topP,
          title,
          userId,
          done: true,
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
          message: this.safeErrMsg(err)
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

  public async postHandleConnectionEstablishedJob(userId: string) {
    return await Promise.all([
      this.providers.anthropic.syncFileRegistry(userId, true),
      this.providers.gemini.syncFileRegistry(userId, true)
    ]);
  }

  public async handleConnectionEstablished(
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    try {
      let providerContext: ClientContextWorkupProps;
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
      this.safeErrMsg(err);
    }
  }
  /** Dispatches incoming events to handlers */
  public async handleRawMessage(
    ws: WebSocket,
    userId: string,
    raw: BufferLike,
    userData?: UserData
  ): Promise<void> {
    const event = this.parseEvent(raw);
    if (!event) {
      ws.send(JSON.stringify({ error: "Invalid message" }));
      return;
    }
    switch (event.type) {
      case "typing":
        await this.handleTyping(event, ws, userId);
        break;
      case "ping":
        await this.handlePing(event, ws, userId);
        break;
      case "ai_chat_request":
        await this.handleAIChat(event, ws, userId, userData);
        break;
      case "asset_paste":
        await this.handleAssetPaste(event, ws, userId, userData);
        break;
      case "asset_fetch_request":
        await this.handleAssetFetchRequest(event, ws, userId, userData);
        break;
      case "asset_upload_complete":
        await this.handleAssetUploadComplete(event, ws, userId, userData);
        break;
      case "asset_upload_progress":
        await this.handleAssetProgress(event, ws, userId, userData);
        break;
      case "asset_attached":
        await this.handleAssetAttached(event, ws, userId, userData);
        break;
      case "provider_context_ping":
        await this.handleProviderContextPing(event, ws, userId, userData);
        break;
      case "provider_context_update":
        await this.handleProviderContextUpdate(event, ws, userId, userData);
        break;
      default:
        await this.wsServer.redis.publish(
          this.wsServer.channel,
          JSON.stringify({ event: "never", userId, timestamp: Date.now() })
        );
    }
  }

  public EVENT_TYPES = [
    "ai_chat_chunk",
    "ai_chat_error",
    "ai_chat_inline_data",
    "ai_chat_request",
    "ai_chat_response",
    "asset_attached",
    "asset_batch_upload",
    "asset_deleted",
    "asset_fetch_error",
    "asset_fetch_request",
    "asset_fetch_response",
    "asset_paste",
    "asset_ready",
    "asset_upload_abort",
    "asset_upload_aborted",
    "asset_upload_complete",
    "asset_upload_complete_error",
    "asset_upload_error",
    "asset_upload_instructions",
    "asset_upload_prepare",
    "asset_upload_progress",
    "asset_upload_request",
    "asset_upload_response",
    "asset_uploaded",
    "connection_established",
    "image_gen_error",
    "image_gen_progress",
    "image_gen_request",
    "image_gen_response",
    "ping",
    "provider_context_ping",
    "provider_context_pong",
    "provider_context_update",
    "provider_context_update_ack",
    "typing"
  ] as const satisfies readonly AnyEventTypeUnion[];

  /** Parses a raw WebSocket message into an event */
  private parseEvent(raw: BufferLike): AnyEvent | null {
    let msg: unknown;
    try {
      let str: string;

      if (typeof raw === "string") {
        str = raw;
      } else if (Array.isArray(raw)) {
        str = Buffer.concat(raw).toString();
      } else if (Buffer.isBuffer(raw)) {
        str = raw.toString();
      } else if (raw instanceof ArrayBuffer) {
        str = Buffer.from(raw).toString();
      } else if (raw instanceof DataView) {
        str = Buffer.from(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength
        ).toString();
      } else if (ArrayBuffer.isView(raw)) {
        str = Buffer.from(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength
        ).toString();
      } else if (raw instanceof Blob) {
        console.error("Blob parsing not supported in sync context");
        return null;
      } else if (typeof raw === "number") {
        str = raw.toString();
      } else if (raw && typeof raw === "object") {
        // Handle objects with valueOf() or Symbol.toPrimitive
        if ("valueOf" in raw) {
          const value = raw.valueOf();
          if (typeof value === "string") {
            str = value;
          } else if (value instanceof ArrayBuffer) {
            str = Buffer.from(value).toString();
          } else if (value instanceof Uint8Array) {
            str = Buffer.from(value).toString();
          } else if (Array.isArray(value)) {
            str = Buffer.from(value as number[]).toString();
          } else {
            return null;
          }
        } else if (Symbol.toPrimitive in raw) {
          str = (raw as { [Symbol.toPrimitive](hint: string): string })[
            Symbol.toPrimitive
          ]("string");
        } else {
          return null;
        }
      } else {
        return null;
      }
      msg = JSON.parse(str);
      if (
        typeof msg !== "object" ||
        msg === null ||
        !("type" in msg) ||
        typeof (msg as { type?: unknown }).type !== "string" ||
        !this.EVENT_TYPES.includes(
          (msg as { type: string }).type as AnyEventTypeUnion
        )
      ) {
        return null;
      }
      return msg as AnyEvent;
    } catch {
      if (typeof msg === "object" && msg && "type" in msg) {
        console.error("Invalid message received", msg.type ?? "no type");
      }
      return null;
    }
  }

  private handleAssetType(mimeType: string) {
    return mimeType.startsWith("image/")
      ? ("IMAGE" as const)
      : mimeType.startsWith("application/") || mimeType.startsWith("text/")
        ? ("DOCUMENT" as const)
        : mimeType.startsWith("audio/")
          ? ("AUDIO" as const)
          : mimeType.startsWith("video/")
            ? ("VIDEO" as const)
            : ("UNKNOWN" as const);
  }

  public async handleAssetAttached(
    event: EventTypeMap["asset_attached"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    if (
      userData &&
      "city" in userData &&
      "country" in userData &&
      "postalCode" in userData &&
      "region" in userData
    ) {
      console.log(
        `user ${userId} from ${userData.city}, ${userData.region} ${userData?.postalCode} ${userData.country} pasted an asset in chat driving this event.`
      );
    }
    const {
      conversationId,
      filename,
      mime,
      size,
      batchId,
      type,
      draftId,
      // TODO implement this handling
      height,
      width,
      metadata: metadata
    } = event;
    const streamChannel = this.resolveChannel(conversationId, userId);
    let attachmentId = "";
    try {
      const mimeType = mime;

      const extension = this.contentTypeToExt(mime) ?? "bin";

      const properFilename = filename.includes(".")
        ? filename
        : `${filename}.${extension}`;

      // ✅ Use fs package for human-readable size logging
      const sizeInfo = this.getSize(size ?? 0, "auto", {
        decimals: 2,
        includeUnits: true
      });

      console.log(
        `[${type}] User ${userId} attached ${properFilename} (${sizeInfo})`
      );

      const presignedData = await this.s3Service.generatePresignedUpload(
        {
          userId,
          batchId,
          draftId,
          conversationId,
          filename: properFilename,
          contentType: mimeType,
          origin: "UPLOAD"
        },
        604800 // 1 hour expiry
      );
      // Create attachment record in database

      const docOrImg =
        mimeType.startsWith("image") && metadata?.type === "IMAGE"
          ? {
              image: {
                cameraMake: null,
                cameraModel: null,
                colorSpace: metadata?.colorSpace ?? null,
                dominantColorHex: null,
                format: metadata?.format ?? "unknown",
                frames: metadata?.frames ?? 1,
                gpsLat: null,
                gpsLon: null,
                hasAlpha: metadata?.hasAlpha ?? false,
                iccProfile: metadata?.iccProfile ?? null,
                lensModel: null,
                colorModel:
                  metadata.colorModel === "grayscale-alpha"
                    ? "grayscale_alpha"
                    : metadata.colorModel,
                orientation: metadata?.orientation ?? null,
                updatedAt: undefined,
                exifDateTimeOriginal: metadata?.exifDateTimeOriginal
                  ? new Date(metadata.exifDateTimeOriginal)
                  : null,
                animated: metadata?.animated ?? false,
                aspectRatio: metadata?.aspectRatio ?? (1.0 as const),
                width: width ?? 0,
                height: height ?? 0
              } satisfies RTC<
                ImageSingleton,
                "attachmentId" | "createdAt" | "updatedAt"
              >
            }
          : metadata?.type === "DOCUMENT" &&
              (mimeType.startsWith("application") ||
                mimeType.startsWith("text"))
            ? {
                document: {
                  title: filename,
                  attachmentId: undefined,
                  isLinearized: metadata.isLinearized,
                  format: extension,
                  pageCount: metadata.pageCount,
                  wordCount: metadata.wordCount,
                  language: metadata.language,
                  author: metadata.author,
                  subject: metadata.subject,
                  keywords: metadata.keywords ?? [""],
                  pdfVersion: metadata.pdfVersion,
                  isEncrypted: metadata.isEncrypted ?? false,
                  isSearchable: metadata.isSearchable ?? false,
                  encoding: metadata.encoding,
                  lineCount: metadata.lineCount,
                  textPreview: metadata.textPreview
                } satisfies RTC<
                  DocumentSingleton,
                  "attachmentId" | "createdAt" | "updatedAt"
                >
              }
            : {};

      const attachment = await this.wsServer.prisma.createAttachment({
        conversationId,
        userId,
        batchId,
        filename: properFilename,
        draftId,
        region: this.region,
        ...(mimeType.startsWith("image") &&
        typeof docOrImg.image !== "undefined"
          ? { image: docOrImg.image }
          : (mimeType.startsWith("text") ||
                mimeType.startsWith("application")) &&
              typeof docOrImg.document !== "undefined"
            ? { document: docOrImg?.document }
            : {}),
        mime: mimeType,
        assetType: this.handleAssetType(mimeType),
        ext: extension,
        bucket: presignedData.bucket,
        cdnUrl: presignedData.publicUrl,
        sourceUrl: presignedData.uploadUrl,
        key: presignedData.key,
        size: BigInt(size),
        origin: "UPLOAD",
        status: "REQUESTED",
        uploadMethod: "PRESIGNED"
      });
      console.log(
        `[Asset Attached] Created attachment ${attachment.id} with key: ${presignedData.key}`
      );

      const uploadInstructions = {
        type: "asset_upload_instructions",
        conversationId,
        attachmentId: attachment.id,
        bucket: presignedData.bucket,
        batchId: presignedData.batchId,
        draftId: presignedData.draftId,
        key: presignedData.key,
        userId,
        mimeType,
        uploadUrl: presignedData.uploadUrl,
        expiresIn: presignedData.expiresAt,
        method: "PUT",
        requiredHeaders: presignedData.requiredHeaders
      } satisfies EventTypeMap["asset_upload_instructions"];
      // Send presigned URL to client for direct upload

      ws.send(JSON.stringify(uploadInstructions));

      // Notify other participants via Redis
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_upload_progress",
        {
          type: "asset_upload_progress",
          userId,
          conversationId,
          batchId,
          draftId,
          attachmentId: attachment.id,
          progress: 0,
          bytesUploaded: 0,
          totalBytes: size ?? 0
        } satisfies EventTypeMap["asset_upload_progress"]
      );
      // TODO implement polling REQUESTED -> UPLOADING -> READY via a listener--alternatively have the client send an event
    } catch (error) {
      console.error("[Asset Paste] Error:", error);

      const uploadError = {
        type: "asset_upload_error",
        userId,
        attachmentId,
        batchId,
        draftId,
        conversationId: event.conversationId,
        success: false,
        error: this.safeErrMsg(error)
      } satisfies EventTypeMap["asset_upload_error"];

      ws.send(JSON.stringify(uploadError));

      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_upload_error",
        uploadError
      );
    }
  }
  public async handleAssetPaste(
    event: EventTypeMap["asset_paste"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ): Promise<void> {
    if (
      userData &&
      "city" in userData &&
      "country" in userData &&
      "postalCode" in userData &&
      "region" in userData
    ) {
      console.log(
        `user ${userId} from ${userData.city}, ${userData.region} ${userData?.postalCode} ${userData.country} pasted an asset in chat driving this event.`
      );
    }
    const {
      conversationId,
      filename,
      mime,
      size,
      batchId,
      draftId,
      // TODO address integrating these fields
      height,
      width,
      metadata
    } = event;
    const streamChannel = this.resolveChannel(conversationId, userId);
    let attachmentId = "";
    try {
      const mimeType = mime;

      const extension = this.contentTypeToExt(mimeType) ?? "bin";

      const properFilename = filename.includes(".")
        ? filename
        : `${filename}.${extension}`;

      // ✅ Use fs package for human-readable size logging
      const sizeInfo = this.getSize(size ?? 0, "auto", {
        decimals: 2,
        includeUnits: true
      });

      console.log(
        `[Asset Paste] User ${userId} pasting ${properFilename} (${sizeInfo})`
      );

      const presignedData = await this.s3Service.generatePresignedUpload(
        {
          userId,
          batchId,
          draftId,
          conversationId,
          filename: properFilename,
          contentType: mimeType,
          origin: "PASTED"
        },
        3600 // 1 hour expiry
      );

      const docOrImg =
        mimeType.startsWith("image") && metadata?.type === "IMAGE"
          ? {
              image: {
                cameraMake: null,
                cameraModel: null,
                colorSpace: metadata?.colorSpace ?? null,
                dominantColorHex: null,
                format: metadata?.format,
                frames: metadata?.frames ?? 1,
                gpsLat: null,
                gpsLon: null,
                colorModel:
                  metadata.colorModel === "grayscale-alpha"
                    ? "grayscale_alpha"
                    : metadata.colorModel,
                hasAlpha: metadata?.hasAlpha ?? false,
                iccProfile: metadata?.iccProfile ?? null,
                lensModel: null,
                orientation: metadata?.orientation ?? null,
                updatedAt: undefined,
                exifDateTimeOriginal: metadata?.exifDateTimeOriginal
                  ? new Date(metadata.exifDateTimeOriginal)
                  : null,
                animated: metadata?.animated ?? false,
                aspectRatio: metadata?.aspectRatio ?? (1.0 as const),
                width: width ?? metadata.width,
                height: height ?? metadata.height
              } satisfies RTC<
                ImageSingleton,
                "attachmentId" | "createdAt" | "updatedAt"
              >
            }
          : metadata?.type === "DOCUMENT" &&
              (mimeType.startsWith("application") ||
                mimeType.startsWith("text"))
            ? {
                document: {
                  title: filename,
                  attachmentId: undefined,
                  format: metadata?.format ?? extension,
                  pageCount: metadata.pageCount,
                  wordCount: metadata.wordCount,
                  language: metadata.language,
                  author: metadata.author,
                  isLinearized: metadata.isLinearized ?? false,
                  subject: metadata.subject,
                  keywords: metadata.keywords ?? [""],
                  pdfVersion: metadata.pdfVersion,
                  isEncrypted: metadata.isEncrypted ?? false,
                  isSearchable: metadata.isSearchable ?? true,
                  encoding: metadata.encoding,
                  lineCount: metadata.lineCount,
                  textPreview: metadata.textPreview
                } satisfies RTC<
                  DocumentSingleton,
                  "attachmentId" | "createdAt" | "updatedAt"
                >
              }
            : {};

      // Create attachment record in database
      const attachment = await this.wsServer.prisma.createAttachment({
        conversationId,
        userId,
        batchId,
        filename: properFilename,
        region: this.region,
        ...(mimeType.startsWith("image") &&
        typeof docOrImg.image !== "undefined"
          ? { image: docOrImg.image }
          : (mimeType.startsWith("text") ||
                mimeType.startsWith("application")) &&
              typeof docOrImg.document !== "undefined"
            ? { document: docOrImg?.document }
            : {}),
        mime: mimeType,
        assetType: this.handleAssetType(mimeType),
        ext: extension,
        draftId,
        bucket: presignedData.bucket,
        cdnUrl: presignedData.publicUrl,
        sourceUrl: presignedData.uploadUrl,
        key: presignedData.key,
        size: BigInt(size),
        origin: "PASTED",
        status: "REQUESTED",
        uploadMethod: "PRESIGNED"
      });
      console.log(
        `[Asset Paste] Created attachment ${attachment.id} with key: ${presignedData.key}`
      );

      const uploadInstructions = {
        type: "asset_upload_instructions", // Changed event type
        conversationId,
        attachmentId: attachment.id,
        bucket: presignedData.bucket,
        batchId,
        draftId,
        mimeType,
        key: presignedData.key,
        userId,
        uploadUrl: presignedData.uploadUrl,
        expiresIn: presignedData.expiresAt,
        method: "PUT",
        requiredHeaders: presignedData.requiredHeaders
      } satisfies EventTypeMap["asset_upload_instructions"];
      // Send presigned URL to client for direct upload

      ws.send(JSON.stringify(uploadInstructions));

      // Notify other participants via Redis
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_upload_progress",
        {
          type: "asset_upload_progress",
          userId,
          batchId,
          draftId,
          conversationId,
          attachmentId: attachment.id,
          progress: 0,
          bytesUploaded: 0,
          totalBytes: size ?? 0
        } satisfies EventTypeMap["asset_upload_progress"]
      );
    } catch (error) {
      console.error("[Asset Paste] Error:", error);

      const uploadError = {
        type: "asset_upload_error",
        userId,
        attachmentId,
        batchId,
        draftId,
        conversationId: event.conversationId,
        success: false,
        error: this.safeErrMsg(error)
      } satisfies EventTypeMap["asset_upload_error"];

      ws.send(JSON.stringify(uploadError));

      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_upload_error",
        uploadError
      );
    }
  }

  /**
   * Handle fetching remote assets from URLs
   * Uses fs package's intelligent fetchRemoteWriteLocalLargeFiles which:
   * - Automatically checks file size with HEAD request
   * - Streams to disk if >100MB
   * - Uses in-memory processing if <100MB
   * - Creates directories automatically
   */
  public async handleAssetFetchRequest(
    event: EventTypeMap["asset_fetch_request"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ): Promise<void> {
    const _userData = userData;
    const { conversationId = "new-chat", sourceUrl } = event;

    console.log(`[Asset Fetch] User ${userId} requesting: ${sourceUrl}`);

    try {
      // 1. Validate URL
      if (!this.isValidUrl(sourceUrl)) {
        throw new Error(`Invalid URL: ${sourceUrl}`);
      }

      // 2. Get file metadata with HEAD request

      const headResponse = await fetch(sourceUrl, { method: "HEAD" });
      if (!headResponse.ok) {
        throw new Error(`Failed to access URL: ${headResponse.status}`);
      }
      // TODO USE THIS FOR IMPLEMENTING IMAGE GENERATION
      // const meta = await this.extract.extractRemote(sourceUrl);

      // const specs =this.handleMetadata(meta);
      // if (specs.type==="IMAGE" && specs.img) {
      //   const _spec = specs.img;
      // }
      const contentLength = headResponse.headers.get("content-length");
      const contentType =
        headResponse.headers.get("content-type") ?? "application/octet-stream";

      const ext = this.contentTypeToExt(contentType) ?? "bin";

      const fileSizeBytes = contentLength ? parseInt(contentLength, 10) : 0;

      // 3. Extract filename from URL
      const urlPath = new URL(sourceUrl).pathname;
      const urlFilename = urlPath.split("/")?.pop() ?? `remote_${Date.now()}`;
      const extension = ext;
      const filename = urlFilename.includes(".")
        ? urlFilename
        : `${urlFilename}.${extension}`;
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

      // 4. Check file size limit
      const MAX_SIZE_MB = 100;
      if (fileSizeBytes && fileSizeBytes > MAX_SIZE_MB * 1024 * 1024) {
        throw new Error(
          `File too large: ${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`
        );
      }

      // 5. Setup Redis channel for progress updates
      const streamChannel =
        conversationId === "new-chat"
          ? RedisChannels.user(userId)
          : RedisChannels.conversationStream(conversationId);

      // 6. Send initial progress
      const startProgress = {
        type: "asset_upload_progress",
        conversationId,
        attachmentId: "", // Will be filled later
        progress: 0,
        userId,
        bytesUploaded: 0,
        totalBytes: fileSizeBytes
      } satisfies EventTypeMap["asset_upload_progress"];
      ws.send(JSON.stringify(startProgress));

      // 7. Fetch the actual content
      const response = await fetch(sourceUrl);
      if (!response.body) {
        throw new Error(`Failed to download: ${response.status}`);
      }

      // 8. Setup streaming upload to S3
      // Create a PassThrough stream to track progress
      const passThrough = new PassThrough();
      let uploadedBytes = 0;
      let lastProgressUpdate = Date.now();

      // Convert web stream to Node stream
      const nodeStream = Readable.fromWeb(response.body as ReadableStream);

      // Track progress as data flows through
      nodeStream.on("data", (chunk: Uint8Array<ArrayBuffer>) => {
        uploadedBytes += chunk.length;

        // Throttle progress updates to every 100ms
        const now = Date.now();
        if (now - lastProgressUpdate > 100) {
          const progress = fileSizeBytes
            ? Math.min(100, Math.round((uploadedBytes / fileSizeBytes) * 100))
            : 0;

          const progressEvent = {
            type: "asset_upload_progress",
            conversationId,
            userId,
            attachmentId: "",
            progress,
            bytesUploaded: uploadedBytes,
            totalBytes: fileSizeBytes
          } satisfies EventTypeMap["asset_upload_progress"];

          ws.send(JSON.stringify(progressEvent));
          lastProgressUpdate = now;
        }
      });

      // Pipe the node stream to passThrough
      nodeStream.pipe(passThrough);

      // 9. Upload to S3 (streaming)
      const s3Result = await this.s3Service.uploadDirect(passThrough, {
        userId,
        conversationId,
        filename: sanitizedFilename,
        contentType,
        size: fileSizeBytes,
        origin: "REMOTE"
      });

      // 10. Create database record
      const attachment = await this.wsServer.prisma.createAttachment({
        conversationId,
        userId,
        filename: sanitizedFilename,
        region: this.region,
        mime: contentType,
        bucket: s3Result.bucket,
        cdnUrl: s3Result.publicUrl,
        s3ObjectId: s3Result.s3ObjectId,
        versionId: s3Result.versionId,
        sourceUrl,
        checksumAlgo: s3Result.checksum?.algo,
        checksumSha256: s3Result.checksum?.value,
        key: s3Result.key,
        size: BigInt(uploadedBytes), // Use actual uploaded size
        origin: "REMOTE",
        status: "READY",
        uploadMethod: "FETCHED",
        ext: extension,
        etag: s3Result.etag
      });

      // 11. Send final progress
      const finalProgress = {
        type: "asset_upload_progress",
        conversationId,
        attachmentId: attachment.id,
        userId,
        progress: 100,
        bytesUploaded: uploadedBytes,
        totalBytes: fileSizeBytes
      } satisfies EventTypeMap["asset_upload_progress"];
      ws.send(JSON.stringify(finalProgress));

      // 12. Send success response
      const successEvent = {
        type: "asset_fetch_response",
        conversationId,
        attachmentId: attachment.id,
        userId,
        sourceUrl: sourceUrl,
        s3ObjectId: s3Result.s3ObjectId,
        bucket: s3Result.bucket,
        downloadUrl: s3Result.publicUrl,
        downloadUrlExpiresAt: attachment.expiresAt?.valueOf(),
        key: s3Result.key,
        versionId: s3Result.versionId,
        error: undefined,
        success: true
      } satisfies EventTypeMap["asset_fetch_response"];
      ws.send(JSON.stringify(successEvent));

      // 13. Notify via Redis
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_uploaded",
        {
          type: "asset_uploaded",
          conversationId,
          attachmentId: attachment.id,
          userId,
          filename: sanitizedFilename,
          mime: contentType,
          etag: s3Result.etag,
          size: uploadedBytes,
          s3ObjectId: s3Result.s3ObjectId,
          versionId: s3Result.versionId,
          uploadUrl: s3Result.publicUrl,
          bucket: s3Result.bucket,
          uploadUrlExpiresAt:
            attachment.expiresAt?.valueOf() ?? Date.now() * 3600 * 1000,
          key: s3Result.key,
          downloadUrl: s3Result.publicUrl,
          downloadUrlExpiresAt:
            attachment.expiresAt?.valueOf() ?? Date.now() * 3600 * 1000,
          origin: "REMOTE",
          status: "READY"
        }
      );
    } catch (error) {
      console.error("[Asset Fetch] Error:", error);

      const errorEvent = {
        type: "asset_fetch_error",
        conversationId,
        userId,
        sourceUrl,
        success: false,
        error: this.safeErrMsg(error)
      } satisfies EventTypeMap["asset_fetch_error"];

      ws.send(JSON.stringify(errorEvent));
    }
  }

  private toBigInt(size?: number, bytesUploaded?: number) {
    return size
      ? size === 0
        ? 0n
        : BigInt(size)
      : bytesUploaded
        ? bytesUploaded === 0
          ? 0n
          : BigInt(bytesUploaded)
        : undefined;
  }

  private fromBigInt(size: bigint | null) {
    return size ? (size === 0n ? 0 : Number(size)) : undefined;
  }

  public async handleAssetUploadComplete(
    event: EventTypeMap["asset_upload_complete"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const {
      conversationId = "new-chat",
      attachmentId,
      publicUrl,
      bucket,
      batchId,
      draftId,
      key,
      height,
      metadata,
      width,
      duration,
      bytesUploaded,
      versionId,
      etag
    } = event;

    const redisChannel = this.resolveChannel(conversationId, userId);
    try {
      const {
        publicUrl,
        bucket: finalBucket,
        cacheControl,
        checksum,
        contentDisposition,
        contentType,
        etag: finalEtag,
        expires: expires,
        s3ObjectId: finalS3ObjectId,
        extension,
        key: finalKey,
        presignedUrl,
        cdnUrl,
        presignedUrlExpiresAt,
        lastModified,
        versionId: finalVersion,
        size,
        storageClass
      } = await this.s3Service.finalize(bucket, key, this.isProd, versionId);

      const specs = await this.extract.extractRemote(cdnUrl, 64 * 4096);
      const compatStatus =
        specs.type === "DOCUMENT" &&
        extension === "pdf" &&
        specs.format === "pdf"
          ? "ALIASED"
          : specs.type === "IMAGE" && specs.width < 2000 && specs.height < 2000
            ? extension === "jpg"
              ? "ALIASED"
              : extension === "png"
                ? "ALIASED"
                : extension === "webp"
                  ? "ALIASED"
                  : "PENDING"
            : "PENDING";
      const attachment = await this.wsServer.prisma.updateAttachment({
        data: {
          bucket: finalBucket,
          cacheControl,
          checksumAlgo: checksum?.algo,
          checksumSha256: checksum?.value,
          contentDisposition,
          draftId,
          compatStatus,
          expiresAt: expires,
          s3LastModified: lastModified ? new Date(lastModified) : undefined,
          storageClass,
          conversationId,
          id: attachmentId,
          key: finalKey,
          sourceUrl: presignedUrl,
          region: this.region,
          uploadDuration: duration,
          userId,
          publicUrl,
          compatCdnUrl: compatStatus === "ALIASED" ? cdnUrl : undefined,
          compatExt:
            compatStatus === "ALIASED"
              ? (extension ?? this.contentTypeToExt(contentType))
              : undefined,
          compatKey: compatStatus === "ALIASED" ? key : undefined,
          compatMime: compatStatus === "ALIASED" ? contentType : undefined,
          compatReadyAt:
            compatStatus === "ALIASED"
              ? lastModified
                ? new Date(lastModified)
                : new Date()
              : undefined,
          compatS3ObjectId:
            compatStatus === "ALIASED" ? finalS3ObjectId : undefined,
          compatVersionId: compatStatus === "ALIASED" ? versionId : undefined,
          cdnUrl,
          versionId: finalVersion,
          s3ObjectId: finalS3ObjectId,
          etag: finalEtag ?? etag,
          status: "READY",
          ext: extension ?? this.contentTypeToExt(contentType),
          mime: contentType,
          size: this.toBigInt(size, bytesUploaded)
        },
        metadata:
          specs?.type === "IMAGE"
            ? {
                type: "IMAGE",
                img: {
                  animated: specs.animated,
                  aspectRatio: specs.width / specs.height,
                  cameraMake: null,
                  cameraModel: null,
                  colorSpace: specs.colorSpace,
                  createdAt: undefined,
                  updatedAt: undefined,
                  lensModel: null,
                  colorModel:
                    specs.colorModel === "grayscale-alpha"
                      ? "grayscale_alpha"
                      : (specs.colorModel ?? null),
                  iccProfile: specs.iccProfile,
                  orientation: specs.orientation,
                  dominantColorHex: null,
                  exifDateTimeOriginal: specs.exifDateTimeOriginal
                    ? new Date(specs.exifDateTimeOriginal)
                    : null,
                  format: specs.format !== "unknown" ? specs.format : "jpeg",
                  frames: specs.frames,
                  gpsLat: null,
                  gpsLon: null,
                  hasAlpha: specs.hasAlpha ?? false,
                  width: specs.width,
                  height: specs.height
                },
                doc: undefined
              }
            : {
                type: "DOCUMENT",
                img: undefined,
                doc: {
                  author: specs.author ?? undefined,
                  createdAt: specs.createdDate
                    ? new Date(specs.createdDate)
                    : undefined,
                  updatedAt: specs.modifiedDate
                    ? new Date(specs.modifiedDate)
                    : undefined,
                  encoding: specs.encoding ?? undefined,
                  format: specs.format ?? "pdf",
                  isEncrypted: specs.isEncrypted ?? undefined,
                  isLinearized: specs.isLinearized ?? false,
                  language: specs.language ?? undefined,
                  subject: specs.subject ?? undefined,
                  textPreview: specs.textPreview ?? undefined,
                  title: undefined,
                  isSearchable: specs.isSearchable ?? true,
                  wordCount: specs.wordCount ?? undefined,
                  lineCount: specs.lineCount ?? undefined,
                  keywords: specs.keywords ?? undefined,
                  pageCount: specs.pageCount ?? undefined,
                  pdfVersion: specs.pdfVersion ?? undefined
                }
              }
      });

      const meta = (
        metadata?.type === "DOCUMENT"
          ? {
              duration,
              extractedText: attachment.document
                ? (attachment.document.textPreview ?? undefined)
                : undefined,
              filename: attachment.filename ?? "",
              uploadedAt: attachment.updatedAt.toISOString()
            }
          : metadata?.type === "IMAGE"
            ? {
                duration: duration,
                dimensions: attachment.image
                  ? {
                      width: attachment.image.width,
                      height: attachment.image.height
                    }
                  : undefined,
                filename: attachment.filename ?? "",
                uploadDuration: duration,
                uploadedAt: attachment.updatedAt.toISOString()
              }
            : undefined
      ) satisfies EventTypeMap["asset_ready"]["metadata"];

      const assetReady = {
        type: "asset_ready",
        conversationId,
        cdnUrl: attachment.cdnUrl ?? undefined,
        publicUrl: attachment.publicUrl ?? undefined,
        attachmentId,
        s3ObjectId: finalS3ObjectId,
        batchId,
        draftId,
        metadata: meta,
        mime:
          attachment.mime ??
          contentType ??
          (metadata?.type === "IMAGE" || metadata?.type === "DOCUMENT"
            ? this.extToContentType(metadata)
            : ""),
        origin: attachment.origin,
        size: this.fromBigInt(attachment.size) ?? bytesUploaded ?? 0,
        status: "READY",
        etag: attachment.etag ?? finalEtag ?? etag,
        bucket,
        userId,
        key,
        versionId: versionId,
        downloadUrl: cdnUrl,
        downloadUrlExpiresAt: presignedUrlExpiresAt
      } satisfies EventTypeMap["asset_ready"];

      ws.send(JSON.stringify(assetReady));
      // TODO implement image conversion pipeline with sharp (for all non-png/jpg/webp images)
      if (
        attachment.compatStatus === "PENDING" &&
        attachment.assetType === "DOCUMENT"
      ) {
        await this.wsServer.pdfService.convertToPdf({
          assetType: attachment.assetType,
          bucket: attachment.bucket,
          cdnUrl: attachment.cdnUrl ?? "",
          filename: attachment.filename,
          id: attachment.id,
          key: attachment.key,
          mime: attachment.mime,
          origin: attachment.origin
        });
        void this.wsServer.redis.publishTypedEvent(
          redisChannel,
          "asset_ready",
          {
            ...assetReady
          }
        );
      } else if (
        attachment.compatStatus === "PENDING" &&
        attachment.assetType === "IMAGE" &&
        attachment.cdnUrl &&
        attachment.filename &&
        specs.type === "IMAGE"
      ) {
        await this.imgCompatService.convertImage({
          id: attachment.id,
          cdnUrl: attachment.cdnUrl,
          filename: attachment.filename,
          origin: attachment.origin,
          specs: specs,
          userId,
          conversationId
        });
        void this.wsServer.redis.publishTypedEvent(
          redisChannel,
          "asset_ready",
          {
            ...assetReady
          }
        );
      } else {
        void this.wsServer.redis.publishTypedEvent(
          redisChannel,
          "asset_ready",
          {
            ...assetReady
          }
        );
      }
    } catch (error) {
      console.error("[Asset Upload Complete] Error:", error);

      const uploadError = {
        type: "asset_upload_complete_error",
        userId,
        bucket,
        batchId,
        draftId,
        attachmentId,
        height,
        metadata,
        width,
        key,
        publicUrl: publicUrl.length > 1 ? publicUrl : undefined,
        bytesUploaded,
        duration: duration ?? 0,
        etag,
        versionId,
        conversationId: event.conversationId,
        success: false,
        error: this.safeErrMsg(error)
      } satisfies EventTypeMap["asset_upload_complete_error"];

      ws.send(JSON.stringify(uploadError));

      void this.wsServer.redis.publishTypedEvent(
        redisChannel,
        "asset_upload_complete_error",
        uploadError
      );
    }
  }
  /**
   * Batch fetch multiple URLs
   * Useful for fetching multiple images from a webpage or gallery
   */
  public async handleBatchAssetFetch(
    urls: string[],
    conversationId: string,
    userId: string,
    ws: WebSocket,
    userData?: UserData
  ): Promise<{
    successful: string[];
    failed: { url: string; error: string }[];
  }> {
    const successful = Array.of<string>();
    const failed = Array.of<{ url: string; error: string }>();

    // Process in parallel with concurrency limit
    const CONCURRENCY_LIMIT = 3;
    const chunks = this.chunkArray(urls, CONCURRENCY_LIMIT);

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(url =>
          this.handleAssetFetchRequest(
            {
              type: "asset_fetch_request",
              conversationId,
              sourceUrl: url
            },
            ws,
            userId,
            userData
          )
        )
      );

      results.forEach((result, index) => {
        if (chunk[index]) {
          if (result.status === "fulfilled") {
            successful.push(chunk[index]);
          } else {
            failed.push({
              url: chunk[index],
              error: this.safeErrMsg(result?.status)
            });
          }
        } else {
          throw new Error(
            "error in handleBatchAssetFetch -- no chunk[index] values mapped"
          );
        }
      });
    }

    return { successful, failed };
  }

  public async handleTyping(
    event: EventTypeMap["typing"],
    _ws: WebSocket,
    userId: string
  ): Promise<void> {
    this.wsServer.broadcast("typing", { ...event, userId });
  }

  public async handleAssetProgress(
    event: EventTypeMap["asset_upload_progress"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    try {
      const {
        conversationId = "new-chat",
        attachmentId,
        batchId,
        draftId,
        progress,
        bytesUploaded,
        totalBytes
      } = event;

      const redisChannel = this.resolveChannel(conversationId, userId);

      // Track active duration using high-resolution timer
      const now = process.hrtime.bigint();
      const timerKey = this.makeProgressKey(
        conversationId,
        attachmentId,
        draftId,
        batchId,
        userId
      );
      let start = this.uploadTimers.get(timerKey);
      if (!start) {
        start = now;
        this.uploadTimers.set(timerKey, start);
      }
      const elapsedMs = Number(now - start) / 1e6;

      // Passive: accept client-provided payload; lightly sanitize numbers
      const safeProgress = Number.isFinite(progress)
        ? Math.max(0, Math.min(100, Math.round(progress)))
        : 0;

      const payload = {
        type: "asset_upload_progress",
        userId,
        conversationId,
        attachmentId,
        batchId,
        draftId,
        progress: safeProgress,
        bytesUploaded: Math.max(0, bytesUploaded ?? 0),
        totalBytes: Math.max(0, totalBytes ?? 0)
      } satisfies EventTypeMap["asset_upload_progress"];

      // Debug visibility: log the event with sanitized payload and active duration
      console.log(event.type, {
        ...payload,
        elapsedMs: Number.isFinite(elapsedMs) ? +elapsedMs.toFixed(3) : 0
      });

      // Broadcast to all WS clients (passive relay; no direct echo)
      this.wsServer.broadcast("asset_upload_progress", payload);

      // Also publish to Redis so other services/consumers receive updates
      void this.wsServer.redis.publishTypedEvent(
        redisChannel,
        "asset_upload_progress",
        payload
      );

      // Cleanup timer when progress completes
      if (safeProgress >= 100) {
        this.uploadTimers.delete(timerKey);
      }
    } catch (err) {
      console.error("[Asset Progress] Error:", err);
    }
  }

  public async handlePing(
    event: EventTypeMap["ping"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    console.log(event.type);
    ws.send(JSON.stringify({ type: "pong", userId }));
  }
}
