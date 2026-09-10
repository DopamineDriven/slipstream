import type { LoggerService } from "@/logger/index.ts";
import type {
  Content,
  ContentListUnion,
  FunctionDeclaration,
  Interactions,
  Part,
  PartMediaResolution
} from "@google/genai";
import type { Logger } from "pino";
import { GoogleGenAI, PartMediaResolutionLevel, Type } from "@google/genai";

export class GeminiBaseService {
  private defaultClient: GoogleGenAI;
  protected logger: Logger;
  protected apiVersion = "v1beta" as const;
  protected nanoid: Promise<<Type extends string>(size?: number) => Type>;
  constructor(
    logger: LoggerService,
    protected apiKey: string
  ) {
    this.nanoid = import("nanoid").then(d => d.nanoid);
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[gemini] " }
      );
    this.defaultClient = new GoogleGenAI({
      apiKey: this.apiKey,
      apiVersion: this.apiVersion
    });
  }

  protected getClient(overrideKey?: string) {
    if (overrideKey) {
      return new GoogleGenAI({
        apiKey: overrideKey,
        apiVersion: this.apiVersion
      });
    }
    return this.defaultClient;
  }
  /**
   * gemini-3-* only
   */
  protected mediaResolutionLevel(mimeType?: string) {
    if (!mimeType)
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_UNSPECIFIED
      } satisfies PartMediaResolution;
    else if (mimeType === "application/pdf") {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH
      } satisfies PartMediaResolution;
    } else if (mimeType.startsWith("image/")) {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH
      } satisfies PartMediaResolution;
    } else if (mimeType.startsWith("video/")) {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH
      } satisfies PartMediaResolution;
    } else if (
      mimeType.startsWith("text/") ||
      mimeType.startsWith("application/")
    ) {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_UNSPECIFIED
      } satisfies PartMediaResolution;
    } else
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_UNSPECIFIED
      } satisfies PartMediaResolution;
  }

  /**
   * Interactions Step[] → generateContent Content[] — Google exposes
   * tokenization (countTokens) only on the contentGen surface, so the raw
   * `input` from formatInteractionsHistory is re-shaped here to size the
   * context window for the smaller-window models (nano bananas, lyria)
   * before the interaction is created. user_input → role "user",
   * model_output → role "model"; each Content block becomes the Part it
   * would have been on the old lane (uri → fileData, data → inlineData,
   * resolution → mediaResolution). Content[] is a member of
   * ContentListUnion — countTokens' `contents` type — so the return feeds
   * getTokens directly.
   */
  protected interactionStepsToContents(
    steps: (Interactions.UserInputStep | Interactions.ModelOutputStep)[]
  ) {
    const contents = Array.of<Content>();
    for (const step of steps) {
      const parts = Array.of<Part>();
      for (const content of step.content ?? []) {
        switch (content.type) {
          case "text": {
            parts.push({ text: content.text } satisfies Part);
            break;
          }
          case "image": {
            if (content.uri) {
              parts.push({
                fileData: {
                  fileUri: content.uri,
                  mimeType: content.mime_type
                },
                ...(content.resolution
                  ? {
                      mediaResolution: this.mediaResolutionLevel(
                        content.mime_type
                      )
                    }
                  : {})
              } satisfies Part);
            } else if (content.data) {
              parts.push({
                inlineData: {
                  data: content.data,
                  mimeType: content.mime_type
                }
              } satisfies Part);
            } else {
              throw new Error(
                "Interactions image content contains neither uri nor data"
              );
            }
            break;
          }
          case "audio": {
            if (content.uri) {
              parts.push({
                fileData: { mimeType: content.mime_type, fileUri: content.uri }
              } satisfies Part);
            } else if (content.data) {
              parts.push({
                inlineData: { data: content.data, mimeType: content.mime_type }
              } satisfies Part);
            } else {
              throw new Error(
                "Interactions Audio content contains neither uri nor data"
              );
            }
            break;
          }
          case "video": {
            if (content.uri) {
              parts.push({
                fileData: { mimeType: content.mime_type, fileUri: content.uri }
              } satisfies Part);
            } else if (content.data) {
              parts.push({
                inlineData: { data: content.data, mimeType: content.mime_type }
              } satisfies Part);
            } else {
              throw new Error(
                "Interactions Video content contains neither uri nor data"
              );
            }
            break;
          }
          case "document":
          default: {
            if (content.uri) {
              parts.push({
                fileData: {
                  fileUri: content.uri,
                  mimeType: content.mime_type
                }
              } satisfies Part);
            } else if (content.data) {
              parts.push({
                inlineData: {
                  data: content.data,
                  mimeType: content.mime_type
                }
              } satisfies Part);
            } else {
              throw new Error(
                "Interactions Document content contains neither uri nor data"
              );
            }
            break;
          }
        }
      }
      if (parts.length > 0) {
        contents.push({
          role: step.type === "user_input" ? "user" : "model",
          parts
        } satisfies Content);
      }
    }
    return contents satisfies ContentListUnion;
  }

  protected isGemini3ChatModel(m: string) {
    return (
      m ==="gemini-3.8-flash" ||
      m === "gemini-3.7-flash" ||
      m === "gemini-3.6-flash" ||
      m === "gemini-3.5-flash" ||
      m === "gemini-3.5-flash-lite" ||
      m === "gemini-3.1-pro-preview" ||
      m === "gemini-3.1-pro-preview-customtools" ||
      m === "gemini-3.1-flash-lite-preview" ||
      m === "gemini-3-flash-preview"
    );
  }

  protected isOmniModel(m: string) {
    return m === "gemini-omni-flash-preview" || m==="gemini-omni-1.1-flash";
  }

  protected isVeoModel(m: string) {
    return (
      m === "veo-3.1-fast-generate-preview" ||
      m === "veo-3.1-generate-preview" ||
      m === "veo-3.1-lite-generate-preview"
    );
  }
  protected isLyriaModel(m: string) {
    
    return m==="lyria-3.5" || m === "lyria-3-pro-preview" || m === "lyria-3-clip-preview";
  }

  protected isDeepResearch(m: string) {
    return (
      m === "deep-research-max-preview-04-2026" ||
      m === "deep-research-preview-04-2026"
    );
  }

  protected isGemini2dot5Model(m: string) {
    return (
      m === "gemini-2.5-pro" ||
      m === "gemini-2.5-flash-lite" ||
      m === "gemini-2.5-flash"
    );
  }
  protected isValidImgMime(s: string) {
    return (
      s === "image/jpeg" ||
      s === "image/png" ||
      s === "image/webp" ||
      s === "image/heic" ||
      s === "image/heif"
    );
  }

  protected isValidVideoMime(s: string) {
    return (
      s === "video/mp4" ||
      s === "video/mpeg" ||
      s === "video/mpg" ||
      s === "video/mov" ||
      s === "video/webm" ||
      s === "video/avi" ||
      s === "video/x-flv" ||
      s === "video/wmv" ||
      s === "video/3gpp"
    );
  }

  protected isNanoBanana2Lite(m: string) {
    return m === "gemini-3.1-flash-lite-image";
  }

  protected isNanoBanana2(m: string) {
    return m === "gemini-3.1-flash-image-preview";
  }

  protected isNanoBananaPro(m: string) {
    return m === "gemini-3-pro-image-preview";
  }

  protected isNanoBanana1(m: string) {
    return m === "gemini-2.5-flash-image";
  }

  protected isNanoBananaFam(m: string) {
    return (
      this.isNanoBanana2(m) ||
      this.isNanoBananaPro(m) ||
      this.isNanoBanana1(m) ||
      this.isNanoBanana2Lite(m)
    );
  }

  protected mediaModalities(model: string) {
    if (this.isLyriaModel(model)) {
      return ["TEXT", "IMAGE"]
    }
    if (!this.isNanoBananaFam(model)) {
      return ["TEXT"];
    } else return ["TEXT", "IMAGE"];
  }

  protected userStoreSearchToolInteractions() {
    return {
      type: "function",
      name: "user_store_search",
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
        required: ["query"],
        additionalProperties: false
      }
    } as const satisfies Interactions.Function;
  }

  protected memorySearchToolInteractions() {
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
        required: ["query"],
        additionalProperties: false
      }
    } as const satisfies Interactions.Function;
  }

  protected getMemoryChunkToolInteractions() {
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
        },
        required: [],
        additionalProperties: false
      }
    } as const satisfies Interactions.Function;
  }

  protected repoSearchToolInteractions() {
    return {
      type: "function",
      name: "repo_search",
      description:
        "Search text within the active local workspace using ripgrep. " +
        "Paths are workspace-relative. Git ignore files are honored. " +
        "Returns bounded path:line:column:text match references.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            description: "The search pattern (regular expression by default)."
          },
          path: {
            type: "string",
            description:
              "Workspace-relative file or directory to search. Defaults to '.'."
          },
          literal: {
            type: "boolean",
            description:
              "Use literal rather than regular-expression matching. Defaults to false."
          },
          maxResults: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description: "Maximum match lines to return. Defaults to 100."
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    } as const satisfies Interactions.Function;
  }

  protected readFileToolInteractions() {
    return {
      type: "function",
      name: "read_file",
      description:
        "Read a bounded line range from a UTF-8 text file in the active local " +
        "workspace. Returns numbered lines and truncation metadata.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            minLength: 1,
            description: "Workspace-relative file path."
          },
          startLine: {
            type: "integer",
            minimum: 1,
            description: "First line to read (1-indexed). Defaults to 1."
          },
          endLine: {
            type: "integer",
            minimum: 1,
            description:
              "Last line to read (inclusive). Defaults to startLine + 199."
          }
        },
        required: ["path"],
        additionalProperties: false
      }
    } as const satisfies Interactions.Function;
  }

  protected listDirectoryToolInteractions() {
    return {
      type: "function",
      name: "list_directory",
      description:
        "List a workspace-relative directory without following symbolic links. " +
        "Traversal is depth- and entry-bounded; .git and node_modules are " +
        "shown but never descended into.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Workspace-relative directory. Defaults to '.'."
          },
          maxDepth: {
            type: "integer",
            minimum: 0,
            maximum: 4,
            description: "Recursion depth below the target. Defaults to 2."
          }
        },
        additionalProperties: false
      }
    } as const satisfies Interactions.Function;
  }

  protected userStoreSearchTool() {
    return {
      name: "user_store_search",
      description:
        "This tool utilizes a 'Partitioned Foraging' approach which recognizes that for the 200,000+ years that humans have existed " +
        "95%+ of it has been as foragers. Agents are trained exclusively on data aggregated/curated by humans; " +
        "think of it as agentic foraging complete with Jaccard similarity scores for cross-analyzing your bounties. " +
        "Search the user's uploaded documents. The tool uses semantic similarity by default. " +
        "When search_terms is provided, the tool also performs fulltext keyword search and returns " +
        "both result sets separately (semantic + fulltext) so you can reason about which signal " +
        "is most relevant to the user's intent. " +
        "Without search_terms: returns a flat JSON array of chunks. " +
        "With search_terms: returns { semantic: [...], fulltext: [...], overlap: { chunkIds, jaccardSimilarity }, meta }. " +
        "Use as liberally or conservatively as you see fit.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "The semantic search query"
          },
          max_results: {
            type: Type.NUMBER,
            description: "Maximum results to return (1-10, default 5)"
          },
          filename: {
            type: Type.STRING,
            description:
              "Optional filename filter (fuzzy, case-insensitive). " +
              "Only chunks from documents whose filename closely matches this string are returned. " +
              "Example: 'Path to Hell Pt VIII' matches 'The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VIII.pdf'."
          },
          search_terms: {
            type: Type.STRING,
            description:
              "Optional exact-match search terms for fulltext search. " +
              "Supports quoted phrases and negation (-deprecated). " +
              "When provided, returns partitioned semantic + fulltext results instead of a flat array."
          }
        },
        required: ["query"]
      }
    } satisfies FunctionDeclaration;
  }

  protected memorySearchTool() {
    return {
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
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "The semantic search query"
          },
          search_terms: {
            type: Type.STRING,
            description:
              "Optional exact-match terms for the fulltext lane. Supports quoted phrases and negation (-deprecated)."
          },
          scope: {
            type: Type.STRING,
            enum: ["current_conversation", "all_conversations"],
            description:
              "Where to search (default current_conversation). Use all_conversations for cross-conversation recall."
          },
          conversation_title: {
            type: Type.STRING,
            description:
              "Optional fuzzy conversation-title filter (case-insensitive) — providing it implies all_conversations scope. " +
              "Recall by name: 'the Catullan one' matches 'Catullan Odes & Combinatorics'. " +
              "Same contract as the filename filter on the document-search tool."
          },
          max_results: {
            type: Type.NUMBER,
            description: "Maximum results per signal (1-10, default 5)"
          },
          threshold: {
            type: Type.NUMBER,
            description:
              "Cosine similarity floor for the semantic lane (default 0)"
          }
        },
        required: ["query"]
      }
    } satisfies FunctionDeclaration;
  }

  protected memoryGetChunkTool() {
    return {
      name: "conversation_memory_get_chunk",
      description:
        "Fetch one indexed conversation-memory section in full: by chunk_id (from a conversation_memory_search hit), " +
        "or by conversation_id + ordinal (the section covering that 0-based message ordinal). " +
        "direction walks to the adjacent previous/next section — search finds the doorway, traversal walks the room. " +
        "Returns the full firsthand transcript plus previous/next section refs for onward traversal.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          chunk_id: {
            type: Type.STRING,
            description: "Section id from a conversation_memory_search result"
          },
          conversation_id: {
            type: Type.STRING,
            description:
              "Conversation id — pair with ordinal to fetch the covering section"
          },
          ordinal: {
            type: Type.NUMBER,
            description: "0-based message ordinal (pair with conversation_id)"
          },
          direction: {
            type: Type.STRING,
            enum: ["previous", "next"],
            description:
              "Optional: return the adjacent section instead of the resolved one"
          }
        }
      }
    } satisfies FunctionDeclaration;
  }

  protected async generateId(target: "seriesId" | "generationGroupId") {
    const nanoid = await this.nanoid;
    if (target === "generationGroupId") {
      const generationGroupId = "resp_" + nanoid();
      return generationGroupId;
    } else return nanoid();
  }
}
