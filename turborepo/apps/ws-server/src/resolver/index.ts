import type { Message } from "@/generated/client/client.ts";
import type { BufferLike, UserData } from "@/types/index.ts";
import { AnthropicService } from "@/anthropic/index.ts";
import { GeminiService } from "@/gemini/index.ts";
import { LlamaService } from "@/meta/index.ts";
import { ModelService } from "@/models/index.ts";
import { OpenAIService } from "@/openai/index.ts";
import { R2Instance } from "@/r2-helper/index.ts";
import { S3Service } from "@/s3/index.ts";
import { v0Service } from "@/vercel/index.ts";
import { WSServer } from "@/ws-server/index.ts";
import { xAIService } from "@/xai/index.ts";
import { Fs } from "@d0paminedriven/fs";
import { WebSocket } from "ws";
import type {
  AllModelsUnion,
  AnyEvent,
  AnyEventTypeUnion,
  EventTypeMap,
  Provider
} from "@t3-chat-clone/types";
import { RedisChannels } from "@t3-chat-clone/redis-service";

export class Resolver extends ModelService {
  constructor(
    public wsServer: WSServer,
    private openai: OpenAIService,
    private geminiService: GeminiService,
    private anthropicService: AnthropicService,
    private s3Service: S3Service,
    private r2: R2Instance,
    private fastApiUrl: string,
    private Bucket: string,
    private region: string,
    private xAIService: xAIService,
    private v0Service: v0Service,
    private llamaService: LlamaService,
    private fs: Fs
  ) {
    super();
  }

  public registerAll() {
    this.wsServer.on("typing", this.handleTyping.bind(this));
    this.wsServer.on("ping", this.handlePing.bind(this));
    this.wsServer.on(
      "image_gen_request",
      this.handleImageGenRequest.bind(this)
    );
    this.wsServer.on(
      "asset_upload_request",
      this.handleAssetUploadRequest.bind(this)
    );
    this.wsServer.on("ai_chat_request", this.handleAIChat.bind(this));
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
      conversationIdInitial = event.conversationId;

    const res = await this.wsServer.prisma.handleAiChatRequest({
      userId,
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
      max_tokens,
      model,
      systemPrompt,
      temperature,
      title,
      topP
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
      case "asset_upload_request":
        await this.handleAssetUploadRequest(event, ws, userId);
        break;
      case "image_gen_request":
        await this.handleImageGenRequest(event, ws, userId);
        break;
      case "ai_chat_request":
        await this.handleAIChat(event, ws, userId, userData);
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
    "asset_upload_error",
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
      console.error("Invalid message received");
      return null;
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
    const streamChannel =
      event.conversationId === "new-chat"
        ? RedisChannels.user(userId)
        : RedisChannels.conversationStream(event.conversationId);
    try {
      const {
        conversationId = "new-chat",
        filename,
        contentType,
        size
      } = event;
      const [cType, cTypePkg] = [
        contentType,
        this.fs.getMimeTypeForPath(filename)
      ];

      console.log({ cType, cTypePkg });
      // Detect MIME type using fs utility
      const mimeType = cType ?? cTypePkg;

      const extension = this.fs.assetType(filename) ?? "bin";

      const properFilename = filename.includes(".")
        ? filename
        : `${filename}.${extension}`;

      // ✅ Use fs package for human-readable size logging
      const sizeInfo = this.fs.getSize(size ?? 0, "auto", {
        decimals: 2,
        includeUnits: true
      });
      console.log(
        `[Asset Paste] User ${userId} pasting ${properFilename} (${sizeInfo})`
      );
      // TODO handle messageId if it exists
      const presignedData = await this.s3Service.generatePresignedUpload(
        {
          userId,
          conversationId,
          filename: properFilename,
          size,
          contentType: mimeType,
          origin: "PASTED"
        },
        3600 // 1 hour expiry
      );
      // Create attachment record in database
      const attachment = await this.wsServer.prisma.createAttachment({
        conversationId,
        userId,
        filename: filename,
        region: this.region,
        mime: mimeType,
        ext: extension,
        meta: {
          ...presignedData.fields,
          originalName: filename,
          uploadMethod: "PRESIGNED",
          pastedAt: new Date(Date.now()).toISOString(),
          size: size || 0
        },
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

      const assetUploadedRes = {
        type: "asset_uploaded",
        conversationId,
        attachmentId: attachment.id,
        userId,
        filename: properFilename,
        mime: mimeType,
        size: size ?? 0,
        bucket: presignedData.bucket,
        key: presignedData.key,
        url: presignedData.uploadUrl,
        origin: "PASTED",
        status: "UPLOADING"
      } satisfies EventTypeMap["asset_uploaded"];
      // Send presigned URL to client for direct upload

      ws.send(JSON.stringify(assetUploadedRes));

      // Notify other participants via Redis
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_upload_progress",
        {
          type: "asset_upload_progress",
          conversationId,
          attachmentId: attachment.id,
          progress: 0,
          bytesUploaded: 0,
          totalBytes: size ?? 0
        }
      );
      // TODO implement polling REQUESTED -> UPLOADING -> READY via a listener--alternatively have the client send an event
    } catch (error) {
this.fs.parseUrl("")
      console.error("[Asset Paste] Error:", error);

      const uploadError = {
        type: "asset_upload_error",
        userId,
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
    conversationId: realConversationId,
    messageId, // Now the attachment is linked to the specific message
    userId,
    bucket: attachment.bucket,
    key: attachment.key, // SAME KEY - no S3 operations needed!
    status: attachment.status === "REQUESTED" ? "READY" : attachment.status
  });

  console.log(`[Attachment Promoted] ${attachmentId} moved from new-chat to ${realConversationId}, message: ${messageId}, user from ${userData?.city || 'unknown'}`);
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
  userData: UserData
): Promise<void> {
  const {
    conversationId = "new-chat",
    url,
    type,
    messageId
  } = event;

  console.log(`[${type}] User ${userId} requesting: ${url}`);

  try {
    // Validate URL first using fs package
    if (!this.isValidUrl(url)) {
      throw new Error(`Invalid or unsupported URL: ${url}`);
    }

    // Optional: Check if file type is supported
    if (!this.isSupportedFileType(url)) {
      console.warn(`[Asset Fetch] Unsupported file type for URL: ${url}`);
      // Continue anyway - let user fetch what they want
    }

    // ✅ Use fs package for MIME type and extension detection from URL
    const mimeType = this.wsServer.prisma.fs.getMimeTypeForPath(url);
    const extension = this.wsServer.prisma.fs.assetType(url) ?? 'bin';

    // ✅ Use fs package to parse URL and extract filename
    const parsedUrl = this.wsServer.prisma.fs.parseUrl(url);
    if (!parsedUrl) {
      throw new Error(`Invalid URL format: ${url}`);
    }

    // Extract filename from pathname
    const urlFilename = parsedUrl.pathname.split('/').pop() || `remote_${Date.now()}`;
    const filename = urlFilename.includes('.')
      ? urlFilename
      : `${urlFilename}.${extension}`;

    // Sanitize filename for S3
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Check file size with HEAD request first
    const headResponse = await fetch(url, { method: "HEAD" });
    if (!headResponse.ok) {
      throw new Error(`Failed to access URL: ${headResponse.status} ${headResponse.statusText}`);
    }

    const contentLength = headResponse.headers.get("content-length");
    const contentType = headResponse.headers.get("content-type") || mimeType;
    const fileSizeBytes = contentLength ? parseInt(contentLength, 10) : 0;
    const fileSizeMb = fileSizeBytes / (1024 * 1024);

    // ✅ Use fs package for human-readable size
    const sizeInfo = this.wsServer.prisma.fs.getSize(
      fileSizeBytes,
      "auto",
      { decimals: 2, includeUnits: true }
    );
    console.log(`[Asset Fetch] Remote file: ${sanitizedFilename} (${sizeInfo})`);

    // Notify client that fetch is starting
    const progressEvent: EventTypeMap["asset_upload_progress"] = {
      type: "asset_upload_progress",
      conversationId,
      attachmentId: "", // Will be filled after creation
      progress: 0,
      bytesUploaded: 0,
      totalBytes: fileSizeBytes
    };
    ws.send(JSON.stringify(progressEvent));

    let s3UploadResult;
    let actualSize = fileSizeBytes;

    // 🔥 Use the SMART fetchRemoteWriteLocalLargeFiles method
    // It automatically chooses streaming vs in-memory based on file size!
    const tempPath = `/tmp/${Date.now()}_${sanitizedFilename}`;

    try {
      console.log(`[Asset Fetch] Fetching ${url} (method will auto-select strategy)`);

      // This ONE method handles EVERYTHING:
      // - HEAD request to check size
      // - Streams to disk if >100MB
      // - Uses in-memory if <100MB
      // - Creates directories automatically
      await this.wsServer.prisma.fs.fetchRemoteWriteLocalLargeFiles(
        url,
        tempPath,
        false // We already have the extension
      );

      // Get actual file size after download
      const tempFileStats = await this.wsServer.prisma.fs.fileSize(
        tempPath,
        "b",
        { includeUnits: false }
      );
      actualSize = Number(tempFileStats);

      // Log the actual size vs expected
      const actualSizeInfo = this.wsServer.prisma.fs.getSize(
        actualSize,
        "auto",
        { decimals: 2, includeUnits: true }
      );
      console.log(`[Asset Fetch] Downloaded: ${actualSizeInfo} (expected: ${sizeInfo})`);

      // Read file as buffer for S3 upload
      const fileBuffer = this.wsServer.prisma.fs.fileToBuffer(tempPath);

      // Upload to S3
      s3UploadResult = await this.s3Service.uploadDirect(
        fileBuffer,
        {
          userId,
          conversationId,
          messageId,
          filename: sanitizedFilename,
          contentType,
          size: actualSize,
          origin: "REMOTE"
        }
      );

      // Clean up temp file
      await this.wsServer.prisma.fs.unlink(tempPath);
      console.log(`[Asset Fetch] Cleaned up temp file: ${tempPath}`);

    } catch (fetchError) {
      // Try to clean up temp file even on error
      try {
        if (await this.wsServer.prisma.fs.exists(tempPath)) {
          await this.wsServer.prisma.fs.unlink(tempPath);
        }
      } catch {}
      throw fetchError;
    }

    // Create attachment record in database
    const attachment = await this.wsServer.prisma.createAttachment({
      conversationId,
      userId,
      messageId,
      filename: sanitizedFilename,
      region: this.region,
      mime: contentType,
      bucket: s3UploadResult.bucket,
      cdnUrl: s3UploadResult.url,
      sourceUrl: url, // Store original URL
      key: s3UploadResult.key,
      size: BigInt(actualSize),
      origin: "REMOTE",
      status: "READY",
      uploadMethod: "FETCHED",
      ext: extension,
      etag: s3UploadResult.etag,
      meta: {
        originalUrl: url,
        fetchedAt: new Date().toISOString(),
        originalSize: fileSizeBytes,
        originalContentType: contentType
      }
    });

    console.log(`[Asset Fetch] Created attachment ${attachment.id} from ${url}`);

    // Send success response
    const successEvent: EventTypeMap["asset_fetch_response"] = {
      type: "asset_fetch_response",
      conversationId,
      attachmentId: attachment.id,
      url: s3UploadResult.url, // CDN URL for the asset
      success: true
    };

    ws.send(JSON.stringify(successEvent));

    // Notify via Redis for other clients
    const streamChannel = conversationId === "new-chat"
      ? RedisChannels.user(userId)
      : RedisChannels.conversationStream(conversationId);

    await this.wsServer.redis.publishTypedEvent(
      streamChannel,
      "asset_uploaded",
      {
        type: "asset_uploaded",
        conversationId,
        attachmentId: attachment.id,
        userId,
        filename: sanitizedFilename,
        mime: contentType,
        size: actualSize,
        bucket: s3UploadResult.bucket,
        key: s3UploadResult.key,
        url: s3UploadResult.url,
        origin: "REMOTE",
        status: "READY"
      }
    );

  } catch (error) {
    console.error('[Asset Fetch] Error:', error);

    // Send error event
    const errorEvent: EventTypeMap["asset_fetch_error"] = {
      type: "asset_fetch_error",
      conversationId,
      url,
      message: this.safeErrMsg(error)
    };

    ws.send(JSON.stringify(errorEvent));

    // Also publish error to Redis
    const streamChannel = conversationId === "new-chat"
      ? RedisChannels.user(userId)
      : RedisChannels.conversationStream(conversationId);

    await this.wsServer.redis.publishTypedEvent(
      streamChannel,
      "asset_fetch_error",
      errorEvent
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
  messageId: string,
  userId: string,
  ws: WebSocket
): Promise<{ successful: string[]; failed: Array<{ url: string; error: string }> }> {
  const successful: string[] = [];
  const failed: Array<{ url: string; error: string }> = [];

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
            url,
            messageId
          },
          ws,
          userId
        )
      )
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(chunk[index]);
      } else {
        failed.push({
          url: chunk[index],
          error: this.safeErrMsg(result.reason)
        });
      }
    });
  }

  return { successful, failed };
}

/**
 * Helper to validate URL before fetching
 * Uses fs package's parseUrl which returns null for invalid URLs
 */
private isValidUrl(url: string): boolean {
  // Use fs package to parse URL
  const parsed = this.wsServer.prisma.fs.parseUrl(url);

  if (!parsed) {
    return false; // Invalid URL format
  }

  // Only allow http/https protocols
  // parsed.protocol includes the colon, e.g., "https:" or "http:"
  return ['http:', 'https:'].includes(parsed.protocol.toLowerCase());
}

/**
 * Helper to detect if URL points to a supported file type
 */
private isSupportedFileType(url: string): boolean {
  const extension = this.wsServer.prisma.fs.assetType(url);
  if (!extension) return false;

  // Define supported file types
  const supportedTypes = [
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif',
    // Documents
    'pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'json', 'xml',
    // Archives (for future)
    'zip', 'tar', 'gz',
    // Media (for future)
    'mp3', 'mp4', 'webm', 'ogg'
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

  public async handlePing(
    event: EventTypeMap["ping"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    console.log(event.type);
    ws.send(JSON.stringify({ type: "pong", userId }));
  }

  public async handleImageGenRequest(
    event: EventTypeMap["image_gen_request"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    try {
      const res = await fetch(this.fastApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: event.prompt,
          seed: event.seed
        })
      });
      if (!res.ok) {
        const errorText = await res.text();
        ws.send(
          JSON.stringify({
            type: "image_gen_response",
            userId,
            conversationId: event.conversationId,
            success: false,
            error: `Image gen failed: ${errorText}`
          } satisfies EventTypeMap["image_gen_response"])
        );
        return;
      }
      const { url } = (await res.json()) as { url: string };
      ws.send(
        JSON.stringify({
          type: "image_gen_response",
          userId,
          conversationId: event.conversationId,
          imageUrl: url,
          success: true
        } satisfies EventTypeMap["image_gen_response"])
      );
    } catch (error) {
      ws.send(
        JSON.stringify({
          type: "image_gen_response",
          userId,
          conversationId: event.conversationId,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        } satisfies EventTypeMap["image_gen_response"])
      );
    }
  }

  public async handleAssetUploadRequest(
    event: EventTypeMap["asset_upload_request"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    try {
      const data = Buffer.from(event.base64, "base64");
      const key = `user-assets/${userId}/${Date.now()}_${event.filename}`;
      const url = await this.r2.uploadToR2({
        Key: key,
        Body: data,
        ContentType: event.contentType,
        Bucket: this.Bucket
      });
      ws.send(
        JSON.stringify({
          type: "asset_upload_response",
          userId,
          conversationId: event.conversationId,
          url,
          success: true
        } as EventTypeMap["asset_upload_response"])
      );
    } catch (err) {
      const error = this.safeErrMsg(err);
      ws.send(
        JSON.stringify({
          type: "asset_upload_response",
          userId,
          conversationId: event.conversationId,
          success: false,
          error
        } as EventTypeMap["asset_upload_response"])
      );
    }
  }
}
