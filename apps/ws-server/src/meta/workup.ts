import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type {
  MetaAttachmentRef,
  MetaFreshAssetSelection,
  MetaUserLocation
} from "@/meta/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { OpenAI } from "openai";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import { MetaStoreService } from "@/meta/store.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AttachmentSingleton,
  LocalToolName,
  MessageSingleton
} from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class MetaWorkupService extends MetaStoreService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    apiKey: string,
    s3: S3Storage,
    memoryService: ConversationMemoryVectorService
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3, memoryService);
  }

  protected normalizeLocation(user_location?: MetaUserLocation) {
    return (
      user_location
        ? {
            type: "approximate" as const,
            city: user_location.city ?? null,
            country: user_location.country ?? null,
            region: user_location.region ?? null,
            timezone:
              user_location.timezone ??
              (user_location.tz ? decodeURIComponent(user_location.tz) : null)
          }
        : undefined
    ) satisfies OpenAI.Responses.WebSearchTool.UserLocation | null | undefined;
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

  private MetaAttachmentRef(attachment: AttachmentSingleton<true>) {
    const activeCompat = attachment.compatStatus === "ACTIVE";
    const url =
      activeCompat && attachment.compatCdnUrl
        ? attachment.compatCdnUrl
        : (attachment.cdnUrl ?? attachment.sourceUrl);
    const mime =
      activeCompat && attachment.compatMime
        ? attachment.compatMime
        : (attachment.mime ?? attachment.compatMime);

    if (!url || !mime) {
      return;
    }

    return {
      attachment,
      filename: attachment.filename ?? "attachment",
      mime,
      url
    } satisfies MetaAttachmentRef;
  }

  private isMetaDocument(ref: MetaAttachmentRef) {
    return (
      ref.attachment.assetType === "DOCUMENT" && ref.mime === "application/pdf"
    );
  }

  private isMetaImage(ref: MetaAttachmentRef) {
    return (
      ref.attachment.assetType === "IMAGE" &&
      (ref.mime === "image/jpeg" ||
        ref.mime === "image/png" ||
        ref.mime === "image/webp")
    );
  }

  private markdownLabel(filename: string) {
    return filename.replaceAll("[", "\\[").replaceAll("]", "\\]");
  }

  private attachmentMarkdown(ref: MetaAttachmentRef) {
    const label = this.markdownLabel(ref.filename);
    if (ref.attachment.assetType === "IMAGE") {
      return `![${label}](${ref.url})`;
    }

    return `[${label}](${ref.url})`;
  }

  private attachmentOccurrenceKey(
    msg: MessageSingleton<true>,
    attachment: AttachmentSingleton<true>
  ) {
    return `${msg.id}:${attachment.id}`;
  }

  private selectFreshAssets(
    msgs: MessageSingleton<true>[]
  ): MetaFreshAssetSelection {
    const lastMetaIndex = msgs.findLastIndex(
      msg => msg.provider === "META" && msg.senderType === "AI"
    );
    const previouslySeenAttachmentIds = new Set<string>();

    if (lastMetaIndex !== -1) {
      for (const msg of msgs.slice(0, lastMetaIndex + 1)) {
        for (const attachment of msg.attachments) {
          previouslySeenAttachmentIds.add(attachment.id);
        }
      }
    }

    const inlineAttachmentKeys = new Set<string>();
    const selectedAttachmentIds = new Set<string>();
    let documentCount = 0;
    let imageCount = 0;

    for (let msgIndex = msgs.length - 1; msgIndex > lastMetaIndex; msgIndex--) {
      const msg = msgs[msgIndex];
      if (!msg?.senderType || msg.senderType !== "USER") continue;

      for (
        let attachmentIndex = msg.attachments.length - 1;
        attachmentIndex >= 0;
        attachmentIndex--
      ) {
        const attachment = msg.attachments[attachmentIndex];
        if (!attachment) continue;
        if (previouslySeenAttachmentIds.has(attachment.id)) continue;
        if (selectedAttachmentIds.has(attachment.id)) continue;

        const ref = this.MetaAttachmentRef(attachment);
        if (!ref) continue;

        if (this.isMetaDocument(ref) && documentCount < 1) {
          inlineAttachmentKeys.add(
            this.attachmentOccurrenceKey(msg, attachment)
          );
          selectedAttachmentIds.add(attachment.id);
          documentCount += 1;
        } else if (this.isMetaImage(ref) && imageCount < 3) {
          inlineAttachmentKeys.add(
            this.attachmentOccurrenceKey(msg, attachment)
          );
          selectedAttachmentIds.add(attachment.id);
          imageCount += 1;
        }

        if (documentCount === 1 && imageCount === 3) {
          return { inlineAttachmentKeys } satisfies MetaFreshAssetSelection;
        }
      }
    }

    return { inlineAttachmentKeys } satisfies MetaFreshAssetSelection;
  }

  private shouldInlineAttachment(
    msg: MessageSingleton<true>,
    attachment: AttachmentSingleton<true>,
    selection: MetaFreshAssetSelection
  ) {
    return selection.inlineAttachmentKeys.has(
      this.attachmentOccurrenceKey(msg, attachment)
    );
  }

  private formatAssistantMessage(msg: MessageSingleton<true>) {
    const textParts = Array.of<string>();
    const text = this.messageText(msg);
    const provider = msg.provider.toLowerCase();
    const model = msg.model ?? "unknown";

    textParts.push(`[${provider}/${model}]\n${text}`);

    for (const attachment of msg.attachments) {
      const ref = this.MetaAttachmentRef(attachment);
      if (!ref) continue;
      textParts.push(this.attachmentMarkdown(ref));
    }

    return {
      role: "assistant",
      content: textParts.join("\n\n")
    } as const satisfies OpenAI.Responses.EasyInputMessage;
  }

  private formatUserMessage(
    msg: MessageSingleton<true>,
    selection: MetaFreshAssetSelection
  ) {
    const content = Array.of<OpenAI.Responses.ResponseInputContent>();
    const textParts = Array.of<string>();

    for (const attachment of msg.attachments) {
      const ref = this.MetaAttachmentRef(attachment);
      if (!ref) continue;

      if (this.shouldInlineAttachment(msg, attachment, selection)) {
        if (this.isMetaDocument(ref)) {
          content.push({
            type: "input_file",
            file_url: ref.url,
            filename: ref.filename,
            detail: "high"
          } satisfies OpenAI.Responses.ResponseInputFile);
          continue;
        }

        if (this.isMetaImage(ref)) {
          content.push({
            type: "input_image",
            image_url: ref.url,
            detail: "high"
          } satisfies OpenAI.Responses.ResponseInputImage);
          continue;
        }
      }

      textParts.push(this.attachmentMarkdown(ref));
    }

    const text = this.messageText(msg);
    if (text.length > 0) {
      textParts.push(text);
    }

    content.push({
      type: "input_text",
      text: textParts.join("\n\n")
    } satisfies OpenAI.Responses.ResponseInputText);

    return {
      role: "user",
      content
    } satisfies OpenAI.Responses.EasyInputMessage;
  }

  protected async formatMetaInput(msgs: MessageSingleton<true>[]) {
    if (msgs.length === 0) {
      return [{ role: "user", content: "" }] as const satisfies ResponseInput;
    }

    // HMEM substitution assembly (Part II §2)
    const memoryView = await this.memoryService.getHistoryAssemblyView(
      msgs[0]?.conversationId,
      msgs.reduce((max, m) => (m.ordinal >= max ? m.ordinal + 1 : max), 0)
    );
    const selection = this.selectFreshAssets(msgs);
    const input = Array.of<OpenAI.Responses.ResponseInputItem>();

    for (const msg of msgs) {
      const claim = memoryView?.claim(msg.ordinal);
      if (claim) {
        if (claim.emit != null) {
          input.push({
            role: "assistant",
            content: claim.emit
          } satisfies OpenAI.Responses.EasyInputMessage);
        }
        continue;
      }
      if (msg.senderType === "USER") {
        input.push(this.formatUserMessage(msg, selection));
      } else {
        input.push(this.formatAssistantMessage(msg));
      }
    }

    return input satisfies ResponseInput;
  }

  /**
   * Local read-only tool bridge (Sovereign CLI) — canonical definitions
   * mapped into the OpenAI Responses function-tool dialect fugu rides
   * (near-identity: parameters === inputSchema, strict:false to allow the
   * optional fields). The `"required" in d.inputSchema` narrowing is
   * mandatory — list_directory's as-const literal genuinely lacks the key.
   * Empty when the CLI advertises nothing.
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

  protected MetaTools(
    hasUserStoreDocs: boolean,
    user_location?: OpenAI.Responses.WebSearchTool.UserLocation,
    /**
     * local read-only bridge tools (repo_search/read_file/list_directory) —
     * appended last so they compose with whatever the branch selects
     */
    localToolNames: readonly LocalToolName[] = []
  ) {
    // tool_search deliberately absent: api.meta.ai 400s it unless at least
    // one tool is marked deferred ("tools.tool_search requires at least one
    // deferred tool") — re-add alongside a deferred-tool strategy
    const tools = Array.of<OpenAI.Responses.Tool>({
      type: "web_search",
      search_context_size: "high",
      user_location
    });

    if (hasUserStoreDocs) {
      tools.unshift(this.fileSearchFunctionTool());
    }

    // memory tools attach unconditionally — conversation memory exists
    // independently of uploaded documents
    tools.push(
      this.memorySearchFunctionTool(),
      this.memoryGetChunkFunctionTool(),
      ...this.localToolFunctionTools(localToolNames)
    );

    return tools;
  }
}
