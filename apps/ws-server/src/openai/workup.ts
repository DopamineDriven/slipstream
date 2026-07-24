import { createReadStream } from "node:fs";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderOpenaiRequestEntity } from "@/types/index.ts";
import type { OpenAI } from "openai";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import { OpenAIBaseService } from "@/openai/base.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AttachmentSingleton,
  LocalToolName,
  MessageSingleton,
  OpenAiModelIdUnion
} from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class OpenAIServiceWorkup extends OpenAIBaseService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    apiKey: string,
    s3: S3Storage
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3);
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

  protected messageText(
    msg: Pick<MessageSingleton<true>, "content" | "messageBlocks">
  ) {
    const textBlocks = Array.of<string>();

    if (msg.messageBlocks && msg.messageBlocks.length > 0) {
      for (const block of msg.messageBlocks) {
        if (block.type === "TEXT") {
          textBlocks.push(block.content);
        }
      }
    }

    if (textBlocks.length > 0) {
      return textBlocks.join("\n");
    }

    return msg.content;
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

  protected userStoreSearchFunctionTool() {
    return this.prisma.fileSearchToolOpenAI("user_store_search");
  }

  protected memorySearchFunctionTool() {
    return this.prisma.memorySearchToolOpenAI();
  }

  protected memoryGetChunkFunctionTool() {
    return this.prisma.memoryGetChunkToolOpenAI();
  }

  /**
   * Local read-only tool bridge (Sovereign CLI) — canonical definitions
   * mapped into the OpenAI Responses function-tool dialect. The contract's
   * CanonicalSchemaProperty is the portable intersection, so this is a
   * near-identity map (parameters === inputSchema, strict:false to allow
   * the optional fields). Empty when the CLI advertises nothing.
   */
  protected localToolFunctionTools(names: readonly LocalToolName[]) {
    const advertised = new Set<string>(names);
    return LOCAL_TOOL_DEFINITIONS.filter(d => advertised.has(d.name)).map(
      d =>
        ({
          type: "function",
          name: d.name,
          description: d.description,
          strict: false,
          parameters: {
            type: "object",
            properties: d.inputSchema.properties,
            required:
              "required" in d.inputSchema && d.inputSchema.required
                ? [...d.inputSchema.required]
                : [],
            additionalProperties: false
          }
        }) satisfies OpenAI.Responses.FunctionTool
    );
  }

  protected handleTooling(
    model: OpenAiModelIdUnion,
    fileSearchEnabled: boolean,
    user_location?: OpenAI.Responses.WebSearchPreviewTool.UserLocation,
    vector_store_ids?: string[],
    imgGenEnabled = false,
    imgGen?: OpenAI.Responses.Tool.ImageGeneration,
    localFileSearchEnabled = false,
    /**
     * local read-only bridge tools (repo_search/read_file/list_directory) —
     * orthogonal to every branch below, appended last so they compose with
     * whatever tool set the branch selects
     */
    localToolNames: readonly LocalToolName[] = []
  ) {
    const localTools = this.localToolFunctionTools(localToolNames);
    const withLocal = (tools: OpenAI.Responses.Tool[]) =>
      localTools.length > 0 ? [...tools, ...localTools] : tools;
    const pureImgModel = this.canCallImageApi(model);
    // memory tools attach unconditionally — conversation memory exists
    // independently of uploaded documents
    if (localFileSearchEnabled) {
      return withLocal([
        this.userStoreSearchFunctionTool(),
        this.memorySearchFunctionTool(),
        this.memoryGetChunkFunctionTool(),
        {
          type: "web_search",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[]);
    }
    if (fileSearchEnabled && vector_store_ids && vector_store_ids.length >= 1) {
      if (imgGenEnabled === true && imgGen && pureImgModel === false) {
        // memory rides the img-gen flow too — facilitators (gpt-5.5 et al.)
        // think + write + recall while recruiting gpt-image-2
        return withLocal([
          imgGen,
          this.memorySearchFunctionTool(),
          this.memoryGetChunkFunctionTool(),
          {
            type: "web_search",
            user_location
          }
        ] satisfies OpenAI.Responses.Tool[]);
      }
      return withLocal([
        { type: "file_search", vector_store_ids, max_num_results: 10 },
        this.memorySearchFunctionTool(),
        this.memoryGetChunkFunctionTool(),
        {
          type: "web_search",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[]);
    } else {
      if (imgGenEnabled === true && imgGen && pureImgModel === false) {
        return withLocal([
          imgGen,
          this.memorySearchFunctionTool(),
          this.memoryGetChunkFunctionTool()
        ] satisfies OpenAI.Responses.Tool[]);
      }
      return withLocal([
        this.memorySearchFunctionTool(),
        this.memoryGetChunkFunctionTool(),
        {
          type: "web_search",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[]);
    }
  }
}
