export type ToolCatalogCategory =
  "document_retrieval" | "conversation_memory" | "meta";

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
