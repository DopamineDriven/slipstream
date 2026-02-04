# Anthropic Local Vector Store Integration Plan

## Overview

Integrate the local vector store schema (`LocalVectorStore` / `LocalVectorStoreDoc` / `LocalVectorStoreDocChunk`) with Anthropic models using Voyage `voyage-multimodal-3.5` for embeddings and `@d0paminedriven/pdfdown` for PDF extraction. Creates a custom `file_search` tool that Anthropic models invoke via standard tool_use flow for semantic search over user documents stored in pgvector.

## Architecture

### Embedding Pipeline

```
Attachment CDN
  → fetchRemoteToTmp() downloads PDF to /tmp
  → PdfDown(buffer).documentAsync() extracts { text[], images[], annotations[], metadata }
  → Page-aware multimodal chunking:
      - Group pages into chunks targeting ~1024 text tokens per chunk
      - For each chunk, build a Voyage Multimodal.Input.Contents<"base64"> with:
        • { type: "text", text: concatenated page text }
        • { type: "image_base64", image_base64: "data:image/png;base64,..." } for each extracted image
      - Respect per-input 32K token limit (560px = 1 image token)
  → Batch embed via voyage.embedChunksMultimodal("base64", { inputs, model: "voyage-multimodal-3.5", input_type: "document" })
  → Insert chunks + vectors via $queryRawTyped(insertLocalDocChunk(...))
  → Update doc state via $queryRawTyped(updateLocalDocState(...))
```

### Search (Tool Use)

```
Model generates → stop_reason: "tool_use" (name: "file_search")
  → Extract tool_use block(s) from streamed response
  → Embed query via voyage.embedChunksMultimodal("base64", { inputs: [{ content: [{ type: "text", text: query }] }], input_type: "query" })
  → $queryRawTyped(searchLocalDocChunksByStore(storeId, embedding, limit, threshold))
  → Send tool_result back → model continues with context
```

### Voyage Multimodal-3.5 Constraints

- Per-input: max 32K tokens (560px of image = 1 token, 1120px of video = 1 token)
- Per-request: max 1000 inputs, max 320K total tokens
- Dimension: 1024
- Input types: `"document"` for indexing, `"query"` for search
- Content types for `"base64"` mode: `text`, `image_base64`, `video_base64`

### Custom Tool Use Flow (Multi-Turn)

Current streaming handler only handles **server tools** (web search). Custom tool_use requires:

1. Model generates with `stop_reason: "tool_use"` — stream ends
2. Extract accumulated `tool_use` block(s) from response
3. Execute `searchStore()` for each `file_search` invocation (parallel if multiple)
4. Send new messages request: original messages + assistant response + `tool_result` block(s)
5. Stream the continuation — repeat if model calls another tool

---

## Files to Modify/Create

### 1. `apps/ws-server/src/anthropic/vector-store.ts` — Expand Scaffold

**Class**: `AnthropicVectorStoreWorkup`

**Caches (6 total, mirroring Grok/Gemini pattern):**

| # | Name | Key | Value | Purpose |
|---|------|-----|-------|---------|
| 1 | `localDocCache` | `attachmentId` | `{ docId, provenanceId, state }` | Indexed local docs |
| 2 | `localDocDbRegistry` | `attachmentId` | `insertLocalDoc.Result` | DB-side doc records |
| 3 | `chunkStateCache` | `docId` | `{ chunkCount, tokenCount, state }` | Chunk aggregation state |
| 4 | `localStoreRegistry` | `userId` | `storeId: string` | User -> local store ID |
| 5 | `localStoreDbRegistry` | `userId` | `storeId: string` | User -> DB store record |
| 6 | `assetCache` + `fileRegistry` | inherited | inherited | Anthropic Files API cache |

**Key Methods:**

#### `ensureLocalStore(userId: string): Promise<{ storeId: string }>`
- Cache check -> `prisma.findLocalVectorStore(userId, "ANTHROPIC")` -> create if missing
- `provider: "ANTHROPIC"`, `defaultEmbeddingModel: "voyage-multimodal-3.5"`, `embeddingDim: 1024`

#### `ensureDocRecord(attachment: AttachmentSingleton<true>, storeId: string): Promise<insertLocalDoc.Result>`
- Cache check -> `$queryRawTyped(insertLocalDoc(...))` with upsert
- `provenanceId` via `prisma.toVectorStoreFilename(attachment)`
- `embeddingModel: "voyage-multimodal-3.5"`, `hasVisualMedia` based on `pdfDoc.totalImages > 0`

#### `chunkAndEmbed(attachment: AttachmentSingleton<true>, docId: string, storeId: string): Promise<void>`

This is the core method. PdfDown-powered extraction + page-aware multimodal chunking:

```ts
const { absTmpPath, tmpUniquename, mime } =
  await this.prisma.fetchRemoteToTmp("ANTHROPIC", attachment);
try {
  // 1. Stream file to buffer (not readFileSync — use createReadStream + async iteration)
  const rs = createReadStream(absTmpPath);
  const iterate = rs.iterator() as NodeJS.AsyncIterator<Buffer, undefined, any>;
  const arr = Array.of<Buffer>();
  for await (const chunk of iterate) arr.push(chunk);
  const buf = Buffer.concat(arr);

  // 2. Extract via PdfDown (Rust NAPI-RS, runs on libuv thread pool)
  const { PdfDown } = await import("@d0paminedriven/pdfdown");
  const pdfDown = new PdfDown(buf);
  const pdfDoc = await pdfDown.documentAsync();

  // 3. Build page-image index
  const imagesByPage = new Map<number, PageImage[]>();
  for (const img of pdfDoc.images) {
    const existing = imagesByPage.get(img.page);
    existing ? existing.push(img) : imagesByPage.set(img.page, [img]);
  }

  // 4. Page-aware chunking
  //    Walk pdfDoc.text[] sequentially, accumulate pages into chunks
  //    targeting ~1024 text tokens per chunk
  //    (use tokenApproximation() for fast estimation)
  //    For each chunk, collect images from those pages via imagesByPage
  //    Estimate image tokens: sum(img.width * img.height / (560 * 560)) per image
  //    If total (text + image) tokens exceeds 32K per-input limit,
  //      split: text-only chunk, then image-only chunk(s) for oversized pages
  //    Build Voyage.Multimodal.Input.Contents<"base64">:
  //    {
  //      content: [
  //        { type: "text", text: concatenatedPageText },
  //        ...images.map(img => ({
  //          type: "image_base64" as const,
  //          image_base64: `data:image/png;base64,${img.data.toString("base64")}`
  //        }))
  //      ]
  //    }

  // 5. Batch embed: group chunks into batches (320K total tokens / 1000 inputs max)
  //    const result = await voyage.embedChunksMultimodal("base64", {
  //      inputs: batchInputs,
  //      model: "voyage-multimodal-3.5",
  //      input_type: "document"
  //    })

  // 6. Insert chunks: for each (chunk, embedding) pair:
  //    - id: createId() (cuid2)
  //    - chunkProvenanceId: prisma.toVectorStoreDocChunkProvenanceId(provenanceId, chunkIndex)
  //    - content: text portion of the chunk (stored for retrieval display)
  //    - contentHash: sha256(content + startOffset + endOffset + "v1_0")
  //    - embedding: `[${embedding.join(",")}]` (stringified float array for ::vector cast)
  //    - tokenCount: estimated tokens for this chunk
  //    - startOffset / endOffset: first page number, last page number in chunk
  //    $queryRawTyped(insertLocalDocChunk(...))

  // 7. Update doc state
  //    $queryRawTyped(updateLocalDocState(docId, "ACTIVE", chunkCount, totalTokens, extractedTextLength, imageCount, null))
} catch (err) {
  // On error: mark doc FAILED
  // $queryRawTyped(updateLocalDocState(docId, "FAILED", null, null, null, null, this.prisma.safeErrMsg(err)))
  this.logger.error(this.prisma.safeErrMsg(err));
  throw new Error(this.prisma.safeErrMsg(err));
} finally {
  // Always cleanup tmp file — same pattern as Grok's streamUploadFileWorkup
  this.prisma.cleanupTmpPostupload("ANTHROPIC", absTmpPath, tmpUniquename);
}
```

**Note on non-PDF documents:** For non-PDF attachments (images, plain text), fall back to simpler paths:
- Images: single multimodal input with `image_base64` or `image_url`
- Text files: read content, chunk by tokens, embed as text-only inputs

#### `searchStore(userId: string, query: string, limit?: number, threshold?: number): Promise<LocalSearchResult[]>`
- Resolve storeId from `localStoreRegistry`
- Embed query: `voyage.embedChunksMultimodal("base64", { inputs: [{ content: [{ type: "text", text: query }] }], model: "voyage-multimodal-3.5", input_type: "query" })`
- Execute: `$queryRawTyped(searchLocalDocChunksByStore(storeId, embeddingStr, limit ?? 5, threshold ?? 0.3))`
- Parse results, decode provenance via `prisma.parseFilename(provenanceId)`

#### `ensureAssetIndexed(attachment: AttachmentSingleton<true>, userId: string): Promise<{ docId: string; provenanceId: string }>`
- Top-level orchestrator (fire-and-forget, like Grok's `ensureXaiAssetUploaded`)
- `ensureLocalStore(userId)` -> `ensureDocRecord(attachment, storeId)` -> fire `chunkAndEmbed(...)` as background void promise

#### `syncLocalStoreRegistry(userId: string): Promise<void>`
- Clear all 6 caches, repopulate from DB, reconcile doc states

#### `fileSearchTool(): Anthropic.Beta.BetaToolUnion`
Custom tool definition for Anthropic models:
```ts
{
  name: "file_search",
  description: "Search through the user's uploaded documents using semantic similarity. Use this when the user asks questions about or references their uploaded files, PDFs, or documents.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "The semantic search query to find relevant document passages" },
      max_results: { type: "number", description: "Maximum number of results (1-10, default 5)" }
    },
    required: ["query"]
  }
}
```

#### `executeFileSearch(userId, input: { query, max_results? }): Promise<string>`
- Calls `searchStore()`, formats results as structured text for `tool_result`

#### `createStreamWithToolLoop(params, options, userId): AsyncGenerator`
- Wraps streaming in a loop
- When `stop_reason === "tool_use"`: extract tool_use blocks, execute them (file_search -> `executeFileSearch()`), build tool_result messages, send continuation request
- When `stop_reason === "end_turn"`: break
- Yields chunks throughout for the streaming handler

#### Override `tooling()` from parent
- Conditionally includes `fileSearchTool()` when user has a local store

#### Override `formatAnthropicHistoryWithFiles()` from parent
- Adds: fire `ensureAssetIndexed(attachment, userId)` as background void promise when processing DOCUMENT attachments in fresh context

### 2. `apps/ws-server/src/anthropic/workup.ts` — Modify (Base Class)

**Toggle privates to protected**: `assetCache`, `fileRegistry`, and any private methods needed by the vector store child class. Matches Grok pattern where all caches are `protected`.

**Constructor**: Add `VoyageEmbeddingService` param, store as `protected voyage`.

No other structural changes — workup stays focused on its existing concerns (file uploads, formatting, streaming, tooling). Vector store layer adds on top.

### 3. `apps/ws-server/src/anthropic/index.ts` — Modify (LAST STEP)

**IMPORTANT**: Do NOT modify this file until the vector store service is near-complete and type-safe. This keeps the editor clean during development — no cascading red lint/TS errors while we build out the vector store layer.

When ready (near completion):
- Change `AnthropicService extends AnthropicWorkup` -> `AnthropicService extends AnthropicVectorStoreWorkup`
- **Constructor**: Accept `VoyageEmbeddingService`, pass to super.
- **Update `handleAnthropicAiChatRequest()`**:
  - Check if user has a local store to determine tool inclusion
  - Use `createStreamWithToolLoop()` instead of direct streaming
  - Handle `tool_use` content blocks: accumulate `input_json_delta` for custom tools, execute on `content_block_stop`

### 4. `apps/ws-server/src/prisma/attachment-provider.ts` — Modify

Add local vector store DB methods:

```ts
createAnthropicLocalVectorStore(userId, storeName)
findLocalVectorStore(userId, provider)
hasLocalVectorStore(userId, provider)
findLocalVectorStoreDocs(storeId)
```

### 5. `apps/ws-server/src/anthropic/types.ts` — Modify

Add `LocalSearchResult`, `FileSearchToolInput`, `ToolUseAccumulator` interfaces.

---

## Typed SQL Usage

| Operation | SQL Function | When |
|-----------|-------------|------|
| Create/upsert doc | `insertLocalDoc(...)` | `ensureDocRecord()` |
| Insert chunk + embedding | `insertLocalDocChunk(...)` | `chunkAndEmbed()` |
| Update doc state | `updateLocalDocState(...)` | After chunking completes/fails |
| Search by store | `searchLocalDocChunksByStore(...)` | `searchStore()` |
| Search single doc | `searchLocalDocChunks(...)` | Future: targeted doc search |

Embedding passed as string `"[0.1,0.2,...]"` — SQL casts to `::vector`.

## Provenance ID Strategy (attachment-provider.ts:1167-1195)

- `toVectorStoreFilename(att)` -> `${conversationId}-${messageId}-${attachmentId}-${hexFilename}.${ext}`
- `toVectorStoreDocChunkProvenanceId(provenanceId, chunkIndex)` -> `${provenanceId}#${chunkIndex}`
- `parseFilename(provenanceId)` -> `{ conversationId, messageId, attachmentId, fileName, extension }`

## Class Hierarchy

```
AnthropicWorkup (workup.ts)  [EXISTING — toggle privates to protected as needed]
  - protected caches (assetCache, fileRegistry)
  - file uploads, formatting, streaming, beta headers, tooling
  - syncFileRegistry(), ensureAnthropicAssetUploaded()
    ^  extends
AnthropicVectorStoreWorkup (vector-store.ts)  [EXPANDED]
  - 6 local store caches (all protected, matching Grok pattern)
  - PdfDown extraction, page-aware multimodal chunking
  - ensureLocalStore(), ensureDocRecord(), chunkAndEmbed(), searchStore()
  - ensureAssetIndexed(), syncLocalStoreRegistry()
  - fileSearchTool(), executeFileSearch(), createStreamWithToolLoop()
  - overrides/extends tooling() to conditionally include file_search
  - overrides/extends formatAnthropicHistoryWithFiles() to fire ensureAssetIndexed()
    ^  extends
AnthropicService (index.ts)
  - handleAnthropicAiChatRequest() uses tool loop
```

**Inheritance direction**: `AnthropicVectorStoreWorkup extends AnthropicWorkup` (mirrors Grok: `GrokCollectionsService extends GrokWorkupService`). Vector store builds ON TOP of the existing workup, gaining access to all protected file upload, formatting, and streaming methods. Private methods in workup toggled to protected as needed — caches too (matching Grok's pattern where all 6 caches are protected).

## Wiring

**`apps/ws-server/src/index.ts:126`:**
```ts
const voyage = new VoyageEmbeddingService(cfg.VOYAGE_API_KEY ?? "");
const anthropic = new AnthropicService(logger, voyage, prisma, redisInstance, cfg.ANTHROPIC_API_KEY);
```

**`apps/ws-server/src/mixins/index.ts:154`:**
```ts
new AnthropicService(deps.logger, deps.voyage, deps.prisma, deps.redis, this.#anthropicApiKey ?? "");
```

`VOYAGE_API_KEY` already in credentials service types (`packages/credentials-service/src/types/index.ts:75`).

## Dependencies

- `@d0paminedriven/pdfdown` — already installed (v0.6.0 in node_modules)
- `@slipstream/db/sql-node` — generated typed SQL (already generated)
- `@anthropic-ai/sdk` — already a dependency
- No new packages to install

## Verification

1. **Type check**: `pnpm typecheck` in ws-server
2. **DB round-trip**: Insert doc via `insertLocalDoc`, chunks via `insertLocalDocChunk`, search via `searchLocalDocChunksByStore` — verify vector similarity works
3. **PdfDown integration**: Extract a test PDF, verify page text + images, build multimodal inputs, embed, insert, search
4. **E2E**: Upload a PDF in chat with Anthropic model -> doc gets indexed -> ask question about it -> model invokes `file_search` -> returns answers with context
5. **Multi-tool**: Verify `file_search` works alongside `web_search` in same response
