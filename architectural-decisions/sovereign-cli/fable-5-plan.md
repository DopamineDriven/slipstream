# Sovereign CLI — Fable 5 Plan

> Authored by Claude Fable 5, 2026-07-06 — written ~24 hours before this model goes
> API-only for this user. The feature exists so the collaboration survives the
> cutoff: a terminal client for Slipstream's own ws-server, where the marginal
> cost of a conversation is API tokens through Andrew's own platform — with HMEM
> remembering every session — instead of a subscription.

---

## 0. Where I land (TL;DR)

- **The CLI is a fourth client surface, not a new system.** web, web-next, and the probe scripts already speak to the ws-server; the CLI joins them as a first-class WS client — same `EventTypeMap` contract, same resolver, same 14 providers, same HMEM/tools/persistence. Nearly everything hard (streaming, tool loops, memory, resumability) is already server-side and battle-tested. The CLI is a renderer and an input loop.
- **Hand-rolled, framework-free.** `node:readline/promises` + keypress handling for the loop; a `Map<string, handler>` slash-command router; `process.stdout.write` streaming renderer. Deps: `ws` (+ `@types/ws`), `picocolors` (optional), `dotenv`. NO inquirer (form-flow tool; fights a persistent REPL for stdin raw mode), no commander/yargs/ink/ora.
- **Workspace-native.** `@slipstream/types` gives the CLI the typed wire contract (`EventTypeMap`), model-id unions (fuzzy `/model` matching against the real registry), and zero drift with the server. Everything is a package; the CLI is one more.
- **Resumability is inherited, not built.** The server already replays `existingState.chunks` on reconnect mid-stream — the CLI gets crash-proof streaming for free by sending the same connection shape the web client does.
- **HMEM makes it a continuity machine.** Every CLI conversation indexes, summarizes under the two-arm mixture, and becomes reunifiable. Post-cutoff Fable-via-API sessions inherit the memory of everything before — including, recursively, the sessions that built the memory system.

---

## 1. Why this shape

The ws-server IS the product: provider fleet, HMEM, user store, tool_catalog, resumable streams, persistence, title-gen — all of it lives behind one WS surface with a typed event contract. Any CLI that re-implemented provider calls would fork the platform; a CLI that *renders the existing surface* compounds it. The economics follow: sub → API pricing makes chat-through-own-infra the cheapest way to keep working together, and every session enriches the same memory corpus the platform already maintains.

## 2. Transport & auth

- **Connection:** `ws` client → `ws(s)://host/?id=<sessionId>` — the server's `authenticateConnection` path (`getAndValidateUserSessionById`). The CLI reads the session id from env/config (`.env`: `SLIPSTREAM_WS_URL`, `SLIPSTREAM_SESSION_ID`). Session minting stays out of scope for v1 — Andrew grabs a valid session id from the web app / DB; a `slipstream login` flow is a later phase.
- **Cookie header at handshake** (the reason for `ws` over native WebSocket): send `tz`, `city`, `country`, `viewport=desktop`, `latlng`, etc. so `stashUserData` populates real UserData instead of the anonymous defaults — `user_location` then feeds web_search across providers exactly as it does for the browser.
- **Contract:** every frame is `{ type: keyof EventTypeMap, ...EventTypeMap[type] }`. The CLI imports the types and switches exhaustively — the same discipline the web store uses. `ai_chat_chunk` delivers ONE block per frame with authoritative ordinals; `ai_chat_response` finalizes with the full convo pair.
- **Reconnect:** exponential backoff; on reconnect mid-stream the server replays accumulated chunks (`existingState`) — the renderer just needs to tolerate a replay-from-zero (clear current draft, re-render).

## 3. The loop

One `readline/promises` interface, persistent. Input dispatch:

1. Line starts with `/` → slash-command router.
2. Otherwise → `ai_chat_request` with the active conversation/model/provider settings (mirroring the web client's event shape: prompt, conversationId (`new-chat-…` for fresh), model, provider, systemPrompt?, temperature?, topP?, maxTokens?).

Streaming discipline: while a response streams, the prompt line yields; `Esc`/`Ctrl+C` (single) sends the platform's stop semantics / abandons render without killing the process; double `Ctrl+C` exits. Keypress handling via `readline.emitKeypressEvents(process.stdin)`.

**Slash commands (v1 set):**

| cmd | behavior |
|---|---|
| `/model <fuzzy>` | fuzzy-match against the `@slipstream/types` model unions; sets model+provider (the `modelIdsByProvider` registry gives both) |
| `/new [title-hint]` | next send opens a fresh conversation (`new-chat-` id; first chunk rekeys — the deterministic id+title contract) |
| `/convo <id>` | attach to an existing conversation (id from web app or `/last`) |
| `/system <text\|clear>` | set/clear systemPrompt for subsequent sends |
| `/think` | toggle thinking-block rendering (dim) on/off |
| `/quit` | exit |

Deliberately NOT commands in v1: conversation listing/search (no WS event exists for it — the web app lists via Next server actions; a `conversation_list` event or small HTTP endpoint is a clean later addition and pairs with 8.5's `user_pathname_update`, which the CLI should emit on `/convo` switch once that event lands).

## 4. Rendering

- **Text deltas:** raw passthrough (`stdout.write`) — minimal processing between upstream and terminal, the house doctrine. No markdown re-rendering in v1; light ANSI tinting only (code-fence lines dimmed, name-tags colored).
- **Thinking:** `isThinking`/thinking chunks render dim-gray, prefixed once with `∴ thinking…`; suppressible via `/think`. Thinking duration printed on block finalize.
- **Name tags:** `[provider/model]` prefixes tinted per provider — the platform's notation, now in ANSI.
- **Tool activity:** chunk frames that carry tool round metadata render one-line notices (`⛏ conversation_memory_search …`) — visibility into HMEM foraging live in the terminal.
- **Img-gen:** partial/final frames render CDN URLs as they land (`🖼 partial 2/3 → https://…`); no inline image protocol in v1.
- **Finalize:** on `ai_chat_response`, print the title + usage line, restore the prompt. The convo pair in the payload is the reconciliation source if the renderer ever drifts.

## 5. What it unlocks beyond chat

- **The post-cutoff pairing loop:** Fable/Claude via API through Slipstream, with HMEM reunification across sessions — `conversation_memory_search` reaching back into the sessions that built it.
- **Backfill by wandering:** `/convo` switching = the visitation trigger; once 8.5 lands, the CLI emits `user_pathname_update` and browsing old conversations from the terminal warms the archive.
- **A live probe harness:** the CLI doubles as the cleanest way to exercise substitution payloads, tool_catalog calls, and the two-arm summarizer audition without the browser.

## 6. Dependencies (settled 2026-07-06)

- `ws` + `@types/ws` — handshake Cookie header (native WebSocket can't), reconnect control; already a workspace dep with house augmentations.
- `picocolors` — optional; hand-rolled escape constants acceptable instead.
- `dotenv` — config.
- Built-ins for everything else: `node:readline/promises`, keypress events, stdout writes.
- **No inquirer** (form-flow vs REPL raw-mode conflict), no commander/yargs (hand-rolled router), no ink/ora.

## 7. Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **1 — skeleton** | connect + auth + cookie handshake; send `ai_chat_request`; print raw text deltas; `ai_chat_response` finalize; `/quit` | full round-trip conversation with any provider from the terminal |
| **2 — render** | thinking blocks (dim, toggleable), name-tag tinting, tool notices, img-gen URL lines, spinner/status line, replay-tolerant redraw | a mixed thinking+tools+text response reads cleanly |
| **3 — commands** | `/model` fuzzy (registry-backed), `/new`, `/convo`, `/system`, `/think`; per-conversation setting memory in a local rc file | model/provider switching mid-session without restart |
| **4 — resilience** | reconnect + resume replay, single/double Ctrl+C semantics, drain-mode 503 handling (the server's `isDraining` rejection frame) | kill wifi mid-stream, reconnect, stream completes |
| **5 — reach** | conversation listing (new tiny event or HTTP), `user_pathname_update` on `/convo` (8.5), `/memory <query>` issuing a direct reunification search, attachment upload via the existing presign pipeline | the terminal is a peer of the web client |

## 8. Non-goals (v1)

TUI panes/ink layouts; full markdown rendering; inline image protocols (iTerm2/kitty); session minting/login flow; Windows-exotic terminals; local persistence beyond an rc file (the server owns state — that's the whole point).
