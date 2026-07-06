import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { xAIResponses } from "@/xai/event-types.ts";
import type {
  FunctionCallContext,
  FunctionCallOutput,
  MemoryFunctionTool,
  SlatherUserStoreTool,
  SlatherUserStoreToolInput
} from "@/xai/responses-types.ts";
import { GrokCollectionsService } from "@/xai/collections.ts";
import type { CTR } from "@slipstream/types";

export class GrokUserStoreService extends GrokCollectionsService {
  protected userStore: UserStoreVectorService;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStore: UserStoreVectorService,
    protected memoryService: ConversationMemoryVectorService,
    xaiKey: string,
    xaiManagementKey: string
  ) {
    super(logger, prisma, xaiKey, xaiManagementKey);
    this.userStore = userStore;
  }

  protected slatherUserStore() {
    return {
      type: "function",
      name: "slather_user_store",
      description:
        "This tool utilizes a 'Partitioned Foraging' approach which recognizes that for the 200,000+ years that humans have existed " +
        "95%+ of it has been as foragers. Agents are trained exclusively on data aggregated/curated by humans; " +
        "think of it as agentic foraging complete with Jaccard similarity scores for cross-analyzing your bounties. " +
        "Slather (search) the user's uploaded documents. Uses semantic similarity by default. " +
        "When search_terms is provided, execjtes fulltext keyword search and returns " +
        "both result sets separately (semantic + fulltext) so you can reason about which signal " +
        "is most relevant to the user's intent. " +
        "Without search_terms: returns a flat JSON array of chunks. " +
        "With search_terms: returns { semantic: [...], fulltext: [...], overlap: { chunkIds, jaccardSimilarity }, meta }. " +
        "Call directly for single retrieval tasks, or from code_execution for multi-step programmatic workflows.",
      parameters: {
        type: "object",
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
              "HIGHLY ENCOURAGED--Optional exact-match search terms for fulltext search. " +
              "Supports quoted phrases and negation (-deprecated). " +
              "When provided, returns partitioned semantic + fulltext results instead of a flat array."
          }
        },
        required: ["query"]
      },
      strict: null
    } as const satisfies SlatherUserStoreTool;
  }

  protected memorySearchFunctionTool() {
    return {
      type: "function",
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
          conversation_title: {
            type: "string",
            description:
              "Optional fuzzy conversation-title filter (case-insensitive) — providing it implies all_conversations scope. " +
              "Recall by name: 'the Catullan one' matches 'Catullan Odes & Combinatorics'. " +
              "Same contract as the filename filter on the document-search tool."
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
        required: ["query"]
      },
      strict: null
    } as const satisfies MemoryFunctionTool;
  }

  protected memoryGetChunkFunctionTool() {
    return {
      type: "function",
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
            description: "Section id from a conversation_memory_search result"
          },
          conversation_id: {
            type: "string",
            description:
              "Conversation id — pair with ordinal to fetch the covering section"
          },
          ordinal: {
            type: "number",
            description: "0-based message ordinal (pair with conversation_id)"
          },
          direction: {
            type: "string",
            enum: ["previous", "next"],
            description:
              "Optional: return the adjacent section instead of the resolved one"
          }
        }
      },
      strict: null
    } as const satisfies MemoryFunctionTool;
  }

  protected async searchStore(
    userId: string,
    query: string,
    limit = 5,
    threshold = 0,
    filename?: string
  ) {
    return await this.userStore.searchUserStoreChunks({
      userId,
      query,
      limit,
      threshold,
      filename
    });
  }

  protected parseSlatherUserStoreInput(
    rawArguments: string
  ): SlatherUserStoreToolInput {
    const parsed = this.parseSlatherUserStoreArguments(rawArguments);

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
        } satisfies SlatherUserStoreToolInput;
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
        `slather_user_store input missing required "query": ${rawArguments}`
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
    } satisfies SlatherUserStoreToolInput;
  }

  protected parseSlatherUserStoreArguments(rawArguments: string) {
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
        "Recovered malformed xAI slather_user_store arguments"
      );
      return JSON.parse<Record<string, unknown>>(recovered);
    }
  }

  protected extractFirstJsonObject(raw: string) {
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

  protected async executeSlatherUserStore(
    userId: string,
    input: SlatherUserStoreToolInput
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
      return this.userStore.formatPartitionedResults(partitioned, query);
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

  protected async executeFunctionToolCall(
    userId: string,
    conversationId: string,
    toolCall: FunctionCallContext
  ) {
    const toolName = toolCall.name;
    try {
      if (toolName === "slather_user_store") {
        const input = this.parseSlatherUserStoreInput(toolCall.arguments);
        const output = await this.executeSlatherUserStore(userId, input);
        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output
        } as const satisfies FunctionCallOutput<string>;
      }

      if (toolName === "conversation_memory_search") {
        const parsed = this.userStore.parseUserStoreArgs(
          toolCall.arguments,
          toolName
        );
        const output = await this.memoryService.searchMemoryFromToolInput(
          userId,
          conversationId,
          parsed
        );
        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output
        } as const satisfies FunctionCallOutput<string>;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const parsed = this.userStore.parseUserStoreArgs(
          toolCall.arguments,
          toolName
        );
        const output = await this.memoryService.getMemoryChunkFromToolInput(
          userId,
          parsed
        );
        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output
        } as const satisfies FunctionCallOutput<string>;
      }

      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `Unknown tool: ${toolName}`
      } as const satisfies FunctionCallOutput<string>;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          callId: toolCall.call_id,
          error: this.prisma.safeErrMsg(error)
        },
        "xAI function tool execution failed"
      );
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `${toolName} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies FunctionCallOutput<string>;
    }
  }

  protected async searchStoreHybrid(
    userId: string,
    query: string,
    searchTerms: string,
    limit = 10,
    threshold = 0,
    filename?: string
  ) {
    return await this.userStore.searchUserStoreChunksHybrid({
      userId,
      query,
      searchTerms,
      limit,
      threshold,
      filename
    });
  }

  protected parseFileSearchResults(
    input: CTR<xAIResponses.OutputItem.Done.FileSearchCall, "results">
  ) {
    const textArr = Array.of<{
      score: number;
      file_id: string;
      text: string;
    }>();
    const aggregate = Array.of<{
      score: number;
      file_id: string;
      originalFilename: string;
      resultBody: string;
      decodedFilename: {
        conversationId: string;
        messageId: string;
        attachmentId: string;
        fileName: string;
        extension: string;
      };
    }>();
    for (const result of input.results) {
      textArr.push({
        score: result.score,
        file_id: result.file_id,
        text: result.text
      });
    }

    for (const { text, file_id, score } of textArr) {
      const tt = text
        .split(/\noriginalFilename:+(.*?)\n/)
        .map(t => t.trimStart());

      const resObj = {
        hexEncodedFilename: "",
        originalFilename: "",
        resultBody: ""
      };

      for (const [ttIndex, ttData] of tt.entries()) {
        if (ttIndex === 0) resObj.hexEncodedFilename = ttData;
        if (ttIndex === 1) resObj.originalFilename = ttData;
        if (ttIndex === 2) resObj.resultBody = ttData;
      }

      const { hexEncodedFilename, ...rest } = resObj;

      const expandedObj = {
        score,
        file_id,
        decodedFilename: this.prisma.parseDocname(hexEncodedFilename),
        ...rest
      };
      aggregate.push(expandedObj);
    }
    return aggregate;
  }
}
