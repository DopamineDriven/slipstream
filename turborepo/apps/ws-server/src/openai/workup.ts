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
import { PrismaService } from "@/prisma/index.ts";
import type { OpenAiModelIdUnion } from "@slipstream/types";

export class OpenAIServiceWorkup extends ModelService {
  protected readonly vsCache = new Map<string, string>();
  protected readonly inflightVS = new Map<string, Promise<string>>();
  constructor(protected prisma: PrismaService) {
    super();
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

  public formatOpenAi(isNewChat: boolean, msgs: MessageSingleton<true>[]) {
    if (isNewChat) {
      const first = msgs[0];
      if (!first) {
        return [{ role: "user", content: "" }] as const satisfies ResponseInput;
      }
      const attContent = this.buildAttachmentContent(first.attachments);
      if (attContent.length > 0) {
        return [
          {
            role: "user",
            content: [
              ...attContent,
              { type: "input_text", text: first.content }
            ]
          }
        ] as const satisfies ResponseInput;
      }
      return [
        { role: "user", content: first.content }
      ] as const satisfies ResponseInput;
    } else {
      const history = this.prependProviderModelTag(msgs.slice(0, -1));
      const last = msgs.at(-1);
      if (last?.senderType === "USER") {
        const attContent = this.buildAttachmentContent(last.attachments);
        if (attContent.length > 0) {
          return [
            ...history,
            {
              role: "user",
              content: [
                ...attContent,
                { type: "input_text", text: last.content }
              ]
            }
          ] as const satisfies ResponseInput;
        } else {
          return [
            ...history,
            { role: "user", content: last.content }
          ] as const satisfies ResponseInput;
        }
      }
      return this.formatMsgs(this.prependProviderModelTag(msgs));
    }
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
    vector_store_ids?: string[]
  ) {
    // TODO determine where/when to incorporate Image Gen Tool
    const _imageGenToolingCompat = this.imageGenToolCompat(model);
    if (hasFiles && vector_store_ids && vector_store_ids.length >= 1) {
      // if (imageGenToolingCompat) {
      //   return [
      //   { type: "file_search", vector_store_ids },
      //   {
      //     type: "web_search_preview",
      //     user_location
      //   },
      //   {type: "image_generation",  input_image_mask: {file_id: ""} satisfies OpenAI.Responses.Tool.ImageGeneration.InputImageMask}
      // ] satisfies OpenAI.Responses.Tool[];
      // }
      return [
        { type: "file_search", vector_store_ids },
        {
          type: "web_search_preview",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[];
    } else {
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
    summary: Reasoning["summary"] = "auto"
  ) {
    switch (model) {
      // gpt-5-pro is required to have high effort for reasoning and a detailed summary
      case "gpt-5-pro": {
        return { effort: "high", summary: "detailed" } as const;
      }
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-nano":
      case "gpt-5-codex":
      case "o3":
      case "o3-mini":
      case "o3-pro":
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
      case "o3":
      case "gpt-4o":
      case "gpt-4o-mini": {
        return true;
      }
      case "gpt-5-pro":
      case "gpt-5-codex":
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

  public openAiVerbosity(model: OpenAiModelIdUnion, verbosity?: string) {
    switch (model) {
      case "gpt-5-pro": {
        return { verbosity: "high" } as const;
      }
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-codex":
      case "gpt-5-nano": {
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
