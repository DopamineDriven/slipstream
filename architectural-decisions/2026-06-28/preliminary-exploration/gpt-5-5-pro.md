You’re close. I’d build conversation memory as a sibling to `UserStore`, not as a special document type inside `UserStore`. The user-store implementation already gives you the right skeleton: scoped store → source/context record → chunk records with lifecycle state, provenance, embedding model, vector, text payload, `contentHash`, and `tsvector` for exact search. The memory schema is already pointed in that direction, but I’d tighten the range model, task lifecycle, and exact-search columns before writing the worker.

## The big things I’d change before shipping

### 1. Move memory to `voyage-context-4` everywhere, but make model/version explicit

Right now `memory.prisma` defaults the memory store and memory chunks to `voyage-context-3` (`ConversationMemoryStore.embeddingModel`, `ConversationMemoryChunk.embeddingModel`).   Your `VoyageEmbeddingService.embedChunksContextual()` already defaults to `voyage-context-4`, but the live user-store vector path still passes `voyage-context-3` explicitly in both indexing and query embedding.

I’d make memory default to:

```prisma
embeddingModel String @default("voyage-context-4")
embeddingDim   Int    @default(1024)
```

Voyage’s current docs list `voyage-context-4` as the recommended contextualized chunk embedding model, with a 32K per-chunk context window, 120K total context length, and flexible dimensions of 256/512/1024/2048. ([Voyage AI][1])

Important: keep `embeddingModel` and `embeddingDim` on the chunk, not only the store. You will want painless reindexing and mixed-era retrieval during migrations.

### 2. Make `ConversationMemoryChunk.embedding` nullable

This one is immediate. In `UserStoreDocChunk`, `embedding` is nullable, which matches the `QUEUED → EMBEDDING → READY/ERROR` lifecycle.  In `ConversationMemoryChunk`, `embedding` is currently required even though the chunk has `QUEUED`, `CHUNKING`, `EMBEDDING`, `INDEXED`, and `ERROR` states.

Make it:

```prisma
embedding Unsupported("vector(1024)")?
```

Otherwise you can’t safely create a durable chunk row before the Voyage call succeeds, which makes retries, leasing, and idempotency much uglier.

### 3. Use ordinal ranges as first-class columns

You already have the right primitive: `Message.ordinal Int`, unique per conversation.   User messages start at ordinal `0`, and AI messages are appended using `convoCount()` as the next ordinal.

`ConversationMemoryChunk` currently stores `messageIdStart`, `messageIdEnd`, timestamps, `messageIdsRaw`, and `chunkIndex`, but not ordinal bounds.  Add:

```prisma
ordinalStart        Int
ordinalEndInclusive Int
// or better:
ordinalEndExclusive Int
```

I strongly prefer **exclusive end** for sanity:

```ts
// messages covered: ordinalStart <= msg.ordinal < ordinalEndExclusive
[0, 8)  // messages 0..7
[8, 16) // messages 8..15
```

Then add:

```prisma
@@unique([conversationId, ordinalStart, ordinalEndExclusive, schemaVersion])
@@index([conversationId, ordinalStart])
@@index([conversationId, ordinalEndExclusive])
@@index([storeId, conversationId, ordinalStart])
```

I’d also replace `lastChunkedMessageIndex` with a clearer watermark:

```prisma
lastIndexedOrdinalExclusive Int @default(0)
lastSummarizedOrdinalExclusive Int @default(0)
```

`lastChunkedMessageIndex` is close, but “index” is easy to confuse with array index, chunk index, message ordinal, or transcript line index.

### 4. Do not rely on `Message.conversationMemoryChunkId` as the only source mapping

Currently `Message` has a single nullable `conversationMemoryChunkId`, and `ConversationMemoryChunk` has `messages Message[]`.    That works for a single active chunking pass, but it gets brittle once you reindex with a new `schemaVersion`, re-summarize with a new prompt version, or create synthetic summary messages.

I’d add an explicit join table and stop treating the nullable FK on `Message` as the canonical mapping:

```prisma
enum ConversationMemoryMessageRole {
  SOURCE
  SUMMARY_MESSAGE
}

model ConversationMemoryChunkMessage {
  chunkId        String
  messageId      String
  conversationId String
  ordinal        Int
  role           ConversationMemoryMessageRole @default(SOURCE)

  createdAt DateTime @default(now())

  chunk   ConversationMemoryChunk @relation(fields: [chunkId], references: [id], onDelete: Cascade)
  message Message                 @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@id([chunkId, messageId, role])
  @@index([messageId])
  @@index([conversationId, ordinal])
  @@index([chunkId, ordinal])
}
```

That gives you reindexing without overwriting message ownership, and it lets a summary message point at the same chunk without pretending it is one of the source messages.

### 5. Add exact-match search columns to memory now

The user-store hybrid implementation is the template. `UserStoreDocChunk` already has `contentTsv`, a GIN index, and a nullable vector.  The hybrid SQL has separate semantic and full-text CTEs, filters by store/model/state, uses `websearch_to_tsquery`, and marks overlap via `appearsInBothSignals`.    The existing migration pattern maintains `contentTsv` with a trigger on insert/update.

For memory, add at least one weighted search vector:

```prisma
transcriptTsv Unsupported("tsvector")?
summaryTsv    Unsupported("tsvector")?
searchTsv     Unsupported("tsvector")?
```

Then maintain it with SQL roughly like:

```sql
NEW."transcriptTsv" := to_tsvector('english', COALESCE(NEW."transcriptMarkdown", ''));
NEW."summaryTsv" := to_tsvector('english', COALESCE(NEW."summary", ''));

NEW."searchTsv" :=
  setweight(to_tsvector('english', COALESCE(NEW."summary", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(NEW."transcriptMarkdown", '')), 'B');
```

Index:

```sql
CREATE INDEX idx_memory_chunk_search_tsv
  ON "ConversationMemoryChunk" USING GIN ("searchTsv");
```

I’d search `searchTsv` by default, but expose `search_target: "summary" | "transcript" | "both"` in tooling later.

### 6. Add separate lifecycle for embedding and summarization

`MemoryChunkingState` currently conflates chunking, embedding, and final indexing.  But your target flow has two independent background steps: vector indexing and high-quality summarization.

I’d either split state columns:

```prisma
embeddingState MemoryEmbeddingState @default(QUEUED)
summaryState   MemorySummaryState   @default(QUEUED)
sectionState   MemorySectionState   @default(QUEUED)
```

or expand the enum:

```prisma
enum MemoryChunkingState {
  QUEUED
  TRANSCRIPT_RENDERING
  EMBEDDING
  SUMMARIZING
  INDEXED
  PARTIAL
  ERROR
  ABANDONED
}
```

Separate states are cleaner because embedding can succeed while summarization fails, and that section should still be semantically searchable.

Also add worker fields now:

```prisma
retryCount          Int @default(0)
summaryRetryCount   Int @default(0)
lockedAt            DateTime?
lockedBy            String?
leaseExpiresAt      DateTime?
lastError           String?
```

If you already have a queue elsewhere, this can live there instead, but the database should still be able to answer: “is this section done, partially done, failed, or being processed by another worker?”

### 7. Add a durable job table or at least idempotency columns

For “after every `n` messages” background processing, you need de-duping. Otherwise multiple WS instances or reconnects can enqueue the same ordinal window.

A minimal job table:

```prisma
enum ConversationMemoryJobType {
  INDEX_SECTION
  SUMMARIZE_SECTION
  REINDEX_SECTION
}

enum ConversationMemoryJobState {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  ABANDONED
}

model ConversationMemoryJob {
  id             String @id @default(cuid(2))
  userId         String
  storeId        String
  contextId      String
  conversationId String
  chunkId        String?

  type  ConversationMemoryJobType
  state ConversationMemoryJobState @default(QUEUED)

  ordinalStart        Int
  ordinalEndExclusive Int
  schemaVersion       MemorySchemaVersion @default(v1_0)

  inputHash     String
  attemptCount  Int @default(0)
  runAfter      DateTime @default(now())
  lockedAt      DateTime?
  lockedBy      String?
  leaseExpiresAt DateTime?
  lastError     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([conversationId, ordinalStart, ordinalEndExclusive, type, schemaVersion])
  @@index([state, runAfter])
  @@index([conversationId, ordinalStart])
}
```

Use `SELECT ... FOR UPDATE SKIP LOCKED` in the worker. That is the boring, battle-tested path.

### 8. Treat summaries as synthetic history, not normal conversation turns

Your `MessageType` enum currently has no memory-summary type.  If you append summaries as ordinary `TEXT` messages, your chunker will eventually summarize the summaries, then summarize summaries-of-summaries.

Add something like:

```prisma
enum MessageType {
  AUDIO_GEN
  COMPUTER_USE
  IMAGE_GEN
  DOC_GEN
  DEEP_RESEARCH
  TEXT
  VIDEO_GEN
  MEMORY_SUMMARY
}
```

Then on `ConversationMemoryChunk`:

```prisma
summaryMessageId String? @unique
summaryOrdinal   Int?
```

And on `Message`, or via the join table:

```prisma
isSyntheticMemory Boolean @default(false)
summarizesOrdinalStart Int?
summarizesOrdinalEndExclusive Int?
```

The chunker should exclude `MEMORY_SUMMARY` messages from source windows by default. You can still hydrate summaries into the visible conversation history or into provider context, but they should not contaminate raw conversation memory.

### 9. Normalize provider/model and attachments before it hurts

`providerModelsRaw` and `attachmentProvenanceIdsRaw` are useful as compact denormalized fields, but they will become painful for filters and traversal.  Keep the raw fields if you like, but add join tables:

```prisma
model ConversationMemoryChunkProviderModel {
  chunkId  String
  provider Provider
  model    String
  messageCount Int @default(0)

  @@id([chunkId, provider, model])
  @@index([provider, model])
}

model ConversationMemoryChunkAttachment {
  chunkId       String
  attachmentId  String
  userStoreDocId String?
  provenanceId String?
  messageId     String
  ordinal       Int
  filename      String?
  assetType     AssetType?

  @@id([chunkId, attachmentId])
  @@index([attachmentId])
  @@index([userStoreDocId])
  @@index([messageId])
}
```

That gives your future tool a natural hop:

conversation memory hit → message range → attachment provenance → user-store document chunks.

### 10. Add soft-delete/retention fields to memory

User-store docs and chunks already have `deletedAt`.   Memory should too:

```prisma
deletedAt DateTime?
```

Add it to store/context/chunk if you expect privacy deletion, conversation deletion, branch pruning, or reindex tombstoning.

## Transcript generator changes

Repurposing `apps/ws-server/src/test/transcript-gen.ts` is right, but I would turn it into a pure renderer rather than keeping the current script shape.

Current generator orders messages by `createdAt ASC`, while the schema gives you a real ordinal.  For memory sections, order by `ordinal ASC`, always. Also, the generator increments an array index with `++i` and uses that as `msgNumber`; that makes the transcript display 1-based numbers unrelated to the database ordinal.  For memory, render both:

```md
<message ordinal="0" id="..." sender="USER" provider="..." model="...">
...
</message>
```

and optionally display `#1` for humans. The machine key should be ordinal.

I’d also change these before using it for indexing:

```ts
renderConversationMemorySection({
  conversation,
  messages, // already filtered by ordinal range
  includeThinking: false,
  includeEncryptedThinking: false,
  includeAttachments: "provenance-links",
  timestampMode: "iso",
  ordinalBase: 0,
})
```

Message blocks include `TEXT`, `THINKING`, and `ENCRYPTED_THINKING`.  I would not index thinking by default. Store an explicit `transcriptIncludesThinking Boolean @default(false)` if you ever enable that for private/local modes.

## Suggested memory chunk shape

A practical `ConversationMemoryChunk` target:

```prisma
model ConversationMemoryChunk {
  id             String @id @default(cuid(2))
  provenanceId   String @unique

  contextId      String
  storeId        String
  userId         String
  conversationId String

  chunkIndex            Int
  ordinalStart          Int
  ordinalEndExclusive   Int
  messageIdStart        String
  messageIdEnd          String
  messageTimestampStart DateTime
  messageTimestampEnd   DateTime
  chunkedMessagesCount  Int @default(0)

  transcriptMarkdown        String @db.Text
  transcriptRendererVersion String @default("conversation-memory-transcript-v1")
  transcriptIncludesThinking Boolean @default(false)

  summary            String? @db.Text
  summaryModel       String?
  summaryProvider    Provider?
  summaryPromptVersion String?
  summaryGeneratedAt DateTime?
  summaryMessageId   String? @unique

  contentHash        String
  transcriptHash     String
  summaryInputHash   String?
  embeddingInputHash String?

  tokenCount         Int @default(0)
  summaryTokens      Int @default(0)

  embedding      Unsupported("vector(1024)")?
  embeddingModel String @default("voyage-context-4")
  embeddingDim   Int    @default(1024)
  embeddedAt     DateTime?

  transcriptTsv Unsupported("tsvector")?
  summaryTsv    Unsupported("tsvector")?
  searchTsv     Unsupported("tsvector")?

  embeddingState MemoryEmbeddingState @default(QUEUED)
  summaryState   MemorySummaryState   @default(QUEUED)
  sectionState   MemorySectionState   @default(QUEUED)

  boundaryReason MemoryChunkBoundaryReason?
  retryCount     Int @default(0)
  summaryRetryCount Int @default(0)
  lastError      String?

  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  context ConversationMemoryContext @relation(fields: [contextId], references: [id], onDelete: Cascade)

  @@unique([contextId, chunkIndex, schemaVersion])
  @@unique([conversationId, ordinalStart, ordinalEndExclusive, schemaVersion])
  @@index([storeId, embeddingModel])
  @@index([conversationId, ordinalStart])
  @@index([conversationId, ordinalEndExclusive])
  @@index([sectionState])
  @@index([embeddedAt])
  @@index([contentHash])
  @@index([embedding], map: "idx_memory_chunk_embedding_hnsw")
  @@index([searchTsv], map: "idx_memory_chunk_search_tsv", type: Gin)
}
```

I’d also add `MESSAGE_COUNT` to `MemoryChunkBoundaryReason`, since your first boundary condition is “after every `n` messages.” The existing enum has `TOKEN_LIMIT`, `IDLE_TIME`, `TOPIC_SHIFT`, `SESSION_END`, and `OTHER`.

## Indexing flow I’d implement

After a provider response is persisted, enqueue memory work without blocking the websocket response. Anthropic is a good insertion point because `handleAnthropicAiChatRequest()` persists the final assistant message via `handleAiChatResponse()`, sends the final event, and then returns.

The worker loop should be ordinal-watermark based:

```ts
const watermark = context.lastIndexedOrdinalExclusive; // starts at 0
const maxSourceOrdinalExclusive = await getMaxNonSyntheticOrdinalExclusive(conversationId);

if (maxSourceOrdinalExclusive - watermark >= MESSAGE_THRESHOLD) {
  const end = chooseEndByMessageCountAndTokenBudget(watermark, maxSourceOrdinalExclusive);
  enqueueUniqueJob({ conversationId, ordinalStart: watermark, ordinalEndExclusive: end });
}
```

Then worker:

```ts
claim job with SKIP LOCKED
fetch source messages where ordinal >= start && ordinal < end && messageType != MEMORY_SUMMARY
render transcript
create chunk row with embeddingState=EMBEDDING, summaryState=QUEUED
call voyage.contextualized_embed({
  model: "voyage-context-4",
  inputs: [[transcriptMarkdown]],
  input_type: "document",
  output_dimension: 1024
})
write vector, token count, embeddedAt, tsv fields
call summarizer model
write summary, summary metadata, summary tsv
optionally append synthetic MEMORY_SUMMARY message
advance context.lastIndexedOrdinalExclusive = end
```

Use message count as the trigger, but token budget as the final guard. `n` messages can be wildly different sizes.

## Hybrid memory search SQL

Make a sibling of `searchUserStoreChunksHybrid.sql`, not a generic abstraction yet. The current user-store SQL is clear and debuggable. It uses one semantic CTE, one full-text CTE, unions them, annotates the signal, and marks overlap.

Memory version should accept:

```sql
-- store/user scope
$1 storeId
$2 embedding
$3 semanticLimit
$4 threshold
$5 searchTerms?
$6 fulltextLimit
$7 embeddingModel

-- filters
$8 conversationId?
$9 includeInterConversation boolean
$10 ordinalStart?
$11 ordinalEndExclusive?
$12 provider?
$13 model?
```

Return:

```ts
{
  chunkId,
  conversationId,
  conversationTitle,
  ordinalStart,
  ordinalEndExclusive,
  messageIdStart,
  messageIdEnd,
  messageTimestampStart,
  messageTimestampEnd,
  summary,
  transcriptExcerpt,
  score,
  rank,
  signal: "semantic" | "fulltext",
  appearsInBothSignals,
  previousChunkId,
  nextChunkId
}
```

The previous/next chunk IDs matter for traversal. Search finds the doorway; traversal walks the room.

## Tooling shape

Your file-search tool already has the right user-facing contract: semantic `query`, optional `search_terms`, max results, and partitioned semantic/fulltext/overlap output.  The Anthropic handler already parses and executes `file_search` during tool rounds.

I’d add separate tools rather than overloading `file_search`:

```ts
conversation_memory_search({
  query: string,
  search_terms?: string,
  scope?: "current_conversation" | "all_conversations" | "branch" | "conversation_ids",
  conversation_ids?: string[],
  max_results?: number,
  threshold?: number,
  ordinal_start?: number,
  ordinal_end_exclusive?: number,
  include_transcript?: boolean,
  include_summary?: boolean
})
```

Then:

```ts
conversation_memory_get_chunk({
  chunk_id?: string,
  conversation_id?: string,
  ordinal_start?: number,
  ordinal_end_exclusive?: number,
  include_messages?: boolean,
  include_attachments?: boolean
})
```

And for graph-like movement:

```ts
conversation_memory_walk({
  chunk_id: string,
  direction: "previous" | "next" | "both",
  depth?: number
})
```

Default search result should return summaries plus short transcript excerpts. Full transcript should be opt-in.

## Priority order

I’d do the schema changes in this order:

1. Change memory defaults to `voyage-context-4`; make `embedding` nullable; add `embeddingDim`.
2. Add ordinal range columns and unique indexes.
3. Add `searchTsv`/`summaryTsv`/`transcriptTsv` plus trigger and GIN index.
4. Add summary/synthetic-message linkage without overloading source messages.
5. Add job/lease/idempotency support.
6. Normalize chunk-message, provider-model, and attachment edges.
7. Refactor `transcript-gen.ts` into a pure section renderer ordered by `Message.ordinal`.

The two changes I would absolutely not postpone are **ordinal range columns** and **nullable embeddings**. Those are foundational, and retrofitting them after you have indexed memory in production will be annoying.

[1]: https://docs.voyageai.com/docs/contextualized-chunk-embeddings "Contextualized Chunk Embeddings"
