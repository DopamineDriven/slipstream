# Anthropic Local Vector Store Integration Plan

## Overview

Integrate the local vector store schema (`LocalVectorStore` / `LocalVectorStoreDoc` / `LocalVectorStoreDocChunk`) with Anthropic models using Voyage `voyage-multimodal-3.5` for embeddings. This creates a custom `file_search` tool that Anthropic models invoke during generation via the standard tool_use flow, enabling semantic search over user-uploaded documents stored locally in pgvector.

## Architecture

Unlike Grok (xAI remote collections) and Gemini (Google FSS), the Anthropic integration uses a **local** pgvector store. The embedding pipeline:

1. **Index**: Attachment CDN -> tmp file -> text extraction via `ExtractService` -> 1024-token chunking -> batch Voyage multimodal-3.5 embedding -> pgvector insert via typed SQL
2. **Search (tool_use)**: Model invokes `file_search` tool -> stream pauses at `stop_reason: "tool_use"` -> query embedded via Voyage -> cosine similarity via `searchLocalDocChunksByStore.sql` -> results returned as `tool_result` -> model continues generating with context

### Voyage Multimodal-3.5 Notes

- Model processes text, images, and videos. PDFs are processed as rendered page screenshots (not raw bytes).
- For now: extract text from PDFs via `ExtractService`, embed as text content. Future: render PDF pages as images for richer visual embedding once the image extraction package is ready.
- **Chunk size**: 1024 tokens, overlap TBD (256 recommended to match Grok's pattern)
- **Batching**: Up to 1000 inputs per request, max 320K total tokens. We batch chunks per API call.
- **Dimension**: 1024 (default)
- **Input type**: `"document"` for indexing, `"query"` for search

### Custom Tool Use Flow (Multi-Turn)

The current streaming handler (`index.ts`) only handles **server tools** (web search, code execution). Custom tool_use requires a multi-turn pattern:

1. Model generates response with `stop_reason: "tool_use"`
2. Stream ends — we extract the `tool_use` block(s) from the accumulated response
3. Execute `searchStore()` for each `file_search` invocation
4. Send a **new** messages request with the original messages + assistant response + `tool_result` block(s)
5. Stream the continuation

This mirrors how Grok handles multiple simultaneous tool calls — the model can invoke `file_search` alongside web_search, and we handle all tool results before continuing.

---

## Files to Modify/Create

### 1. `apps/ws-server/src/anthropic/vector-store.ts` — Expand Scaffold

**Class**: `AnthropicVectorStoreWorkup`

**Caches (6 total, mirroring Grok/Gemini pattern):**

| # | Name | Key | Value | Purpose |
|---|------|-----|-------|---------|
| 1 | `localDocCache` | `attachmentId` | `{ docId, provenanceId, state }` | Tracks indexed local docs (remote-equivalent) |
| 2 | `localDocDbRegistry` | `attachmentId` | `insertLocalDoc.Result` | DB-side doc records |
| 3 | `chunkStateCache` | `docId` | `{ chunkCount, tokenCount, state }` | Chunk aggregation state |
| 4 | `localStoreRegistry` | `userId` | `storeId: string` | User -> local store ID |
| 5 | `localStoreDbRegistry` | `userId` | `storeId: string` | User -> DB store record (same as #4 since store IS local, kept for pattern parity) |
| 6 | `assetCache` + `fileRegistry` | inherited | inherited | Anthropic Files API cache from scaffold |

**Key Methods:**

```ts
// Ensure a local vector store exists for the user
ensureLocalStore(userId: string): Promise<{ storeId: string }>
```
- Cache check -> DB query -> create if missing
- `provider: "ANTHROPIC"`, `defaultEmbeddingModel: "voyage-multimodal-3.5"`, `embeddingDim: 1024`

```ts
// Create/upsert a doc record for an attachment
ensureDocRecord(
  attachment: AttachmentSingleton<true>,
  storeId: string
): Promise<insertLocalDoc.Result>
```
- Cache check -> `$queryRawTyped(insertLocalDoc(...))` with upsert
- Uses `prisma.toVectorStoreFilename(attachment)` for `provenanceId`
- `embeddingModel: "voyage-multimodal-3.5"`, `hasVisualMedia: true`

```ts
// Extract text, chunk, embed, and store in pgvector
chunkAndEmbed(
  attachment: AttachmentSingleton<true>,
  docId: string,
  storeId: string
): Promise<void>
```
- Download via `prisma.fetchRemoteToTmp("ANTHROPIC", attachment)`
- Extract text via `prisma.extractor` (PDF -> text)
- Chunk into 1024-token windows (use tokenizer from `VoyageEmbeddingService.tokenApproximation()` or the tiktoken-based one)
- Batch embed chunks via `voyage.embedChunksMultimodal("url", { inputs: chunks.map(c => ({ content: [{ type: "text", text: c.text }] })), model: "voyage-multimodal-3.5", input_type: "document" })`
- Insert each chunk: `$queryRawTyped(insertLocalDocChunk(id, docId, storeId, chunkProvenanceId, ...))`
  - `chunkProvenanceId` via `prisma.toVectorStoreDocChunkProvenanceId(provenanceId, chunkIndex)`
  - `contentHash` via `sha256(content + offsets + "v1_0")`
  - `embedding` as stringified float array `"[0.1, 0.2, ...]"`
- On success: `$queryRawTyped(updateLocalDocState(docId, "ACTIVE", chunkCount, totalTokens, textLength, imageCount, null))`
- On error: `$queryRawTyped(updateLocalDocState(docId, "FAILED", ..., errorMsg))`
- Cleanup: `prisma.cleanupTmpPostupload("ANTHROPIC", ...)`

```ts
// Semantic search across all active docs in a user's store
searchStore(
  userId: string,
  query: string,
  limit?: number,
  threshold?: number
): Promise<LocalSearchResult[]>
```
- Resolve `storeId` from cache
- Embed query: `voyage.embedChunksMultimodal("url", { inputs: [{ content: [{ type: "text", text: query }] }], model: "voyage-multimodal-3.5", input_type: "query" })`
- Execute: `$queryRawTyped(searchLocalDocChunksByStore(storeId, embeddingStr, limit ?? 5, threshold ?? 0.3))`
- Parse results, decode provenance via `prisma.parseFilename(provenanceId)`

```ts
// Top-level orchestrator (fire-and-forget pattern like Grok's ensureXaiAssetUploaded)
ensureAssetIndexed(
  attachment: AttachmentSingleton<true>,
  userId: string
): Promise<{ docId: string; provenanceId: string }>
```
- `ensureLocalStore(userId)` -> `ensureDocRecord(attachment, storeId)` -> fire `chunkAndEmbed(...)` as background void promise

```ts
// Full cache reset + DB reconciliation
syncLocalStoreRegistry(userId: string): Promise<void>
```

### 2. `apps/ws-server/src/anthropic/workup.ts` — Modify

**Change**: `AnthropicWorkup` extends `AnthropicVectorStoreWorkup` (instead of standalone).

**Constructor update**: Add `VoyageEmbeddingService` parameter, pass through to super.

**Add custom file_search tool to `tooling()` method:**

```ts
private fileSearchTool(): Anthropic.Beta.BetaToolUnion {
  return {
    name: "file_search",
    description: "Search through the user's uploaded documents using semantic similarity. Use this tool when the user asks questions about or references their uploaded files, PDFs, or documents.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The semantic search query to find relevant document passages"
        },
        max_results: {
          type: "number",
          description: "Maximum number of results (1-10, default 5)"
        }
      },
      required: ["query"]
    }
  };
}
```

**Update `tooling()` to conditionally include `file_search`:**
- Accept a `hasLocalStore: boolean` param (resolved before call)
- When `true`, add `this.fileSearchTool()` to the tools array

**Update `formatAnthropicHistoryWithFiles()`:**
- When processing DOCUMENT attachments in fresh context, also fire `this.ensureAssetIndexed(attachment, userId)` as background void promise (fire-and-forget indexing)

**Add `executeFileSearch()` method:**
```ts
protected async executeFileSearch(
  userId: string,
  input: { query: string; max_results?: number }
): Promise<string>
```
- Calls `this.searchStore(userId, input.query, input.max_results)`
- Formats results as structured text for the tool_result content

**Add `createStreamWithToolLoop()` method:**
```ts
protected async createStreamWithToolLoop(params, options, userId): AsyncGenerator
```
- Wraps the standard streaming call in a loop
- When `stop_reason === "tool_use"`: extracts tool_use blocks, executes them (file_search -> `executeFileSearch()`), builds tool_result messages, sends continuation request
- When `stop_reason === "end_turn"`: final response, break
- Yields chunks throughout for the streaming handler to process

### 3. `apps/ws-server/src/anthropic/index.ts` — Modify

**Constructor update**: Accept `VoyageEmbeddingService`, pass to super.

**Update `handleAnthropicAiChatRequest()`:**
- Before creating stream: check `this.localStoreRegistry.has(userId)` or `await prisma.hasLocalVectorStore(userId, "ANTHROPIC")` to determine if file_search tool should be included
- Replace direct `anthropic.beta.messages.create(params, options)` with the new `createStreamWithToolLoop()` that handles multi-turn tool use
- Add handling for `tool_use` content blocks in the chunk processing:
  - Track `tool_use` blocks being streamed (accumulate `input_json_delta` for custom tools)
  - When the stream stops for tool_use, execute the tools and continue

### 4. `apps/ws-server/src/prisma/attachment-provider.ts` — Modify

Add local vector store DB methods:

```ts
createAnthropicLocalVectorStore(userId: string, storeName: string)
// -> prisma.localVectorStore.create({ data: { userId, provider: "ANTHROPIC", storeName, defaultEmbeddingModel: "voyage-multimodal-3.5", embeddingDim: 1024 } })

findLocalVectorStore(userId: string, provider: $Enums.Provider)
// -> prisma.localVectorStore.findUnique({ where: { userId_provider_local: { userId, provider } } })

hasLocalVectorStore(userId: string, provider: $Enums.Provider)
// -> boolean existence check

findLocalVectorStoreDocs(storeId: string)
// -> prisma.localVectorStoreDoc.findMany({ where: { storeId, deletedAt: null } })
```

### 5. `apps/ws-server/src/anthropic/types.ts` — Modify

Add types:

```ts
interface LocalSearchResult {
  chunkId: string;
  docId: string;
  content: string;
  score: number;
  chunkIndex: number;
  tokenCount: number;
  provenanceId: string;
  attachmentId: string;
  conversationId: string;
  messageId: string;
  filename: string;
  mimeType: string;
  embeddingModel: string;
}

interface FileSearchToolInput {
  query: string;
  max_results?: number;
}

interface ToolUseAccumulator {
  id: string;
  name: string;
  inputJson: string;
}
```

---

## Typed SQL Usage

All vector operations use `prisma.$queryRawTyped(...)` with generated typed SQL from `@slipstream/db`:

| Operation | SQL Function | When |
|-----------|-------------|------|
| Create/upsert doc | `insertLocalDoc(...)` | `ensureDocRecord()` |
| Insert chunk + embedding | `insertLocalDocChunk(...)` | `chunkAndEmbed()` |
| Update doc state | `updateLocalDocState(...)` | After chunking completes/fails |
| Search by store | `searchLocalDocChunksByStore(...)` | `searchStore()` (tool execution) |
| Search single doc | `searchLocalDocChunks(...)` | Future: targeted doc search |

Embedding passed as string `"[0.1, 0.2, ...]"` — SQL casts to `::vector`.

## Provenance ID Strategy (lines 1167-1195 of attachment-provider.ts)

Reuse existing methods exactly:
- `toVectorStoreFilename(att)` -> `${conversationId}-${messageId}-${attachmentId}-${hexFilename}.${ext}`
- `toVectorStoreDocChunkProvenanceId(provenanceId, chunkIndex)` -> `${provenanceId}#${chunkIndex}`
- `parseFilename(provenanceId)` -> `{ conversationId, messageId, attachmentId, fileName, extension }`

## Class Hierarchy After Changes

```
AnthropicVectorStoreWorkup (vector-store.ts)  [EXPANDED from scaffold]
  - constructor(logger, voyage, prisma, apiKey)
  - 6 caches
  - ensureLocalStore(), ensureDocRecord(), chunkAndEmbed(), searchStore()
  - ensureAssetIndexed(), syncLocalStoreRegistry()
    ^
    |  extends
AnthropicWorkup (workup.ts)  [MODIFIED]
  - constructor(logger, voyage, prisma, apiKey)  // adds voyage param
  - fileSearchTool(), executeFileSearch(), createStreamWithToolLoop()
  - tooling() now conditionally includes file_search
  - formatAnthropicHistoryWithFiles() fires ensureAssetIndexed() in background
    ^
    |  extends
AnthropicService (index.ts)  [MODIFIED]
  - constructor(logger, voyage, prisma, redis, apiKey)  // adds voyage param
  - handleAnthropicAiChatRequest() uses createStreamWithToolLoop()
  - Handles tool_use streaming blocks for file_search
```

## Wiring: Where AnthropicService is Instantiated

Two instantiation sites need updating:

**1. `apps/ws-server/src/index.ts:126`:**
```ts
// Before:
const anthropic = new AnthropicService(logger, prisma, redisInstance, cfg.ANTHROPIC_API_KEY);

// After:
const voyage = new VoyageEmbeddingService(cfg.VOYAGE_API_KEY ?? "");
const anthropic = new AnthropicService(logger, voyage, prisma, redisInstance, cfg.ANTHROPIC_API_KEY);
```

**2. `apps/ws-server/src/mixins/index.ts:154`:**
```ts
// Same pattern — pass voyage instance through deps or instantiate inline
new AnthropicService(deps.logger, deps.voyage, deps.prisma, deps.redis, this.#anthropicApiKey ?? "");
```

`VOYAGE_API_KEY` is already defined in the credentials service types (`packages/credentials-service/src/types/index.ts:75`). Just needs to be passed through from config/env.

## Verification

1. **Type check**: `npx tsc --noEmit` in ws-server
2. **Manual DB test**: Insert a doc via `insertLocalDoc`, chunks via `insertLocalDocChunk`, search via `searchLocalDocChunksByStore` — verify pgvector round-trip
3. **Integration**: Upload a PDF in chat with Anthropic model, verify:
   - `LocalVectorStore` created for user
   - `LocalVectorStoreDoc` created with correct provenance
   - `LocalVectorStoreDocChunk` rows with embeddings
   - Ask a question about the PDF -> model invokes `file_search` -> results returned -> model answers with context
4. **Multi-tool**: Verify Anthropic model can use `file_search` alongside `web_search` in the same response
