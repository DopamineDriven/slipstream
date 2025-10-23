import type {
  MessageSingleton,
  ProviderChatRequestEntity
} from "@/types/index.ts";
import type { Uploadable } from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaImageBlockParam,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaRequestDocumentBlock,
  BetaStopReason,
  BetaTextBlockParam,
  BetaThinkingConfigParam,
  BetaWebSearchResultBlock,
  BetaWebSearchTool20250305,
  FileUploadParams
} from "@anthropic-ai/sdk/resources/beta.mjs";
import type { Logger as PinoLogger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Anthropic } from "@anthropic-ai/sdk";
import { Stream } from "@anthropic-ai/sdk/core/streaming.mjs";
import type { CompatStatus } from "@slipstream/db/enums-node";
import type {
  AllModelsUnion,
  AnthropicModelIdUnion,
  EventTypeMap
} from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

interface ProviderAnthropicChatRequestEntity extends ProviderChatRequestEntity {
  user_location?: BetaWebSearchTool20250305.UserLocation;
}

export class AnthropicService {
  private defaultClient: Anthropic;
  private logger: PinoLogger;
  // In-memory cache for uploaded files (similar to Gemini pattern)
  private assetCache = new Map<string, { fileId: string; expiresAt: Date }>();
  constructor(
    logger: LoggerService,
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private apiKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[anthropic] " }
      );
    this.defaultClient = new Anthropic({
      apiKey: this.apiKey,
      logLevel: "debug",
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

  private handleBetaHeaders(model: AnthropicModelIdUnion) {
    switch (model) {
      case "claude-sonnet-4-5-20250929":
      case "claude-sonnet-4-20250514": {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11",
          "context-1m-2025-08-07"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
      case "claude-3-5-haiku-20241022":
      case "claude-3-5-sonnet-20240620":
      case "claude-3-5-sonnet-20241022":
      case "claude-3-haiku-20240307":
      case "claude-3-7-sonnet-20250219":
      case "claude-opus-4-1-20250805":
      case "claude-opus-4-20250514":
      case "claude-haiku-4-5-20251001":
      default: {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
    }
  }

  private async streamToBuffer(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const chunks = Array.of<Uint8Array>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks);
  }
  private handleNumBigIntUnion(size: number | bigint) {
    return typeof size === "bigint" ? 10n * 1024n * 1024n : 10 * 1024 * 1024;
  }
  private async uploadFileToAnthropic(
    attachment: {
      compatCdnUrl: string | null;
      compatMime: string | null;
      cdnUrl: string | null;
      mime: string | null;
      id: string;
      filename: string | null;
      compatStatus: CompatStatus | null;
    },
    client: Anthropic,
    model: AnthropicModelIdUnion
  ) {
    let url: string | null;
    if (attachment.compatStatus === "ALIASED")
      url = attachment.cdnUrl ?? attachment.compatCdnUrl;
    url = attachment.compatCdnUrl ?? attachment.cdnUrl;
    if (!url) throw new Error("No CDN URL available for upload");
    // Fetch the file
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    // const buffer = await this.streamToBuffer(response.body);
    // const mime = (attachment.compatStatus === "ACTIVE" ? attachment.compatMime : attachment.mime) ?? "application/pdf";
    // const filename = attachment.filename ?? "document.pdf";

    // Upload using Anthropic Files API
    const file = await client.beta.files.upload({
      file: (await fetch(url)) satisfies Uploadable,
      betas: this.handleBetaHeaders(model)
    } satisfies FileUploadParams);

    return file;
  }

  private async ensureAnthropicAssetUploaded(
    attachment: {
      cdnUrl: string | null;
      compatCdnUrl: string | null;
      compatMime: string | null;
      filename: string | null;
      mime: string | null;
      id: string;
      compatStatus: CompatStatus | null;
    },
    client: Anthropic,
    model: AnthropicModelIdUnion,
    keyFingerprint: string,
    keyId?: string
  ): Promise<string> {
    const cacheKey = `${keyFingerprint}:${attachment.id}`;
    const now = new Date();

    // Check in-memory cache
    const cached = this.assetCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.logger.debug(`Reusing cached Anthropic file: ${attachment.id}`);
      return cached.fileId;
    }

    // Check database
    const existing = await this.prisma.findActiveAnthropicAsset(
      attachment.id,
      keyFingerprint
    );

    if (
      existing?.providerRef &&
      existing.expiresAt &&
      existing.expiresAt > now
    ) {
      this.logger.debug(`Reusing Anthropic file from DB: ${attachment.id}`);
      this.assetCache.set(cacheKey, {
        fileId: existing.providerRef,
        expiresAt: existing.expiresAt
      });
      return existing.providerRef;
    }

    const mime =
      (attachment.compatStatus === "ACTIVE"
        ? attachment.compatMime
        : attachment.mime) ?? "application/pdf";

    // Create mapping (acts as lock)
    const mapping = await this.prisma.upsertAnthropicAssetMapping(
      attachment.id,
      keyFingerprint,
      mime,
      keyId
    );

    try {
      // Upload file
      const uploadedFile = await this.uploadFileToAnthropic(
        attachment,
        client,
        model
      );

      // Anthropic files expire in 7 days per documentation
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await this.prisma.finalizeAnthropicAsset(
        mapping.id,
        uploadedFile.id,
        expiresAt,
        BigInt(uploadedFile.size_bytes ?? 0)
      );

      // Update cache
      this.assetCache.set(cacheKey, {
        fileId: uploadedFile.id,
        expiresAt
      });

      this.logger.info(
        `Uploaded PDF to Anthropic Files API: ${uploadedFile.id} (${uploadedFile.filename})`
      );

      return uploadedFile.id;
    } catch (error) {
      await this.prisma.markAnthropicAssetFailed(
        mapping.id,
        error instanceof Error ? error.message : JSON.stringify(error, null, 2)
      );
      throw error;
    }
  }

  private get outputTokensByModel() {
    return {
      "claude-3-haiku-20240307": 4096,
      "claude-3-5-haiku-20241022": 8192,
      "claude-3-5-sonnet-20240620": 8192,
      "claude-3-5-sonnet-20241022": 8192,
      "claude-opus-4-20250514": 32000,
      "claude-opus-4-1-20250805": 32000,
      "claude-haiku-4-5-20251001": 32000,
      "claude-sonnet-4-20250514": 64000,
      "claude-sonnet-4-5-20250929": 64000,
      "claude-3-7-sonnet-20250219": 64000
    } as const satisfies Record<
      AnthropicModelIdUnion,
      4096 | 8192 | 32000 | 64000
    >;
  }

  private getMaxTokens = <const T extends AnthropicModelIdUnion>(model: T) => {
    return this.outputTokensByModel[model];
  };

  public async formatAnthropicHistoryWithFiles(
    isNewChat: boolean,
    msgs: MessageSingleton<true>[],
    model: AnthropicModelIdUnion,
    systemPrompt?: string,
    client?: Anthropic,
    keyFingerprint = "server",
    keyId?: string
  ) {
    if (!isNewChat) {
      const messages = await Promise.all(
        msgs.map(async msg => {
          if (msg.senderType === "USER") {
            const content = Array.of<BetaContentBlockParam>();
            try {
              // Process attachments
              if (msg.attachments && msg.attachments.length > 0 && client) {
                for (const attachment of msg.attachments) {
                  const {
                    cdnUrl,
                    mime: ogMime,
                    compatStatus,
                    compatCdnUrl,
                    compatMime
                  } = attachment;
                  const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
                  const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

                  if (url && mime) {
                    // Use Files API for PDFs only
                    if (mime === "application/pdf") {
                      try {
                        const fileId = await this.ensureAnthropicAssetUploaded(
                          attachment,
                          client,
                          model,
                          keyFingerprint,
                          keyId
                        );
                        const docBlock = {
                          type: "document",
                          source: { file_id: fileId, type: "file" }
                        } as const satisfies BetaRequestDocumentBlock;
                        content.push(docBlock);
                      } catch (err) {
                        this.logger.warn(
                          { err },
                          "Failed to upload PDF to Files API, falling back to URL"
                        );
                        // Fallback to URL
                        const docBlock = {
                          type: "document",
                          source: {
                            type: "url",
                            url
                          }
                        } as const satisfies BetaRequestDocumentBlock;
                        content.push(docBlock);
                      }
                    } else if (mime.startsWith("image/")) {
                      // Images use URLs
                      const imageBlock = {
                        type: "image",
                        source: {
                          type: "url",
                          url
                        }
                      } as const satisfies BetaImageBlockParam;
                      content.push(imageBlock);
                    } else if (mime.includes("application")) {
                      // Other docs use URLs
                      const docBlock = {
                        type: "document",
                        source: {
                          type: "url",
                          url
                        }
                      } as const satisfies BetaRequestDocumentBlock;
                      content.push(docBlock);
                    }
                  }
                }
              }
            } catch (err) {
              this.logger.warn({ err }, "error in anthropic history workup");
            } finally {
              content.push({ type: "text", text: msg.content } as const);
            }

            return {
              role: "user",
              content: content.length > 0 ? content : msg.content
            } as const satisfies BetaMessageParam;
          } else {
            const provider = msg.provider.toLowerCase();
            const model = msg.model ?? "";
            return {
              role: "assistant",
              content: `<model provider="${provider}" name="${model}">\n${msg.content}\n</model>`
            } as const;
          }
        })
      );

      const enhancedSystemPrompt = systemPrompt
        ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context.`
        : "Previous responses in this conversation may be tagged with their source model for context.";

      return {
        messages,
        system: [
          { type: "text", text: enhancedSystemPrompt }
        ] as const satisfies BetaTextBlockParam[]
      };
    } else {
      // new chat means only one message exists period -> the first user message
      const userMsg = msgs[0];
      const content = Array.of<BetaContentBlockParam>();

      if (userMsg) {
        try {
          if (userMsg.attachments && userMsg.attachments.length > 0 && client) {
            for (const attachment of userMsg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatCdnUrl,
                compatMime
              } = attachment;
              const url = compatCdnUrl ?? cdnUrl;
              const mime = compatMime ?? ogMime;

              if (url && mime) {
                // Use Files API for PDFs only
                if (mime === "application/pdf") {
                  try {
                    const fileId = await this.ensureAnthropicAssetUploaded(
                      attachment,
                      client,
                      model,
                      keyFingerprint,
                      keyId
                    );
                    const docBlock = {
                      type: "document",
                      source: {
                        type: "file",
                        file_id: fileId
                      },
                      cache_control: { type: "ephemeral", ttl: "1h" }
                    } as const satisfies BetaRequestDocumentBlock;
                    content.push(docBlock);
                  } catch (err) {
                    this.logger.warn(
                      { err },
                      "Failed to upload PDF to Files API, falling back to URL"
                    );
                    // Fallback to URL
                    const docBlock = {
                      type: "document",
                      source: {
                        type: "url",
                        url
                      }
                    } as const satisfies BetaContentBlockParam;
                    content.push(docBlock);
                  }
                } else if (mime.startsWith("image/")) {
                  // Images use URLs
                  const imageBlock = {
                    type: "image",
                    source: {
                      type: "url",
                      url
                    }
                  } as const satisfies BetaContentBlockParam;
                  content.push(imageBlock);
                } else if (mime.includes("application")) {
                  // Other docs use URLs
                  const docBlock = {
                    type: "document",
                    source: {
                      type: "url",
                      url
                    }
                  } as const satisfies BetaContentBlockParam;
                  content.push(docBlock);
                }
              }
            }
          }
        } catch (err) {
          this.logger.warn(
            { err },
            "error in new chat anthropic history workup"
          );
        } finally {
          content.push({ type: "text", text: userMsg.content } as const);
        }
      }

      // never pass the already database persisted user prompt
      const messages = [
        {
          role: "user",
          content: content.length >= 1 ? content : "no user message found"
        }
      ] as const satisfies BetaMessageParam[];

      if (systemPrompt) {
        return {
          messages,
          system: [
            { type: "text", text: systemPrompt }
          ] as const satisfies BetaTextBlockParam[]
        };
      } else {
        return {
          messages,
          system: undefined
        };
      }
    }
  }

  private handleMaxTokens(mod: AllModelsUnion, max_tokens?: number) {
    const model = mod as AnthropicModelIdUnion;
    if (max_tokens && max_tokens <= this.getMaxTokens(model)) {
      return max_tokens;
    } else {
      return this.getMaxTokens(model);
    }
  }

  private handleThinking(mod: AllModelsUnion, max_tokens?: number) {
    const model = mod as AnthropicModelIdUnion;
    switch (model) {
      case "claude-3-7-sonnet-20250219":
      case "claude-opus-4-1-20250805":
      case "claude-opus-4-20250514":
      case "claude-sonnet-4-20250514":
      case "claude-haiku-4-5-20251001":
      case "claude-sonnet-4-5-20250929": {
        if (this.handleMaxTokens(mod, max_tokens) >= 1024) {
          return {
            type: "enabled",
            budget_tokens: this.getMaxTokens(model) - 1024
          } as const satisfies BetaThinkingConfigParam;
        } else {
          return {
            type: "disabled"
          } as const satisfies BetaThinkingConfigParam;
        }
      }
      case "claude-3-5-haiku-20241022":
      case "claude-3-5-sonnet-20240620":
      case "claude-3-5-sonnet-20241022":
      case "claude-3-haiku-20240307":
      default: {
        return { type: "disabled" } as const satisfies BetaThinkingConfigParam;
      }
    }
  }

  public handleMaxTokensAndThinking(mod: AllModelsUnion, max_tokens?: number) {
    return {
      thinking: this.handleThinking(mod, max_tokens),
      max_tokens: this.handleMaxTokens(mod, max_tokens)
    };
  }

  private webSearchTool(
    user_location: ProviderAnthropicChatRequestEntity["user_location"]
  ) {
    return [
      {
        type: "web_search_20250305",
        cache_control: { type: "ephemeral", ttl: "1h" },
        name: "web_search",
        user_location
      }
    ] satisfies BetaWebSearchTool20250305[] | undefined;
  }

  public async handleAnthropicAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    apiKey,
    keyId,
    max_tokens,
    model = "claude-sonnet-4-20250514" satisfies AnthropicModelIdUnion,
    systemPrompt,
    temperature,
    title,
    topP,
    user_location
  }: ProviderAnthropicChatRequestEntity) {
    const provider = "anthropic" as const;
    let anthropicThinkingStartTime: number | null = null,
      anthropicThinkingDuration = 0,
      anthropicIsCurrentlyThinking = false,
      anthropicThinkingAgg = "",
      anthropicAgg = "",
      anthropicWebsearchToolUse = false,
      anthropicCi = 0;

    const anthropic = this.getClient(apiKey ?? undefined);
    const keyFingerprint = keyId ?? "server";

    // Use Files API for PDFs
    const { messages, system } = await this.formatAnthropicHistoryWithFiles(
      isNewChat,
      msgs,
      model as AnthropicModelIdUnion,
      systemPrompt,
      anthropic,
      keyFingerprint,
      keyId ?? undefined
    );

    const { max_tokens: maxTokens, thinking } = this.handleMaxTokensAndThinking(
      model as AllModelsUnion,
      max_tokens
    );
    this.logger.debug(
      messages,
      "debugging full content on first message to anthropic"
    );
    /**
     * tools failing on anthropic following bash_tool_20251022 release...
     */
    const _tools = this.webSearchTool(user_location);

    const betas = this.handleBetaHeaders(model as AnthropicModelIdUnion);

    const stream = (await anthropic.beta.messages.create(
      {
        max_tokens: maxTokens,
        stream: true,
        thinking,
        top_p: topP,
        temperature,
        system,
        model,
        metadata: { user_id: userId },
        messages,
        service_tier: "auto",
        betas
      },
      { stream: true }
    )) satisfies Stream<BetaRawMessageStreamEvent> & {
      _request_id?: string | null;
    };

    for await (const chunk of stream) {
      let text: string | undefined = undefined,
        thinkingText: string | undefined = undefined,
        webSearchRes: BetaWebSearchResultBlock | null = null,
        done: BetaStopReason | null = null; 

      if (chunk.type === "content_block_start") {
        if (chunk.content_block.type === "server_tool_use") {
          if (anthropicWebsearchToolUse === false) {
            anthropicWebsearchToolUse = true;
          }
        }

        if (chunk.content_block.type === "web_search_tool_result") {
          if ("error" in chunk.content_block.content) {
            this.logger.info(chunk.content_block.content.error);
          }
          if (Array.isArray(chunk.content_block.content)) {
            for (const subblock of chunk.content_block.content) {
              webSearchRes = subblock;
              this.logger.debug(webSearchRes, "web_search_res");
              anthropicWebsearchToolUse = false;
            }
          }
        }
      }
      if (chunk.type === "content_block_delta") {
        if (chunk.delta.type === "thinking_delta") {
          thinkingText = chunk.delta.thinking;
          if (
            !anthropicIsCurrentlyThinking &&
            anthropicThinkingStartTime === null
          ) {
            anthropicThinkingStartTime = performance.now();
            anthropicIsCurrentlyThinking = true;
          }
        }
        if (chunk.delta.type === "text_delta") {
          text = chunk.delta.text;
          if (
            anthropicIsCurrentlyThinking &&
            anthropicThinkingStartTime !== null
          ) {
            const endTime = performance.now();
            anthropicThinkingDuration = Math.round(
              endTime - anthropicThinkingStartTime
            );
            anthropicIsCurrentlyThinking = false;
          }
        }
        if (chunk.delta.type === "citations_delta") {
          this.logger.info(chunk.delta.citation);
        }
        if (chunk.delta.type === "input_json_delta") {
          if (anthropicWebsearchToolUse === true) {
            this.logger.info(
              { chunk_delta_type: "input_json_delta" },
              chunk.delta.partial_json
            );
          }
        }
      } else if (chunk.type === "message_delta") {
        done = chunk.delta.stop_reason;
      }
      if (thinkingText) {
        if (webSearchRes) {
          anthropicCi += 1;

          const { url } = webSearchRes;

          this.logger.info(
            { ...webSearchRes },
            `web-search-result ${anthropicCi}`
          );

          const formatIt = ` [\\(^{${anthropicCi}}\\)](${url})` as const;

          anthropicThinkingAgg += thinkingText.concat(formatIt);

          thinkingChunks.push(thinkingText.concat(formatIt));

          webSearchRes = null;
        } else {
          anthropicThinkingAgg += thinkingText;
          thinkingChunks.push(thinkingText);
        }
        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            provider,
            title,
            model,
            systemPrompt,
            temperature,
            topP,
            thinkingText: thinkingText,
            thinkingDuration: anthropicThinkingStartTime
              ? performance.now() - anthropicThinkingStartTime
              : undefined,
            isThinking: true,
            done: false
          } satisfies EventTypeMap["ai_chat_chunk"])
        );

        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          thinkingDuration: anthropicThinkingStartTime
            ? performance.now() - anthropicThinkingStartTime
            : undefined,
          title,
          systemPrompt,
          temperature,
          topP,
          provider,
          thinkingText: thinkingText,
          isThinking: true,
          done: false
        });
      }
      if (text) {
        if (webSearchRes) {
          anthropicCi += 1;

          const { url } = webSearchRes;

          this.logger.info(
            { ...webSearchRes },
            `web-search-result ${anthropicCi}`
          );

          const formatIt = ` [\\(^{${anthropicCi}}\\)](${url})` as const;

          anthropicAgg += text.concat(formatIt);

          chunks.push(text);

          webSearchRes = null;
        } else {
          anthropicAgg += text;
          chunks.push(text);
        }
        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            provider,
            title,
            model,
            systemPrompt,
            temperature,
            topP,
            chunk: text,
            isThinking: false,
            thinkingDuration:
              anthropicThinkingDuration > 0
                ? anthropicThinkingDuration
                : undefined,
            done: false
          } satisfies EventTypeMap["ai_chat_chunk"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          title,
          systemPrompt,
          temperature,
          topP,
          provider,
          thinkingText:
            anthropicThinkingAgg.length > 0 ? anthropicThinkingAgg : undefined,
          thinkingDuration:
            anthropicThinkingDuration > 0
              ? anthropicThinkingDuration
              : undefined,

          chunk: text,
          done: false
        });
        if (chunks.length % 10 === 0) {
          void this.redis.saveStreamState(
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

      if (done) {
        await this.prisma.handleAiChatResponse({
          chunk: anthropicAgg,
          conversationId,
          done: true,
          title,
          temperature,
          topP,
          provider,
          userId,
          systemPrompt,
          model,
          thinkingText:
            anthropicThinkingAgg.length > 0 ? anthropicThinkingAgg : undefined,
          thinkingDuration:
            anthropicThinkingDuration > 0
              ? anthropicThinkingDuration
              : undefined
        });
        ws.send(
          JSON.stringify({
            type: "ai_chat_response",
            conversationId,
            userId,
            provider,
            model,
            title,
            systemPrompt,
            temperature,
            topP,
            chunk: anthropicAgg,
            thinkingText: anthropicThinkingAgg || undefined,
            thinkingDuration:
              anthropicThinkingDuration > 0
                ? anthropicThinkingDuration
                : undefined,
            done: true
          } satisfies EventTypeMap["ai_chat_response"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
          type: "ai_chat_response",
          conversationId,
          userId,
          systemPrompt,
          temperature,
          title,
          topP,
          provider,
          thinkingText: anthropicThinkingAgg || undefined,
          thinkingDuration:
            anthropicThinkingDuration > 0
              ? anthropicThinkingDuration
              : undefined,
          model,
          chunk: anthropicAgg,
          done: true
        });
        void this.redis.del(`stream:state:${conversationId}`);
        break;
      }
    }
  }
}
