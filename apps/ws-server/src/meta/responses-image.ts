import type { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type {
  MetaImageGenerationTool,
  MetaProviderChatRequestEntity,
  PersistMetaImageParams
} from "@/meta/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { OpenAI } from "openai";
import { MetaChatService } from "@/meta/chat.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AIChatRequestImgGenFields,
  AIChatResponseImgGenSubFields,
  EventTypeMap
} from "@slipstream/types";

/**
 * muse-image-1.0, invoked directly on /v1/responses with `image_generation`
 * as its only tool (it accepts no function tools, so there is no tool loop).
 *
 * Wire shape, probe-verified 2026-09-21 (`probe-muse-image-1.sh`): Meta's
 * "stream" is TWO events — `response.created` at ~0.1-0.5 s, then
 * `response.completed` 10-40 s later carrying everything: a readable
 * reasoning summary, an assistant message whose text is "", and the
 * `image_generation_call` with the base64 in `result`. No deltas, no
 * output_item events, no partials (`partial_images` is accepted and ignored).
 */
export class MetaResponsesImageService extends MetaChatService {
  private readonly nanoId: Promise<(typeof import("nanoid"))["nanoid"]>;
  /** Meta sends nothing between created and completed; the UI's clock is ours to tick */
  private readonly HEARTBEAT_MS = 1_000;
  private readonly IMG_HEADER_BYTES = 4096 * 48;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    memoryService: ConversationMemoryVectorService,
    redis: EnhancedRedisPubSub,
    apiKey: string,
    localToolBroker: LocalToolBroker
  ) {
    super(
      logger,
      prisma,
      userStoreVector,
      s3,
      memoryService,
      redis,
      apiKey,
      localToolBroker
    );
    this.nanoId = import("nanoid").then(t => t.nanoid);
  }

  /**
   * the planner switches are on by default upstream and stay on here.
   * `size` sets aspect ratio only (the generator picks its own resolution),
   * so an unrecognised value is omitted rather than sent as a guess
   */
  private metaImageTool(imgGenFields?: AIChatRequestImgGenFields) {
    const size = imgGenFields?.output_size;
    const format = imgGenFields?.output_format;
    return {
      type: "image_generation",
      size: size && this.prisma.isValidMetaSize(size) ? size : undefined,
      output_format:
        format && this.prisma.isValidMetaOututFormat(format) ? format : "webp",
      reasoning_strength: "high",
      enable_web_search: true,
      enable_image_search: true,
      enable_shell: true
    } as const satisfies MetaImageGenerationTool;
  }

  private metaGenMime(ext: string) {
    return ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "jpeg" || ext === "jpg"
          ? "image/jpeg"
          : "application/octet-stream";
  }

  /**
   * bytes → S3 → the attachment-shaped payload the client and the persist
   * layer share. Meta's `ig_` item id is a 200-360 char signed token that
   * embeds a permanent url and the app id — never a filename or a series id;
   * a minted id stands in, and the `resp_` id is the generation group
   */
  private async persistMetaImage({
    b64,
    index,
    userId,
    conversationId,
    generationGroupId,
    requestMessageId,
    jobId
  }: PersistMetaImageParams) {
    const buffer = Buffer.from(b64, "base64");
    const specs = this.prisma.extractor.getImageSpecsWorkup(
      buffer,
      this.IMG_HEADER_BYTES
    );
    const nanoid = await this.nanoId;
    const seriesId = nanoid();
    const filename = `${seriesId}-${index}.${specs.format}`;
    const mime = specs.contentType ?? this.metaGenMime(specs.format);
    const size = specs.byteSize ?? buffer.byteLength;

    const uploadStartedAt = performance.now();
    const rt = await this.s3.uploadGenerated(buffer, this.prisma.isProd, {
      contentType: mime,
      filename,
      origin: "GENERATED",
      userId,
      size,
      conversationId
    });
    const uploadDuration = performance.now() - uploadStartedAt;

    const imgMeta = this.prisma.handleAssetMetadata(specs).img;
    const now = new Date();

    return {
      cdnUrl: rt.cdnUrl,
      index,
      itemId: seriesId,
      width: specs.width,
      height: specs.height,
      mime: rt.contentType ?? mime,
      bucket: rt.bucket,
      key: rt.key,
      versionId: rt.versionId,
      s3ObjectId: rt.s3ObjectId,
      filename,
      ext: specs.format,
      etag: rt.etag ?? null,
      size,
      s3LastModified: rt.lastModified ? new Date(rt.lastModified) : null,
      contentDisposition: rt.contentDisposition ?? null,
      cacheControl: rt.cacheControl ?? null,
      checksumAlgo: rt.checksum?.algo ?? "CRC32",
      checksumSha256: rt.checksum?.value ?? null,
      storageClass: rt.storageClass ?? null,
      generationGroupId,
      image: {
        ...imgMeta,
        width: specs.width,
        height: specs.height,
        animated: specs.animated,
        colorModel:
          specs.colorModel === "grayscale-alpha"
            ? "grayscale_alpha"
            : specs.colorModel,
        aspectRatio: specs.width / specs.height,
        cameraMake: null,
        cameraModel: null,
        colorSpace: specs.colorSpace,
        dominantColorHex: null,
        exifDateTimeOriginal: specs.exifDateTimeOriginal
          ? new Date(specs.exifDateTimeOriginal)
          : null,
        frames: specs.frames,
        gpsLat: null,
        gpsLon: null,
        hasAlpha: specs.hasAlpha,
        iccProfile: specs.iccProfile,
        lensModel: null,
        orientation: specs.orientation,
        format: imgMeta?.format ?? "jpeg"
      },
      document: null,
      uploadDuration,
      requestMessageId,
      jobId: jobId ?? "",
      jobIndex: index,
      seriesId,
      seriesIndex: 0,
      kind: "FINAL",
      revisedPrompt: undefined,
      region: "us-east-1",
      batchId: null,
      compatCdnUrl: rt.cdnUrl,
      compatExt: rt.extension ?? specs.format,
      compatKey: rt.key,
      compatMime: rt.contentType ?? mime,
      compatReadyAt: null,
      compatStatus: "ALIASED",
      compatS3ObjectId: rt.s3ObjectId,
      compatVersionId: rt.versionId,
      contentEncoding: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      origin: "GENERATED",
      publicUrl: rt.publicUrl,
      sourceUrl: "buffer",
      sseAlgorithm: null,
      sseKmsKeyId: null,
      status: "READY",
      thumbnailKey: null,
      userId,
      draftId: null,
      expiresAt: rt.expires,
      imageGenOutput: {
        ext: specs.format,
        height: specs.height,
        width: specs.width,
        isPartial: false,
        jobId: jobId ?? "",
        jobIndex: index,
        kind: "FINAL",
        mime: rt.contentType ?? mime,
        revisedPrompt: null,
        seriesId,
        seriesIndex: 0
      }
    } as const satisfies AIChatResponseImgGenSubFields;
  }

  protected async handleMetaResponsesImageRequest({
    conversationId,
    msgs,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    userMsgId,
    apiKey,
    jobId,
    requestMessageId,
    model,
    systemPrompt,
    temperature,
    title,
    topP,
    imgGenFields
  }: MetaProviderChatRequestEntity) {
    const provider = "meta" as const;

    const requestMsg =
      msgs.find(m => m.id === requestMessageId) ??
      msgs.findLast(m => m.senderType === "USER");
    if (!requestMsg) {
      throw new Error("no user message found for meta image generation");
    }

    const client = this.getClient(apiKey ?? undefined);
    const input = this.formatMetaImageInput(requestMsg);
    const imageTool = this.metaImageTool(imgGenFields);
    const tools = Array.of<OpenAI.Responses.Tool>(imageTool);

    /**
     * ONE THINKING block at ordinal 0 for the whole turn. It opens blank on
     * `response.created`, re-sends each heartbeat with a growing duration,
     * and is replaced by the real summary on `response.completed` — the
     * client's block merge is last-wins by ordinal, so nothing concatenates
     */
    const sendThinking = (
      content: string,
      durationMs: number,
      isThinking: boolean
    ) => {
      const frame = {
        type: "ai_chat_chunk",
        conversationId,
        userId,
        userMsgId,
        model,
        provider,
        title,
        systemPrompt,
        temperature,
        topP,
        imgGenEnabled: true,
        imgGenFields: undefined,
        thinkingText: content.length > 0 ? content : undefined,
        messageBlocks: {
          type: "THINKING",
          content,
          ordinal: 0,
          conversationId,
          durationMs
        },
        thinkingDuration: durationMs > 0 ? durationMs : undefined,
        isThinking,
        done: false
      } as const satisfies EventTypeMap["ai_chat_chunk"];
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", frame);
    };

    let createdAt = 0;
    const elapsed = () =>
      createdAt === 0
        ? 0
        : Math.max(0, Math.round(performance.now() - createdAt));

    let heartbeat: ReturnType<typeof setInterval> | undefined = undefined;
    let completed: OpenAI.Responses.Response | undefined = undefined;

    try {
      const streamRes = await client.responses.create(
        {
          stream: true,
          store: false,
          model,
          input,
          tools,
          safety_identifier: userId
        },
        { stream: true }
      );

      for await (const s of streamRes) {
        if (s.type === "response.created" && createdAt === 0) {
          createdAt = performance.now();
          sendThinking("", 0, true);
          heartbeat = setInterval(
            () => sendThinking("", elapsed(), true),
            this.HEARTBEAT_MS
          );
        }

        if (s.type === "response.completed") {
          completed = s.response;
        }

        if (s.type === "response.incomplete") {
          throw new Error(
            `Meta image response ended incomplete (${s.response.incomplete_details?.reason ?? "unknown reason"})`
          );
        }

        if (s.type === "response.failed") {
          throw new Error(
            `Meta image response failed: ${s.response.error?.message ?? "unknown failure"}`
          );
        }
      }
    } catch (error) {
      this.logger.error(
        { model, conversationId, err: this.prisma.safeErrMsg(error) },
        "Meta image stream request failed"
      );
      throw new Error(this.prisma.safeErrMsg(error));
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }

    if (!completed) {
      throw new Error("Meta image response stream ended without completion");
    }

    // created → completed: reasoning, the planner's searches, generation and
    // any self-correcting regeneration — the wait the user actually sat through
    const duration = elapsed();

    const summaryParts = Array.of<string>();
    const results = Array.of<string>();
    for (const output of completed.output) {
      if (output.type === "reasoning") {
        for (const part of output.summary) summaryParts.push(part.text);
      }
      if (output.type === "image_generation_call" && output.result) {
        results.push(output.result);
      }
    }
    const summary = summaryParts.join("\n");

    // the reasoning lands on screen now; S3 and the row write follow
    sendThinking(summary, duration, false);
    if (summary.length > 0) thinkingChunks.push(summary);

    if (results.length === 0) {
      throw new Error("Meta image response completed without an image");
    }

    const generationGroupId = completed.id;
    const usage = completed.usage?.total_tokens ?? 0;

    const images = await Promise.all(
      results.map((b64, index) =>
        this.persistMetaImage({
          b64,
          index,
          userId,
          conversationId,
          generationGroupId,
          requestMessageId,
          jobId
        })
      )
    );
    const activeImage = images.at(-1);
    const first = images[0];

    const messageBlocks =
      summary.length > 0
        ? [
            {
              type: "THINKING",
              content: summary,
              durationMs: duration,
              ordinal: 0,
              conversationId
            } as const
          ]
        : undefined;

    const finalImgGenFields = {
      duration,
      revisedPrompt: undefined,
      outputQuality: undefined,
      actualCount: images.length,
      requestedCount: 1,
      outputAspectRatio: first ? first.width / first.height : undefined,
      outputFormat: first?.ext,
      outputBackground: undefined,
      outputCompression: undefined,
      seed: undefined,
      outputSize: first?.size.toString(10),
      outputMime: first?.mime,
      outputWidth: first?.width,
      outputHeight: first?.height,
      size: first?.size,
      partialImagesRequested: 0,
      partialImagesActual: 0,
      activeImage,
      partialImages: undefined,
      images
    };

    // Meta returns an empty assistant message and no revised prompt: the
    // message is its THINKING block plus the image, with no invented text
    const d = await this.prisma.handleAiChatResponse({
      chunk: "",
      conversationId,
      done: true,
      title,
      temperature,
      responseOutput: generationGroupId,
      userMsgId,
      topP,
      uploadDuration: activeImage?.uploadDuration,
      provider,
      mime: first?.mime,
      userId,
      systemPrompt,
      usage,
      jobId,
      requestMessageId,
      model,
      imgGenEnabled: true,
      imgGenFields: finalImgGenFields,
      thinkingText: summary.length > 0 ? summary : undefined,
      thinkingDuration: duration > 0 ? duration : undefined,
      messageBlocks
    });

    const response = {
      type: "ai_chat_response",
      conversationId,
      userId,
      provider,
      model,
      userMsgId,
      convo: d.convo,
      aiMsgId: d.aiMsgId,
      imgGenAttachmentId: d.imgGenAttachmentId,
      title,
      imgGenEnabled: true,
      usage,
      systemPrompt,
      temperature,
      topP,
      imgGenFields: finalImgGenFields,
      chunk: "",
      thinkingText: summary.length > 0 ? summary : undefined,
      messageBlocks,
      thinkingDuration: duration > 0 ? duration : undefined,
      done: true
    } satisfies EventTypeMap["ai_chat_response"];

    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(response));
    void this.redis.publishTypedEvent(
      streamChannel,
      "ai_chat_response",
      response
    );
    void this.redis.del(`stream:state:${conversationId}`);
  }
}
