import type {
  InferPromiseRT,
  MessageSingleton,
  ProviderOpenaiRequestEntity
} from "@/types/index.ts";
import type {
  ResponseInput,
  ResponseTextConfig
} from "openai/resources/responses/responses.mjs";
import type { Reasoning } from "openai/resources/shared.mjs";
import { OpenAI, toFile } from "openai";
import { ModelService } from "@/models/index.ts";
import { ImageGenPartialArr } from "@/openai/types.ts";
import { PrismaService } from "@/prisma/index.ts";
import type {
  AIChatRequest,
  AIChatResponseImgGenSubFields,
  AIChatResRT,
  ConversationSingleton,
  ImgGenWorkupResRT,
  OpenAiModelIdUnion
} from "@slipstream/types";

export class OpenAIServiceWorkup extends ModelService {
  protected readonly vsCache = new Map<string, string>();
  protected readonly inflightVS = new Map<string, Promise<string>>();
  constructor(protected prisma: PrismaService) {
    super();
  }

  protected responsesImgGen(
    imgGenEnabled: AIChatRequest["imgGenEnabled"],
    mo: AIChatRequest["model"],
    imgFields?: AIChatRequest["imgGenFields"],
    currentMsgBoundAssets?: ProviderOpenaiRequestEntity["currentMsgBoundAssets"]
  ):
    | {
        /**
         * **dall-e-2, dall-e-3, and grok-2-image-1212 only**
         *
         * "url" (default) | "b64_json"
         */
        response_format: "url" | "b64_json";
        isPureImgGenModel: true;
        /**
         * **dall-e-3 only**
         *
         * defaults to "vivid"
         */
        style: "vivid" | "natural";
        msgBoundImgAssets: boolean;
        /** dall-e-3 has max n of 1 */
        n: number;
        model: "dall-e-3";
        output_quality: "auto" | "standard" | "hd";
        output_size: "auto" | "1024x1024" | "1792x1024" | "1024x1792";
        targetApi: "images";
      }
    | {
        /**
         * **dall-e-2, dall-e-3, and grok-2-image-1212 only**
         *
         * "url" (default) | "b64_json"
         */
        response_format: "url" | "b64_json";
        isPureImgGenModel: true;
        msgBoundImgAssets: boolean;
        /**
         * count
         *
         * 1 (min)
         * 10 (max)
         */
        n: number;
        model: "dall-e-2";
        output_quality: "auto" | "standard";
        output_size: "auto" | "1024x1024" | "256x256" | "512x512";
        targetApi: "images";
      }
    | ImgGenWorkupResRT<
        | "gpt-5"
        | "gpt-5-mini"
        | "gpt-5-nano"
        | "gpt-5-pro"
        | "gpt-5-chat-latest"
        | "gpt-4.1"
        | "gpt-4.1-mini"
        | "gpt-4.1-nano"
        | "gpt-4o"
        | "gpt-4o-mini"
        | "gpt-image-1"
        | "gpt-image-1-mini"
        | "o3"
      >
    | undefined {
    const model = mo as OpenAiModelIdUnion;
    if (imgGenEnabled === false) return undefined;
    if (!imgFields) return undefined;
    if (
      model === "gpt-3.5-turbo" ||
      model === "gpt-4" ||
      model === "gpt-4-turbo" ||
      model === "gpt-5-codex" ||
      model === "o3-mini" ||
      model === "o1" ||
      model === "o3-deep-research" ||
      model === "o4-mini-deep-research" ||
      model === "o4-mini" ||
      model === "o3-pro" ||
      model === "chatgpt-4o-latest" ||
      model === "sora-2" ||
      model === "sora-2-pro" ||
      model === "o1-pro"
    ) {
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
          (this.handleImgGenOutputQuality("openai", model, {
            output_quality
          }) as "auto" | "hd" | "standard" | undefined) ?? ("auto" as const),
        output_size:
          (this.handleOutputSize("openai", model, { output_size }) as
            | "auto"
            | "1024x1024"
            | "1792x1024"
            | "1024x1792"
            | undefined) ?? ("auto" as const),
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
        n: this.handleImgGenCount("openai", model, { n }) ?? 1,
        model: "dall-e-2" as const,
        output_quality:
          (this.handleImgGenOutputQuality("openai", model, {
            output_quality
          }) as "auto" | "standard" | undefined) ?? ("auto" as const),
        output_size:
          (this.handleOutputSize("openai", model, { output_size }) as
            | "auto"
            | "256x256"
            | "512x512"
            | "1024x1024"
            | undefined) ?? ("auto" as const),
        targetApi: "images" as const
      };
      return dalle2Opts satisfies ImgGenWorkupResRT<"dall-e-2">;
    }

    const moderate = (moderation as "low" | "auto" | undefined) ?? "low";
    const outputFormat =
      (output_format as "jpeg" | "webp" | "png" | undefined) ??
      ("png" as const);
    const bg = this.handleImgGenBg("openai", model, {
      background: output_background,
      format: outputFormat
    });
    const sharedOpts = {
      input_image_mask,
      isPureImgGenModel:
        (pureImgGenModel ?? model === "gpt-image-1")
          ? true
          : model === "gpt-image-1-mini"
            ? true
            : false,
      msgBoundImgAssets,
      n: this.handleImgGenCount("openai", model, { n }),
      moderation: moderate,
      output_format: outputFormat,
      output_compression: this.handleImgGenCompression("openai", model, {
        output_compression,
        output_format
      }),
      model: model,
      output_quality:
        (this.handleImgGenOutputQuality("openai", model, { output_quality }) as
          | "low"
          | "auto"
          | "high"
          | "standard"
          | "hd"
          | "medium"
          | undefined) ?? ("high" as const),
      output_size:
        (this.handleOutputSize("openai", model, { output_size }) as
          | "1536x1024"
          | "1024x1536"
          | "1024x1024"
          | undefined) ?? ("auto" as const),
      output_background: bg,
      targetApi:
        this.imageGenToolCompat(model) === true
          ? ("responses" as const)
          : ("images" as const),
      partialImagesRequested: this.handlePartialImgGen("openai", model, {
        partialImagesRequested: output_partial_images
      }),
      input_fidelity:
        input_fidelity && msgBoundImgAssets
          ? this.handleInputFidelity("openai", model, { input_fidelity })
          : undefined
    };
    console.log(sharedOpts);
    return sharedOpts as ImgGenWorkupResRT<typeof model>;
  }
  public async ensureAssetUploadedToOpenAI(
    attachment: {
      id: string;
      cdnUrl: string | null;
      compatStatus: "FAILED" | "PENDING" | "ACTIVE" | "ALIASED" | null;
      compatCdnUrl: string | null;
      compatMime: string | null;
      filename: string | null;
      mime: string | null;
    },
    client: OpenAI,
    keyFingerprint = "server",
    keyId?: string
  ): Promise<{ file_id: string }> {
    const url =
      attachment.compatStatus === "ACTIVE"
        ? attachment.compatCdnUrl
        : attachment.cdnUrl;

    const mime =
      attachment.compatStatus === "ACTIVE"
        ? attachment.compatMime
        : attachment.mime;
    if (!url) throw new Error("Attachment has no CDN URL");

    // 1) Reuse if we already uploaded this asset for this key fingerprint
    const existing = await this.prisma.findActiveOpenAIAsset(
      attachment.id,
      keyFingerprint
    );
    if (existing?.providerRef) {
      // IMPORTANT: return ONLY file_id; do NOT include filename alongside file_id
      return { file_id: existing.providerRef };
    }

    // 2) Create mapping (PENDING)
    const mapping = await this.prisma.upsertOpenAIAssetMapping(
      attachment.id,
      keyFingerprint,
      mime ?? "application/octet-stream",
      keyId
    );

    try {
      const resp = await fetch(url, { method: "GET" });
      if (!resp.ok) {
        throw new Error(
          `Failed to fetch ${url}: ${resp.status} ${resp.statusText}`
        );
      }

      const file = await toFile(resp, attachment.filename ?? "upload.bin", {
        type:
          mime ?? mapping.mime ?? resp.headers.get("Content-Type") ?? undefined
      });

      const uploaded = await client.files.create({
        file,
        purpose: "user_data"
      });

      // 6) Finalize mapping
      await this.prisma.finalizeOpenAIAsset(
        mapping.id,
        uploaded.id,
        BigInt(uploaded.bytes ?? 0)
      );

      // 7) Return ONLY file_id (no filename here)
      return { file_id: uploaded.id };
    } catch (err) {
      await this.prisma.markOpenAIAssetFailed(
        mapping.id,
        err instanceof Error ? err.message : this.safeErrMsg(err)
      );
      throw err;
    }
  }

  public mapPartialImgGenArr(props: ImageGenPartialArr[]) {
    return props.map((t, o) => {
      return {
        index: t[0] ?? o,
        cdnUrl: t[1],
        width: t[3],
        height: t[4],
        mime: t[5]
      };
    });
  }

  public getGenMime(target: string) {
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
  public async generateId(target: "itemId" | "generationGroupId") {
    const { nanoid } = await import("nanoid");
    if (target === "generationGroupId") {
      const generationGroupId = "resp_" + nanoid();
      return generationGroupId;
    } else return nanoid();
  }
  public mapPersistenceImgGenArr(userId: string, props: ImageGenPartialArr[]) {
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

  public transformConvoSingleton(data: ConversationSingleton<true>) {
    const cdnUrls = Array.of<string>();
    const timeAndIndexArr = Array.of<readonly [number, number]>();
    try {
      for (const alpha of data.messages) {
        if (!alpha.attachments) continue;
        for (const beta of alpha.attachments) {
          if (beta.cdnUrl) cdnUrls.push(beta.cdnUrl);
          continue;
        }
      }
    } finally {
      for (const url of cdnUrls) {
        const p = url.split(/\//gm);
        const filename = p.at(-1);
        if (!filename) continue;
        const pathFragments = filename.split(/-/gm);

        const timestamp = pathFragments[0];
        const seriesIndex = pathFragments?.[2]?.split(".")?.[0];

        if (!timestamp || !seriesIndex) continue;
        timeAndIndexArr.push([
          Number.parseInt(timestamp),
          Number.parseInt(seriesIndex)
        ]);
        continue;
      }
      const sorted = timeAndIndexArr
        .sort(([_aa, aaa], [_bb, bbb]) => aaa - bbb)
        .sort(([aa, _aaa], [bb, _bbb]) => aa - bb);

      return sorted.map((t, o) =>
        o === sorted.length - 1
          ? [t[0], "FINAL" as const, t[1]]
          : [t[0], "PARTIAL" as const, t[1]]
      ) as [number, "PARTIAL" | "FINAL", number][];
    }
  }

  public mapToCompletionImgGenArr(props: AIChatResRT, userMsgId: string, revisedPrompt?: string) {

    const s = props.messages[0];

    if (!s) throw new Error("returned db res has no attachments for image gen");

    return s.attachments.map((t, o) => {
      const p = t.cdnUrl?.split(/\//gm);
      const filename = p?.at(-1);
      const ext = filename?.split(".")?.at(-1) ?? null;
      const pathFragments = filename?.split(/-/gm);
      const _timestamp = pathFragments?.[0];
      const seriesId = pathFragments?.[1] ?? null;
      const seriesIndex = pathFragments?.[2]?.split(".")?.[0];
      const kind = o === s.attachments?.length - 1 ? "FINAL" : "PARTIAL";
      return {
        cdnUrl: t.cdnUrl ?? "",
        seriesId: t.seriesId ?? seriesId,
        width: t.image?.width ?? 0,
        height: t.image?.height ?? 0,
        checksumSha256: t.checksumSha256,
        compatCdnUrl: t.cdnUrl,
        compatExt: t.ext ?? ext,
        compatKey: t.key,
        compatMime: t.mime,
        compatReadyAt: t.s3LastModified,
        compatS3ObjectId: t.s3ObjectId,
        compatStatus: "ALIASED",
        compatVersionId: t.versionId,
        createdAt: t.createdAt,
        deletedAt: t.deletedAt,
        index: seriesIndex,
        itemId: t.seriesId ?? "",
        origin: "GENERATED",
        publicUrl: t.publicUrl,
        region: t.region,
        sourceUrl: t.sourceUrl,
        status: "READY",
        thumbnailKey: t.thumbnailKey,
        updatedAt: t.updatedAt,
        userId: t.userId,
        batchId: t.batchId,
        checksumAlgo: t.checksumAlgo,
        expiresAt: t?.expiresAt,
        jobId: t.imageGenOutput?.jobId,
        s3LastModified: t.s3LastModified,
        size: t.size ? Number(t.size) : null,
        sseAlgorithm: t.sseAlgorithm,
        sseKmsKeyId: t.sseKmsKeyId,
        storageClass: t.storageClass,
        uploadDuration: t.uploadDuration,
        requestMessageId: userMsgId,
        revisedPrompt,
        seriesIndex: o,
        draftId: t.draftId,
        cacheControl: t.cacheControl,
        mime: t.mime ?? "",
        assetType: t.assetType,
        conversationId: t.conversationId,
        id: t.id,
        messageId: t.messageId,
        uploadMethod: "GENERATED",
        contentDisposition: t.contentDisposition,
        contentEncoding: t.contentEncoding,
        document: null,
        bucket: t.bucket,
        generationGroupId: t.generationGroupId ?? "",
        jobIndex: 0,
        key: t.key,
        s3ObjectId: t.s3ObjectId ?? "",
        versionId: t.versionId ?? "",
        etag: t.etag,
        ext: t.ext,
        filename: t.filename,
        image: t.image,
        imageGenOutput: t.imageGenOutput,
        kind: t.imageGenOutput?.kind ?? kind
      } as const;
    });
  }

  public async buildAttachmentContentAsync(
    attachments?: MessageSingleton<true>["attachments"],
    client?: OpenAI,
    keyFingerprint = "server",
    keyId?: string
  ) {
    const content = Array.of<
      | {
          type: "input_image";
          image_url: string;
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
      const filename =
        att.compatStatus === "ACTIVE"
          ? this.filenameToCompat(att.filename, att.compatExt)
          : att.filename;
      if (!url) continue;

      if (mime.startsWith("image/")) {
        content.push({ type: "input_image", image_url: url, detail: "auto" });
      } else {
        const { file_id } = await this.ensureAssetUploadedToOpenAI(
          {
            id: att.id,
            cdnUrl: url,
            compatCdnUrl: att.compatCdnUrl,
            compatMime: att.compatMime,
            compatStatus: att.compatStatus,
            filename,
            mime
          },
          client,
          keyFingerprint,
          keyId ?? undefined
        );

        content.push({ type: "input_file", file_id });
      }
    }
    return content;
  }

  // openai/index.ts
  public async formatOpenAiWithUploads(
    isNewChat: boolean,
    msgs: MessageSingleton<true>[],
    client: OpenAI,
    keyFingerprint = "server",
    keyId?: string
  ) {
    if (isNewChat) {
      const first = msgs[0];
      if (!first)
        return [{ role: "user", content: "" }] as const satisfies ResponseInput;
      const attContent = await this.buildAttachmentContentAsync(
        first.attachments,
        client,
        keyFingerprint,
        keyId
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
      const history = this.prependProviderModelTag(msgs.slice(0, -1));
      const last = msgs.at(-1);
      if (last?.senderType === "USER") {
        const attContent = await this.buildAttachmentContentAsync(
          last.attachments,
          client,
          keyFingerprint,
          keyId
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
  public prependProviderModelTag(
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

  public buildInstructions(systemPrompt?: string) {
    return systemPrompt
      ? `${systemPrompt}\n\nWhen formatting codeblocks, always fence them with proper language tags using backticks not tildes.\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.`
      : "When formatting codeblocks, always fence them with proper language tags using backticks not tildes.\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";
  }

  public ensureUserVectorStoreId(
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
  public hasFiles(
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
  public hasImages(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    return formatted.some(m => {
      if (typeof m.content === "string") return false;
      if (m.role !== "user") return false;
      return m.content.some(
        t => t.type === "input_image" && typeof t?.image_url !== "undefined"
      );
    });
  }
  public fileIds(
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

  public buildAttachmentContent(
    attachments?: MessageSingleton<true>["attachments"]
  ) {
    const content = Array.of<
      | {
          type: "input_image";
          image_url: string;
          detail: "auto" | "low" | "high";
        }
      | {
          type: "input_file";
          file_url?: string;
          filename?: string;
          file_id?: string | null;
          file_data?: string;
        }
    >();
    if (!attachments || attachments.length === 0) return content;

    for (const att of attachments) {
      const url = att.compatCdnUrl ?? att.cdnUrl ?? att.sourceUrl;
      const mime = att.compatMime ?? att.mime ?? "";
      const filename =
        att.compatStatus === "ACTIVE"
          ? this.filenameToCompat(att.filename, att.compatExt)
          : att.filename;
      if (!url || url.length === 0) continue;

      if (mime.startsWith("image/")) {
        content.push({ type: "input_image", image_url: url, detail: "auto" });
      } else {
        content.push({
          type: "input_file",
          file_url: url,
          filename: filename ?? undefined
        });
      }
    }
    return content;
  }

  public filenameToCompat(filename: string | null, compatExt: string | null) {
    if (!filename) {
      return `filename-${Date.now()}.${compatExt ?? "pdf"}`;
    }
    const splitIt = filename.split(/\./g);
    const l = splitIt.length;
    return splitIt
      .map((t, o) => {
        if (o === l - 1) {
          if (compatExt) return compatExt;
          else return "pdf";
        } else return t;
      })
      .join(".");
  }

  public formatMsgs(
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

  public normalizeLocation(
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

  public handleTooling(
    model: OpenAiModelIdUnion,
    hasFiles: boolean,
    user_location?: OpenAI.Responses.WebSearchPreviewTool.UserLocation,
    vector_store_ids?: string[],
    imgGenEnabled = false,
    imgGen?: OpenAI.Responses.Tool.ImageGeneration
  ) {
    const pureImgModel = this.canCallImageApi(model);
    if (hasFiles && vector_store_ids && vector_store_ids.length >= 1) {
      if (imgGenEnabled === true && imgGen && pureImgModel === false) {
        return [{ ...imgGen }] satisfies OpenAI.Responses.Tool[];
      }
      return [
        { type: "file_search", vector_store_ids },
        {
          type: "web_search_preview",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[];
    } else {
      if (imgGenEnabled === true && imgGen && pureImgModel === false) {
        return [{ ...imgGen }] satisfies OpenAI.Responses.Tool[];
      }
      return [
        {
          type: "web_search_preview",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[];
    }
  }

  public openaiReasoning(
    model: OpenAiModelIdUnion,
    effort: Reasoning["effort"] = "medium",
    summary: Reasoning["summary"] = "auto",
    imgGenEnabled = false
  ) {
    switch (model) {
      // gpt-5-pro is required to have high effort for reasoning and a detailed summary
      case "gpt-5-pro": {
        return { effort: "high", summary: "detailed" } as const;
      }
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-nano":
      case "gpt-5-chat-latest":
      case "o3": {
        if (imgGenEnabled) {
          return { effort: "minimal" } satisfies Reasoning;
        }
        return { effort, summary } satisfies Reasoning;
      }
      case "gpt-5-codex":
      case "o1":
      case "o3-mini":
      case "o3-pro":
      case "o1-pro":
      case "o3-deep-research":
      case "o4-mini-deep-research":
      case "o4-mini": {
        return { effort, summary } satisfies Reasoning;
      }
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4-turbo":
      case "gpt-4.1":
      case "gpt-4.1-mini":
      case "gpt-4.1-nano":
      case "gpt-4o":
      case "sora-2":
      case "sora-2-pro":
      case "chatgpt-4o-latest":
      case "gpt-4o-mini":
      case "dall-e-2":
      case "dall-e-3":
      case "gpt-image-1":
      case "gpt-image-1-mini":
      default: {
        return undefined;
      }
    }
  }

  public canCallImageApi(model: OpenAiModelIdUnion) {
    switch (model) {
      case "gpt-image-1":
      case "gpt-image-1-mini":
      case "dall-e-2":
      case "dall-e-3": {
        return true;
      }
      case "gpt-5-pro":
      case "gpt-5-codex":
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-nano":
      case "gpt-4.1":
      case "gpt-4.1-mini":
      case "gpt-4.1-nano":
      case "o3":
      case "gpt-4o":
      case "gpt-4o-mini":
      case "o3-mini":
      case "o3-pro":
      case "o4-mini":
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4-turbo":
      default: {
        return false;
      }
    }
  }

  public imageGenToolCompat(model: OpenAiModelIdUnion) {
    switch (model) {
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-nano":
      case "gpt-4.1":
      case "gpt-4.1-mini":
      case "gpt-4.1-nano":
      case "gpt-5-pro":
      case "o3":
      case "gpt-4o":
      case "gpt-5-chat-latest":
      case "gpt-4o-mini": {
        return true;
      }
      case "dall-e-2":
      case "dall-e-3":
      case "gpt-image-1":
      case "gpt-image-1-mini":
      case "gpt-5-codex":
      case "chatgpt-4o-latest":
      case "o1":
      case "o1-pro":
      case "o3-deep-research":
      case "o4-mini-deep-research":
      case "sora-2":
      case "sora-2-pro":
      case "o3-mini":
      case "o3-pro":
      case "o4-mini":
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4-turbo":
      default: {
        return false;
      }
    }
  }

  public openAiVerbosity(
    model: OpenAiModelIdUnion,
    verbosity?: string,
    imgGenEnabled = false
  ) {
    switch (model) {
      case "gpt-5-pro": {
        return { verbosity: "high" } as const;
      }
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-chat-latest":
      case "gpt-5-codex":
      case "gpt-5-nano": {
        if (imgGenEnabled) {
          return { verbosity: "low" } satisfies ResponseTextConfig;
        }
        const v = verbosity
          ? (verbosity as ResponseTextConfig["verbosity"])
          : ("medium" satisfies ResponseTextConfig["verbosity"]);
        return { verbosity: v } satisfies ResponseTextConfig;
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
      case "gpt-4o-mini":
      default: {
        return undefined;
      }
    }
  }
}
