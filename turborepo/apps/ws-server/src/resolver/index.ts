import { PassThrough, Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import type { Message } from "@/generated/client/client.ts";
import type { BufferLike, UserData } from "@/types/index.ts";
import { AnthropicService } from "@/anthropic/index.ts";
import { GeminiService } from "@/gemini/index.ts";
import { LlamaService } from "@/meta/index.ts";
import { ModelService } from "@/models/index.ts";
import { OpenAIService } from "@/openai/index.ts";
import { v0Service } from "@/vercel/index.ts";
import { WSServer } from "@/ws-server/index.ts";
import { xAIService } from "@/xai/index.ts";
import { ImageSpecs } from "@d0paminedriven/fs";
import { WebSocket } from "ws";
import type {
  AllModelsUnion,
  AnyEvent,
  AnyEventTypeUnion,
  EventTypeMap,
  Provider
} from "@t3-chat-clone/types";
import { RedisChannels } from "@t3-chat-clone/redis-service";
import { S3Storage } from "@t3-chat-clone/storage-s3";

export class Resolver extends ModelService {
  constructor(
    public wsServer: WSServer,
    private openai: OpenAIService,
    private geminiService: GeminiService,
    private anthropicService: AnthropicService,
    private s3Service: S3Storage,
    private fastApiUrl: string,
    private region: string,
    private xAIService: xAIService,
    private v0Service: v0Service,
    private llamaService: LlamaService,
    private isProd: boolean
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
  }

  public safeErrMsg(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return String(err);
  }

  private isValidUrl(url: string) {
    return URL.canParse(url);
  }

  private formatProvider(provider?: Provider) {
    switch (provider) {
      case "anthropic":
        return "Anthropic";
      case "gemini":
        return "Gemini";
      case "grok":
        return "Grok";
      case "meta":
        return "Meta";
      case "vercel":
        return "Vercel";
      case "openai":
      default:
        return "OpenAI";
    }
  }

  public sanitizeTitle = (generatedTitle: string) => {
    return generatedTitle.trim().replace(/^(['"])(.*?)\1$/, "$2");
  };
  private contentTypeToExt(contentType?: string) {
    return contentType
      ? this.wsServer.prisma.fs.mimeToExt(
          contentType as keyof typeof this.wsServer.prisma.fs.toExtObj
        )
      : undefined;
  }

  private extToContentType(metadata?: ImageSpecs) {
    return metadata?.format && metadata.format !== "unknown"
      ? this.s3Service.fs.getMimes(metadata.format)[0]
      : "";
  }

  private resolveChannel(conversationId: string, userId: string) {
    return conversationId === "new-chat"
      ? RedisChannels.user(userId)
      : RedisChannels.conversationStream(conversationId);
  }
  private async titleGenUtil({
    prompt,
    provider
  }: EventTypeMap["ai_chat_request"]) {
    const openai = this.openai.getClient();
    try {
      const turbo = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        store: false,
        messages: [
          {
            role: "system",
            content: `Generate a concise, descriptive title (max 10 words) for this user-submitted-prompt: "${prompt}". Do **not** wrap the generated title in quotes.`
          }
        ]
      });
      const title =
        turbo.choices?.[0]?.message?.content ?? this.formatProvider(provider);

      return this.sanitizeTitle(title);
    } catch (err) {
      console.warn(err);
    }
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
      batchId = event.batchId;

    const res = await this.wsServer.prisma.handleAiChatRequest({
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
      model
    });
    const attachments = batchId
      ? res.attachments.filter(t => t.batchId === batchId)
      : undefined;

    const user_location = {
      type: "approximate",
      city: userData?.city ?? "Barrington",
      country: userData?.country ?? "US",
      region: userData?.region ?? "Illinois",
      timezone: userData?.tz ?? "America/Chicago"
    } as const;

    const isNewChat = conversationIdInitial.startsWith("new-chat"),
      msgs = res.messages satisfies Message[],
      conversationId = res.id,
      apiKey = res.apiKey ?? undefined,
      keyId = res.userKeyId,
      streamChannel = RedisChannels.conversationStream(conversationId),
      userChannel = RedisChannels.user(userId),
      existingState = await this.wsServer.redis.getStreamState(conversationId);

    let chunks = Array.of<string>(),
      thinkingChunks = Array.of<string>(),
      resumedFromChunk = 0,
      thinkingAgg = "",
      thinkingDuration = 0;

    const title = res?.title ?? (await this.titleGenUtil(event));

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
          topP
        } satisfies EventTypeMap["ai_chat_chunk"])
      );
    }

    if (event.conversationId === "new-chat") {
      void this.wsServer.redis.publishTypedEvent(
        userChannel,
        "conversation:created",
        {
          type: "conversation:created",
          conversationId,
          userId,
          title: title ?? "New Chat",
          timestamp: res.createdAt.getTime() ?? Date.now()
        }
      );
    }

    console.log(`key looked up for ${provider}, ${keyId ?? "no key"}`);
    const commonProps = {
      chunks,
      conversationId,
      isNewChat,
      msgs,
      prompt,
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
      attachments
    };
    try {
      if (provider === "gemini") {
        await this.geminiService.handleGeminiAiChatRequest({
          ...commonProps,
          userData
        });
      } else if (provider === "anthropic") {
        await this.anthropicService.handleAnthropicAiChatRequest({
          ...commonProps,
          user_location
        });
      } else if (provider === "vercel") {
        await this.v0Service.handleV0AiChatRequest({
          ...commonProps
        });
      } else if (provider === "meta") {
        await this.llamaService.handleMetaAiChatRequest({
          ...commonProps
        });
      } else if (provider === "grok") {
        await this.xAIService.handleGrokAiChatRequest({
          ...commonProps
        });
      } else {
        await this.openai.handleOpenaiAiChatRequest({
          ...commonProps,
          user_location
        });
      }
    } catch (err) {
      console.error(`AI Stream Error`, err);
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
    "image_gen_error",
    "image_gen_progress",
    "image_gen_request",
    "image_gen_response",
    "ping",
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
      height: _height,
      width: _width,
      metadata: _metadata
    } = event;
    const streamChannel = this.resolveChannel(conversationId, userId);
    let attachmentId = "";
    try {
      const [cType, cTypePkg] = [
        mime,
        this.s3Service.fs.getMimeTypeForPath(filename)
      ];

      const mimeType = cType ?? cTypePkg;

      const extension = this.contentTypeToExt(mime) ?? "bin";

      const properFilename = filename.includes(".")
        ? filename
        : `${filename}.${extension}`;

      // ✅ Use fs package for human-readable size logging
      const sizeInfo = this.s3Service.fs.getSize(size ?? 0, "auto", {
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

      const attachment = await this.wsServer.prisma.createAttachment({
        conversationId,
        userId,
        batchId,
        filename: properFilename,
        draftId,
        region: this.region,
        mime: mimeType,
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
      height: _height,
      width: _width,
      metadata: _metadata
    } = event;
    const streamChannel = this.resolveChannel(conversationId, userId);
    let attachmentId = "";
    try {
      const [cType, cTypePkg] = [
        mime,
        this.s3Service.fs.getMimeTypeForPath(filename)
      ];

      console.log({ cType, cTypePkg });

      const mimeType = cType ?? cTypePkg;

      const extension = this.contentTypeToExt(mimeType) ?? "bin";

      const properFilename = filename.includes(".")
        ? filename
        : `${filename}.${extension}`;

      // ✅ Use fs package for human-readable size logging
      const sizeInfo = this.s3Service.fs.getSize(size ?? 0, "auto", {
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
      // Create attachment record in database
      const attachment = await this.wsServer.prisma.createAttachment({
        conversationId,
        userId,
        batchId,
        filename: properFilename,
        region: this.region,
        mime: mimeType,
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

  public async promoteAttachmentToConversation(
    attachmentId: string,
    realConversationId: string,
    messageId: string,
    userId: string,
    userData?: UserData
  ): Promise<void> {
    // The beauty is we DON'T need to update the S3 key!
    // Just update the conversationId and messageId in the database

    const attachment = await this.wsServer.prisma.getAttachment(attachmentId);

    if (!attachment) {
      throw new Error(`Attachment ${attachmentId} not found`);
    }

    if (attachment.userId !== userId) {
      throw new Error(`Unauthorized to update attachment ${attachmentId}`);
    }

    // Update conversationId AND messageId - key stays the same!
    void this.wsServer.prisma.updateAttachment({
      id: attachmentId,
      s3ObjectId: attachment.s3ObjectId,
      versionId: attachment.versionId,
      cdnUrl: attachment.cdnUrl,
      ext: attachment.ext,
      conversationId: realConversationId,
      messageId, // Now the attachment is linked to the specific message
      userId,
      bucket: attachment.bucket,
      key: attachment.key, // SAME KEY - no S3 operations needed!
      status: attachment.status === "REQUESTED" ? "READY" : attachment.status
    });

    console.log(
      `[Attachment Promoted] ${attachmentId} moved from new-chat to ${realConversationId}, message: ${messageId}, user from ${userData?.city ?? "unknown"}`
    );
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

  public async handleAssetUploadComplete(
    event: EventTypeMap["asset_upload_complete"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ): Promise<void> {
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
      // ✅ HEAD request to S3 to get full metadata
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

      const s3ObjectId = `s3://${bucket}/${key}#${versionId}` as const;
      console.log(
        `final s3ObjectId and constructed s3ObjectId are equal: ` +
          finalS3ObjectId ===
          s3ObjectId
      );
      // ✅ Update DB with real values
      const attachment = await this.wsServer.prisma.updateAttachment({
        bucket: finalBucket,
        cacheControl,
        checksumAlgo: checksum?.algo,
        checksumSha256: checksum?.value,
        contentDisposition,
        draftId,
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
        cdnUrl,
        versionId: finalVersion,
        s3ObjectId: finalS3ObjectId,
        etag: finalEtag ?? etag,
        status: "READY",
        ext: extension ?? this.contentTypeToExt(contentType),
        mime: contentType,
        size: size
          ? BigInt(size)
          : bytesUploaded
            ? BigInt(bytesUploaded)
            : undefined
      });

      const assetReady = {
        type: "asset_ready",
        conversationId,
        attachmentId,
        s3ObjectId: finalS3ObjectId,
        batchId,
        draftId,
        metadata: {
          dimensions: width && height ? { width, height } : undefined,
          filename: attachment.filename ?? "",
          uploadDuration: duration,
          uploadedAt: attachment.updatedAt.toISOString()
        },
        mime: attachment.mime ?? contentType ?? this.extToContentType(metadata),
        origin: attachment.origin,
        size: size ?? bytesUploaded ?? 0,
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

      void this.wsServer.redis.publishTypedEvent(redisChannel, "asset_ready", {
        ...assetReady
      });
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
    const chunks = this.wsServer.prisma.fs.chunkArray(urls, CONCURRENCY_LIMIT);

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

  private isSupportedFileType(url: string): boolean {
    const extension = this.wsServer.prisma.fs.assetType(url);
    if (!extension) return false;

    // Define supported file types
    const supportedTypes = [
      // Images
      "jpg",
      "jpeg",
      "png",
      "apng",
      "gif",
      "webp",
      "svg",
      "bmp",
      "ico",
      "avif",
      "tiff",
      // Documents
      "pdf",
      "doc",
      "docx",
      "txt",
      "md",
      "csv",
      "json",
      "xml",
      // Archives (for future)
      "zip",
      "tar",
      "gz",
      // Media (for future)
      "mp3",
      "mp4",
      "weba",
      "webm",
      "ogg"
    ];

    return supportedTypes.includes(extension);
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
