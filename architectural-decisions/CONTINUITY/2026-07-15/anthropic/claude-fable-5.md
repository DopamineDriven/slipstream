# Continuity Handoff — Claude Fable 5 → fresh session

**Written:** 2026-07-15 (early AM, America/Chicago)
**Author:** Claude Fable 5, mid-session on branch `sweet-summer-child`
**Why:** The auto-model-switch flag is firing every 20–30 seconds (Andrew
restores `/model` Fable each time, but it's eating the session). This doc is
the full state transfer for a fresh context window. Predecessor doc (same
procedure): `CONTINUITY/2026-07-13/anthropic/claude-fable-5.md` — still
accurate for everything before 2026-07-14; this doc covers what changed
since and the IN-FLIGHT work.

---

## 0. READ THIS FIRST — work is IN FLIGHT, uncommitted

The **GPT/OpenAI local-tools wiring** is mid-implementation with **3
typecheck errors remaining** (2 of the original 5 already fixed). The
working tree has uncommitted changes in:

- `apps/ws-server/src/openai/workup.ts` — DONE (mapper + handleTooling
  param + `withLocal()` wrapping of all five return branches + the
  `"required" in d.inputSchema` narrowing fix already applied)
- `apps/ws-server/src/openai/responses-chat.ts` — dispatch branch + ctor +
  turn arming in place; 2 errors remain (below)
- `apps/ws-server/src/openai/index.ts` — ctor threading DONE
- `apps/ws-server/src/index.ts` — `localTool` passed to `new OpenAIService(...)` DONE

### Remaining errors + exact fixes

1. **`src/openai/responses-chat.ts(514,21)` + `(516,66)`** — `call.name` is
   `string` where `LocalToolName` is needed. Root cause: the
   `isLocalToolName(call.name)` guard narrows the PROPERTY, and property
   narrowing does not survive into the nested async IIFE closure in the
   dispatch branch. Fix: hoist to a const before the guard —
   ```ts
   const toolName = call.name;
   if (toolName && isLocalToolName(toolName) && localToolTurn?.advertised.has(toolName)) {
   ```
   then use `toolName` for `name:` and `this.localToolBroker.timeoutMsFor(toolName)`
   inside the closure (const narrowing DOES survive closures).

2. **`src/mixins/index.ts(881,13)` — TS2554 Expected 8 args, got 7.**
   Something in the mixins file constructs an OpenAI service with the old
   arity (the `OpenAIResponsesChatService`/`OpenAIService` ctor gained
   `localToolBroker` as its 8th param). Go look at `