● All 21 tests pass, zero failures. Typecheck clean, tests clean.                                                                                                                                                                                       
                                                                                                                                                                                                                                                        
● Here's a summary of everything that was implemented:                                                                                                                                                                                                  
                                                                                                                                                                                                                                                        
  SQL — chunk."embeddingModel" added to SELECT in both search queries; $9:embeddingModel? added to updateUserStoreChunkState                                                                                                                            
                                                                                                                                                                                                                                                        
  Prisma types/service — embeddingModel?: Voyage.ModelUnion on CreateUserStoreChunkParams; threaded through buildUserStoreChunkCreateData                                                                                                               
                                                                                                                                                                                                                                                        
  vector-store.ts — 4 changes:
  1. chunkDraftsFromOffsetCache — pages now produce separate text chunks (hasImages: false, no images) and per-image chunks (hasImages: true, exactly 1 image + page text as context)                                                                   
  2. tokenUsageForChunk — text chunks tokenize with countTokens("voyage-context-3"), image chunks use existing countUsageFromPaths("voyage-multimodal-3.5")                                                                                             
  3. partitionTextChunkBatches — accumulates text chunks in page order, splits into batches at the 32K token boundary                                                                                                                                   
  4. Embedding loop — Phase A partitions into textChunks/imageChunks, Phase B batch-embeds text with voyage-context-3 contextual endpoint, Phase C embeds images one-at-a-time with voyage-multimodal-3.5

  Ready for manual testing with a real PDF.                                                                                                                                                                                                             

✻ Brewed for 46s

---

# Dual-Wield Embedding: voyage-context-3 (text) + voyage-multimodal-3.5 (images)

## Context

Currently all chunks — text-only and image-containing — are embedded with `voyage-multimodal-3.5` via the `multimodalembeddings` endpoint. This works but wastes the specialized text understanding of `voyage-context-3` (contextualized embeddings with cross-chunk awareness) on pages that have no visual content.

Both models produce 1024-dim vectors. The `embeddingModel` column already exists on `UserStoreDocChunk` (schema default `"voyage-multimodal-3.5"`). The `countTokens` test confirms the Python bridge works for text-only tokenization with `voyage-context-3`.

**Goal**: Split page chunks into separate text and image chunks. Text chunks embed with `voyage-context-3` (batch per-document for cross-chunk context). Image chunks embed with `voyage-multimodal-3.5` (one image + surrounding text per chunk). A page with 2 images produces 3 chunks: 1 text (context-3) + 2 image (multimodal-3.5).

## Files to Modify

1. `apps/ws-server/src/store/vector-store.ts` — chunking strategy, embedding loop, token budget, search
2. `apps/ws-server/src/prisma/types.ts` — add `embeddingModel` to `CreateUserStoreChunkParams`
3. `apps/ws-server/src/prisma/user-store.ts` — pass `embeddingModel` through chunk creation
4. `packages/db/prisma/sql/searchUserStoreChunksByStore.sql` — SELECT `chunk."embeddingModel"`
5. `packages/db/prisma/sql/searchUserStoreChunksByDoc.sql` — SELECT `chunk."embeddingModel"`
6. `packages/db/prisma/sql/updateUserStoreChunkState.sql` — add `$9:embeddingModel?` param

## Changes

### 1. Chunking: `chunkDraftsFromOffsetCache` → split text from images

**Current**: one chunk per page containing text + all images interleaved.

**New**: for each page, produce separate chunks:

- **Text chunk**: `hasImages: false`, `images: []`, body text only. Every page with non-empty text produces one.
- **Image chunks**: `hasImages: true`, one per image on the page. Each contains the image + the full page body text as context for the multimodal embedding. If a page has 2 images → 2 image chunks (each with the same page text but a different image).

`chunkDraftsFromOffsetCache` currently iterates `sortedOffsets` and builds one chunk per page entry. Refactor the inner loop:

```ts
for (const offsetEntry of sortedOffsets) {
  const [startOffset, endOffset] = offsetEntry.offsets;
  const hasText = offsetEntry.body.trim().length > 0;
  const pageImages = /* same as current */;

  // Always emit a text chunk if text exists (even if page also has images)
  if (hasText) {
    drafts.push({
      page: offsetEntry.page,
      text: offsetEntry.body,
      startOffset, endOffset,
      hasImages: false,
      hasAnnots: offsetEntry.hasAnnots,
      images: Array.of<AttScopedImg>()
    });
  }

  // Emit one image chunk per image (with page text as context)
  for (const img of pageImages) {
    drafts.push({
      page: offsetEntry.page,
      text: hasText
        ? offsetEntry.body
        : `[Visual content from page ${offsetEntry.page} of ${filename}]`,
      startOffset, endOffset,
      hasImages: true,
      hasAnnots: offsetEntry.hasAnnots,
      images: [img]   // exactly one image per image chunk
    });
  }
}
```

Pages with no text and no images are still skipped (unchanged).

### 2. Token Budget: model-aware `tokenUsageForChunk`

**Current** (`vector-store.ts:153`): always calls `countUsageFromPaths` with `voyage-multimodal-3.5`.

**New**: branch on `chunk.hasImages`:

```ts
private async tokenUsageForChunk(chunk: UserStoreChunkDraft) {
  if (!chunk.hasImages) {
    // Text-only: use countTokens with voyage-context-3
    const result = await this.voyage.countTokens(
      [chunk.text],
      "voyage-context-3"
    );
    if ("error" in result) throw new Error(`tokenize error: ${result.error}`);
    return result.total;
  }
  // Image chunk: existing multimodal path
  const usageInput = Array.of<{ t: string } | { f: string }>();
  usageInput.push({ t: chunk.text });
  for (const image of chunk.images) {
    usageInput.push({ f: image.absTmpPath });
  }
  const usage = await this.voyage.countUsageFromPaths(
    [usageInput],
    "voyage-multimodal-3.5"
  );
  return usage.total_tokens;
}
```

### 3. Embedding Loop: batch contextual for text, per-chunk multimodal for images

**Current** (`indexAttachment` lines 807-855): iterates all chunks sequentially, calls `embedChunksMultimodal` one at a time.

**New**: partition finalized chunks, then embed each set with its model.

#### Phase A: partition after budget finalization

```ts
const textChunks = Array.of<{ chunk: UserStoreChunkReady; record: ChunkRecord }>();
const imageChunks = Array.of<{ chunk: UserStoreChunkReady; record: ChunkRecord }>();

for (const [chunkIndex, chunk] of chunkQueue.entries()) {
  // ... contentHash, createUserStoreChunkForEmbedding (with embeddingModel) ...
  const embeddingModel = chunk.hasImages
    ? "voyage-multimodal-3.5"
    : "voyage-context-3";
  // pass embeddingModel to createUserStoreChunkForEmbedding
  const chunkRecord = await this.prisma.createUserStoreChunkForEmbedding({
    ...existingParams,
    embeddingModel
  });
  if (chunk.hasImages) {
    imageChunks.push({ chunk, record: chunkRecord });
  } else {
    textChunks.push({ chunk, record: chunkRecord });
  }
}
```

#### Phase B: batch embed text chunks with `voyage-context-3`

The contextual embedding endpoint takes `inputs: string[][]` for "document" — one inner array per document, each string in the inner array is a chunk ordered by position. The API returns one embedding per chunk, contextualized against all other chunks in the same inner array. Per the OpenAPI spec, Voyage recommends chunks **not** have any overlap.

**API constraints** (from Voyage OpenAPI spec):
- Max 1,000 outer arrays per request (we send 1 per document — fine)
- Max 32,000 tokens per inner list (per document)
- Max 120K total tokens per request
- Max 16K total chunks per request

If a document's total text token count exceeds 32K, split the text chunk array into batches that each stay under 32K. Use the per-chunk `tokenCount` from budget finalization to partition.

```ts
if (textChunks.length > 0) {
  // Partition into batches under 32K token limit
  const batches = this.partitionTextChunkBatches(textChunks, 32_000);

  for (const batch of batches) {
    const textBodies = batch.map(({ chunk }) => chunk.text);
    const contextualResult = await this.voyage.embedChunksContextual({
      inputs: [textBodies],  // single doc batch, ordered by page
      input_type: "document",
      model: "voyage-context-3",
      output_dimension: 1024
    });
    // contextualResult.data[0].data[i].embedding → batch[i]
    if ("detail" in contextualResult) {
      // handle error — mark all batch chunks as ERROR
    } else {
      for (const [i, { record }] of batch.entries()) {
        const embedding = contextualResult.data[0].data[i]?.embedding;
        if (embedding) {
          await this.prisma.updateUserStoreChunkTyped(
            record.id, "READY",
            `[${embedding.join(",")}]`,
            batch[i].chunk.tokenCount,
            null, null,
            false, batch[i].chunk.hasAnnots
          );
          readyCount += 1;
          totalTokenCount += batch[i].chunk.tokenCount;
        }
      }
    }
  }
}
```

**`partitionTextChunkBatches` helper**: accumulates chunks in order until the running token total would exceed the limit, then starts a new batch. Preserves document ordering within each batch so contextual embeddings remain meaningful.

#### Phase C: embed image chunks one-at-a-time with `voyage-multimodal-3.5`

Existing flow, unchanged — `buildEmbeddingInput(chunk)` + `embedChunksMultimodal`.

### 4. Chunk Creation: pass `embeddingModel`

**`apps/ws-server/src/prisma/types.ts`** — add to `CreateUserStoreChunkParams`:
```ts
embeddingModel?: "voyage-context-3" | "voyage-multimodal-3.5";
```

**`apps/ws-server/src/prisma/user-store.ts`** — add to `buildUserStoreChunkCreateData` destructure + return:
```ts
embeddingModel = "voyage-multimodal-3.5"   // default preserves current behavior
// ...
return { ..., embeddingModel } as const;
```

### 5. SQL Updates

#### `searchUserStoreChunksByStore.sql`
Add to SELECT:
```sql
chunk."embeddingModel",
```

#### `searchUserStoreChunksByDoc.sql`
Add to SELECT:
```sql
chunk."embeddingModel",
```

#### `updateUserStoreChunkState.sql`
Add `$9:embeddingModel?` param:
```sql
"embeddingModel" = COALESCE($9, "embeddingModel"),
```

### 6. Search: single query (unchanged for now)

Query embedding stays `voyage-multimodal-3.5` (handles text queries). No model filtering in WHERE clause. Both text (context-3) and image (multimodal-3.5) chunks compete on cosine similarity score.

The SQL changes add `chunk."embeddingModel"` to the SELECT so consumers can see which model produced each result. If cross-model scoring proves unreliable, we can add parallel dual-query later (embed query with both models, search filtered by model, merge results). But start simple.

## What NOT to Change

- `UserStoreDoc.embeddingModel` stays as `"voyage-multimodal-3.5"` (doc-level, describes the primary model)
- `searchUserStoreChunks` in `vector-store.ts` — query embedding stays multimodal for now
- `finalizeChunkBudget` recursive splitting logic — same algorithm, just now text chunks are simpler (no image budget to manage) and image chunks have exactly 1 image
- Schema — `embeddingModel` column already exists on `UserStoreDocChunk`

## Verification

1. `pnpm --filter @slipstream/ws-server typecheck` — clean
2. `pnpm --filter @slipstream/db generate` — regenerate after SQL changes
3. Manual: index a PDF with images → verify `UserStoreDocChunk` records show both `voyage-context-3` (text) and `voyage-multimodal-3.5` (image) in `embeddingModel`
4. Manual: index a text-only PDF → all chunks should be `voyage-context-3`
5. Manual: search query → verify results include chunks from both models, with `embeddingModel` visible in results

---
# Contextualized Chunk Embeddings

# Model Choices

Voyage currently provides the following contextualized chunk embedding models:

| Model              | Context Length (tokens) | Embedding Dimension            | Description                                                                                                                                                                            |
| ------------------ | ----------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voyage-context-3` | 32,000                  | 1024 (default), 256, 512, 2048 | Contextualized chunk embeddings optimized for general-purpose and multilingual retrieval quality. See [blog post](https://blog.voyageai.com/2025/07/23/voyage-context-3/) for details. |

***

# Python API

Voyage contextualized chunk embeddings are accessible in Python through the `voyageai` [package](https://docs.voyageai.com/docs/api-key-and-installation#install-voyage-python-package). Please install the `voyageai` package, [set up](https://docs.voyageai.com/docs/api-key-and-installation)  the API key, and use the `voyageai.Client.contextualized_embed()` function to vectorize your inputs.

> `voyageai.Client.contextualized_embed(inputs : List[List[str]], model : str, input_type : Optional[str] = None, output_dimension: Optional[int] = None, output_dtype: Optional[str] = "float", chunk_fn: Optional[Callable[[str], List[str]]] = None)`

**Parameters**

* **inputs** (List\[List\[str]]) - A list of lists, where each inner list contains a query, a document, or document chunks to be vectorized.
  * Each inner list in `inputs` represents a set of text elements that will be embedded together. Each element in the list is encoded not just independently, but also encodes context from the other elements in the same list.\
    `inputs = [["text_1_1", "text_1_2", ..., "text_1_n"], ["text_2_1", "text_2_2", ..., "text_2_m"]]`
  * **Document Chunks**. Most commonly, each inner list contains chunks from a single document, ordered by their position in the document. In this case:\
    `inputs = [["doc_1_chunk_1", "doc_1_chunk_2", ..., "doc_1_chunk_n"], ["doc_2_chunk_1", "doc_2_chunk_2", ..., "doc_2_chunk_m"]]`\
    Each chunk is encoded in context with the others from the same document, resulting in more context-aware embeddings. **We recommend that supplied chunks *not* have any overlap**.
  * **Context-Agnostic Behavior for Queries and Documents**. If there is one element per inner list, each text is embedded independently—similar to standard (context-agnostic) embeddings:\
    `inputs = [["query_1"], ["query_2"], ..., ["query_k"]]`\
    `inputs = [["doc_1"], ["doc_2"], ..., ["doc_k"]]`\
    Therefore, if the inputs are queries, each inner list should contain a single query (i.e., a length of one), as shown above, and the `input_type` should be set to `query`.
  * The following constraints apply to the `inputs` list:
    * The list must not contain more than 1,000 inputs.
    * The total number of tokens across all inputs must not exceed 120K.
    * The total number of chunks across all inputs must not exceed 16K.
* **model** (str) - Name of the model. Recommended options: `voyage-context-3`.
* **input\_type** (str, optional, defaults to `None`) - Type of the input text. Options: `None`, `query`, `document`.
  * When `input_type` is `None` , the embedding model directly converts the inputs into numerical vectors. For retrieval/search purposes, where a "query" is used to search for relevant information among a collection of data, referred to as "documents", we recommend specifying whether your inputs are intended as queries or documents by setting `input_type` to `query` or `document` , respectively. In these cases, Voyage automatically prepends a prompt to your inputs before vectorizing them, creating vectors more tailored for retrieval/search tasks. Embeddings generated with and without the `input_type` argument are compatible.
  * For transparency, the following prompts are prepended to your input.
    * For query, the prompt is "*Represent the query for retrieving supporting documents:* ".
    * For document, the prompt is "*Represent the document for retrieval:* ".
* **output\_dimension** (int, optional, defaults to `None`) - The number of dimensions for resulting output embeddings. `voyage-context-3` supports the following `output_dimension` values: 2048, 1024 (default), 512, and 256.
* **output\_dtype** (str, optional, defaults to `float`) - The data type for the embeddings to be returned. Options: `float`, `int8`, `uint8`, `binary`, `ubinary`.  Please see our [guide](https://docs.voyageai.com/docs/flexible-dimensions-and-quantization#quantization) for more details about output data types.
  * `float`: Each returned embedding is a list of 32-bit (4-byte) [single-precision floating-point](https://en.wikipedia.org/wiki/Single-precision_floating-point_format) numbers.  This is the default and provides the highest precision / retrieval accuracy.
  * `int8` and `uint8`: Each returned embedding is a list of 8-bit (1-byte) integers ranging from -128 to 127 and 0 to 255, respectively.
  * `binary` and `ubinary`: Each returned embedding is a list of 8-bit integers that represent bit-packed, quantized single-bit embedding values: `int8` for `binary` and `uint8` for `ubinary`. The length of the returned list of integers is 1/8 of `output_dimension` (which is the actual dimension of the embedding). The `binary` type uses the offset binary method. Please refer to our guide for details on [offset binary](https://docs.voyageai.com/docs/flexible-dimensions-and-quantization#offset-binary) and [binary embeddings](https://docs.voyageai.com/docs/flexible-dimensions-and-quantization#quantization).
* **chunk\_fn** (Callable\[\[str], List\[str]], optional, defaults to `None`) - A custom chunking function that takes a single string (e.g., document) and returns a list of strings (e.g., chunk of documents). If provided, this function is applied to each string in `inputs`.  For convenience, `voyageai.default_chunk_fn` is available, which currently use [LangChain's `RecursiveCharacterTextSplitter.split_text`](https://python.langchain.com/api_reference/text_splitters/character/langchain_text_splitters.character.RecursiveCharacterTextSplitter.html) method. We recommend avoiding chunk overlap, so do not use functions that produce overlapping chunks.

**Returns**

* A `ContextualizedEmbeddingsObject`, containing the following attributes:
  * **results** (List\[`ContextualizedEmbeddingsResult`]) - A list of `ContextualizedEmbeddingsResult` objects, each representing the result from a query or document and contains the following attributes:
    * **embeddings** (List\[List\[float]] or List\[List\[int]]) - A list of embeddings corresponding to a list of input texts, which may be either a query, document, or chunks from the same document. For document chunks, the embeddings are ordered to match the chunk order, which reflects their position within the document. Each embedding is a vector represented as a list of [floats](https://docs.python.org/3/library/functions.html#float) when `output_dtype` is set to `float` and as a list of [integers](https://docs.python.org/3/library/functions.html#int) for all other values of `output_dtype` (`int8`, `uint8`, `binary`, `ubinary`).
    * **chunk\_texts** (List\[str]) - The text of the document chunks, included only when a chunking function (`chunk_fn`) is provided. If no chunking function is supplied, it is assumed that the chunks were provided by the user, and `chunk_texts` is not returned.
    * **index** (int) - The index of the query or document in the input list.
  * **total\_tokens** (int) - The total number of tokens in the input texts.

<br />

**Example**: See our [quickstart](contextualized-chunk-embeddings#quickstart) below.

***

# REST API

Voyage contextualized chunk embeddings can be accessed by calling the endpoint `POST https://api.voyageai.com/v1/contextualizedembeddings`. Please refer to the [Contextualized Chunk Embeddings API Reference](https://docs.voyageai.com/reference/contextualized-embeddings-api) for the specification.

**Example**

```shell
curl -X POST https://api.voyageai.com/v1/contextualizedembeddings \
  -H "Authorization: Bearer $VOYAGE_API_KEY" \
  -H "content-type: application/json" \
  -d ' 
  {
    "inputs": [
      ["doc_1_chunk_1", "doc_1_chunk_2"],
      ["doc_2_chunk_1", "doc_2_chunk_2"]
    ],
    "input_type": "document",
    "model": "voyage-context-3"
  }'
```

***

# Quickstart

This quickstart will show you how easy it is to use contextualized chunk embeddings and highlight their advantages over standard, context-agnostic embedding models. As you will see, contextualized chunk embeddings can serve as a seamless drop-in replacement for the standard embeddings used in existing RAG pipelines.

If you haven't already, follow the [installation](https://docs.voyageai.com/docs/api-key-and-installation)  guide to install the Voyage Python package and obtain your API key. Additionally, to avoid interrupting your workflow during the walkthrough, install the third-party packages required by the quickstart using pip.

```shell
pip install -qU langchain-text-splitters numpy
```

## Set up

**Prepare data**. You can replace the documents below with your own corpus. We've provided a simplified sample set that, when chunked, suffer from context loss—an issue that contextualized chunk embeddings are designed to address.

```python
documents = [
    "This is the SEC filing on Greenery Corp.'s Q2 2024 performance.\n"
    "The company's revenue increased by 7% compared to the previous quarter.",
    
    "This is the SEC filing on Greenery Corp.'s Q1 2024 performance.\n"
    "The company's revenue increased by 7% compared to the previous quarter.",

    "This is the SEC filing on Leafy Inc.'s Q2 2024 performance.\n"
    "The company's revenue increased by 15% compared to the previous quarter.",
    
    "This is the SEC filing on Leafy Inc.'s Q1 2024 performance.\n"
    "The company's revenue increased by 10% compared to the previous quarter.",
    
    "This is the SEC filing on Elephant Ltd.'s Q2 2024 performance.\n"
    "The company's revenue decreased by 2% compared to the previous quarter."
]
```

**Chunk documents**. We'll start by chunking the documents with a basic [recursive text splitter from LangChain](https://python.langchain.com/docs/how_to/recursive_text_splitter/).

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter
import json

text_splitter = RecursiveCharacterTextSplitter(separators=["\n"], chunk_size=100, chunk_overlap=0)
texts = [text_splitter.split_text(d) for d in documents]

print(f"Texts:\n{json.dumps(texts, indent=2)}")
```

```python Output
Texts:
[
  [
    "This is the SEC filing on Greenery Corp.'s Q2 2024 performance.",
    "The company's revenue increased by 7% compared to the previous quarter."
  ],
  [
    "This is the SEC filing on Greenery Corp.'s Q1 2024 performance.",
    "The company's revenue increased by 7% compared to the previous quarter."
  ],
  [
    "This is the SEC filing on Leafy Inc.'s Q2 2024 performance.",
    "The company's revenue increased by 15% compared to the previous quarter."
  ],
  [
    "This is the SEC filing on Leafy Inc.'s Q1 2024 performance.",
    "The company's revenue increased by 10% compared to the previous quarter."
  ],
  [
    "This is the SEC filing on Elephant Ltd.'s Q2 2024 performance.",
    "The company's revenue decreased by 2% compared to the previous quarter."
  ]
]
```

We want to maintain document provenance for each chunk so that we can perform document-level (parent-document) retrieval and return the entire document that contains a chunks retrieved by semantic search.

```python
# Flatten list while maintaining document provenance
all_chunks = []
for doc_id, doc in enumerate(texts):
    doc_chunks = [{"chunk": chunk, "doc_id": doc_id} for chunk in doc]
    all_chunks.extend(doc_chunks)

print(f"All chunks:\n{json.dumps(all_chunks, indent=2)}")
```

```python Output
All chunks:
[
  {
    "chunk": "This is the SEC filing on Greenery Corp.'s Q2 2024 performance.",
    "doc_id": 0
  },
  {
    "chunk": "The company's revenue increased by 7% compared to the previous quarter.",
    "doc_id": 0
  },
  {
    "chunk": "This is the SEC filing on Greenery Corp.'s Q1 2024 performance.",
    "doc_id": 1
  },
  {
    "chunk": "The company's revenue increased by 7% compared to the previous quarter.",
    "doc_id": 1
  },
  {
    "chunk": "This is the SEC filing on Leafy Inc.'s Q2 2024 performance.",
    "doc_id": 2
  },
  {
    "chunk": "The company's revenue increased by 15% compared to the previous quarter.",
    "doc_id": 2
  },
  {
    "chunk": "This is the SEC filing on Leafy Inc.'s Q1 2024 performance.",
    "doc_id": 3
  },
  {
    "chunk": "The company's revenue increased by 10% compared to the previous quarter.",
    "doc_id": 3
  },
  {
    "chunk": "This is the SEC filing on Elephant Ltd.'s Q2 2024 performance.",
    "doc_id": 4
  },
  {
    "chunk": "The company's revenue decreased by 2% compared to the previous quarter.",
    "doc_id": 4
  }
]
```

**Query**. We want to identify the most relevant chunk for the following query: “What was the revenue growth for Leafy Inc. in Q2 2024?”

```python
query = "What was the revenue growth for Leafy Inc. in Q2 2024?"
```

## Approach 1: Standard, context-agnostic embeddings

**Vectorize/embed the chunks**

```python
import voyageai

vo = voyageai.Client()
# This will automatically use the environment variable VOYAGE_API_KEY.
# Alternatively, you can use vo = voyageai.Client(api_key="<your secret key>")

# Embed the chunks
chunk_embds = vo.embed(
    texts=[record["chunk"] for record in all_chunks],
    model="voyage-3-large",
    input_type="document"
).embeddings
```

**Perform basic semantic similarity search**. To find out the chunk that is most similar to the query among the existing data, we can first embed/vectorize the query:

```python
query_embd = vo.embed([query], model="voyage-3-large", input_type="query").embeddings[0]
```

We can compute the cosine similarity between the query and each chunk embedding, then retrieve the chunk with the highest similarity score.

```python
import numpy as np

# Compute the similarity
# Voyage embeddings are normalized to length 1, therefore dot-product and cosine 
# similarity are the same.
similarities = np.dot(chunk_embds, query_embd)

# Rank similiarities
ranks = np.argsort(np.argsort(-similarities)) + 1

# Combine chunks with their ranks and similarities
ranked_chunks = []
for i, (chunk_data, similarity, rank) in enumerate(zip(all_chunks, similarities, ranks)):
    ranked_chunks.append({
        "chunk": chunk_data["chunk"],
        "doc_id": chunk_data["doc_id"],
        "similarity": float(similarity),
        "rank": int(rank)
    })

print(f"Chunk similarities:\n{json.dumps(ranked_chunks, indent=2)}")
```

```python Output
Chunk similarities:
[
  {
    "chunk": "This is the SEC filing on Greenery Corp.'s Q2 2024 performance.",
    "doc_id": 0,
    "similarity": 0.4513495880308087,
    "rank": 3
  },
  {
    "chunk": "The company's revenue increased by 7% compared to the previous quarter.",
    "doc_id": 0,
    "similarity": 0.35663545808598424,
    "rank": 7
  },
  {
    "chunk": "This is the SEC filing on Greenery Corp.'s Q1 2024 performance.",
    "doc_id": 1,
    "similarity": 0.4166124680496381,
    "rank": 4
  },
  {
    "chunk": "The company's revenue increased by 7% compared to the previous quarter.",
    "doc_id": 1,
    "similarity": 0.35663545808598424,
    "rank": 6
  },
  {
    "chunk": "This is the SEC filing on Leafy Inc.'s Q2 2024 performance.",
    "doc_id": 2,
    "similarity": 0.6311910174756162,
    "rank": 1
  },
  {
    "chunk": "The company's revenue increased by 15% compared to the previous quarter.",
    "doc_id": 2,
    "similarity": 0.3472309722297028,
    "rank": 8
  },
  {
    "chunk": "This is the SEC filing on Leafy Inc.'s Q1 2024 performance.",
    "doc_id": 3,
    "similarity": 0.5992214666926985,
    "rank": 2
  },
  {
    "chunk": "The company's revenue increased by 10% compared to the previous quarter.",
    "doc_id": 3,
    "similarity": 0.34059832265203566,
    "rank": 9
  },
  {
    "chunk": "This is the SEC filing on Elephant Ltd.'s Q2 2024 performance.",
    "doc_id": 4,
    "similarity": 0.3860622636731734,
    "rank": 5
  },
  {
    "chunk": "The company's revenue decreased by 2% compared to the previous quarter.",
    "doc_id": 4,
    "similarity": 0.31796281117887043,
    "rank": 10
  }
]
```

We see that the most relevant chunk is the fifth one, which simply states that it is the SEC filing for Leafy Inc.'s Q2 2024 performance—an appropriate result. This is followed by the seventh chunk, which references the SEC filing for Leafy Inc.'s Q1 2024 performance, also a sensible match given its relevance to Leafy Inc. and 2024 performance. After that, however, the next highest-ranked chunks reference SEC filings for other companies.

The chunk that actually contains the answer to the query is the sixth one, which states that the company’s revenue increased by 15% compared to the previous quarter. However, because this chunk was separated from the broader document, it lost the context linking it to Leafy Inc.’s Q2 2024 SEC filing. As a result, this "golden chunk" was ranked only eighth out of the ten chunks.

Next, we'll create contextualized chunk embeddings to see how they handle this kind of context loss.

## Approach 2: Contextualized chunk embeddings

We can directly pass the output of our text splitter (chunker), which is already structured as the required list of lists—each inner list containing the chunks of a single document.

```python
# Contextualized embedding model
query_embd_context = vo.contextualized_embed(inputs=[[query]], model="voyage-context-3", input_type="query").results[0].embeddings[0]

embds_obj = vo.contextualized_embed(
    inputs=texts,
    model="voyage-context-3",
    input_type="document"
)

contextualized_chunk_embds = [emb for r in embds_obj.results for emb in r.embeddings]
```

**Perform semantic similarity search with contextualized chunk embeddings**. We can now perform the same semantic similarity search, but using our contextualized chunk embeddings.

```python
# Compute the similarity
# Voyage embeddings are normalized to length 1, therefore dot-product and cosine 
# similarity are the same.
similarities_context = np.dot(contextualized_chunk_embds, query_embd_context)

# Rank similiarities
ranks_context = np.argsort(np.argsort(-similarities_context)) + 1


# Combine chunks with their ranks and similarities
ranked_contextualized_chunks = []
for i, (chunk_data, similarity, rank) in enumerate(zip(all_chunks, similarities_context, ranks_context)):
    ranked_contextualized_chunks.append({
        "chunk": chunk_data["chunk"],
        "doc_id": chunk_data["doc_id"],
        "similarity": float(similarity),
        "rank": int(rank)
    })

print(f"Contextualized chunk similarities:\n{json.dumps(ranked_contextualized_chunks, indent=2)}")
```

```python Output
Contextualized chunk similarities:
[
  {
    "chunk": "This is the SEC filing on Greenery Corp.'s Q2 2024 performance.",
    "doc_id": 0,
    "similarity": 0.4890238923220861,
    "rank": 7
  },
  {
    "chunk": "The company's revenue increased by 7% compared to the previous quarter.",
    "doc_id": 0,
    "similarity": 0.5549016527374564,
    "rank": 5
  },
  {
    "chunk": "This is the SEC filing on Greenery Corp.'s Q1 2024 performance.",
    "doc_id": 1,
    "similarity": 0.4372318483382978,
    "rank": 9
  },
  {
    "chunk": "The company's revenue increased by 7% compared to the previous quarter.",
    "doc_id": 1,
    "similarity": 0.5096683171316662,
    "rank": 6
  },
  {
    "chunk": "This is the SEC filing on Leafy Inc.'s Q2 2024 performance.",
    "doc_id": 2,
    "similarity": 0.6630080274283974,
    "rank": 3
  },
  {
    "chunk": "The company's revenue increased by 15% compared to the previous quarter.",
    "doc_id": 2,
    "similarity": 0.7112170390868932,
    "rank": 1
  },
  {
    "chunk": "This is the SEC filing on Leafy Inc.'s Q1 2024 performance.",
    "doc_id": 3,
    "similarity": 0.6141823847063445,
    "rank": 4
  },
  {
    "chunk": "The company's revenue increased by 10% compared to the previous quarter.",
    "doc_id": 3,
    "similarity": 0.6637902760998357,
    "rank": 2
  },
  {
    "chunk": "This is the SEC filing on Elephant Ltd.'s Q2 2024 performance.",
    "doc_id": 4,
    "similarity": 0.3961326436687487,
    "rank": 10
  },
  {
    "chunk": "The company's revenue decreased by 2% compared to the previous quarter.",
    "doc_id": 4,
    "similarity": 0.44325838626567066,
    "rank": 8
  }
]
```

The table below summarizes the retrieval rankings from `voyage-3-large` (context-agnostic) and `voyage-context-3` (contextualized chunk embeddings). We can see that contextualized chunk embeddings can significantly improve the retrieval accuracy where there is severe context loss. Instead of prioritizing chunks that reference SEC filings, `voyage-context-3` correctly ranks information about Leafy Inc.’s revenue increase as most relevant, placing the “golden chunk” at the top.

| Chunk                                                                        | voyage-3-large Rank | voyage-context-3 Rank |
| :--------------------------------------------------------------------------- | :------------------ | :-------------------- |
| This is the SEC filing on Greenery Corp.'s Q2 2024 performance.              | 3                   | 7                     |
| The company's revenue increased by 7% compared to the previous quarter.      | 7                   | 5                     |
| This is the SEC filing on Greenery Corp.'s Q1 2024 performance.              | 4                   | 9                     |
| The company's revenue increased by 7% compared to the previous quarter.      | 6                   | 6                     |
| This is the SEC filing on Leafy Inc.'s Q2 2024 performance.                  | 1                   | 3                     |
| **The company's revenue increased by 15% compared to the previous quarter**. | 8                   | **1**                 |
| This is the SEC filing on Leafy Inc.'s Q1 2024 performance.                  | 2                   | 4                     |
| The company's revenue increased by 10% compared to the previous quarter.     | 9                   | 2                     |
| This is the SEC filing on Elephant Ltd.'s Q2 2024 performance.               | 5                   | 10                    |
| The company's revenue decreased by 2% compared to the previous quarter.      | 10                  | 8                     |

# Tutorial

For a full tutorial on using contextualized chunk embeddings, see our [detailed guide](https://www.mongodb.com/company/blog/technical/contextualized-chunk-embeddings-combining-local-detail-with-global-context).

The Jupyter Notebook for this tutorial is available on GitHub in our [GenAI Showcase repository](https://github.com/mongodb-developer/GenAI-Showcase/blob/main/notebooks/advanced_techniques/contextual_chunk_embedding.ipynb). To follow along, run the notebook in Google Colab or your preferred environment, and refer to the tutorial for explanations of key code blocks.
---

Contextualized chunk embedding models

# Contextualized chunk embedding models

The Voyage contextualized chunk embedding endpoint accepts document chunks—in addition to queries and full documents—and returns a response containing contextualized chunk vector embeddings. These contextualized chunk embeddings capture not only the local details within each chunk but also global, coarse-grained metadata from the entire document.

# OpenAPI definition

```json
{
  "openapi": "3.0.2",
  "info": {
    "title": "Voyage API",
    "description": "The VoyageAI REST API. Please see https://docs.voyageai.com/reference for more details.\n",
    "version": "1.1",
    "contact": {
      "name": "VoyageAI Support",
      "url": "https://docs.voyageai.com/docs/faq",
      "email": "contact@voyageai.com"
    },
    "license": {
      "name": "MIT",
      "url": "https://github.com/voyage-ai/voyage-openapi/blob/main/LICENSE"
    }
  },
  "servers": [
    {
      "url": "https://api.voyageai.com/v1"
    }
  ],
  "security": [
    {
      "ApiKeyAuth": []
    }
  ],
  "tags": [
    {
      "name": "Inference"
    }
  ],
  "paths": {
    "/contextualizedembeddings": {
      "post": {
        "tags": [
          "Inference"
        ],
        "summary": "Contextualized chunk embedding models",
        "description": "The Voyage contextualized chunk embedding endpoint accepts document chunks—in addition to queries and full documents—and returns a response containing contextualized chunk vector embeddings. These contextualized chunk embeddings capture not only the local details within each chunk but also global, coarse-grained metadata from the entire document.",
        "operationId": "contextualized-embeddings-api",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "inputs",
                  "model"
                ],
                "properties": {
                  "inputs": {
                    "type": "array",
                    "description": "A list of lists, where each inner list contains a query, a document, or document chunks to be vectorized.<br>\nEach inner list in <code>inputs</code> represents a set of text elements that will be embedded together. Each element in the list is encoded not just independently, but also encodes context from the other elements in the same list.<br>\n<pre><code> inputs = [[\"text_1_1\", \"text_1_2\", ..., \"text_1_n\"],\n          [\"text_2_1\", \"text_2_2\", ..., \"text_2_m\"]]\n</code></pre>\n<br> <b>Document Chunks</b>. Most commonly, each inner list contains chunks from a single document, ordered by their position in the document. In this case:\n<pre><code> inputs = [[\"doc_1_chunk_1\", \"doc_1_chunk_2\", ..., \"doc_1_chunk_n\"],\n          [\"doc_2_chunk_1\", \"doc_2_chunk_2\", ..., \"doc_2_chunk_m\"]]\n</code></pre>\nEach chunk is encoded in context with the others from the same document, resulting in more context-aware embeddings. <strong>We recommend that supplied chunks <em>not</em> have any overlap.</strong><br> <br> <b>Context-Agnostic Behavior for Queries and Documents</b>. If there is one element per inner list, each text is embedded independently—similar to standard (context-agnostic) embeddings:\n<pre><code> inputs = [[\"query_1\"], [\"query_2\"], ..., [\"query_k\"]]\n inputs = [[\"doc_1\"], [\"doc_2\"], ..., [\"doc_k\"]]\n</code></pre>\nTherefore, if the inputs are queries, each inner list should contain a single query (i.e., a length of one), as shown above, and the <code>input_type</code> should be set to <code>query</code>. <br>\nThe following constraints apply to the <code>inputs</code> list: <ul>\n  <li> The list must not contain more than 1,000 inputs. </li>\n  <li> The total number of tokens across all inputs must not exceed 120K. </li>\n  <li> The total number of chunks across all inputs must not exceed 16K. </li>\n</ul>\n",
                    "items": {
                      "type": "array",
                      "description": "For queries, the list contains only a single query. For documents or document chunks, the list should include all chunks from a single document, ordered by their position in the document, or the entire document may be provided as a single chunk. The total number of tokens in the list must not exceed 32,000 tokens.\n",
                      "items": {
                        "type": "string",
                        "description": "A query, document, or chunk of text from a document.\n"
                      }
                    }
                  },
                  "model": {
                    "type": "string",
                    "description": "Name of the model. Recommended options: `voyage-context-3`.\n"
                  },
                  "input_type": {
                    "type": "string",
                    "description": "Type of the input text. Defaults to `null`. Other options: `query`, `document`. <ul> <li> When `input_type` is `null`, the embedding model directly converts the inputs into numerical vectors. For retrieval/search purposes, where a \"query\" is used to search for relevant information among a collection of data referred to as \"documents,\" we recommend specifying whether your inputs are intended as queries or documents by setting `input_type` to `query` or `document`, respectively. In these cases, Voyage automatically prepends a prompt to your `inputs` before vectorizing them, creating vectors more tailored for retrieval/search tasks. Embeddings generated with and without the `input_type` argument are compatible. </li> <li> For transparency, the following prompts are prepended to your input. </li>\n  <ul>\n    <li> For <code>query</code>, the prompt is <i>\"Represent the query for retrieving supporting documents: \".</i> </li>\n    <li> For <code>document</code>, the prompt is <i>\"Represent the document for retrieval: \".</i> </li>\n  </ul> \n<ul> <ul>\n",
                    "enum": [
                      null,
                      "query",
                      "document"
                    ],
                    "nullable": true,
                    "default": null
                  },
                  "output_dimension": {
                    "type": "integer",
                    "description": "The number of dimensions for resulting output embeddings. Defaults to `null`.  `voyage-context-3` supports the following `output_dimension` values: 2048, 1024 (default), 512, and 256.  If set to `null`, the model uses the default value of 1024.\n",
                    "nullable": true,
                    "default": null
                  },
                  "output_dtype": {
                    "type": "string",
                    "description": "The data type for the embeddings to be returned. Defaults to `float`. Other options: `int8`, `uint8`, `binary`, `ubinary`. Please see our <a href=\"https://docs.voyageai.com/docs/flexible-dimensions-and-quantization#quantization\" target=\"_blank\">guide</a> for more details about output data types. <ul> <li> `float`: Each returned embedding is a list of 32-bit (4-byte) <a href=\"https://en.wikipedia.org/wiki/Single-precision_floating-point_format\" target=\"_blank\">single-precision floating-point</a> numbers. This is the default and provides the highest precision / retrieval accuracy. </li> <li> `int8` and `uint8`: Each returned embedding is a list of 8-bit (1-byte) integers ranging from -128 to 127 and 0 to 255, respectively. </li> <li> `binary` and `ubinary`: Each returned embedding is a list of 8-bit integers that represent bit-packed, quantized single-bit embedding values: `int8` for `binary` and `uint8` for `ubinary`. The length of the returned list of integers is 1/8 of `output_dimension` (which is the actual dimension of the embedding). The `binary` type uses the offset binary method. Please refer to our guide for details on <a href=\"https://docs.voyageai.com/docs/flexible-dimensions-and-quantization#offset-binary\" target=\"_blank\">offset binary</a> and <a href=\"https://docs.voyageai.com/docs/flexible-dimensions-and-quantization#quantization\" target=\"_blank\">binary embeddings</a>.  </ul>\n",
                    "enum": [
                      "float",
                      "int8",
                      "uint8",
                      "binary",
                      "ubinary"
                    ],
                    "default": "float"
                  },
                  "encoding_format": {
                    "type": "string",
                    "description": "Format in which the embeddings are encoded. Defaults to `null`. Other options: `base64`. <ul> <li> If `null`, each embedding is an array of float numbers when `output_dtype` is set to `float` and as an array of integers for all other values of `output_dtype` (`int8`, `uint8`, `binary`, and `ubinary`). See `output_dtype` for more details. <li> If `base64`, the embeddings are represented as a <a href=\"https://docs.python.org/3/library/base64.html\" target=\"_blank\">Base64-encoded</a> NumPy array of: </li>\n  <ul>\n    <li> Floating-point numbers (<a href=\"https:/umpy.org/doc/2.1/user/basics.types.html#numerical-data-types\" target=\"_blank\">numpy.float32</a>) for <code>output_dtype</code> set to <code>float</code>. </li>\n    <li> Signed integers (<a href=\"https:/umpy.org/doc/2.1/user/basics.types.html#numerical-data-types\" target=\"_blank\">numpy.int8</a>) for <code>output_dtype</code> set to <code>int8</code> or <code>binary</code>. </li>\n    <li> Unsigned integers (<a href=\"https:/umpy.org/doc/2.1/user/basics.types.html#numerical-data-types\" target=\"_blank\">numpy.uint8</a>) for <code>output_dtype</code> set to <code>uint8</code> or <code>ubinary</code>. </li>\n  </ul> \n</ul>\n",
                    "enum": [
                      null,
                      "base64"
                    ],
                    "nullable": true,
                    "default": null
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success.\n",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ChunkEmbeddingsObject"
                },
                "examples": {
                  "SuccessDocuments": {
                    "summary": "Success response for documents.\n",
                    "value": "{\n  \"object\": \"list\",\n  \"data\": [\n    {\n      \"object\": \"list\",\n      \"data\": [\n        {\n          \"object\": \"embedding\",\n          \"embedding\": [0.040455919, -0.017057089, -0.007927173, \"...\", 0.042205364],\n          \"index\": 0\n        },\n        {\n          \"object\": \"embedding\",\n          \"embedding\": [0.03946501, -0.015512259, -0.009809222, \"...\", 0.033990096],\n          \"index\": 1\n        }\n      ],\n      \"index\": 0\n    },\n    {\n      \"object\": \"list\",\n      \"data\": [\n        {\n          \"object\": \"embedding\",\n          \"embedding\": [0.047289684, -0.042560715, -7.7669e-05, \"...\", 0.038691558],\n          \"index\": 0\n        },\n        {\n          \"object\": \"embedding\",\n          \"embedding\": [0.04198277, -0.036370102, -0.00352195, \"...\", 0.031879965],\n          \"index\": 1\n        }\n      ],\n      \"index\": 1\n    },\n  ],\n  \"model\": \"voyage-context-3\",\n  \"usage\": {\n    \"total_tokens\": 24 \n  }\n}\n"
                  },
                  "SuccessQueries": {
                    "summary": "Success response for queries.\n",
                    "value": "{\n  \"object\": \"list\",\n  \"data\": [\n    {\n      \"object\": \"list\",\n      \"data\": [\n        {\n          \"object\": \"embedding\",\n          \"embedding\": [0.00738032, -0.025062965, 0.007892424, \"...\" , 0.002048415],\n          \"index\": 0\n        }\n      ],\n      \"index\": 0\n    },\n    {\n      \"object\": \"list\",\n      \"data\": [\n        {\n          \"object\": \"embedding\",\n          \"embedding\": [0.056637563, -0.026602492, 0.021989964, \"...\" , 0.004612529],\n          \"index\": 0\n        }\n      ],\n      \"index\": 1\n    }\n  ],\n  \"model\": \"voyage-context-3\",\n  \"usage\": {\n    \"total_tokens\": 4 \n  }\n}\n"
                  }
                }
              }
            }
          },
          "4XX": {
            "$ref": "#/components/responses/4XX"
          },
          "5XX": {
            "$ref": "#/components/responses/5XX"
          }
        },
        "x-readme": {
          "code-samples": [
            {
              "language": "shell",
              "name": "Documents",
              "code": "curl -X POST https://api.voyageai.com/v1/contextualizedembeddings \\\n  -H \"Authorization: Bearer $VOYAGE_API_KEY\" \\\n  -H \"content-type: application/json\" \\\n  -d ' \n  {\n    \"inputs\": [\n      [\"doc_1_chunk_1\", \"doc_1_chunk_2\"],\n      [\"doc_2_chunk_1\", \"doc_2_chunk_2\"]\n    ],\n    \"input_type\": \"document\",\n    \"model\": \"voyage-context-3\"\n  }\n  '"
            },
            {
              "language": "shell",
              "name": "Queries",
              "code": "curl -X POST https://api.voyageai.com/v1/contextualizedembeddings \\\n  -H \"Authorization: Bearer $VOYAGE_API_KEY\" \\\n  -H \"content-type: application/json\" \\\n  -d ' \n  {\n    \"inputs\": [\n      [\"query_1\"],\n      [\"query_2\"]\n    ],\n    \"input_type\": \"query\",\n    \"model\": \"voyage-context-3\"\n  }\n  '"
            }
          ]
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "ApiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "Authorization: Bearer",
        "x-default": "$VOYAGE_API_KEY"
      }
    },
    "responses": {
      "4XX": {
        "description": "Client error  <p> This indicates an issue with the request format or frequency. Please see our  [Error Codes](https://docs.voyageai.com/docs/error-codes) guide. </p>\n",
        "content": {
          "application/json": {
            "schema": {
              "properties": {
                "detail": {
                  "type": "string",
                  "description": "The error message."
                }
              }
            }
          }
        }
      },
      "5XX": {
        "description": "Server Error <p> This indicates our servers are experiencing high traffic or having an unexpected issue. Please see our  [Error Codes](https://docs.voyageai.com/docs/error-codes) guide. </p>\n"
      }
    },
    "schemas": {
      "ChunkEmbeddingsObject": {
        "type": "object",
        "properties": {
          "object": {
            "type": "string",
            "description": "The object type, which is always `list`."
          },
          "data": {
            "type": "array",
            "description": "An array of contextualized embeddings.\n",
            "items": {
              "type": "object",
              "properties": {
                "object": {
                  "type": "string",
                  "description": "The object type, which is always `list`.\n"
                },
                "data": {
                  "type": "array",
                  "description": "An array of embedding objects.",
                  "items": {
                    "type": "object",
                    "properties": {
                      "object": {
                        "type": "string",
                        "description": "The object type, which is always `embedding`.\n"
                      },
                      "embedding": {
                        "type": "array",
                        "description": "Each embedding is a vector represented as an array of float numbers when `output_dtype` is set to `float` and as an array of integers for all other values of `output_dtype` (`int8`, `uint8`, `binary`, and `ubinary`). The length of this vector varies depending on the specific model, `output_dimension`, and `output_dtype`.\n",
                        "items": {
                          "type": "number"
                        }
                      },
                      "index": {
                        "type": "integer",
                        "description": "An integer representing the index of the query or the contextualized chunk embedding within the list of embeddings from the same document.\n"
                      }
                    }
                  }
                },
                "index": {
                  "type": "integer",
                  "description": "An integer representing the index of the query or document within the list of queries or documents, respectively.       \n"
                }
              }
            }
          },
          "model": {
            "type": "string",
            "description": "Name of the model."
          },
          "usage": {
            "type": "object",
            "properties": {
              "total_tokens": {
                "type": "integer",
                "description": "The total number of tokens used for computing the embeddings."
              }
            }
          }
        }
      }
    }
  },
  "x-readme": {
    "headers": [],
    "explorer-enabled": false,
    "proxy-enabled": false,
    "samples-enabled": true
  },
  "x-readme-fauxas": true
}
```
