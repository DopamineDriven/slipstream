import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { OpenAI } from "openai";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import { SakanaStoreService } from "@/sakana/store.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { AttachmentSingleton, MessageSingleton } from "@slipstream/types";

export interface SakanaUserLocation {
  readonly type: "approximate";
  readonly city?: string;
  readonly region?: string;
  readonly country?: string;
  readonly timezone?: string;
  readonly tz?: string;
}

interface SakanaAttachmentRef {
  readonly attachment: AttachmentSingleton<true>;
  readonly filename: string;
  readonly mime: string;
  readonly url: string;
}

interface SakanaFreshAssetSelection {
  readonly inlineAttachmentKeys: ReadonlySet<string>;
}

export class SakanaWorkupService extends SakanaStoreService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    apiKey: string,
    s3: S3Storage
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3);
  }

  protected formatSystemInstruction(isNewChat: boolean, systemPrompt?: string) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return systemPrompt ? `${systemPrompt}\n\n${note}` : note;
  }

  protected normalizeLocation(user_location?: SakanaUserLocation) {
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

  private sakanaAttachmentRef(attachment: AttachmentSingleton<true>) {
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
    } satisfies SakanaAttachmentRef;
  }

  private isSakanaDocument(ref: SakanaAttachmentRef) {
    return (
      ref.attachment.assetType === "DOCUMENT" && ref.mime === "application/pdf"
    );
  }

  private isSakanaImage(ref: SakanaAttachmentRef) {
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

  private attachmentMarkdown(ref: SakanaAttachmentRef) {
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
  ): SakanaFreshAssetSelection {
    const lastSakanaIndex = msgs.findLastIndex(
      msg => msg.provider === "SAKANA" && msg.senderType === "AI"
    );
    const previouslySeenAttachmentIds = new Set<string>();

    if (lastSakanaIndex !== -1) {
      for (const msg of msgs.slice(0, lastSakanaIndex + 1)) {
        for (const attachment of msg.attachments) {
          previouslySeenAttachmentIds.add(attachment.id);
        }
      }
    }

    const inlineAttachmentKeys = new Set<string>();
    const selectedAttachmentIds = new Set<string>();
    let documentCount = 0;
    let imageCount = 0;

    for (
      let msgIndex = msgs.length - 1;
      msgIndex > lastSakanaIndex;
      msgIndex--
    ) {
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

        const ref = this.sakanaAttachmentRef(attachment);
        if (!ref) continue;

        if (this.isSakanaDocument(ref) && documentCount < 1) {
          inlineAttachmentKeys.add(
            this.attachmentOccurrenceKey(msg, attachment)
          );
          selectedAttachmentIds.add(attachment.id);
          documentCount += 1;
        } else if (this.isSakanaImage(ref) && imageCount < 3) {
          inlineAttachmentKeys.add(
            this.attachmentOccurrenceKey(msg, attachment)
          );
          selectedAttachmentIds.add(attachment.id);
          imageCount += 1;
        }

        if (documentCount === 1 && imageCount === 3) {
          return { inlineAttachmentKeys } satisfies SakanaFreshAssetSelection;
        }
      }
    }

    return { inlineAttachmentKeys } satisfies SakanaFreshAssetSelection;
  }

  private shouldInlineAttachment(
    msg: MessageSingleton<true>,
    attachment: AttachmentSingleton<true>,
    selection: SakanaFreshAssetSelection
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
      const ref = this.sakanaAttachmentRef(attachment);
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
    selection: SakanaFreshAssetSelection
  ) {
    const content = Array.of<OpenAI.Responses.ResponseInputContent>();
    const textParts = Array.of<string>();

    for (const attachment of msg.attachments) {
      const ref = this.sakanaAttachmentRef(attachment);
      if (!ref) continue;

      if (this.shouldInlineAttachment(msg, attachment, selection)) {
        if (this.isSakanaDocument(ref)) {
          content.push({
            type: "input_file",
            file_url: ref.url,
            filename: ref.filename,
            detail: "low"
          } satisfies OpenAI.Responses.ResponseInputFile);
          continue;
        }

        if (this.isSakanaImage(ref)) {
          content.push({
            type: "input_image",
            image_url: ref.url,
            detail: "auto"
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

  protected formatSakanaInput(msgs: MessageSingleton<true>[]) {
    if (msgs.length === 0) {
      return [{ role: "user", content: "" }] as const satisfies ResponseInput;
    }

    const selection = this.selectFreshAssets(msgs);
    const input = Array.of<OpenAI.Responses.ResponseInputItem>();

    for (const msg of msgs) {
      if (msg.senderType === "USER") {
        input.push(this.formatUserMessage(msg, selection));
      } else {
        input.push(this.formatAssistantMessage(msg));
      }
    }

    return input satisfies ResponseInput;
  }

  protected sakanaTools(
    hasUserStoreDocs: boolean,
    user_location?: OpenAI.Responses.WebSearchTool.UserLocation
  ) {
    const tools = Array.of<OpenAI.Responses.Tool>({
      type: "web_search",
      user_location
    } satisfies OpenAI.Responses.WebSearchTool);

    if (hasUserStoreDocs) {
      tools.unshift(this.fileSearchFunctionTool());
    }

    return tools;
  }
}
