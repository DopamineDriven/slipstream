**Yes—very plausible for a genuinely useful read-only alpha by this time tomorrow.** Not a production-complete coding agent, but enough that Anthropic and OpenAI models can independently inspect your repository, search symbols, open files, and reason from the actual source tree.

You already have most of the expensive infrastructure:

* Sovereign CLI talks to the existing WebSocket server.
* Both provider families already support tool loops.
* Your server already normalizes heterogeneous provider behavior.
* Conversations, HMEM, and the user vector store already work from the CLI.
* The Phase 2 reviews have converged on the eventual request/result correlation model. 
* Your own Phase 3 design explicitly calls for **read-only workspace tools first**, before patching and command execution. 

## The right deadline target

By tomorrow, aim for exactly three tools:

```ts
repo_search({
  query: string,
  path?: string,
  glob?: string,
  maxResults?: number
})

read_file({
  path: string,
  startLine?: number,
  endLine?: number
})

list_directory({
  path?: string,
  maxDepth?: number
})
```

That is enough for prompts such as:

> Find the implementation of `ConversationMemoryVectorService`, inspect its indexing claim path, and explain how the watermark CAS prevents overlapping chunks.

The desired loop is:

```text
model
  → repo_search("ConversationMemoryVectorService")
CLI
  → matching paths and line locations
model
  → read_file(path, 1, 240)
CLI
  → bounded source content
model
  → additional searches/reads
  → grounded final answer
```

That already qualifies as the models **reading and navigating your local codebase**, rather than you manually pasting context.

## The smallest clean architecture

Do not put filesystem implementation inside either provider adapter.

Use a provider-neutral delegated-tool bridge:

```text
Anthropic / OpenAI provider loop
        ↓ normalized tool call
ws-server local-tool bridge
        ↓ local_tool_request
Sovereign CLI
        ↓ execute against workspace
        ↑ local_tool_result
ws-server resumes provider loop
        ↑
model continues reasoning
```

A minimal shared contract could look like:

```ts
type LocalToolRequest = {
  type: "local_tool_request";
  operationId: string;
  toolCallId: string;
  name: "repo_search" | "read_file" | "list_directory";
  arguments: unknown;
};

type LocalToolResult = {
  type: "local_tool_result";
  operationId: string;
  toolCallId: string;
  status: "COMPLETE" | "FAILED";
  content?: string;
  error?: {
    code:
      | "INVALID_ARGUMENTS"
      | "OUTSIDE_WORKSPACE"
      | "NOT_FOUND"
      | "TOO_LARGE"
      | "INTERNAL";
    message: string;
  };
  truncated?: boolean;
};
```

The provider-specific parts should only translate between native tool-call formats and your existing normalized tool machinery. The filesystem executor belongs entirely in the CLI.

## The non-negotiable containment layer

Even for your single-operator CLI, implement these immediately:

```ts
const root = await realpath(configuredWorkspaceRoot);
const candidate = await realpath(resolve(root, requestedPath));

if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
  return outsideWorkspaceError();
}
```

Also:

* Reject symlink escapes after `realpath`.
* Reject binary files.
* Bound lines, bytes, search matches, and directory depth.
* Return explicit truncation metadata.
* Use `rg` for search and honor `.gitignore`.
* Permit only one configured workspace root.
* Record tool name, arguments, duration, result size, and status.
* Never expose arbitrary shell execution through a “search” argument.

I would put the workspace root in CLI session state:

```bash
slipstream --workspace /home/andrew/repos/slipstream
```

and eventually add:

```text
/workspace
/workspace /path/to/repo
```

## One caveat from the adversarial reviews

Your current CLI has known turn-correlation and terminal-state weaknesses. Both reviews correctly warn that local tools use the **same request/result correlation problem** as hydration and chat operations.  

I would not let that block an experimental branch, but constrain the alpha:

* one active turn;
* one tool request at a time;
* no concurrent prompts;
* no reconnect/resume during a tool round;
* no writes;
* no shell commands;
* feature flag the delegated-tool bridge;
* reject stale results by `operationId` and `toolCallId`.

That lets you prove the product loop now without pretending the reliability kernel is finished.

## An even faster fallback

If the delegated tool protocol becomes unexpectedly sticky, you can still hit the user-visible goal through explicit CLI context commands:

```text
/search ConversationMemoryVectorService
/read apps/ws-server/src/memory/vector-service.ts 1 240
/ask explain the CAS behavior using the selected repository context
```

The CLI would attach the bounded source excerpts to the next request. That is less agentic, but both Anthropic and OpenAI would still be reasoning over local source through Sovereign CLI by the deadline.

I would build the autonomous bridge first, while keeping explicit `/search` and `/read` as a debugging surface. Those commands will remain valuable even after models can invoke the same operations themselves.

## What is not plausible by tomorrow

Do not expand the goal to include:

* patch application;
* file writes;
* arbitrary command execution;
* approval-policy tiers;
* resumable tool runs;
* parallel agents;
* diff review;
* full run persistence;
* production-grade reconnect/idempotency;
* Claude Code or Codex parity.

Those are the real Phase 3 runtime described in the review documents. 

## My confidence

* **Explicit local search/read through CLI:** nearly certain.
* **Model-initiated read/search tools for both Anthropic and OpenAI:** strongly plausible.
* **Robust, reconnect-safe local agent runtime:** not by tomorrow.
* **Useful demo that makes Sovereign CLI feel like the beginning of a real coding tool:** absolutely.

Your success criterion should be one recorded session where **both Fable and Sol**, independently, locate an unfamiliar implementation from only a natural-language request, read multiple relevant files, and produce a source-grounded architectural assessment with file and line references. That would be a legitimate milestone—not a toy proof of concept.
