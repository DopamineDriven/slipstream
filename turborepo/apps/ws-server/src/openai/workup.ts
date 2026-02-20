import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import type {
  ImageGenPartialArr,
  OpenAIFileSearchToolInput
} from "@/openai/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  InferPromiseRT,
  ProviderOpenaiRequestEntity
} from "@/types/index.ts";
import type {
  ResponseInput,
  ResponseTextConfig
} from "openai/resources/responses/responses.mjs";
import type { Reasoning, ReasoningEffort } from "openai/resources/shared.mjs";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import type {
  AIChatRequest,
  AIChatResponseImgGenSubFields,
  AttachmentSingleton,
  ImgGenWorkupResRT,
  MessageSingleton,
  OpenAiModelIdUnion
} from "@slipstream/types";
import { S3Storage } from "@slipstream/storage-s3";

export class OpenAIServiceWorkup {
  protected readonly vsCache = new Map<string, string>();
  protected readonly inflightVS = new Map<string, Promise<string>>();
  private assetCache = new Map<
    string,
    { fileId: string; dbRecordId: string; lastCheckedAt: Date | null }
  >();

  protected defaultClient: OpenAI;
  protected logger: PinoLogger;
  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected userStoreVector: UserStoreVectorService,
    protected apiKey: string,
    protected s3: S3Storage
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[openai] " }
      );
    this.defaultClient = new OpenAI({
      logLevel: "debug",
      apiKey: this.apiKey,
      logger: this.logger
    });
  }
  public getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }

    return client;
  }

  protected handleImgExtension(
    ext:
      | "png"
      | "jpeg"
      | "webp"
      | "apng"
      | "gif"
      | "bmp"
      | "avif"
      | "heic"
      | "svg"
      | "ico"
      | "tiff"
      | "unknown"
      | "jpg"
  ) {
    return ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "jpeg"
          ? "image/jpeg"
          : ext === "jpg"
            ? "image/jpeg"
            : "application/octet-stream";
  }

  protected isImgGenModel(m: OpenAiModelIdUnion) {
    return (
      m === "dall-e-2" ||
      m === "dall-e-3" ||
      m === "gpt-image-1" ||
      m === "gpt-image-1-mini" ||
      m === "gpt-image-1.5"
    );
  }

  protected isDeepResearchModel(m: OpenAiModelIdUnion) {
    return (
      m === "gpt-5-pro" ||
      m === "gpt-5.2-pro" ||
      m === "o1-pro" ||
      m === "o3-pro" ||
      m === "o3-deep-research" ||
      m === "o4-mini-deep-research"
    );
  }

  protected isImgGenFacilitating(m: OpenAiModelIdUnion) {
    return (
      m === "gpt-4.1" ||
      m === "gpt-4.1-mini" ||
      m === "gpt-4.1-nano" ||
      m === "gpt-5" ||
      m === "gpt-5-chat-latest" ||
      m === "gpt-5-mini" ||
      m === "gpt-5-nano" ||
      m === "gpt-5-pro" ||
      m === "gpt-5.1" ||
      m === "gpt-5.2" ||
      m === "gpt-5.2-pro" ||
      m === "o3" ||
      m === "gpt-4o" ||
      m === "gpt-4o-mini"
    );
  }

  protected isImgGenCapable(m: OpenAiModelIdUnion) {
    return this.isImgGenModel(m) || this.isImgGenFacilitating(m);
  }

  protected responsesImgGen(
    imgGenEnabled: AIChatRequest["imgGenEnabled"],
    mo: AIChatRequest["model"],
    imgFields?: AIChatRequest["imgGenFields"],
    currentMsgBoundAssets?: ProviderOpenaiRequestEntity["currentMsgBoundAssets"]
  ) {
    const model = mo as OpenAiModelIdUnion;
    if (imgGenEnabled === false) return undefined;
    if (!imgFields) return undefined;
    if (!this.isImgGenCapable(model)) {
      return;
    }

    const msgBoundImgAssets =
      typeof currentMsgBoundAssets?.assets !== "undefined" &&
      currentMsgBoundAssets.assetCounts > 0 &&
      currentMsgBoundAssets?.assets?.filter(t => t.type === "IMAGE")?.length >
        0;

    // facilitating models automatically recruit gpt-image-1 via the image_generation tool -> streaming = true

    const {
      moderation,
      n,
      input_fidelity,
      input_image_mask,
      response_format,
      pureImgGenModel,
      style,
      output_background,
      output_compression,
      output_format,
      output_partial_images,
      output_quality,
      output_size
    } = imgFields;

    if (model === "dall-e-3") {
      const dalle3Opts = {
        /**
         * **dall-e-2, dall-e-3, and grok-2-image-1212 only**
         *
         * "url" (default) | "b64_json"
         */
        response_format: response_format ?? "url",

        isPureImgGenModel: true as const,
        /**
         * **dall-e-3 only**
         *
         * defaults to "vivid"
         */
        style: (style as "vivid" | "natural" | undefined) ?? ("vivid" as const),
        msgBoundImgAssets,
        /** dall-e-3 has max n of 1 */
        n: 1,
        model: model,
        output_quality:
          (this.prisma.handleImgGenOutputQuality("openai", model, {
            output_quality: output_quality as
              | "hd"
              | "auto"
              | "standard"
              | undefined
          }) as "auto" | "hd" | "standard" | undefined) ?? ("auto" as const),
        output_size:
          (this.prisma.handleOutputSize("openai", model, {
            output_size: output_size as
              | "1792x1024"
              | "1024x1792"
              | "1024x1024"
              | "auto"
              | undefined
          }) as "auto" | "1024x1024" | "1792x1024" | "1024x1792" | undefined) ??
          ("auto" as const),
        targetApi: "images" as const
      };
      return dalle3Opts satisfies ImgGenWorkupResRT<"dall-e-3">;
    }
    if (model === "dall-e-2") {
      const dalle2Opts = {
        /**
         * **dall-e-2, dall-e-3, and grok-2-image-1212 only**
         *
         * "url" (default) | "b64_json"
         */
        response_format: response_format ?? "url",
        isPureImgGenModel: true as const,
        msgBoundImgAssets,
        /**
         * count
         *
         * 1 (min)
         * 10 (max)
         */
        n: this.prisma.handleImgGenCount("openai", model, { n }) ?? 1,
        model: "dall-e-2" as const,
        output_quality:
          (this.prisma.handleImgGenOutputQuality("openai", model, {
            output_quality: output_quality as "auto" | "standard" | undefined
          }) as "auto" | "standard" | undefined) ?? ("auto" as const),
        output_size:
          (this.prisma.handleOutputSize("openai", model, {
            output_size: output_size as
              | "256x256"
              | "512x512"
              | "1024x1024"
              | "auto"
              | undefined
          }) as "auto" | "256x256" | "512x512" | "1024x1024" | undefined) ??
          ("auto" as const),
        targetApi: "images" as const
      };
      return dalle2Opts satisfies ImgGenWorkupResRT<"dall-e-2">;
    }

    const moderate = (moderation as "low" | "auto" | undefined) ?? "low";
    const outputFormat =
      (output_format as "jpeg" | "webp" | "png" | undefined) ??
      ("png" as const);
    const bg = this.prisma.handleImgGenBg("openai", model, {
      background: output_background,
      format: outputFormat
    });
    const sharedOpts = {
      input_image_mask,
      isPureImgGenModel: pureImgGenModel ?? this.isImgGenModel(model),
      msgBoundImgAssets,
      n: this.prisma.handleImgGenCount("openai", model, { n }),
      moderation: moderate,
      output_format: outputFormat,
      output_compression: this.prisma.handleImgGenCompression("openai", model, {
        output_compression,
        output_format
      }),
      model: model,
      output_quality:
        (this.prisma.handleImgGenOutputQuality("openai", model, {
          output_quality: output_quality as
            | "low"
            | "medium"
            | "high"
            | "auto"
            | undefined
        }) as
          | "low"
          | "auto"
          | "high"
          | "standard"
          | "hd"
          | "medium"
          | undefined) ?? ("high" as const),
      output_size:
        (this.prisma.handleOutputSize("openai", model, {
          output_size: output_size as
            | "1536x1024"
            | "1024x1024"
            | "1024x1536"
            | "auto"
            | undefined
        }) as "1536x1024" | "1024x1536" | "1024x1024" | undefined) ??
        ("auto" as const),
      output_background: bg,
      targetApi: this.isImgGenFacilitating(model)
        ? ("responses" as const)
        : ("images" as const),
      partialImagesRequested: this.prisma.handlePartialImgGen("openai", model, {
        partialImagesRequested: output_partial_images
      }),
      input_fidelity:
        input_fidelity && msgBoundImgAssets
          ? this.prisma.handleInputFidelity("openai", model, { input_fidelity })
          : undefined
    };
    console.log(sharedOpts);
    return sharedOpts as ImgGenWorkupResRT<typeof model>;
  }
  private async ensureAssetUploadedToOpenAI(
    attachment: AttachmentSingleton<true>,
    client: OpenAI,
    keyFingerprint = "server",
    keyId?: string
  ): Promise<{ file_id: string; db_id: string }> {
    // 1) Reuse if we already uploaded this asset for this key fingerprint
    const existing = await this.prisma.findActiveOpenAIAsset(
      attachment.id,
      keyFingerprint
    );
    if (existing?.providerRef) {
      // IMPORTANT: return ONLY file_id; do NOT include filename alongside file_id
      return { file_id: existing.providerRef, db_id: existing.id };
    }

    const { absTmpPath, tmpUniquename, mime } =
      await this.prisma.fetchRemoteToTmp("OPENAI", attachment);

    try {
      const uploaded = await client.files.create({
        file: createReadStream(absTmpPath),
        purpose: "user_data"
      });

      const upsert = await this.prisma.upsertOpenAIAssetMapping(
        attachment.id,
        keyFingerprint,
        mime,
        uploaded.id,
        keyId,
        BigInt(uploaded.bytes),
        new Date(uploaded.created_at * 1000).toISOString()
      );

      return { file_id: uploaded.id, db_id: upsert.id };
    } catch (err) {
      throw new Error(this.prisma.safeErrMsg(err));
    } finally {
      this.prisma.cleanupTmpPostupload("OPENAI", absTmpPath, tmpUniquename);
    }
  }

  private async encodeImageAsDataUrl(
    attachment: AttachmentSingleton<true>
  ): Promise<string> {
    const { absTmpPath, tmpUniquename, mime } =
      await this.prisma.fetchRemoteToTmp("OPENAI", attachment);
    try {
      const fileBuffer = await readFile(absTmpPath);
      const base64 = fileBuffer.toString("base64");
      const contentType =
        mime ??
        attachment.compatMime ??
        attachment.mime ??
        "application/octet-stream";
      return `data:${contentType};base64,${base64}`;
    } finally {
      this.prisma.cleanupTmpPostupload("OPENAI", absTmpPath, tmpUniquename);
    }
  }

  protected getGenMime(target: string) {
    return target === "jpeg"
      ? "image/jpeg"
      : target === "jpg"
        ? "image/jpeg"
        : target === "png"
          ? "image/png"
          : target === "webp"
            ? "image/webp"
            : "application/octet-stream";
  }
  protected async generateId(target: "itemId" | "generationGroupId") {
    const { nanoid } = await import("nanoid");
    if (target === "generationGroupId") {
      const generationGroupId = "resp_" + nanoid();
      return generationGroupId;
    } else return nanoid();
  }
  protected mapPersistenceImgGenArr(
    userId: string,
    props: ImageGenPartialArr[]
  ) {
    return props.map((t, o) => {
      const rt = t[25];
      const expImg = t[26];
      const p = rt.cdnUrl?.split(/\//gm);
      const filename = p?.at(-1);
      const pathFragments = filename?.split(/-/gm);
      const _timestamp = pathFragments?.[0];
      const seriesIndex = pathFragments?.[2]?.split(".")?.[0];
      return {
        index: t[0] ?? o,
        cdnUrl: t[1],
        itemId: t[2],
        width: t[3],
        height: t[4],
        mime: t[5],
        bucket: t[6],
        key: t[7],
        versionId: t[8],
        s3ObjectId: t[9],
        filename: t[10] ?? null,
        batchId: null,
        draftId: null,
        cacheControl: rt.cacheControl ?? null,
        checksumAlgo: rt?.checksum?.algo ?? "CRC32",
        checksumSha256: rt.checksum?.value ?? null,
        compatCdnUrl: rt.cdnUrl,
        compatExt: rt.extension ?? t?.[11] ?? expImg.format,
        compatKey: rt.key,
        compatS3ObjectId: rt.s3ObjectId,
        compatMime:
          rt.contentType ??
          this.getGenMime(rt.extension ?? t[11] ?? expImg.format),
        compatReadyAt: null,
        compatStatus: "ALIASED",
        compatVersionId: rt.versionId,
        contentDisposition: rt.contentDisposition ?? null,
        contentEncoding: null,
        createdAt: new Date(Date.now()),
        ext: t[11] ?? rt.extension ?? expImg.format,
        deletedAt: null,
        document: null,
        expiresAt: rt.expires,
        origin: "GENERATED",
        publicUrl: rt.publicUrl,
        region: "us-east-1",
        sourceUrl: "buffer",
        sseAlgorithm: null,
        sseKmsKeyId: null,
        status: "READY",
        storageClass: rt.storageClass ?? null,
        thumbnailKey: null,
        updatedAt: new Date(Date.now()),
        userId,
        etag: rt.etag ?? null,
        size: t?.[13] ?? null,
        s3LastModified: rt.lastModified ? new Date(rt.lastModified) : null,
        generationGroupId: t[19],
        image: {
          animated: expImg.animated,
          width: expImg.width,
          height: expImg.height,
          aspectRatio: expImg.width / expImg.height,
          cameraMake: null,
          cameraModel: null,
          colorSpace: expImg.colorSpace,
          colorModel:
            expImg.colorModel === "grayscale-alpha"
              ? "grayscale_alpha"
              : expImg.colorModel,
          dominantColorHex: null,
          exifDateTimeOriginal: expImg.exifDateTimeOriginal
            ? new Date(expImg.exifDateTimeOriginal)
            : null,
          format: expImg.format,
          frames: expImg.frames,
          gpsLat: null,
          gpsLon: null,
          hasAlpha: expImg.hasAlpha,
          iccProfile: expImg.iccProfile,
          lensModel: null,
          orientation: expImg.orientation
        },
        imageGenOutput: {
          ext: expImg.format,
          height: expImg.height,
          width: expImg.width,
          jobId: t[23] ?? "",
          isPartial: true,
          jobIndex: 0,
          kind: "PARTIAL",
          mime: expImg.contentType ?? this.getGenMime(expImg.format),
          revisedPrompt: null,
          seriesId: t[2],
          seriesIndex: seriesIndex ? Number.parseInt(seriesIndex, 10) : o++
        },
        uploadDuration: t[21] ?? null,
        requestMessageId: t[22],
        jobId: t[23] ?? "",
        jobIndex: 0,
        seriesIndex: t[0],
        seriesId: t[2],
        revisedPrompt: t[24],
        kind: "PARTIAL"
      } as const satisfies AIChatResponseImgGenSubFields;
    });
  }

  protected async buildAttachmentContentAsync(
    attachments?: MessageSingleton<true>["attachments"],
    client?: OpenAI,
    keyFingerprint = "server"
  ) {
    const content = Array.of<
      | {
          type: "input_image";
          image_url?: string;
          file_id?: string;
          detail: "auto" | "low" | "high";
        }
      | {
          type: "input_file";
          file_id?: string;
          filename?: string;
          file_data?: string;
        }
    >();
    if (!attachments || attachments.length === 0) return content;
    if (!client) return content;

    for (const att of attachments) {
      const url = att.compatCdnUrl ?? att.cdnUrl ?? att.sourceUrl;
      const mime = att.compatMime ?? att.mime ?? "";
      if (!url) continue;

      if (mime.startsWith("image/")) {
        try {
          const { file_id } = await this.ensureAssetUploadedToOpenAI(
            att,
            client,
            keyFingerprint
          );
          content.push({ type: "input_image", file_id, detail: "auto" });
          continue;
        } catch (error) {
          this.logger.warn(
            { attachmentId: att.id, error },
            "Failed to upload image to OpenAI, falling back to base64 data URL"
          );
          const image_url = await this.encodeImageAsDataUrl(att);
          content.push({ type: "input_image", image_url, detail: "auto" });
          continue;
        }
      } else {
        const { file_id } = await this.ensureAssetUploadedToOpenAI(
          att,
          client,
          keyFingerprint
        );

        content.push({ type: "input_file", file_id });
      }
    }
    return content;
  }

  // openai/index.ts
  protected async formatOpenAiWithUploads(
    isNewChat: boolean,
    msgs: MessageSingleton<true>[],
    client: OpenAI,
    keyFingerprint = "server",
    opts?: { onlyMostRecentUser?: boolean }
  ) {
    if (isNewChat) {
      const first = msgs[0];
      if (!first)
        return [{ role: "user", content: "" }] as const satisfies ResponseInput;
      const attContent = await this.buildAttachmentContentAsync(
        first.attachments,
        client,
        keyFingerprint
      );
      return attContent.length
        ? ([
            {
              role: "user",
              content: [
                ...attContent,
                { type: "input_text", text: first.content }
              ]
            }
          ] as const satisfies ResponseInput)
        : ([
            { role: "user", content: first.content }
          ] as const satisfies ResponseInput);
    } else {
      if (opts?.onlyMostRecentUser) {
        const lastUser = [...msgs].reverse().find(t => t.senderType === "USER");
        if (lastUser) {
          const attContent = await this.buildAttachmentContentAsync(
            lastUser.attachments,
            client,
            keyFingerprint
          );
          return attContent.length
            ? ([
                {
                  role: "user",
                  content: [
                    ...attContent,
                    { type: "input_text", text: lastUser.content }
                  ]
                }
              ] as const satisfies ResponseInput)
            : ([
                { role: "user", content: lastUser.content }
              ] as const satisfies ResponseInput);
        }
      }
      const history = this.prependProviderModelTag(msgs.slice(0, -1));
      const last = msgs.at(-1);
      if (last?.senderType === "USER") {
        const attContent = await this.buildAttachmentContentAsync(
          last.attachments,
          client,
          keyFingerprint
        );
        return attContent.length
          ? ([
              ...history,
              {
                role: "user",
                content: [
                  ...attContent,
                  { type: "input_text", text: last.content }
                ]
              }
            ] as const satisfies ResponseInput)
          : ([
              ...history,
              { role: "user", content: last.content }
            ] as const satisfies ResponseInput);
      }
      return this.formatMsgs(this.prependProviderModelTag(msgs));
    }
  }
  private prependProviderModelTag(
    msgs: Pick<
      MessageSingleton<true>,
      "senderType" | "provider" | "model" | "content"
    >[]
  ) {
    return msgs.map(msg => {
      if (msg.senderType === "USER") {
        return { role: "user", content: msg.content } as const;
      } else {
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "";
        const modelIdentifier = `[${provider}/${model}]`;
        return {
          role: "assistant",
          content: `${modelIdentifier} \n` + msg.content
        } as const;
      }
    }) satisfies ResponseInput;
  }

  protected buildInstructions(systemPrompt?: string) {
    return systemPrompt
      ? `${systemPrompt}\n\nWhen formatting codeblocks, always fence them with proper language tags using backticks not tildes.\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.`
      : "When formatting codeblocks, always fence them with proper language tags using backticks not tildes.\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";
  }

  protected ensureUserVectorStoreId(
    client: OpenAI,
    workspaceId: string | null | undefined,
    userId: string
  ) {
    const name = `slipstream:${workspaceId ?? "global"}:${userId}`;

    const cached = this.vsCache.get(name);
    if (cached) return Promise.resolve(cached);

    const inflight = this.inflightVS.get(name);
    if (inflight) return inflight;

    const p = (async () => {
      try {
        // 1) Scan existing stores (auto-paginates)
        for await (const store of client.vectorStores.list({ limit: 100 })) {
          if (store.name === name) {
            this.vsCache.set(name, store.id);
            return store.id;
          }
        }

        // 2) Create once and cache
        const created = await client.vectorStores.create({ name });
        this.vsCache.set(name, created.id);
        return created.id;
      } finally {
        this.inflightVS.delete(name);
      }
    })();

    this.inflightVS.set(name, p);
    return p;
  }
  protected hasFiles(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    return formatted.some(m => {
      if (typeof m.content === "string") return false;
      if (m.role !== "user") return false;
      return m.content.some(
        t =>
          t.type === "input_file" &&
          (typeof t?.file_id !== "undefined" ||
            typeof t?.file_data !== "undefined")
      );
    });
  }
  protected hasImages(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    return formatted.some(m => {
      if (typeof m.content === "string") return false;
      if (m.role !== "user") return false;
      return m.content.some(
        t =>
          t.type === "input_image" &&
          (typeof t?.image_url !== "undefined" ||
            typeof t?.file_id !== "undefined")
      );
    });
  }
  protected fileIds(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    const fileIdArr = Array.of<string>();
    try {
      for (const m of formatted) {
        if (m.role !== "user") continue;
        const c = m.content;
        if (typeof c === "string") continue;
        for (const p of c) {
          if (p.type === "input_file" && p.file_id) fileIdArr.push(p.file_id);
        }
      }
    } finally {
      return fileIdArr;
    }
  }

  protected formatMsgs(
    msgs: (
      | {
          readonly role: "user";
          readonly content: string;
        }
      | {
          readonly role: "assistant";
          readonly content: string;
        }
    )[]
  ) {
    return [...msgs] as const satisfies ResponseInput;
  }

  protected normalizeLocation(
    user_location: ProviderOpenaiRequestEntity["user_location"]
  ) {
    return (
      user_location
        ? {
            type: "approximate" as const,
            city: user_location.city ?? null,
            country: user_location.country ?? null,
            region: user_location.region ?? null,
            timezone: user_location.tz
              ? decodeURIComponent(user_location.tz)
              : null
          }
        : undefined
    ) satisfies OpenAI.Responses.WebSearchTool.UserLocation | null | undefined;
  }

  protected fileSearchFunctionTool() {
    return {
      type: "function",
      name: "file_search",
      description:
        "Search the user's uploaded documents using semantic similarity. " +
        "Pass one or more queries in a single call. " +
        "Returns a JSON array of matching chunks with filename, score, content, offsets, and chunk index.",
      strict: false,
      parameters: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            description:
              "One or more semantic search queries. Prefer batching related queries in one tool call (max 5).",
            items: { type: "string" },
            minItems: 1,
            maxItems: 5
          },
          max_results: {
            type: "number",
            description: "Maximum results to return (1-10, default 5)"
          },
          filename: {
            type: "string",
            description:
              "Optional filename filter (fuzzy, case-insensitive). " +
              "Only chunks from documents whose filename closely matches this string are returned. " +
              "Example: 'Path to Hell Pt VIII' matches 'The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VIII.pdf'."
          }
        },
        required: ["queries"],
        additionalProperties: false
      }
    } as const satisfies OpenAI.Responses.FunctionTool;
  }

  private truncateFileSearchContent(content: string, maxChars = 1200) {
    if (content.length <= maxChars) return content;
    return content.slice(0, maxChars).concat("...");
  }

  protected async searchStore(
    userId: string,
    query: string,
    limit = 5,
    threshold = 0.3,
    filename?: string
  ) {
    return await this.userStoreVector.searchUserStoreChunks({
      userId,
      query,
      limit,
      threshold,
      filename
    });
  }

  protected parseFileSearchInput(
    rawArguments: string
  ): OpenAIFileSearchToolInput {
    const parsed = JSON.parse<Record<string, unknown>>(rawArguments);

    const queryList = Array.of<string>();
    if ("queries" in parsed && Array.isArray(parsed.queries)) {
      for (const q of parsed.queries) {
        if (typeof q !== "string") continue;
        const normalized = q.trim();
        if (normalized.length === 0) continue;
        queryList.push(normalized);
      }
    }
    // Backward-compatible fallback for single-query invocations.
    if (
      queryList.length === 0 &&
      "query" in parsed &&
      typeof parsed.query === "string"
    ) {
      const normalized = parsed.query.trim();
      if (normalized.length > 0) {
        queryList.push(normalized);
      }
    }
    const uniqueQueries = Array.from(new Set(queryList)).slice(0, 5);
    const firstQuery = uniqueQueries[0];
    if (!firstQuery) {
      throw new Error(
        `file_search input missing required "queries": ${rawArguments}`
      );
    }
    const normalizedQueries = [firstQuery, ...uniqueQueries.slice(1)] as const;

    const maxResults =
      "max_results" in parsed && typeof parsed.max_results === "number"
        ? parsed.max_results
        : undefined;

    const filenameInput =
      "filename" in parsed && typeof parsed.filename === "string"
        ? parsed.filename.trim() || undefined
        : undefined;

    return {
      queries: normalizedQueries,
      max_results: maxResults,
      filename: filenameInput
    } satisfies OpenAIFileSearchToolInput;
  }

  protected async executeFileSearch(
    userId: string,
    input: OpenAIFileSearchToolInput
  ) {
    const maxResults = Math.max(1, Math.min(input.max_results ?? 5, 5));
    const queryResults = await Promise.all(
      input.queries.map(query =>
        this.searchStore(userId, query, maxResults, 0, input.filename)
      )
    );
    const results = queryResults.flat();

    if (results.length === 0) {
      return "[]";
    }

    const unique = new Map<
      string,
      {
        filename: string;
        score: number;
        content: string;
        startOffset: number | null;
        endOffset: number | null;
        chunkIndex: number;
      }
    >();
    for (const r of results) {
      const mapped = {
        filename: r.filename,
        score: r.score != null ? Number(r.score.toFixed(4)) : 0,
        content: this.truncateFileSearchContent(r.content),
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        chunkIndex: r.chunkIndex
      };
      const key = `${mapped.filename}::${mapped.chunkIndex}::${mapped.startOffset ?? "null"}::${mapped.endOffset ?? "null"}`;
      const previous = unique.get(key);
      if (!previous || mapped.score > previous.score) {
        unique.set(key, mapped);
      }
    }
    const mapped = Array.from(unique.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(maxResults, 5), 10));

    const maxOutputChars = 48_000;
    if (JSON.stringify(mapped).length <= maxOutputChars) {
      return JSON.stringify(mapped);
    }

    const reduced = [...mapped];
    while (
      reduced.length > 1 &&
      JSON.stringify(reduced).length > maxOutputChars
    ) {
      reduced.pop();
    }

    if (JSON.stringify(reduced).length <= maxOutputChars) {
      return JSON.stringify(reduced);
    }

    return JSON.stringify(
      reduced.map(r => ({
        filename: r.filename,
        score: r.score,
        content: this.truncateFileSearchContent(r.content, 600),
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        chunkIndex: r.chunkIndex
      }))
    );
  }

  protected async executeFunctionToolCall(
    userId: string,
    toolCall: OpenAI.Responses.ResponseFunctionToolCall
  ) {
    if (toolCall.name !== "file_search") {
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `Unknown tool: ${toolCall.name}`
      } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
    }

    try {
      const input = this.parseFileSearchInput(toolCall.arguments);
      const output = await this.executeFileSearch(userId, input);
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output
      } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
    } catch (error) {
      this.logger.error(
        {
          toolName: toolCall.name,
          callId: toolCall.call_id,
          error: this.prisma.safeErrMsg(error)
        },
        "OpenAI function tool execution failed"
      );
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `file_search error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
    }
  }

  // To continue this session, run codex resume 019b2b4a-3e12-7c90-8276-49994f1d3bd2
  protected handleTooling(
    model: OpenAiModelIdUnion,
    fileSearchEnabled: boolean,
    user_location?: OpenAI.Responses.WebSearchPreviewTool.UserLocation,
    vector_store_ids?: string[],
    imgGenEnabled = false,
    imgGen?: OpenAI.Responses.Tool.ImageGeneration,
    localFileSearchEnabled = false
  ) {
    const pureImgModel = this.canCallImageApi(model);
    if (localFileSearchEnabled) {
      return [
        this.fileSearchFunctionTool(),
        {
          type: "web_search",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[];
    }
    if (fileSearchEnabled && vector_store_ids && vector_store_ids.length >= 1) {
      if (imgGenEnabled === true && imgGen && pureImgModel === false) {
        return [
          imgGen,
          {
            type: "web_search",
            user_location
          }
        ] satisfies OpenAI.Responses.Tool[];
      }
      return [
        { type: "file_search", vector_store_ids, max_num_results: 10 },
        {
          type: "web_search",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[];
    } else {
      if (imgGenEnabled === true && imgGen && pureImgModel === false) {
        return [imgGen] satisfies OpenAI.Responses.Tool[];
      }
      return [
        {
          type: "web_search",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[];
    }
  }

  protected openaiReasoning(
    m: OpenAiModelIdUnion,
    effort: ReasoningEffort = "high",
    summary: Reasoning["summary"] = "auto",
    imgGenEnabled = false
  ) {
    if (!this.isReasoningModel(m)) return;
    switch (m) {
      // gpt-5-pro only supports high reasoning
      case "gpt-5-pro": {
        return { effort: "high", summary } as const satisfies Reasoning;
      }
      case "o1":
      case "o1-pro":
      case "o3-deep-research":
      case "o3":
      case "o3-pro":
      case "o4-mini-deep-research": {
        if (imgGenEnabled === true) {
          return { effort: "low", summary } as const satisfies Reasoning;
        } else {
          if (effort === "high" || effort === "low" || effort === "medium") {
            return { effort, summary } as const satisfies Reasoning;
          } else {
            return { effort: "high", summary } as const satisfies Reasoning;
          }
        }
      }
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-nano": {
        if (imgGenEnabled === true) {
          return { effort: "minimal", summary } as const satisfies Reasoning;
        } else {
          if (
            effort === "high" ||
            effort === "low" ||
            effort === "medium" ||
            effort === "minimal"
          ) {
            return { effort, summary } as const satisfies Reasoning;
          } else {
            return { effort: "high", summary } as const satisfies Reasoning;
          }
        }
      }
      case "gpt-5.1": {
        if (imgGenEnabled === true) {
          return { effort: "low", summary } as const satisfies Reasoning;
        } else {
          if (
            effort === "high" ||
            effort === "low" ||
            effort === "medium" ||
            effort === "none"
          ) {
            return { effort, summary } as const satisfies Reasoning;
          } else {
            return { effort: "high", summary } as const satisfies Reasoning;
          }
        }
      }
      case "gpt-5.1-codex-max": {
        if (
          effort === "high" ||
          effort === "low" ||
          effort === "medium" ||
          effort === "xhigh"
        ) {
          return { effort, summary } as const satisfies Reasoning;
        } else {
          return { effort: "xhigh", summary } as const satisfies Reasoning;
        }
      }
      case "gpt-5.2": {
        if (imgGenEnabled === true) {
          return { effort: "low", summary } as const satisfies Reasoning;
        } else {
          if (
            effort === "xhigh" ||
            effort === "high" ||
            effort === "low" ||
            effort === "medium" ||
            effort === "none"
          ) {
            return { effort, summary } as const satisfies Reasoning;
          } else {
            return { effort: "high", summary } as const satisfies Reasoning;
          }
        }
      }
      case "gpt-5.2-pro": {
        if (effort === "xhigh") {
          return { effort, summary } as const satisfies Reasoning;
        } else {
          return { effort: "xhigh", summary } as const satisfies Reasoning;
        }
      }
      case "o3-mini":
      case "gpt-5.2-chat-latest":
      case "gpt-5-codex":
      case "gpt-image-1.5":
      case "gpt-5-chat-latest":
      case "gpt-5.1-codex":
      case "gpt-5.1-codex-mini":
      case "o4-mini":
      case "gpt-5.1-chat-latest":
      default: {
        if (effort === "high" || effort === "low" || effort === "medium") {
          return { effort, summary } as const satisfies Reasoning;
        } else {
          return { effort: "medium", summary } as const satisfies Reasoning;
        }
      }
    }
  }

  protected isReasoningModel(m: OpenAiModelIdUnion) {
    return (
      m === "gpt-5" ||
      m === "gpt-5-chat-latest" ||
      m === "gpt-5-codex" ||
      m === "gpt-5-mini" ||
      m === "gpt-5-nano" ||
      m === "gpt-5-pro" ||
      m === "o1" ||
      m === "o3" ||
      m === "o3-mini" ||
      m === "o4-mini" ||
      m === "gpt-5.2-pro" ||
      m === "gpt-5.2" ||
      m === "gpt-5.2-chat-latest" ||
      m === "gpt-5.1" ||
      m === "gpt-5.1-chat-latest" ||
      m === "gpt-5.1-codex-max" ||
      m === "gpt-5.1-codex" ||
      m === "gpt-5.1-codex-mini" ||
      m === "gpt-image-1.5" ||
      m === "o3-pro" ||
      m === "o1-pro" ||
      m === "o3-deep-research" ||
      m === "o4-mini-deep-research"
    );
  }

  protected canCallImageApi(model: OpenAiModelIdUnion) {
    return this.isImgGenModel(model);
  }

  protected imageGenToolCompat(model: OpenAiModelIdUnion) {
    return this.isImgGenFacilitating(model);
  }

  protected openAiVerbosity(
    model: OpenAiModelIdUnion,
    verbosity: ResponseTextConfig["verbosity"] = "medium",
    imgGenEnabled = false
  ) {
    switch (model) {
      case "gpt-5.1-codex-max":
      case "gpt-5.2":
      case "gpt-5.1":
      case "gpt-5.2-pro":
      case "gpt-5":
      case "gpt-5-pro": {
        return { verbosity: "high" } as const;
      }
      case "gpt-5-mini":
      case "gpt-5-chat-latest":
      case "gpt-5-nano": {
        if (imgGenEnabled) {
          return { verbosity: "low" } satisfies ResponseTextConfig;
        }
        return { verbosity } satisfies ResponseTextConfig;
      }
      case "gpt-image-1.5":
      case "gpt-5.2-chat-latest":
      case "gpt-5-codex":
      case "gpt-5.1-chat-latest":
      case "gpt-5.1-codex":
      case "gpt-5.1-codex-mini": {
        return { verbosity } satisfies ResponseTextConfig;
      }
      case "o3":
      case "o3-mini":
      case "o3-pro":
      case "o4-mini":
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4-turbo":
      case "gpt-4.1":
      case "dall-e-2":
      case "chatgpt-4o-latest":
      case "o1":
      case "o1-pro":
      case "sora-2-pro":
      case "sora-2":
      case "dall-e-3":
      case "gpt-image-1":
      case "gpt-image-1-mini":
      case "gpt-4.1-mini":
      case "gpt-4.1-nano":
      case "gpt-4o":
      case "o3-deep-research":
      case "o4-mini-deep-research":
      case "gpt-4o-mini":
      default: {
        return { verbosity } as const satisfies ResponseTextConfig;
      }
    }
  }
}
// To continue this session, run codex resume 019b2b4a-3e12-7c90-8276-49994f1d3bd2
