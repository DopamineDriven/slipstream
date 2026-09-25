import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { SakanaUserLocation } from "@/sakana/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { OpenAI } from "openai";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import { SakanaStoreService } from "@/sakana/store.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { LocalToolName, MessageSingleton } from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class SakanaWorkupService extends SakanaStoreService {
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
    msg: Pick<
      MessageSingleton<true>,
      "content" | "messageBlocks" | "provider" | "model"
    >
  ) {
    const textBlocks = Array.of<string>();

    if (msg.messageBlocks && msg.messageBlocks.length > 0) {
      for (const block of msg.messageBlocks) {
        if (block.type === "TEXT") {
          textBlocks.push(block.content);
        }
        if (
          block.type === "IMAGE_GEN" &&
          block.cdnUrl &&
          block.width &&
          block.height
        ) {
          textBlocks.push(
            `![[${msg.provider}/${msg.model}]-${block.width}x${block.height}](${block.cdnUrl})\n\n${block.content}`
          );
        }
      }
    }

    if (textBlocks.length > 0) {
      return textBlocks.join("\n");
    }

    return msg.content;
  }

  protected async formatSakanaInput(msgs: MessageSingleton<true>[]) {
    if (msgs.length === 0) {
      return [{ role: "user", content: "" }] as const satisfies ResponseInput;
    }

    // HMEM substitution assembly (Part II §2) — msgs arrive ordinal-sorted
    // from resolver/chat.ts
    const memoryView = await this.memoryService.getHistoryAssemblyView(
      msgs[0]?.conversationId,
      msgs.reduce((max, m) => (m.ordinal >= max ? m.ordinal + 1 : max), 0)
    );
    const input = Array.of<OpenAI.Responses.ResponseInputItem>();

    // fresh assets: user attachments that arrived after the last Sakana turn
    // and were never seen up to it, newest first, at most one pdf as
    // input_file and three images as input_image. Everything else rides as
    // a markdown link inside the text. Keyed per occurrence (`msgId:attId`)
    // so the same attachment on an older message stays a link.
    const lastSakanaIndex = msgs.findLastIndex(
      m => m.provider === "SAKANA" && m.senderType === "AI"
    );
    const previouslySeenAttachmentIds = new Set<string>();
    for (const [msgIndex, msg] of msgs.entries()) {
      if (msgIndex > lastSakanaIndex) break;
      for (const att of msg.attachments) {
        previouslySeenAttachmentIds.add(att.id);
      }
    }

    const inlineKeys = new Set<string>();
    const selectedAttachmentIds = new Set<string>();
    let documentCount = 0,
      imageCount = 0;

    for (
      let msgIndex = msgs.length - 1;
      msgIndex > lastSakanaIndex;
      msgIndex--
    ) {
      const msg = msgs[msgIndex];
      if (msg?.senderType !== "USER") continue;

      for (let attIndex = msg.attachments.length - 1; attIndex >= 0; attIndex--) {
        const att = msg.attachments[attIndex];
        if (!att) continue;
        if (previouslySeenAttachmentIds.has(att.id)) continue;
        if (selectedAttachmentIds.has(att.id)) continue;

        const url =
          att.compatStatus === "ACTIVE" && att.compatCdnUrl
            ? att.compatCdnUrl
            : (att.cdnUrl ?? att.sourceUrl);
        const mime =
          att.compatStatus === "ACTIVE" && att.compatMime
            ? att.compatMime
            : (att.mime ?? att.compatMime);
        if (!url || !mime) continue;

        const isPdf =
          att.assetType === "DOCUMENT" && mime === "application/pdf";
        const isImage =
          att.assetType === "IMAGE" &&
          (mime === "image/jpeg" ||
            mime === "image/png" ||
            mime === "image/webp");

        if (isPdf && documentCount < 1) {
          inlineKeys.add(`${msg.id}:${att.id}`);
          selectedAttachmentIds.add(att.id);
          documentCount += 1;
        } else if (isImage && imageCount < 3) {
          inlineKeys.add(`${msg.id}:${att.id}`);
          selectedAttachmentIds.add(att.id);
          imageCount += 1;
        }

        if (documentCount === 1 && imageCount === 3) break;
      }
      if (documentCount === 1 && imageCount === 3) break;
    }

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
        const content = Array.of<OpenAI.Responses.ResponseInputContent>();
        const textParts = Array.of<string>();

        for (const att of msg.attachments) {
          if (att.messageBlock) continue;
          const url =
            att.compatStatus === "ACTIVE" && att.compatCdnUrl
              ? att.compatCdnUrl
              : (att.cdnUrl ?? att.sourceUrl);
          const mime =
            att.compatStatus === "ACTIVE" && att.compatMime
              ? att.compatMime
              : (att.mime ?? att.compatMime);
          if (!url || !mime) continue;

          const filename = att.filename ?? "attachment";
          const label = filename.replaceAll("[", "\\[").replaceAll("]", "\\]");

          if (inlineKeys.has(`${msg.id}:${att.id}`)) {
            if (att.assetType === "DOCUMENT" && mime === "application/pdf") {
              content.push({
                type: "input_file",
                file_url: url,
                filename,
                detail: "high"
              } satisfies OpenAI.Responses.ResponseInputFile);
              continue;
            }
            if (
              att.assetType === "IMAGE" &&
              (mime === "image/jpeg" ||
                mime === "image/png" ||
                mime === "image/webp")
            ) {
              content.push({
                type: "input_image",
                image_url: url,
                detail: "high"
              } satisfies OpenAI.Responses.ResponseInputImage);
              continue;
            }
          }

          textParts.push(
            att.assetType === "IMAGE"
              ? `![${label}](${url})`
              : `[${label}](${url})`
          );
        }

        const text = this.messageText(msg);
        if (text.length > 0) {
          textParts.push(text);
        }

        content.push({
          type: "input_text",
          text: textParts.join("\n\n")
        } satisfies OpenAI.Responses.ResponseInputText);

        input.push({
          role: "user",
          content
        } satisfies OpenAI.Responses.EasyInputMessage);
      } else {
        const textParts = Array.of<string>();
        const modelIdentifier = `[${msg.provider.toLowerCase()}/${msg.model ?? "unknown"}]`;

        textParts.push(`${modelIdentifier}\n${this.messageText(msg)}`);

        for (const att of msg.attachments) {
          // owned by an IMAGE_GEN block — messageText places it at its ordinal
          if (att.messageBlock) continue;
          const url =
            att.compatStatus === "ACTIVE" && att.compatCdnUrl
              ? att.compatCdnUrl
              : (att.cdnUrl ?? att.sourceUrl);
          const mime =
            att.compatStatus === "ACTIVE" && att.compatMime
              ? att.compatMime
              : (att.mime ?? att.compatMime);
          if (!url || !mime) continue;

          const filename = att.filename ?? "attachment";
          const label = filename.replaceAll("[", "\\[").replaceAll("]", "\\]");
          textParts.push(
            att.assetType === "IMAGE"
              ? `![${label}](${url})`
              : `[${label}](${url})`
          );
        }

        input.push({
          role: "assistant",
          content: textParts.join("\n\n")
        } as const satisfies OpenAI.Responses.EasyInputMessage);
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

  protected sakanaTools(
    hasUserStoreDocs: boolean,
    user_location?: OpenAI.Responses.WebSearchTool.UserLocation,
    /**
     * local read-only bridge tools (repo_search/read_file/list_directory) —
     * appended last so they compose with whatever the branch selects
     */
    localToolNames: readonly LocalToolName[] = []
  ) {
    const tools = Array.of<OpenAI.Responses.Tool>({
      type: "web_search",
      user_location
    } satisfies OpenAI.Responses.WebSearchTool);

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
