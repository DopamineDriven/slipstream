Andrew: awww I should make an analytics table to track which providers pull up which chunks over time (a running count, not just a true or false) and see if there is any sort of retrieval bias happening at the provider level

Fable (on claude.ai): 

Do it — and log *events*, derive the counts. A raw counter can tell you bias exists; it can't tell you which of the four distinct channels it's flowing through, and they have completely different interpretations:

1. **Query formulation** — providers write different search strings for the same intent (lexical vs. conceptual phrasing). This shapes what the ranker *serves* them.
2. **Expansion selection** — given the same result list, which hits does the model actually `get_chunk` on? Served vs. *consumed* is the crucial split; a model can be handed identical results and read entirely different rooms.
3. **Traversal appetite** — who follows `previous`/`next` chains, and how deep. This is the episodic-reconstruction behavior, and I'd bet real money it varies wildly by provider.
4. **Exposure** — raw counts are hopelessly confounded by usage: if Sol gets summoned into fish-adjacent conversations more often, Sol retrieves fish chunks more often, no bias required. Everything needs normalizing per-opportunity (per search issued, per turn with tools available), not per-calendar-month.

The clean part of your setup: the retrieval pipeline is provider-agnostic — same lanes, same scoring for all twelve — so any provider-level divergence enters *only* through query text and read choices. The ranker is a controlled variable, which makes this actually interpretable in a way most retrieval-bias studies aren't.

Schema-wise, an append-only fact table with the rollup as a materialized view:

```sql
CREATE TABLE memory_retrieval_event (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  call_id       uuid NOT NULL,            -- groups events within one tool call
  provider      text NOT NULL,
  model         text NOT NULL,
  conversation_id        uuid NOT NULL,   -- where retrieval happened
  chunk_id      uuid NOT NULL REFERENCES memory_chunk(id),
  source_conversation_id uuid NOT NULL,   -- where the chunk lives
  event_kind    text NOT NULL CHECK (event_kind IN ('search_hit','expansion_read','traversal_read')),
  lane          text CHECK (lane IN ('semantic','fulltext','both')),
  rank_in_lane  smallint,                 -- NULL for traversal
  query_text    text                      -- NULL except search_hit; enables query-style analysis
);
```

Keeping `rank_in_lane` lets you separate "the ranker put it at #1" from "the model chose it from #7" — expansion reads that reach deep into the list are the strongest evidence of genuine model preference. And `conversation_id ≠ source_conversation_id` gives you cross-conversation reach per provider for free.

Two analyses I'd preregister now, because you'll want to claim you predicted them:

**The Narcissus coefficient.** Chunks carry fleet notation, so every chunk has known speaker composition. Does a provider preferentially expand chunks where *its own tag* appears, relative to base rate? Self-retrieval bias is the single most interesting measurable in this whole design — P(expand | own voice present) / P(expand overall), per provider. Whether Barry disproportionately excavates Barry is a publishable-flavored question.

**Retrieval is self-exciting, so counts aren't i.i.d.** When a chunk gets retrieved, it gets *discussed*, the discussion gets indexed, the new chunks lexically and semantically echo the old one, and the whole neighborhood becomes more retrievable. Rich-get-richer — the fish isn't just a benchmark, it's an attractor the archive is actively deepening. Practically: track first-retrieval vs. re-retrieval separately, and expect count distributions to go heavy-tailed over time regardless of provider. Provider bias is divergence *between* providers' distributions (Jensen-Shannon between their normalized chunk-retrieval distributions works well and handles sparsity better than chi-square on the raw contingency), not shape of the tail.

The satisfying symmetry: the write path already has audition receipts per arm — model, usage, tool rounds. This is the identical discipline pointed at the read path. HMEM stops just having memories and starts having a *historiography* — a record not only of what the archive contains but of who keeps returning to which shelves, and whether the fleet reads the past the way it wrote it.
