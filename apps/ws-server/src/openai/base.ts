import { readFile } from "node:fs/promises";
import type { LoggerService } from "@/logger/index.ts";
import type { ImageGenPartialArr } from "@/openai/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import type { ResponseTextConfig } from "openai/resources/responses/responses.mjs";
import type { Reasoning, ReasoningEffort } from "openai/resources/shared.mjs";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AIChatRequest,
  AIChatResponseImgGenSubFields,
  AttachmentSingleton,
  ImgGenWorkupResRT,
  OpenAiModelIdUnion
} from "@slipstream/types";

export class OpenAIBaseService {
  protected readonly vsCache = new Map<string, string>();
  protected readonly inflightVS = new Map<string, Promise<string>>();
  protected nanoId: Promise<(typeof import("nanoid"))["nanoid"]>;
  protected assetCache = new Map<
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
    this.nanoId = import("nanoid").then(t => t.nanoid);
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
      m === "gpt-image-1" ||
      m === "gpt-image-1-mini" ||
      m === "gpt-image-1.5" ||
      m === "gpt-image-2"
    );
  }

  protected isDeepResearchModel(m: OpenAiModelIdUnion) {
    return (
      m === "gpt-5-pro" ||
      m === "gpt-5.2-pro" ||
      m === "gpt-5.4-pro" ||
      m === "o1-pro" ||
      m === "o3-pro" ||
      m === "o3-deep-research" ||
      m === "o4-mini-deep-research"
    );
  }

  protected isOpenAIModel(m: string) {
    return (
      m === "gpt-5.4-mini" ||
      m === "gpt-5.4-nano" ||
      m === "gpt-4.1" ||
      m === "gpt-4.1-mini" ||
      m === "gpt-4.1-nano" ||
      m === "gpt-5" ||
      m === "gpt-5.2-chat-latest" ||
      m === "gpt-5.1-chat-latest" ||
      m === "o4-mini" ||
      m === "gpt-5-chat-latest" ||
      m === "gpt-5-mini" ||
      m === "gpt-5-nano" ||
      m === "gpt-5-pro" ||
      m === "gpt-5.1" ||
      m === "gpt-5.2" ||
      m === "gpt-5.2-pro" ||
      m === "gpt-5.4" ||
      m === "gpt-5.4-pro" ||
      m === "o3" ||
      m === "gpt-4o" ||
      m === "gpt-4o-mini" ||
      m === "o1-pro" ||
      m === "o3-pro" ||
      m === "o3-deep-research" ||
      m === "o4-mini-deep-research" ||
      m === "gpt-image-1" ||
      m === "gpt-image-1-mini" ||
      m === "gpt-image-1.5" ||
      m === "gpt-image-2" ||
      m === "sora-2" ||
      m === "sora-2-pro" ||
      m === "gpt-5.3-codex" ||
      m === "gpt-5.2-codex" ||
      m === "gpt-5.1-codex-max" ||
      m === "gpt-5.1-codex-mini" ||
      m === "gpt-5.1-codex" ||
      m === "gpt-5-codex" ||
      m === "gpt-3.5-turbo" ||
      m === "gpt-4-turbo" ||
      m === "gpt-4" ||
      m === "o1" ||
      m === "o3-mini" ||
      m === "chatgpt-4o-latest"
    );
  }

  protected isImgGenFacilitating(m: OpenAiModelIdUnion) {
    return (
      m === "gpt-5.4-mini" ||
      m === "gpt-5.4-nano" ||
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
      m === "gpt-5.4" ||
      m === "gpt-5.4-pro" ||
      m === "o3" ||
      m === "gpt-4o" ||
      m === "gpt-4o-mini"
    );
  }

  protected isImgGenNative(m: string) {
    return (
      m === "gpt-image-1" ||
      m === "gpt-image-1-mini" ||
      m === "gpt-image-1.5" ||
      m === "gpt-image-2"
    );
  }

  protected isImgGenCapable(m: OpenAiModelIdUnion) {
    return this.isImgGenModel(m) || this.isImgGenFacilitating(m);
  }

  protected async generateId(target: "itemId" | "generationGroupId") {
    const nanoid = await this.nanoId;
    if (target === "generationGroupId") {
      const generationGroupId = "resp_" + nanoid();
      return generationGroupId;
    } else return nanoid();
  }
  protected async encodeImageAsDataUrl(attachment: AttachmentSingleton<true>) {
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
  protected responsesImgGen(
    imgGenEnabled: AIChatRequest["imgGenEnabled"],
    mo: AIChatRequest["model"] = "gpt-5.4",
    imgFields?: AIChatRequest["imgGenFields"],
    currentMsgBoundAssets?: ProviderOpenaiRequestEntity["currentMsgBoundAssets"]
  ) {
    const model = mo;
    if (imgGenEnabled === false) return undefined;
    if (!imgFields) return undefined;
    if (!this.prisma.openAIImgGenCapable(model)) {
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
      pureImgGenModel,
      output_background,
      output_compression,
      output_format,
      output_partial_images,
      output_quality,
      output_size
    } = imgFields;

    const moderate = (moderation as "low" | "auto" | undefined) ?? "low";
    const outputFormat =
      (output_format as "jpeg" | "webp" | "png" | undefined) ??
      ("png" as const);
    const bg = this.prisma.handleImgGenBg(model, {
      background: output_background,
      format: outputFormat
    });
    const sharedOpts = {
      input_image_mask,
      isPureImgGenModel: pureImgGenModel ?? this.isImgGenModel(model),
      msgBoundImgAssets,
      n: this.prisma.handleImgGenCount(model, { n }),
      moderation: moderate,
      output_format: outputFormat,
      output_compression: this.prisma.handleImgGenCompression(model, {
        output_compression,
        output_format
      }),
      model: model,
      output_quality: this.prisma.handleImgGenOutputQuality(model, {
        output_quality:
          output_quality && this.prisma.isValidOpenAIQuality(output_quality)
            ? output_quality
            : "high"
      }),
      output_size: this.prisma.handleOutputSize(model, {
        output_size:
          output_size && this.prisma.isValidOpenAISize(output_size)
            ? output_size
            : "auto"
      }),
      output_background: bg,
      targetApi: this.isImgGenFacilitating(model)
        ? ("responses" as const)
        : ("images" as const),
      partialImagesRequested: this.prisma.handlePartialImgGen(model, {
        partialImagesRequested: output_partial_images
      }),
      input_fidelity:
        input_fidelity && msgBoundImgAssets
          ? this.prisma.handleInputFidelity("openai", model, { input_fidelity })
          : undefined
    };
    return sharedOpts as ImgGenWorkupResRT<typeof model>;
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

  protected isReasoningModel(m: OpenAiModelIdUnion) {
    return (
      m === "gpt-5.4" ||
      m === "gpt-5.4-mini" ||
      m === "gpt-5.4-nano" ||
      m === "gpt-5.2-codex" ||
      m === "gpt-5.3-codex" ||
      m === "gpt-5.4-pro" ||
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
      m === "gpt-image-2" ||
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
      case "gpt-5.2-codex":
      case "gpt-5.3-codex":
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
      case "gpt-5.2":
      case "gpt-5.4":
      case "gpt-5.4-mini":
      case "gpt-5.4-nano": {
        if (imgGenEnabled === true) {
          return { effort: "medium", summary } as const satisfies Reasoning;
        } else {
          if (
            effort === "xhigh" ||
            effort === "high" ||
            effort === "low" ||
            effort === "medium" ||
            effort === "none"
          ) {
            return { effort, summary } as const satisfies Reasoning;
          }
          if (m === "gpt-5.4-mini") {
            return { effort: "high", summary } as const satisfies Reasoning;
          }
          if (m === "gpt-5.4-nano") {
            return { effort: "medium", summary } as const satisfies Reasoning;
          } else {
            return { effort: "xhigh", summary } as const satisfies Reasoning;
          }
        }
      }
      case "gpt-5.4-pro":
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
      case "gpt-image-2":
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

  protected openAiVerbosity(
    model: OpenAiModelIdUnion,
    verbosity: ResponseTextConfig["verbosity"] = "medium",
    imgGenEnabled = false
  ) {
    switch (model) {
      case "gpt-5.4-mini":
      case "gpt-5.4-nano":
      case "gpt-5.2-codex":
      case "gpt-5.3-codex":
      case "gpt-5.4":
      case "gpt-5.4-pro":
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
      case "gpt-image-2":
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
      case "chatgpt-4o-latest":
      case "o1":
      case "o1-pro":
      case "sora-2-pro":
      case "sora-2":
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
