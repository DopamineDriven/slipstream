import type { LoggerService } from "@/logger/index.ts";
import type { FunctionDeclaration, PartMediaResolution } from "@google/genai";
import type { Logger } from "pino";
import { GoogleGenAI, PartMediaResolutionLevel, Type } from "@google/genai";

export class GeminiBaseService {
  private defaultClient: GoogleGenAI;
  protected logger: Logger;
  protected apiVersion = "v1alpha" as const;
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
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
      } satisfies PartMediaResolution;
    } else if (mimeType.startsWith("image/")) {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH
      } satisfies PartMediaResolution;
    } else if (mimeType.startsWith("video/")) {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
      } satisfies PartMediaResolution;
    } else if (
      mimeType.startsWith("text/") ||
      mimeType.startsWith("application/")
    ) {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
      } satisfies PartMediaResolution;
    } else
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_UNSPECIFIED
      } satisfies PartMediaResolution;
  }

  protected isGemini3ChatModel(m: string) {
    return (
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
    return m === "gemini-omni-flash-preview";
  }

  protected isVeoModel(m: string) {
    return (
      m === "veo-3.1-fast-generate-preview" ||
      m === "veo-3.1-generate-preview" ||
      m === "veo-3.1-lite-generate-preview"
    );
  }
  protected isLyriaModel(m: string) {
    return m === "lyria-3-pro-preview" || m === "lyria-3-clip-preview";
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
    if (!this.isNanoBananaFam(model)) {
      return ["TEXT"];
    } else return ["TEXT", "IMAGE"];
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
}
