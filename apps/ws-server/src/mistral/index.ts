import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type {
  MistralAccumulatedToolCall,
  MistralActiveMessageBlock,
  MistralAssistantToolCallMessage,
  MistralFinalizedMessageBlock,
  MistralForcedLoopStopReason,
  MistralFunctionTool,
  MistralFunctionToolCall,
  MistralMessageReq,
  MistralToolMessage,
  ToolTypes
} from "@/mistral/types.ts";
import type { OpenAIFileSearchToolInput } from "@/openai/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type {
  ContentChunk,
  SystemMessage,
  ToolCall
} from "@mistralai/mistralai/models/components";
import type { Logger as PinoLogger } from "pino";
import { MistralStreamContentService } from "@/mistral/stream-content.ts";
import { Mistral } from "@mistralai/mistralai";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type {
  EventTypeMap,
  MessageSingleton,
  MistralModelIdUnion
} from "@slipstream/types";

const MISTRAL_HISTORY_MESSAGE_LIMIT = 175;

interface MistralAssistantHistoryTextMessage {
  readonly content: string;
  readonly model: string | null;
  readonly provider: $Enums.Provider;
}

function formatMistralHistoryModelIdentifier(
  msg: MistralAssistantHistoryTextMessage
) {
  return `[${msg.provider.toLowerCase()}/${msg.model ?? "model"}]`;
}

export function formatMistralAssistantHistoryText(
  msg: MistralAssistantHistoryTextMessage,
  textParts: readonly string[]
) {
  const joinedText = textParts.join("\n\n");

  if (joinedText.trim().length > 0) {
    return joinedText;
  }

  if (msg.content.trim().length > 0) {
    return msg.content;
  }

  return formatMistralHistoryModelIdentifier(msg);
}

interface MistralHistoryFormatterDeps {
  readonly filenameToHexExtTuple: (
    url: string,
    compatStatus: $Enums.CompatStatus | null,
    encoded?: boolean
  ) => readonly [filename: string, ext: string];
  readonly logInfo: (message: string) => void;
  readonly safeErrMsg: (error: unknown) => string;
}

function selectMistralHistoryMessages(msgs: readonly MessageSingleton<true>[]) {
  const orderedMsgs = [...msgs].sort((a, b) => a.ordinal - b.ordinal);
  if (orderedMsgs.length <= MISTRAL_HISTORY_MESSAGE_LIMIT) {
    return orderedMsgs;
  }

  const selectedIds = new Set<string>();

  for (
    let msgIndex = orderedMsgs.length - 1;
    msgIndex >= 0 && selectedIds.size < MISTRAL_HISTORY_MESSAGE_LIMIT;
    msgIndex--
  ) {
    const msg = orderedMsgs[msgIndex];
    if (!msg || msg.provider !== "MISTRAL") continue;
    selectedIds.add(msg.id);
  }

  for (
    let msgIndex = orderedMsgs.length - 1;
    msgIndex >= 0 && selectedIds.size < MISTRAL_HISTORY_MESSAGE_LIMIT;
    msgIndex--
  ) {
    const msg = orderedMsgs[msgIndex];
    if (!msg) continue;
    selectedIds.add(msg.id);
  }

  return orderedMsgs.filter(msg => selectedIds.has(msg.id));
}

export function formatMistralHistory(
  msgs: readonly MessageSingleton<true>[],
  deps: MistralHistoryFormatterDeps
) {
  const historyMsgs = selectMistralHistoryMessages(msgs);
  const allowFreshAttachments =
    historyMsgs.length < MISTRAL_HISTORY_MESSAGE_LIMIT;
  const formatted = Array.of<MistralMessageReq>();
  const lastIndex = historyMsgs.findLastIndex(
    m => m.provider === "MISTRAL" && m.senderType === "AI"
  );

  const isFirstMistralMsg = lastIndex === -1;
  const previouslySeenAttachmentIds = new Set<string>();

  if (!isFirstMistralMsg) {
    for (const msg of historyMsgs.slice(0, lastIndex + 1)) {
      for (const attachment of msg.attachments) {
        previouslySeenAttachmentIds.add(attachment.id);
      }
    }
  }

  const inlineAttachmentKeys = new Set<string>();
  const selectedAttachmentIds = new Set<string>();
  let documentSelected = false;
  let imageSelected = false;

  if (allowFreshAttachments) {
    for (
      let msgIndex = historyMsgs.length - 1;
      msgIndex > lastIndex && (!documentSelected || !imageSelected);
      msgIndex--
    ) {
      const msg = historyMsgs[msgIndex];
      if (!msg?.senderType || msg.senderType !== "USER") continue;

      for (
        let attachmentIndex = msg.attachments.length - 1;
        attachmentIndex >= 0 && (!documentSelected || !imageSelected);
        attachmentIndex--
      ) {
        const attachment = msg.attachments[attachmentIndex];
        if (!attachment) continue;
        if (previouslySeenAttachmentIds.has(attachment.id)) continue;
        if (selectedAttachmentIds.has(attachment.id)) continue;

        const activeCompat = attachment.compatStatus === "ACTIVE";
        const url = activeCompat ? attachment.compatCdnUrl : attachment.cdnUrl;
        const mime = activeCompat ? attachment.compatMime : attachment.mime;
        if (!url || !mime) continue;

        if (attachment.assetType === "DOCUMENT" && !documentSelected) {
          inlineAttachmentKeys.add(`${msg.id}:${attachment.id}`);
          selectedAttachmentIds.add(attachment.id);
          documentSelected = true;
        } else if (attachment.assetType === "IMAGE" && !imageSelected) {
          inlineAttachmentKeys.add(`${msg.id}:${attachment.id}`);
          selectedAttachmentIds.add(attachment.id);
          imageSelected = true;
        }
      }
    }
  }

  for (const [msgIndex, msg] of historyMsgs.entries()) {
    const isFreshContext = isFirstMistralMsg || msgIndex > lastIndex;
    if (msg.senderType === "USER") {
      const content = Array.of<ContentChunk>();
      const textParts = Array.of<string>();
      try {
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            const {
              cdnUrl,
              mime: ogMime,
              compatStatus,
              compatCdnUrl,
              compatMime
            } = att;
            const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
            const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;
            if (url && mime) {
              const [filename, ext] = deps.filenameToHexExtTuple(
                url,
                att.compatStatus,
                false
              );
              const name = `${filename}.${ext}`;
              if (att.assetType === "DOCUMENT") {
                try {
                  if (
                    isFreshContext &&
                    inlineAttachmentKeys.has(`${msg.id}:${att.id}`)
                  ) {
                    try {
                      content.push({
                        documentUrl: url,
                        type: "document_url"
                      });
                    } catch {
                      textParts.push(`[${name}](${url})`);
                    }
                  } else {
                    textParts.push(`[${name}](${url})`);
                  }
                } catch {
                  textParts.push(`[${name}](${url})`);
                }
              } else if (att.assetType === "IMAGE") {
                if (
                  isFreshContext &&
                  inlineAttachmentKeys.has(`${msg.id}:${att.id}`)
                ) {
                  content.push({
                    type: "image_url",
                    imageUrl: { url, detail: "high" }
                  });
                } else {
                  textParts.push(`![${name}](${url})`);
                }
              } else {
                textParts.push(`[${name}](${url})`);
              }
            }
          }
        }
      } catch (err) {
        throw new Error(deps.safeErrMsg(err));
      } finally {
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          const textBlocks = Array.of<string>();
          for (const x of msg.messageBlocks) {
            if (x.type === "TEXT") {
              textBlocks.push(x.content);
            }
          }
          textParts.push(textBlocks.join(`\n`));
        } else {
          textParts.push(msg.content);
        }
      }
      content.push({ type: "text", text: textParts.join(`\n\n`) });
      formatted.push({ role: "user", content });
    } else {
      const content = Array.of<ContentChunk>();
      const textParts = Array.of<string>();
      const modelIdentifier = formatMistralHistoryModelIdentifier(msg);

      try {
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            const {
              cdnUrl,
              mime: ogMime,
              compatStatus,
              assetType,
              compatCdnUrl,
              compatMime
            } = att;
            const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
            const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

            if (url && mime) {
              const [filename, ext] = deps.filenameToHexExtTuple(
                url,
                att.compatStatus,
                false
              );

              const name = `${filename}.${ext}`;

              if (assetType === "IMAGE") {
                textParts.push(`${modelIdentifier}\n![${name}](${url})`);
              } else {
                textParts.push(`${modelIdentifier}\n[${name}](${url})`);
              }
            }
          }
        }
      } catch (err) {
        deps.logInfo(deps.safeErrMsg(err));
      } finally {
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          const textBlocks = Array.of<string>();
          for (const x of msg.messageBlocks) {
            if (x.type === "TEXT") {
              textBlocks.push(x.content);
            }
          }
          textParts.push(textBlocks.join(`\n\n`));
        } else {
          textParts.push(msg.content);
        }
      }
      content.push({
        type: "text",
        text: formatMistralAssistantHistoryText(msg, textParts)
      });
      formatted.push({ role: "assistant", content });
    }
  }
  return formatted;
}

export class MistralService extends MistralStreamContentService {
  protected defaultClient: Mistral;
  protected logger: PinoLogger;

  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected redis: EnhancedRedisPubSub,
    protected userStoreVector: UserStoreVectorService,
    protected memoryService: ConversationMemoryVectorService,
    protected apiKey: string
  ) {
    super();
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[mistral] " }
      );
    this.defaultClient = new Mistral({
      apiKey: this.apiKey
    });
  }

  protected getClient(overrideKey?: string) {
    if (overrideKey) {
      return new Mistral({
        apiKey: overrideKey
      });
    }

    return this.defaultClient;
  }

  private isMistralModel(model = "mistral-medium-3.5") {
    return (
      model === "mistral-small-latest" ||
      model === "mistral-medium-3" ||
      model === "mistral-medium-3.5" ||
      model === "mistral-large-latest"
    );
  }

  private resolveModel(model = "mistral-medium-3.5") {
    if (this.isMistralModel(model)) {
      return model;
    }

    return "mistral-small-latest" satisfies MistralModelIdUnion;
  }

  private handleReasoning(m: MistralModelIdUnion) {
    if (m === "mistral-small-latest") return "high";
    if (m === "mistral-medium-3") return "high";
    if (m === "mistral-medium-3.5") return "high";
    else return;
  }

  private async stream(
    model: MistralModelIdUnion,
    messages: MistralMessageReq[],
    apiKey?: string,
    options?: {
      temperature?: number;
      topP?: number;
      maxTokens?: number;
      tools?: ToolTypes;
    }
  ) {
    const client = this.getClient(apiKey);

    return await client.chat.stream({
      model,
      messages,
      reasoningEffort: this.handleReasoning(model),
      temperature: options?.temperature ?? 0.7,
      tools: options?.tools,
      stream: true,
      safePrompt: false
    });
  }

  protected formatHistory(msgs: MessageSingleton<true>[]) {
    return formatMistralHistory(msgs, {
      filenameToHexExtTuple: (url, compatStatus, encoded) =>
        this.prisma.filenameToHexExtTuple(url, compatStatus, encoded),
      logInfo: message => this.logger.info(message),
      safeErrMsg: error => this.prisma.safeErrMsg(error)
    } satisfies MistralHistoryFormatterDeps);
  }

  protected formatSystemInstruction(isNewChat: boolean, systemPrompt?: string) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation. " +
      "Older messages of long conversations may be omitted from your view — use conversation_memory_search to recall them.";

    return systemPrompt ? `${systemPrompt}\n\n${note}` : note;
  }

  private fileSearchFunctionTool() {
    return {
      type: "function",
      function: {
        name: "file_search",
        description:
          "This tool utilizes a 'Partitioned Foraging' approach which recognizes that for the 200,000+ years that humans have existed " +
          "95%+ of it has been as foragers. Agents are trained exclusively on data aggregated/curated by humans; " +
          "think of it as agentic foraging complete with Jaccard similarity scores for cross-analyzing your bounties. " +
          "Search the user's uploaded documents. Uses semantic similarity by default. " +
          "When search_terms is provided, also performs fulltext keyword search and returns " +
          "both result sets separately (semantic + fulltext) so you can reason about which signal is most relevant. " +
          "Without search_terms: returns a flat JSON array. " +
          "With search_terms: returns { semantic, fulltext, overlap, meta }.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The semantic search query."
            },
            max_results: {
              type: "number",
              description: "Maximum results to return (1-10, default 5)"
            },
            filename: {
              type: "string",
              description:
                "Optional filename filter (fuzzy, case-insensitive). Only chunks from documents whose filename closely matches this string are returned."
            },
            search_terms: {
              type: "string",
              description:
                "Optional exact-match search terms for fulltext search. " +
                "Supports quoted phrases and negation (-deprecated). " +
                "When provided, returns partitioned semantic + fulltext results instead of a flat array."
            }
          },
          required: ["query"],
          additionalProperties: false
        }
      }
    } as const satisfies MistralFunctionTool;
  }

  private memorySearchFunctionTool() {
    return {
      type: "function",
      function: {
        name: "conversation_memory_search",
        description:
          "Search the user's indexed conversation history — older sections of this conversation and other conversations. " +
          "Sections are ~8k-token transcript slices of firsthand conversation history; an invisible summary layer boosts " +
          "fulltext ranking for conceptual keywords. Semantic similarity by default; when search_terms is provided, also " +
          "performs fulltext keyword search and returns { semantic_results, fulltext_results, overlap_results, metadata }. " +
          "scope 'current_conversation' (default) reaches this conversation's older indexed sections — including messages " +
          "beyond your context window; 'all_conversations' reaches the user's entire history, with conversation_id + " +
          "conversation_title on every hit for citation. Sections are keyed by 0-based message ordinal ranges [start, end). " +
          "Expand a hit with conversation_memory_get_chunk.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The semantic search query"
            },
            search_terms: {
              type: "string",
              description:
                "Optional exact-match terms for the fulltext lane. Supports quoted phrases and negation (-deprecated)."
            },
            scope: {
              type: "string",
              enum: ["current_conversation", "all_conversations"],
              description:
                "Where to search (default current_conversation). Use all_conversations for cross-conversation recall."
            },
            max_results: {
              type: "number",
              description: "Maximum results per signal (1-10, default 5)"
            },
            threshold: {
              type: "number",
              description:
                "Cosine similarity floor for the semantic lane (default 0)"
            }
          },
          required: ["query"],
          additionalProperties: false
        }
      }
    } as const satisfies MistralFunctionTool;
  }

  private memoryGetChunkFunctionTool() {
    return {
      type: "function",
      function: {
        name: "conversation_memory_get_chunk",
        description:
          "Fetch one indexed conversation-memory section in full: by chunk_id (from a conversation_memory_search hit), " +
          "or by conversation_id + ordinal (the section covering that 0-based message ordinal). " +
          "direction walks to the adjacent previous/next section — search finds the doorway, traversal walks the room. " +
          "Returns the full firsthand transcript plus previous/next section refs for onward traversal.",
        parameters: {
          type: "object",
          properties: {
            chunk_id: {
              type: "string",
              description:
                "Section id from a conversation_memory_search result"
            },
            conversation_id: {
              type: "string",
              description:
                "Conversation id — pair with ordinal to fetch the covering section"
            },
            ordinal: {
              type: "number",
              description:
                "0-based message ordinal (pair with conversation_id)"
            },
            direction: {
              type: "string",
              enum: ["previous", "next"],
              description:
                "Optional: return the adjacent section instead of the resolved one"
            }
          },
          required: [],
          additionalProperties: false
        }
      }
    } as const satisfies MistralFunctionTool;
  }

  private async searchStore(
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

  private async searchStoreHybrid(
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

  private parseFileSearchInput(
    rawArguments: string
  ): OpenAIFileSearchToolInput {
    const parsed = this.parseFileSearchArguments(rawArguments);

    if ("query" in parsed && typeof parsed.query === "string") {
      const normalized = parsed.query.trim();
      if (normalized.length > 0) {
        const maxResults =
          "max_results" in parsed && typeof parsed.max_results === "number"
            ? parsed.max_results
            : undefined;

        const filenameInput =
          "filename" in parsed && typeof parsed.filename === "string"
            ? parsed.filename.trim() || undefined
            : undefined;

        const searchTermsInput =
          "search_terms" in parsed && typeof parsed.search_terms === "string"
            ? parsed.search_terms.trim() || undefined
            : undefined;

        return {
          query: normalized,
          max_results: maxResults,
          filename: filenameInput,
          search_terms: searchTermsInput
        } satisfies OpenAIFileSearchToolInput;
      }
    }

    const queryList = Array.of<string>();

    if ("queries" in parsed && Array.isArray(parsed.queries)) {
      for (const query of parsed.queries) {
        if (typeof query !== "string") continue;
        const normalized = query.trim();
        if (normalized.length === 0) continue;
        queryList.push(normalized);
      }
    }

    const uniqueQueries = Array.from(new Set(queryList)).slice(0, 5);
    const firstQuery = uniqueQueries[0];

    if (!firstQuery) {
      throw new Error(
        `file_search input missing required "query": ${rawArguments}`
      );
    }

    const maxResults =
      "max_results" in parsed && typeof parsed.max_results === "number"
        ? parsed.max_results
        : undefined;

    const filenameInput =
      "filename" in parsed && typeof parsed.filename === "string"
        ? parsed.filename.trim() || undefined
        : undefined;

    const searchTermsInput =
      "search_terms" in parsed && typeof parsed.search_terms === "string"
        ? parsed.search_terms.trim() || undefined
        : undefined;

    return {
      queries: [firstQuery, ...uniqueQueries.slice(1)] as const,
      max_results: maxResults,
      filename: filenameInput,
      search_terms: searchTermsInput
    } satisfies OpenAIFileSearchToolInput;
  }

  private parseFileSearchArguments(rawArguments: string) {
    const trimmed = rawArguments.trim();

    if (trimmed.length === 0) {
      return {} satisfies Record<string, unknown>;
    }

    try {
      return JSON.parse<Record<string, unknown>>(trimmed);
    } catch (error) {
      const recovered = this.extractFirstJsonObject(trimmed);
      if (!recovered) {
        throw error;
      }

      this.logger.warn(
        {
          rawArgumentsPreview: trimmed.slice(0, 300),
          recoveredPreview: recovered.slice(0, 300),
          error: this.prisma.safeErrMsg(error)
        },
        "Recovered malformed streamed mistral file_search arguments"
      );

      return JSON.parse<Record<string, unknown>>(recovered);
    }
  }

  private extractFirstJsonObject(raw: string) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (const [index, char] of Array.from(raw).entries()) {
      if (start === -1) {
        if (char === "{") {
          start = index;
          depth = 1;
        }

        continue;
      }

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === "\\") {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }

        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return raw.slice(start, index + 1);
        }
      }
    }

    return undefined;
  }

  private async executeFileSearch(
    userId: string,
    input: OpenAIFileSearchToolInput
  ) {
    const maxResults = Math.max(1, Math.min(input.max_results ?? 5, 10));

    if (input.search_terms) {
      const query = "query" in input ? input.query : input.queries[0];
      const partitioned = await this.searchStoreHybrid(
        userId,
        query,
        input.search_terms,
        maxResults,
        0,
        input.filename
      );

      return this.userStoreVector.formatPartitionedResults(partitioned, query);
    }

    const results =
      "query" in input
        ? await this.searchStore(
            userId,
            input.query,
            maxResults,
            0,
            input.filename
          )
        : (
            await Promise.all(
              input.queries.map(query =>
                this.searchStore(userId, query, maxResults, 0, input.filename)
              )
            )
          ).flat();

    if (results.length === 0) {
      return "[]";
    }

    return JSON.stringify(
      results.map(result => ({
        filename: result.filename,
        score: result.score != null ? Number(result.score.toFixed(4)) : 0,
        content: result.content,
        startOffset: result.startOffset,
        endOffset: result.endOffset,
        chunkIndex: result.chunkIndex
      }))
    );
  }

  private async executeToolCall(
    userId: string,
    conversationId: string,
    toolCall: MistralFunctionToolCall
  ) {
    const toolName = toolCall.function.name;
    try {
      if (toolName === "file_search") {
        const input = this.parseFileSearchInput(toolCall.function.arguments);
        const output = await this.executeFileSearch(userId, input);
        return {
          role: "tool",
          toolCallId: toolCall.id,
          name: toolName,
          content: output
        } as const satisfies MistralToolMessage;
      }

      if (toolName === "conversation_memory_search") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          this.toolCallArgumentsToString(toolCall.function.arguments),
          toolName
        );
        const output = await this.memoryService.searchMemoryFromToolInput(
          userId,
          conversationId,
          parsed
        );
        return {
          role: "tool",
          toolCallId: toolCall.id,
          name: toolName,
          content: output
        } as const satisfies MistralToolMessage;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          this.toolCallArgumentsToString(toolCall.function.arguments),
          toolName
        );
        const output = await this.memoryService.getMemoryChunkFromToolInput(
          userId,
          parsed
        );
        return {
          role: "tool",
          toolCallId: toolCall.id,
          name: toolName,
          content: output
        } as const satisfies MistralToolMessage;
      }

      return {
        role: "tool",
        toolCallId: toolCall.id,
        name: toolName,
        content: `Unknown tool: ${toolName}`
      } as const satisfies MistralToolMessage;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          toolCallId: toolCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "mistral function tool execution failed"
      );

      return {
        role: "tool",
        toolCallId: toolCall.id,
        name: toolName,
        content: `${toolName} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies MistralToolMessage;
    }
  }

  private toolCallArgumentsToString(value: string | Record<string, unknown>) {
    if (typeof value === "string") {
      return value;
    }

    return JSON.stringify(value);
  }

  private accumulateToolCallDelta(
    registry: Map<number, MistralAccumulatedToolCall>,
    deltas: ToolCall[]
  ) {
    for (const delta of deltas) {
      const index = delta.index ?? 0;
      const current = registry.get(index) ?? {
        id: "",
        name: "",
        arguments: "",
        index
      };

      if (delta.id) {
        current.id = delta.id;
      }

      if (delta.function.name) {
        current.name = delta.function.name;
      }

      const nextArguments = this.toolCallArgumentsToString(
        delta.function.arguments
      );

      if (typeof delta.function.arguments === "string") {
        current.arguments += nextArguments;
      } else if (nextArguments.length > 0) {
        current.arguments = nextArguments;
      }

      registry.set(index, current);
    }
  }

  private materializeToolCalls(
    registry: Map<number, MistralAccumulatedToolCall>
  ) {
    const materialized = Array.of<MistralFunctionToolCall>();

    for (const [, toolCall] of Array.from(registry.entries()).sort(
      ([left], [right]) => left - right
    )) {
      if (!toolCall.id || !toolCall.name) {
        this.logger.warn(
          { toolCall },
          "Skipping incomplete streamed mistral tool call"
        );
        continue;
      }

      materialized.push({
        id: toolCall.id,
        index: toolCall.index,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      });
    }

    return materialized;
  }

  public async handleMistralAiChatRequest({
    chunks,
    conversationId,
    streamChannel,
    msgs,
    thinkingChunks,
    apiKey,
    ws,
    userMsgId,
    userId,
    hasUserStoreDocs,
    isNewChat,
    max_tokens,
    model,
    systemPrompt,
    temperature,
    title,
    topP
  }: ProviderChatRequestEntity) {
    const provider = "mistral" as const;
    const resolvedModel = this.resolveModel(model);
    let mistralThinkingDuration = 0,
      mistralThinkingAgg = "",
      mistralAgg = "",
      totalUsage = 0;
    const trackedBlocks = Array.of<MistralFinalizedMessageBlock>();
    let activeBlock: MistralActiveMessageBlock | undefined = undefined;
    let nextOrdinal = 0;

    const roundTrack = Array.of<{
      type: $Enums.MessageBlockType;
      content: string;
      durationMs: number;
      ordinal: number;
      conversationId: string;
    }>();

    const finalizeActiveBlock = () => {
      if (!activeBlock || activeBlock.content.length === 0) {
        activeBlock = undefined;
        return;
      }

      const durationMs = Math.max(
        0,
        Math.round(performance.now() - activeBlock.startedAt)
      );

      trackedBlocks.push({
        content: activeBlock.content,
        durationMs,
        ordinal: nextOrdinal,
        type: activeBlock.type
      });

      if (activeBlock.type === "THINKING") {
        mistralThinkingDuration += durationMs;
      }

      nextOrdinal += 1;
      activeBlock = undefined;
    };

    const ensureActiveBlock = (type: MistralActiveMessageBlock["type"]) => {
      if (activeBlock?.type !== type) {
        finalizeActiveBlock();
        activeBlock = {
          content: "",
          reasoningChunkCount: 0,
          sawAggregateTail: false,
          startedAt: performance.now(),
          type
        };
      }

      return activeBlock;
    };

    const currentThinkingDuration = () => {
      const activeThinkingDuration =
        activeBlock?.type === "THINKING"
          ? Math.round(performance.now() - activeBlock.startedAt)
          : 0;

      return mistralThinkingDuration + activeThinkingDuration;
    };

    const currentChunkMessageBlock = () => {
      if (!activeBlock) {
        return undefined;
      }

      return {
        type: activeBlock.type,
        content: activeBlock.content,
        ordinal: nextOrdinal,
        conversationId,
        durationMs: Math.max(
          0,
          Math.round(performance.now() - activeBlock.startedAt)
        )
      } as const;
    };

    const appendReasoningDelta = (reasoningText: string) => {
      const block = ensureActiveBlock("THINKING");
      block.reasoningChunkCount += 1;

      let emittedThinkingText = reasoningText;
      if (
        block.reasoningChunkCount > 3 &&
        Math.abs(block.content.length - reasoningText.length) <=
          4 * block.reasoningChunkCount
      ) {
        block.sawAggregateTail = true;
        const prependNew = `\n${reasoningText}`;
        emittedThinkingText =
          block.content.length < prependNew.length
            ? prependNew.substring(block.content.length)
            : "";
      }

      if (emittedThinkingText.length === 0) {
        return undefined;
      }

      const appendedText = block.sawAggregateTail
        ? emittedThinkingText
        : reasoningText;

      block.content += appendedText;
      mistralThinkingAgg += appendedText;
      thinkingChunks.push(appendedText);

      return emittedThinkingText;
    };

    const emitThinkingChunk = (thinkingText: string) => {
      const emittedThinkingText = appendReasoningDelta(thinkingText);

      if (!emittedThinkingText || emittedThinkingText.length === 0) {
        return;
      }

      ws.send(
        JSON.stringify({
          type: "ai_chat_chunk",
          conversationId,
          userId,
          title,
          userMsgId,
          imgGenEnabled: false,
          provider,
          systemPrompt,
          temperature,
          thinkingText: emittedThinkingText,
          messageBlocks: currentChunkMessageBlock(),
          isThinking: true,
          thinkingDuration:
            currentThinkingDuration() > 0
              ? currentThinkingDuration()
              : undefined,
          topP,
          model: resolvedModel,
          done: false
        } satisfies EventTypeMap["ai_chat_chunk"])
      );

      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
        type: "ai_chat_chunk",
        conversationId,
        userId,
        model: resolvedModel,
        userMsgId,
        imgGenEnabled: false,
        title,
        isThinking: true,
        thinkingDuration:
          currentThinkingDuration() > 0 ? currentThinkingDuration() : undefined,
        thinkingText: emittedThinkingText,
        messageBlocks: currentChunkMessageBlock(),
        systemPrompt,
        temperature,
        topP,
        provider,
        done: false
      });

      if (thinkingChunks.length % 10 === 0) {
        void this.redis.saveStreamState(
          conversationId,
          chunks,
          {
            model: resolvedModel,
            provider,
            title,
            totalChunks: thinkingChunks.length,
            completed: false,
            systemPrompt,
            temperature,
            topP
          },
          thinkingChunks
        );
      }
    };

    const emitTextChunk = (text: string) => {
      if (text.length === 0) {
        return;
      }

      const block = ensureActiveBlock("TEXT");
      block.content += text;

      chunks.push(text);
      mistralAgg += text;

      ws.send(
        JSON.stringify({
          type: "ai_chat_chunk",
          conversationId,
          userId,
          title,
          provider,
          userMsgId,
          imgGenEnabled: false,
          systemPrompt,
          temperature,
          thinkingDuration:
            mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
          isThinking: false,
          messageBlocks: currentChunkMessageBlock(),
          topP,
          model: resolvedModel,
          chunk: text,
          done: false
        } satisfies EventTypeMap["ai_chat_chunk"])
      );

      void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
        type: "ai_chat_chunk",
        conversationId,
        userId,
        userMsgId,
        imgGenEnabled: false,
        model: resolvedModel,
        title,
        thinkingDuration:
          mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
        isThinking: false,
        thinkingText:
          mistralThinkingAgg.length > 0 ? mistralThinkingAgg : undefined,
        messageBlocks: currentChunkMessageBlock(),
        systemPrompt,
        temperature,
        topP,
        provider,
        chunk: text,
        done: false
      });

      if (chunks.length % 10 === 0) {
        void this.redis.saveStreamState(
          conversationId,
          chunks,
          {
            model: resolvedModel,
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
    };

    const processDeltaContent = (
      content: string | readonly ContentChunk[] | null | undefined
    ) => {
      this.processDeltaContent(content, {
        emitTextChunk,
        emitThinkingChunk
      });
    };

    // memory tools attach unconditionally — conversation memory exists
    // independently of uploaded documents
    const tools = (
      hasUserStoreDocs
        ? [
            this.fileSearchFunctionTool(),
            this.memorySearchFunctionTool(),
            this.memoryGetChunkFunctionTool()
          ]
        : [
            this.memorySearchFunctionTool(),
            this.memoryGetChunkFunctionTool()
          ]
    ) satisfies ToolTypes;
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );
    let roundMessages = Array.of<MistralMessageReq>(
      ...(systemInstruction
        ? [
            {
              role: "system",
              content: systemInstruction
            } satisfies SystemMessage
          ]
        : []),
      ...this.formatHistory(msgs)
    );

    const MAX_TOOL_ROUNDS = 10;
    let forcedLoopStopReason: MistralForcedLoopStopReason = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const roundToolCalls = new Map<number, MistralAccumulatedToolCall>();
      let roundUsageTotalTokens: number | undefined = undefined;
      let sawToolCallFinish = false;

      const streamer = await this.stream(
        resolvedModel,
        roundMessages,
        apiKey ?? undefined,
        {
          maxTokens: max_tokens,
          topP,
          temperature,
          tools
        }
      );

      for await (const event of streamer) {
        const chunk = event.data;

        if (typeof chunk.usage?.totalTokens === "number") {
          roundUsageTotalTokens = chunk.usage.totalTokens;
        }

        for (const choice of chunk.choices) {
          if (choice.finishReason === "tool_calls") {
            sawToolCallFinish = true;
            finalizeActiveBlock();
          }

          processDeltaContent(choice.delta.content);

          if (choice.delta.toolCalls && choice.delta.toolCalls.length > 0) {
            this.accumulateToolCallDelta(
              roundToolCalls,
              choice?.delta?.toolCalls
            );
            finalizeActiveBlock();
          }
        }
      }

      finalizeActiveBlock();

      if (typeof roundUsageTotalTokens === "number") {
        totalUsage += roundUsageTotalTokens;
      }

      const materializedToolCalls = this.materializeToolCalls(roundToolCalls);
      const hasActionableToolCalls =
        materializedToolCalls.length > 0 &&
        (sawToolCallFinish || typeof roundUsageTotalTokens === "number");

      if (!hasActionableToolCalls) {
        break;
      }

      if (round === MAX_TOOL_ROUNDS) {
        forcedLoopStopReason = "MAX_ROUNDS";
        this.logger.warn(
          {
            round,
            toolCallCount: materializedToolCalls.length
          },
          "mistral tool loop reached max rounds"
        );
        break;
      }

      const assistantToolMessage = {
        role: "assistant",
        content: "",
        toolCalls: materializedToolCalls
      } as const satisfies MistralAssistantToolCallMessage;

      const toolMessages = Array.of<MistralToolMessage>();

      for (const toolCall of materializedToolCalls) {
        toolMessages.push(
          await this.executeToolCall(userId, conversationId, toolCall)
        );
      }

      roundMessages = [
        ...roundMessages,
        assistantToolMessage,
        ...toolMessages
      ] satisfies MistralMessageReq[];

      this.logger.info(
        {
          round,
          toolCallCount: materializedToolCalls.length,
          toolOutputCount: toolMessages.length
        },
        "mistral tool round complete, sending continuation"
      );
    }

    if (forcedLoopStopReason && mistralAgg.trim().length === 0) {
      mistralAgg =
        "I ran document search multiple times but kept hitting a tool loop before a stable answer was produced. " +
        "Please rephrase with a narrower query, such as an exact filename or section title, and I will retry.";
      trackedBlocks.push({
        content: mistralAgg,
        durationMs: 0,
        ordinal: nextOrdinal,
        type: "TEXT"
      });
      nextOrdinal += 1;
    }

    for (const block of trackedBlocks) {
      roundTrack.push({
        type: block.type,
        content: block.content,
        durationMs: block.durationMs,
        ordinal: block.ordinal,
        conversationId
      });
    }

    const finalUsage = totalUsage > 0 ? totalUsage : undefined;
    const d = await this.prisma.handleAiChatResponse({
      chunk: mistralAgg,
      conversationId,
      done: true,
      provider,
      title,
      userId,
      userMsgId,
      imgGenEnabled: false,
      model: resolvedModel,
      systemPrompt,
      thinkingDuration:
        mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
      thinkingText:
        mistralThinkingAgg.length > 0 ? mistralThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      temperature,
      usage: finalUsage,
      topP
    });

    ws.send(
      JSON.stringify({
        type: "ai_chat_response",
        conversationId,
        userId,
        provider,
        userMsgId,
        aiMsgId: d.aiMsgId,
        convo: d.convo,
        imgGenEnabled: false,
        systemPrompt,
        thinkingDuration:
          mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
        thinkingText:
          mistralThinkingAgg.length > 0 ? mistralThinkingAgg : undefined,
        title,
        temperature,
        topP,
        model: resolvedModel,
        usage: finalUsage,
        chunk: mistralAgg,
        messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
        done: true
      } satisfies EventTypeMap["ai_chat_response"])
    );

    void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
      type: "ai_chat_response",
      conversationId,
      userId,
      systemPrompt,
      convo: d.convo,
      userMsgId,
      aiMsgId: d.aiMsgId,
      imgGenEnabled: false,
      temperature,
      title,
      thinkingDuration:
        mistralThinkingDuration > 0 ? mistralThinkingDuration : undefined,
      thinkingText:
        mistralThinkingAgg.length > 0 ? mistralThinkingAgg : undefined,
      messageBlocks: roundTrack.length > 0 ? roundTrack : undefined,
      topP,
      usage: finalUsage,
      provider,
      model: resolvedModel,
      chunk: mistralAgg,
      done: true
    });

    void this.redis.del(`stream:state:${conversationId}`);
  }
}
