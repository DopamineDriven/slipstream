import type { LoggerService } from "@/logger/index.ts";
import type {
  MistralFunctionTool,
  MistralLocalToolFunctionTool,
  MistralMessageReq,
  ToolTypes
} from "@/mistral/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Logger as PinoLogger } from "pino";
import { MistralStreamContentService } from "@/mistral/stream-content.ts";
import { Mistral } from "@mistralai/mistralai";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { LocalToolName, MistralModelIdUnion } from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class MistralWorkupService extends MistralStreamContentService {
  protected defaultClient: Mistral;
  protected logger: PinoLogger;

  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected redis: EnhancedRedisPubSub,
    protected userStoreVector: UserStoreVectorService,
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

  protected isMistralModel(model = "mistral-medium-3.5") {
    return (
      model === "mistral-small-latest" ||
      model === "mistral-medium-3" ||
      model === "mistral-medium-3.5" ||
      model === "mistral-large-latest"
    );
  }

  protected resolveModel(model = "mistral-medium-3.5") {
    if (this.isMistralModel(model)) {
      return model;
    }

    return "mistral-medium-3.5" satisfies MistralModelIdUnion;
  }

  protected handleReasoning(m: MistralModelIdUnion) {
    if (m === "mistral-small-latest") return "high";
    if (m === "mistral-medium-3") return "high";
    if (m === "mistral-medium-3.5") return "high";
    else return;
  }

  protected async stream(
    model: MistralModelIdUnion,
    messages: MistralMessageReq[],
    apiKey?: string,
    options?: {
      temperature?: number;
      topP?: number;
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
      parallelToolCalls: true,
      stream: true,
      safePrompt: false
    });
  }

  protected fileSearchFunctionTool() {
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

  protected memorySearchFunctionTool() {
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
          required: ["query"],
          additionalProperties: false
        }
      }
    } as const satisfies MistralFunctionTool;
  }

  protected memoryGetChunkFunctionTool() {
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
          },
          required: [],
          additionalProperties: false
        }
      }
    } as const satisfies MistralFunctionTool;
  }

  /**
   * Local read-only tool bridge (Sovereign CLI) — canonical definitions
   * mapped into mistral's completions function-tool dialect. Plain JSON
   * Schema, so this is a near-identity map (parameters === inputSchema).
   * Empty when the CLI advertises nothing.
   */
  protected localToolFunctionTools(names: readonly LocalToolName[]) {
    const advertised = new Set<string>(names);
    return LOCAL_TOOL_DEFINITIONS.filter(d => advertised.has(d.name)).map(
      d =>
        ({
          type: "function",
          function: {
            name: d.name,
            description: d.description,
            parameters: d.inputSchema
          }
        }) satisfies MistralLocalToolFunctionTool
    );
  }
}
