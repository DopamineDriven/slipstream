import type { MessageInputParams } from "@/anthropic/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { FileSearchToolInput } from "@/store/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Anthropic } from "@anthropic-ai/sdk";
import { AnthropicWorkup } from "@/anthropic/workup.ts";
import type {
  AnthropicModelIdUnion,
  MessageSingleton
} from "@slipstream/types";

export class AnthropicVectorStoreWorkup extends AnthropicWorkup {
  protected userStoreVector: UserStoreVectorService;
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    apiKey: string
  ) {
    super(logger, prisma, apiKey);
    this.userStoreVector = userStoreVector;
  }
  protected async searchStore(
    userId: string,
    query: string,
    limit = 5,
    threshold = 0,
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

  protected async searchStoreHybrid(
    userId: string,
    query: string,
    searchTerms: string,
    limit = 10,
    threshold = 0,
    filename?: string
  ) {
    return await this.userStoreVector.searchUserStoreChunksHybrid({
      userId,
      query,
      searchTerms,
      limit,
      threshold,
      filename
    });
  }

  protected fileSearchTool(): Anthropic.Beta.BetaToolUnion {
    return {
      name: "file_search",
      allowed_callers: ["direct", "code_execution_20250825"],
      description:
        "This tool utilizes a 'Partitioned Foraging' approach which recognizes that for the 200,000+ years that humans have existed " +
        "95%+ of it has been as foragers. Agents are trained exclusively on data aggregated/curated by humans; " +
        "think of it as agentic foraging complete with Jaccard similarity scores for cross-analyzing your bounties. " +
        "Search the user's uploaded documents. Uses semantic similarity by default. " +
        "When search_terms is provided, also performs fulltext keyword search and returns " +
        "both result sets separately (semantic + fulltext) so you can reason about which signal " +
        "is most relevant to the user's intent. " +
        "Without search_terms: returns a flat JSON array of chunks. " +
        "With search_terms: returns { semantic: [...], fulltext: [...], overlap: { chunkIds, jaccardSimilarity }, meta }. " +
        "Call directly for single retrieval tasks, or from code_execution for multi-step programmatic workflows.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The semantic search query"
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
          },
          search_terms: {
            type: "string",
            description:
              "Optional exact-match search terms for fulltext search. " +
              "Supports quoted phrases and negation (-deprecated). " +
              "When provided, returns partitioned semantic + fulltext results instead of a flat array."
          }
        },
        required: ["query"]
      }
    } satisfies Anthropic.Beta.BetaToolUnion;
  }

  protected async executeFileSearch(
    userId: string,
    input: FileSearchToolInput
  ) {
    const limit = Math.min(input.max_results ?? 5, 10);

    if (input.search_terms) {
      const partitioned = await this.searchStoreHybrid(
        userId,
        input.query,
        input.search_terms,
        limit,
        0,
        input.filename
      );
      return this.userStoreVector.formatPartitionedResults(
        partitioned,
        input.query
      );
    }

    const results = await this.searchStore(
      userId,
      input.query,
      limit,
      0,
      input.filename
    );

    if (results.length === 0) {
      return "[]";
    }

    return JSON.stringify(
      results.map(r => ({
        filename: r.filename,
        score: r.score != null ? Number(r.score.toFixed(4)) : 0,
        content: r.content,
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        chunkIndex: r.chunkIndex
      }))
    );
  }

  private webSearchTool(
    user_location:
      | Anthropic.WebSearchTool20250305["user_location"]
      | null
      | undefined
  ) {
    return {
      type: "web_search_20250305",
      name: "web_search",
      user_location
    } as const satisfies Anthropic.Beta.BetaWebSearchTool20250305;
  }

  private webFetchTool() {
    return {
      name: "web_fetch",
      type: "web_fetch_20250910",
      citations: { enabled: true }
    } as const satisfies Anthropic.Beta.BetaToolUnion;
  }

  private codeExecutionTool() {
    return {
      type: "code_execution_20250825",
      name: "code_execution"
    } as const satisfies Anthropic.Beta.BetaToolUnion;
  }

  protected isAdvancedToolCapable(m: string) {
    return (
      m === "claude-sonnet-4-6" ||
      m === "claude-opus-4-6" ||
      m === "claude-opus-4-5-20251101" ||
      m === "claude-sonnet-4-5-20250929"
    );
  }

  protected isEffortCapable(model: string) {
    return (
      model === "claude-opus-4-6" ||
      model === "claude-opus-4-5-20251101" ||
      model === "claude-sonnet-4-6"
    );
  }

  protected tooling(
    m: AnthropicModelIdUnion,
    user_location:
      | Anthropic.WebSearchTool20250305["user_location"]
      | null
      | undefined,
    hasLocalStore = false
  ) {
    if (m === "claude-3-haiku-20240307") {
      return [
        this.webSearchTool(user_location)
      ] satisfies Anthropic.Beta.BetaToolUnion[];
    } else {
      // advanced tool usage header is a prerequisite for file search (programmatic)
      // only sonnet-4.5, opus-4.5, and opus-4.6 support advanced tool usage currently (2026-02-13)
      if (hasLocalStore && this.isAdvancedToolCapable(m)) {
        return [
          this.codeExecutionTool(),
          this.fileSearchTool(),
          this.webSearchTool(user_location),
          this.webFetchTool()
        ] satisfies Anthropic.Beta.BetaToolUnion[];
      }
      return [
        this.webSearchTool(user_location),
        this.webFetchTool(),
        this.codeExecutionTool()
      ] satisfies Anthropic.Beta.BetaToolUnion[];
    }
  }

  protected async formatAnthropicHistoryWithFiles(
    isNewChat: boolean,
    msgs: MessageSingleton<true>[],
    model: AnthropicModelIdUnion,
    systemPrompt?: string,
    keyFingerprint = "server",
    keyId?: string,
    apiKey?: string
  ) {
    const lastClaudeIndex = msgs.findLastIndex(
      m => m.provider === "ANTHROPIC" && m.senderType === "AI"
    );
    const isFirstClaudeMsg = lastClaudeIndex === -1;

    const messages = Array.of<Anthropic.Beta.BetaMessageParam>();

    for (const [msgIndex, msg] of msgs.entries()) {
      const isFreshContext = isFirstClaudeMsg || msgIndex > lastClaudeIndex;

      if (msg.senderType === "USER") {
        const content = Array.of<Anthropic.Beta.BetaContentBlockParam>();
        const textParts = Array.of<string>();

        if (msg.attachments && msg.attachments.length > 0) {
          for (const attachment of msg.attachments) {
            const url =
              attachment.compatStatus === "ACTIVE"
                ? attachment.compatCdnUrl
                : attachment.cdnUrl;
            const mime =
              attachment.compatStatus === "ACTIVE"
                ? attachment.compatMime
                : attachment.mime;

            if (!url || !mime) continue;

            const filename = attachment.filename ?? "attachment";

            if (isFreshContext) {
              if (attachment.assetType === "DOCUMENT") {
                try {
                  const fileId = await this.ensureAnthropicAssetUploaded(
                    attachment,
                    model,
                    keyFingerprint,
                    keyId,
                    apiKey
                  );
                  content.push({
                    type: "document",
                    source: { type: "file", file_id: fileId },
                    citations: { enabled: true }
                  } satisfies Anthropic.Beta.BetaRequestDocumentBlock);
                } catch {
                  content.push({
                    type: "document",
                    source: { type: "url", url },
                    citations: { enabled: true }
                  } satisfies Anthropic.Beta.BetaRequestDocumentBlock);
                }
              } else if (attachment.assetType === "IMAGE") {
                const sizeInMB = (attachment.size ?? 0) / 1024 / 1024;

                if (sizeInMB >= 1) {
                  try {
                    const fileId = await this.ensureAnthropicAssetUploaded(
                      attachment,
                      model,
                      keyFingerprint,
                      keyId,
                      apiKey
                    );
                    content.push({
                      type: "image",
                      source: { type: "file", file_id: fileId }
                    } satisfies Anthropic.Beta.BetaImageBlockParam);
                  } catch {
                    content.push({
                      type: "image",
                      source: { type: "url", url }
                    } satisfies Anthropic.Beta.BetaImageBlockParam);
                  }
                } else {
                  content.push({
                    type: "image",
                    source: { type: "url", url }
                  } satisfies Anthropic.Beta.BetaImageBlockParam);
                }
              }
            } else {
              // Stale context
              if (attachment.assetType === "IMAGE") {
                textParts.push(`[seen] ![${filename}](${url})`);
              } else {
                textParts.push(`[seen] [${filename}](${url})`);
              }
            }
          }
        }
        const blockAgg = Array.of<string>();
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          for (const block of msg.messageBlocks) {
            if (block.type === "TEXT") {
              blockAgg.push(block.content);
            }
          }
        }
        if (blockAgg.length > 0) {
          textParts.push(blockAgg.join(`\n`));
        } else {
          textParts.push(msg.content);
        }
        content.push({
          type: "text",
          text: textParts.join("\n\n")
        } satisfies Anthropic.Beta.BetaTextBlockParam);

        messages.push({ role: "user", content });
      } else {
        const textParts = Array.of<string>();
        const blockAgg = Array.of<string>();
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          for (const block of msg.messageBlocks) {
            if (block.type === "TEXT") {
              blockAgg.push(block.content);
            }
          }
        }
        if (blockAgg.length > 0) {
          textParts.push(blockAgg.join(`\n`));
        } else {
          textParts.push(msg.content);
        }
        if (msg.attachments && msg.attachments.length > 0) {
          for (const attachment of msg.attachments) {
            const url =
              attachment.compatStatus === "ACTIVE"
                ? attachment.compatCdnUrl
                : attachment.cdnUrl;

            if (!url) continue;

            const filename = attachment.filename ?? "attachment";

            if (attachment.assetType === "IMAGE") {
              if (isFreshContext) {
                textParts.push(`![${filename}](${url})`);
              } else {
                textParts.push(`[seen] ![${filename}](${url})`);
              }
            } else {
              if (isFreshContext) {
                textParts.push(`[${filename}][${url}]`);
              } else {
                textParts.push(`[seen] [${filename}](${url})`);
              }
            }
          }
        }

        messages.push({
          role: "assistant",
          content: `<model provider="${msg.provider.toLowerCase()}" name="${msg.model}">\n${textParts.join("\n\n")}\n</model>`
        });
      }
    }

    const systemNote = `Note: Previous responses may be tagged with their source provider-model combo for context.`;

    const enhancedSystemPrompt = systemPrompt
      ? `${systemPrompt}\n\n${systemNote}`
      : systemNote;

    return {
      messages,
      system: [
        {
          type: "text",
          text: enhancedSystemPrompt
        }
      ] satisfies Anthropic.Beta.BetaTextBlockParam[]
    };
  }

  private is4dot6Model(m = "claude-opus-4-6") {
    return m === "claude-sonnet-4-6" || m === "claude-opus-4-6";
  }

  private handleEffort(model: string | null) {
    if (!model) return;
    if (!this.is4dot6Model(model)) return;
    if (model === "claude-opus-4-6") {
      return { effort: "max" } as const;
    } else {
      return { effort: "high" } as const;
    }
  }

  // ─── Multi-turn tool use streaming loop ──────────────────────────────

  protected async createStreamWorkup({
    isNewChat,
    messages: msgs,
    userId,
    apiKey,
    container = undefined,
    keyId,
    max_tokens,
    model: m,
    systemPrompt,
    temperature,
    topP,
    user_location
  }: MessageInputParams) {
    const model = m as AnthropicModelIdUnion;

    const keyFingerprint = keyId ?? "server";

    // Use Files API for PDFs
    const { messages, system } = await this.formatAnthropicHistoryWithFiles(
      isNewChat,
      msgs,
      model,
      systemPrompt,
      keyFingerprint,
      keyId ?? undefined,
      apiKey
    );

    const { max_tokens: maxTokens, thinking } = this.handleMaxTokensAndThinking(
      model,
      max_tokens
    );

    const tools = this.tooling(model, user_location, true);

    const betas = this.handleBetaHeaders(model, true);
    this.logger.info(betas, "beta headers");
    this.logger.info(tools, "tools returned");
    // only opus 4.5 (with effort beta header set), opus 4.6 & sonnet 4.6 (natively) support effort config
    return {
      params: {
        max_tokens: maxTokens,
        stream: true,
        thinking,
        top_p: topP,
        temperature,
        system,
        container,
        model,
        tools,
        output_config: this.handleEffort(model),
        tool_choice: { type: "auto" },
        metadata: { user_id: userId },
        messages,
        service_tier: "auto",
        betas
      } satisfies Anthropic.Beta.Messages.MessageCreateParamsStreaming
    };
  }
}
