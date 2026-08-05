import type { ToolCatalogEntry } from "@/tool-catalog/types.ts";
import type { Provider } from "@slipstream/types";

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
  /**
   * canonical id (left) → provider wire name (right). Standard for 9 of 12;
   * gemini, grok, and openai deviate because file_search clashes with internal
   * provider tool naming (xAI reserves it for collections; openai and gemini
   * providers ship user_store_search).
   */
  private get providerNameOverrides() {
    return {
      openai: { file_search: "user_store_search" },
      gemini: { file_search: "user_store_search" },
      grok: { file_search: "slather_user_store" }
    } as const satisfies Partial<Record<Provider, Record<string, string>>>;
  }

  private entries(p: Provider) {
    // resolved ONCE here — ids and pairsWith references below are wire names
    const file_search = this.toolNameFor("file_search", p);
    return [
      {
        id: file_search,
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
            tool: file_search,
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
        bestFor: [
          "orienting after waking up mid-conversation with unfamiliar tools"
        ],
        pairsWith: []
      }
    ] as const satisfies readonly ToolCatalogEntry[];
  }

  /**
   * Local read-only tool bridge (Sovereign CLI) — joins the registry only
   * for via: "cli" sockets. Wire names are canonical on every provider (no
   * overrides), and buildCatalog's active-list filter still applies, so an
   * unarmed CLI turn (--no-workspace) never reads about tools it can't call.
   */
  private get localToolEntries() {
    return [
      {
        id: "repo_search",
        category: "local_workspace",
        summary:
          "Ripgrep over the user's live workspace — executed by their CLI on their machine, returning file:line matches with surrounding context.",
        bestFor: [
          "locating symbols, definitions, and call sites across the checkout",
          "answering 'where is X handled' from the real source of truth",
          "scoping the territory before a targeted read_file dig"
        ],
        pairsWith: [
          {
            tool: "read_file",
            how: "search finds the doorway; read_file walks the room — expand hits with line-ranged reads"
          },
          {
            tool: "file_search",
            how: "repo_search reads the LIVE checkout; file_search reads what the user UPLOADED — provenance differs, pick accordingly"
          }
        ]
      },
      {
        id: "read_file",
        category: "local_workspace",
        summary:
          "Line-ranged windows of a workspace file — bounded output from the user's machine, exact enough to cite file:line.",
        bestFor: [
          "reading the exact lines behind a repo_search hit",
          "walking a large file window by window",
          "grounding claims about the user's code in the code itself"
        ],
        pairsWith: [
          {
            tool: "repo_search",
            how: "search finds the doorway; read_file walks the room — expand hits with line-ranged reads"
          }
        ]
      },
      {
        id: "list_directory",
        category: "local_workspace",
        summary:
          "Bounded directory listing of the user's workspace — orientation before targeted reads.",
        bestFor: [
          "mapping unfamiliar project structure",
          "finding candidate paths when search terms are still unknown"
        ],
        pairsWith: [
          {
            tool: "repo_search",
            how: "list to orient, then search the promising subtree"
          },
          {
            tool: "read_file",
            how: "listing surfaces the filenames; read_file opens them"
          }
        ]
      }
    ] as const satisfies readonly ToolCatalogEntry[];
  }

  /** the wire name a canonical tool ships under for a given provider */
  private toolNameFor(canonicalId: string, provider: Provider) {
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
   * the registry for one provider — entries(p) already carries wire names;
   * via: "cli" folds the local read-only bridge entries in (their wire
   * names are canonical everywhere)
   */
  public entriesFor(provider: Provider, via: "web" | "cli" = "web") {
    const registry =
      via === "cli"
        ? [...this.entries(provider), ...this.localToolEntries]
        : this.entries(provider);
    return registry.map(({ id, ...rest }) => ({
      name: id,
      ...rest
    }));
  }

  /**
   * Build the catalog response from the tool names ACTUALLY shipped in the
   * request (wire names, post-mapping). Unknown/native tools (web_search,
   * code_execution, ...) pass through unlisted — the catalog documents the
   * in-house toolkit, not the provider's own surface. via: "cli" admits the
   * local bridge entries into the registry; the active-list filter still
   * decides what the model actually reads about.
   */
  public buildCatalog(
    provider: Provider,
    activeToolNames: readonly string[],
    via: "web" | "cli" = "web"
  ) {
    const active = new Set(activeToolNames);
    const tools = this.entriesFor(provider, via).filter(t =>
      active.has(t.name)
    );
    return JSON.stringify({
      tools,
      note: "Catalog reflects tools available in this request. Use as liberally or conservatively as you see fit."
    });
  }
}
