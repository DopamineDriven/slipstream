import type { Provider } from "@slipstream/types";

export type ToolCatalogCategory =
  | "document_retrieval"
  | "conversation_memory"
  | "meta";

export interface ToolCatalogEntry {
  /** canonical tool id — providers map to their wire names via toolNameFor */
  id: string;
  category: ToolCatalogCategory;
  /** one-breath description: what it is + when to reach for it */
  summary: string;
  bestFor: readonly string[];
  /** the relational layer descriptions can't carry — how tools compose */
  pairsWith: readonly { tool: string; how: string }[];
}

/**
 * Provider-agnostic tool catalog — the single registry the `tool_catalog`
 * meta-tool answers from. Derive, don't duplicate: guidance lives HERE once,
 * per-provider wire names resolve through toolNameFor, and the response is
 * built from the tool names actually shipped in the request so a model never
 * reads about a capability it can't call.
 *
 * Dep-free by design (mirrors the models service) — pure registry + formatting.
 */
export class ToolCatalogService {
  /** xAI reserves file_search for its own collections — grok ships slather_user_store */
  private get providerNameOverrides() {
    return {
      grok: { file_search: "slather_user_store" }
    } as const satisfies Partial<Record<Provider, Record<string, string>>>;
  }

  private get entries() {
    return [
      {
        id: "file_search",
        category: "document_retrieval",
        summary:
          "Partitioned Foraging over the user's uploaded documents — semantic by default, plus a fulltext lane (with Jaccard overlap) when search_terms is provided.",
        bestFor: [
          "grounding claims in the user's own uploads",
          "finding the passage the user is paraphrasing from memory",
          "fuzzy filename-scoped digs (the filename filter)"
        ],
        pairsWith: [
          {
            tool: "conversation_memory_search",
            how: "documents hold what the user KEEPS; memory holds what was SAID about it — search both when provenance matters"
          }
        ]
      },
      {
        id: "conversation_memory_search",
        category: "conversation_memory",
        summary:
          "Memory reunification over indexed conversation history (HMEM) — firsthand transcript sections, semantic + fulltext lanes, current conversation by default; a conversation_title filter (or scope: all_conversations) ranges the whole archive.",
        bestFor: [
          "recalling exchanges beyond your context window",
          "cross-conversation recall by loose title ('the Catullan one')",
          "dating or attributing something a model said earlier"
        ],
        pairsWith: [
          {
            tool: "conversation_memory_get_chunk",
            how: "search is the lay of the land; get_chunk is to dig in and expand — dual wield"
          },
          {
            tool: "file_search",
            how: "when a remembered discussion cites an uploaded doc, chase the citation into the archive"
          }
        ]
      },
      {
        id: "conversation_memory_get_chunk",
        category: "conversation_memory",
        summary:
          "Fetch one indexed memory section in full — by chunk_id, or conversation_id + ordinal; direction: previous/next walks adjacent sections.",
        bestFor: [
          "expanding a promising search hit into its full firsthand transcript",
          "walking a conversation section-by-section once you have a foothold",
          "pulling the verbatim range behind a substituted summary in your history"
        ],
        pairsWith: [
          {
            tool: "conversation_memory_search",
            how: "search is the lay of the land; get_chunk is to dig in and expand — dual wield"
          }
        ]
      },
      {
        id: "tool_catalog",
        category: "meta",
        summary:
          "This catalog — relational guidance for the toolkit shipped with THIS request.",
        bestFor: ["orienting after waking up mid-conversation with unfamiliar tools"],
        pairsWith: []
      }
    ] as const satisfies readonly ToolCatalogEntry[];
  }

  /** the wire name a canonical tool ships under for a given provider */
  public toolNameFor(canonicalId: string, provider: Provider) {
    const overrides = this.providerNameOverrides;
    if (provider in overrides) {
      const map = overrides[provider as keyof typeof overrides];
      if (canonicalId in map) {
        return map[canonicalId as keyof typeof map] as string;
      }
    }
    return canonicalId;
  }

  /**
   * Build the catalog response from the tool names ACTUALLY shipped in the
   * request (wire names, post-mapping). Unknown/native tools (web_search,
   * code_execution, ...) pass through unlisted — the catalog documents the
   * in-house toolkit, not the provider's own surface.
   */
  public buildCatalog(provider: Provider, activeToolNames: readonly string[]) {
    const active = new Set(activeToolNames);
    const tools = this.entries
      .filter(entry => active.has(this.toolNameFor(entry.id, provider)))
      .map(entry => ({
        name: this.toolNameFor(entry.id, provider),
        category: entry.category,
        summary: entry.summary,
        bestFor: entry.bestFor,
        pairsWith: entry.pairsWith.map(p => ({
          tool: this.toolNameFor(p.tool, provider),
          how: p.how
        }))
      }));
    return JSON.stringify({
      tools,
      note: "Catalog reflects tools available in this request. Use as liberally or conservatively as you see fit."
    });
  }
}
