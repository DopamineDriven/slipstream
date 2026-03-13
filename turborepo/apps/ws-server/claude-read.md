---
name: Gemini File Search Implementation
description: In-progress implementation of custom file_search function calling for Gemini models, threading UserStoreVectorService through the class hierarchy
type: project
---

## Status: IN PROGRESS — workup.ts imports added, constructor + methods + chat.ts tool loop still pending

## What's Done (Partitioned Foraging / Hybrid Search)
All completed for Anthropic, OpenAI, Meta, v0 providers:
- Steps 1-6: Migration, schema, SQL, types, Prisma service, vector service
- Step 7: All 4 providers updated (tool definitions, input parsing, executeFileSearch, searchStoreHybrid)
- Step 8: Typecheck clean, backfill complete (1286 chunks)
- Output shape includes: query, search_terms, semantic_results, fulltext_results, overlap_results (with matched_terms + matched_spans), metadata

## What's In Progress: Gemini File Search

### Architecture
```
FileSearchStoreService (fss.ts) — Google's native FSS, base class
  ↓
GeminiWorkupService (workup.ts) — content gen, tool config, history formatting
  ↓
GeminiChatService (chat.ts) — streaming loop, image handling
  ↓
GeminiService (index.ts) — router, public entry point
```

### Constructor chain (current → needed)
- `FileSearchStoreService(logger, prisma, apiKey)` — unchanged
- `GeminiWorkupService(logger, prisma, apiKey)` → ADD `userStoreVector: UserStoreVectorService` after prisma
- `GeminiChatService(logger, prisma, redis, s3, apiKey)` → ADD `userStoreVector` after prisma
- `GeminiService(logger, prisma, redis, s3, apiKey)` → ADD `userStoreVector` after prisma

### Instantiation sites to update
1. `apps/ws-server/src/index.ts:172` — `new GeminiService(logger, prisma, redisInstance, s3, cfg.GOOGLE_API_KEY)` → add `userStore` after prisma
2. `apps/ws-server/src/mixins/index.ts:223` — `new GeminiService(deps.logger, deps.prisma, deps.redis, deps.s3, this.gemApiKey)` → add deps.userStoreVector (need to check if available in deps)

### Files to modify (workup.ts partially done)

**workup.ts** — PARTIALLY DONE (imports added, rest pending):
- [x] Add imports: `UserStoreVectorService`, `Type` from `@google/genai`
- [ ] Update constructor to accept `userStoreVector` (protected parameter)
- [ ] Add `fileSearchFunctionDeclaration()` — Google-style using `Type.OBJECT`, `Type.STRING` etc.
- [ ] Add `searchStore()` — wraps `this.userStoreVector.searchUserStoreChunks()`
- [ ] Add `searchStoreHybrid()` — wraps `this.userStoreVector.searchUserStoreChunksHybrid()`
- [ ] Add `executeFileSearch(userId, args: Record<string, unknown>)` — parses args directly (not JSON string like other providers), conditional hybrid path
- [ ] Update `getTools()` at line 727 — add `{ functionDeclarations: [this.fileSearchFunctionDeclaration()] }` to tools array for FSS-capable models
- [ ] Change `automaticFunctionCalling: { disable: false }` → `{ disable: true }` in `contentGenChat()` for manual control

**chat.ts** — NOT STARTED:
- [ ] Add `Content`, `Part` to imports from `@google/genai`
- [ ] Thread `userStoreVector` through constructor
- [ ] Add function call detection in streaming loop: check `part.functionCall?.name` and collect calls
- [ ] Wrap streaming in do/while loop (max 10 rounds) with `shouldContinue` flag
- [ ] When `done` is reached with function calls: execute file_search, build `functionResponse` parts, append to `contents`, continue loop
- [ ] When `done` is reached WITHOUT function calls: existing completion logic (unchanged)
- [ ] Make `contents` mutable: `const contents = [...params.contents]` and use `{ ...params, contents }` in stream call

**index.ts (gemini)** — NOT STARTED:
- [ ] Thread `userStoreVector` through constructor

**index.ts (root)** — NOT STARTED:
- [ ] Pass `userStore` to `new GeminiService()` at line 172

**mixins/index.ts** — NOT STARTED:
- [ ] Pass `userStoreVector` to `new GeminiService()` at line 223 (need to verify deps shape)

### Key Design Decisions
- Keep FSS (Google's native File Search Store) intact alongside custom file_search
- Custom function declaration named `file_search` — no conflict with Google's built-in `fileSearch` tool type
- `automaticFunctionCalling: { disable: true }` — manual control for WebSocket streaming
- Gemini args come as `Record<string, unknown>` not JSON string — simpler parsing than other providers
- Function call loop pattern: collect `part.functionCall` during stream → execute after stream ends → append model+user parts to contents → re-stream
- Always include file_search function declaration for capable models (search returns empty if no store)

### Google Function Calling Pattern (from claude-notes.md)
```typescript
// Tool declaration
tools: [{ functionDeclarations: [{ name: "file_search", parameters: { type: Type.OBJECT, properties: {...}, required: ["query"] } }] }]

// Model returns functionCalls in response parts
part.functionCall = { name: "file_search", args: { query: "..." } }

// Client sends back functionResponse
{ role: "model", parts: [{ functionCall: {...} }] }
{ role: "user", parts: [{ functionResponse: { name: "file_search", response: { result: "..." } } }] }
```

**Why:** Phasing out Google FSS in favor of user-scoped vector store with hybrid search. FSS stays functional during transition.
**How to apply:** When resuming, start from constructor changes in workup.ts and work down the chain.
