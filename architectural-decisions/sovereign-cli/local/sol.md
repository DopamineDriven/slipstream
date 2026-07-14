Yes—this is exactly the right time to wire it. The first successful `read_file` call will prove the entire coding-agent loop: model intent → provider tool call → Slipstream server → local CLI → filesystem → result back throug existing typed `EventTypeMap` transport and `on`/`send` API already provide the correct seam.  The earlier CLI review also arrived at the same eventual boundary: a provider-neutral tool protocol, explicit turn correlation, containment, bounded output, cancellation, and audit logging. 

The one change I would make to the quoted proposal:

> Implement the **first provider adapter** for Anthropic, but do not implement an Anthropic-shaped tool system.

The core should never import an Anthropic, OpenAI, xAI, or Google SDK type.

## Architecture

```text
Anthropic/OpenAI/xAI/etc. adapter
              │
              ▼
     Canonical provider turn
              │ canonical tool call
              ▼
       LocalToolBroker
        on WS server
              │ local_tool_request
              ▼
       Sovereign CLI
     WorkspaceReadTools
              │ local_tool_result
              ▼
       LocalToolBroker
              │ canonical tool result
              ▼
     Same provider adapter
              │
              ▼
      provider continues
```

Use this correlation identity:

```text
originating WebSocket identity
    + turnId
    + toolCallId
```

`conversationId + toolCallId` is nearly enough for your current single-turn alpha, but binding the pending request to the actual socket prevents another CLI instance or browser socket from satisfying it. `turnId` also kills stale results from an earlier turn.

---

# 1. Shared provider-neutral contract

```ts
// packages/types/src/local-tools.ts

export const LOCAL_TOOL_NAMES = [
  "repo_search",
  "read_file",
  "list_directory"
] as const;

export type LocalToolName = (typeof LOCAL_TOOL_NAMES)[number];

export type LocalToolErrorCode =
  | "INVALID_INPUT"
  | "PATH_OUTSIDE_WORKSPACE"
  | "NOT_FOUND"
  | "NOT_A_FILE"
  | "NOT_A_DIRECTORY"
  | "FILE_TOO_LARGE"
  | "BINARY_FILE"
  | "OUTPUT_LIMIT"
  | "TOOL_BUSY"
  | "TURN_MISMATCH"
  | "TURN_CANCELLED"
  | "DEADLINE_EXCEEDED"
  | "CLIENT_DISCONNECTED"
  | "EXEC_FAILED"
  | "PROTOCOL_ERROR"
  | "INTERNAL";

export interface RepoSearchOutput {
  readonly tool: "repo_search";
  readonly query: string;
  readonly path: string;
  /**
   * rg --vimgrep format:
   *
   * path:line:column:text
   */
  readonly matches: readonly string[];
  readonly truncated: boolean;
}

export interface ReadFileOutput {
  readonly tool: "read_file";
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly totalLines: number;
  readonly content: string;
  readonly truncated: boolean;
}

export interface ListDirectoryEntry {
  readonly path: string;
  readonly kind: "file" | "directory" | "symlink" | "other";
}

export interface ListDirectoryOutput {
  readonly tool: "list_directory";
  readonly path: string;
  readonly entries: readonly ListDirectoryEntry[];
  readonly truncated: boolean;
}

export type LocalToolOutput =
  | RepoSearchOutput
  | ReadFileOutput
  | ListDirectoryOutput;

/**
 * `input` deliberately remains unknown.
 *
 * It originates with a model and crosses a network boundary. JSON Schema
 * guides generation but does not make the generated value trustworthy.
 */
export interface LocalToolRequest {
  readonly type: "local_tool_request";
  readonly conversationId: string;
  readonly turnId: string;
  readonly toolCallId: string;
  readonly name: LocalToolName;
  readonly input: unknown;
  /** Absolute epoch milliseconds. */
  readonly deadlineAt: number;
}

export interface LocalToolSuccess {
  readonly ok: true;
  readonly value: LocalToolOutput;
  readonly durationMs: number;
  readonly outputBytes: number;
}

export interface LocalToolFailure {
  readonly ok: false;
  readonly error: {
    readonly code: LocalToolErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly durationMs: number;
}

export interface LocalToolResult {
  readonly type: "local_tool_result";
  readonly conversationId: string;
  readonly turnId: string;
  readonly toolCallId: string;
  readonly name: LocalToolName;
  readonly result: LocalToolSuccess | LocalToolFailure;
}

export interface LocalToolCapabilities {
  readonly protocolVersion: 1;
  readonly names: readonly LocalToolName[];
}

export interface CanonicalToolDefinition {
  readonly name: LocalToolName;
  readonly description: string;
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
    readonly additionalProperties: false;
  };
}

export const LOCAL_TOOL_DEFINITIONS = [
  {
    name: "repo_search",
    description:
      "Search text within the active local workspace using ripgrep. " +
      "Paths are workspace-relative. Git ignore files are honored. " +
      "Returns bounded path, line, column, and matching-line references.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 500
        },
        path: {
          type: "string",
          description: "Workspace-relative file or directory. Defaults to '.'."
        },
        literal: {
          type: "boolean",
          description:
            "Use literal rather than regular-expression matching. Defaults to false."
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 200
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "read_file",
    description:
      "Read a bounded line range from a UTF-8 text file in the active local workspace. " +
      "Returns numbered lines and truncation metadata.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative file path."
        },
        startLine: {
          type: "integer",
          minimum: 1
        },
        endLine: {
          type: "integer",
          minimum: 1
        }
      },
      required: ["path"],
      additionalProperties: false
    }
  },
  {
    name: "list_directory",
    description:
      "List a workspace-relative directory without following symbolic links. " +
      "Traversal is depth- and entry-bounded.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative directory. Defaults to '.'."
        },
        maxDepth: {
          type: "integer",
          minimum: 0,
          maximum: 4
        }
      },
      additionalProperties: false
    }
  }
] as const satisfies readonly CanonicalToolDefinition[];

export function isLocalToolName(value: string): value is LocalToolName {
  return LOCAL_TOOL_NAMES.some(name => name === value);
}
```

Then:

```ts
// packages/types/src/events.ts

import type {
  LocalToolRequest,
  LocalToolResult
} from "./local-tools.ts";

export interface EventTypeMap {
  // existing members...

  local_tool_request: LocalToolRequest;
  local_tool_result: LocalToolResult;
}
```

I would also add an optional request-level capability field:

```ts
export interface AIChatRequest {
  // existing fields...

  /**
   * Absent for web clients and CLI turns where local access is disabled.
   */
  readonly localTools?: LocalToolCapabilities;
}
```

That gives you the hard flag:

```text
capability absent → zero local tools sent to provider
capability present → intersect advertised names with server-known definitions
```

Do not infer this from the user agent.

---

# 2. Server-side broker

This owns the Promise parking, deadline, socket binding, stale-result rejection, and disconnect synthesis.

```ts
// apps/ws-server/src/local-tools/local-tool-broker.ts

import { WebSocket } from "ws";

import type {
  LocalToolErrorCode,
  LocalToolRequest,
  LocalToolResult
} from "@slipstream/types";

interface PendingLocalTool {
  readonly request: LocalToolRequest;
  readonly finish: (result: LocalToolResult) => void;
}

export class LocalToolBroker {
  private readonly pendingBySocket =
    new WeakMap<WebSocket, Map<string, PendingLocalTool>>();

  private readonly key = (
    event: Pick<LocalToolRequest, "turnId" | "toolCallId">
  ) => `${event.turnId}:${event.toolCallId}`;

  private getPendingMap(ws: WebSocket) {
    const existing = this.pendingBySocket.get(ws);
    if (existing) return existing;

    const created = new Map<string, PendingLocalTool>();
    this.pendingBySocket.set(ws, created);
    return created;
  }

  private failure(
    request: LocalToolRequest,
    code: LocalToolErrorCode,
    message: string,
    retryable = false
  ): LocalToolResult {
    return {
      type: "local_tool_result",
      conversationId: request.conversationId,
      turnId: request.turnId,
      toolCallId: request.toolCallId,
      name: request.name,
      result: {
        ok: false,
        error: {
          code,
          message,
          retryable
        },
        durationMs: 0
      }
    };
  }

  /**
   * Always resolves to a tool result.
   *
   * Timeouts, turn cancellation and disconnects become is_error results
   * rather than rejected promises that can wedge the provider loop.
   */
  public request(
    ws: WebSocket,
    request: LocalToolRequest,
    turnSignal: AbortSignal
  ): Promise<LocalToolResult> {
    const pending = this.getPendingMap(ws);
    const key = this.key(request);

    if (pending.has(key)) {
      return Promise.resolve(
        this.failure(
          request,
          "PROTOCOL_ERROR",
          `Duplicate pending local tool call: ${request.toolCallId}`
        )
      );
    }

    if (turnSignal.aborted) {
      return Promise.resolve(
        this.failure(request, "TURN_CANCELLED", "The provider turn was cancelled.")
      );
    }

    if (request.deadlineAt <= Date.now()) {
      return Promise.resolve(
        this.failure(
          request,
          "DEADLINE_EXCEEDED",
          "The local tool request deadline has already expired.",
          true
        )
      );
    }

    const { promise, resolve } = Promise.withResolvers<LocalToolResult>();

    let timer: NodeJS.Timeout | undefined;

    const onTurnAbort = () => {
      finish(
        this.failure(
          request,
          "TURN_CANCELLED",
          "The provider turn was cancelled."
        )
      );
    };

    const finish = (result: LocalToolResult) => {
      // Only the first completion path wins.
      if (!pending.delete(key)) return;

      if (timer) clearTimeout(timer);
      turnSignal.removeEventListener("abort", onTurnAbort);
      resolve(result);
    };

    pending.set(key, {
      request,
      finish
    });

    turnSignal.addEventListener("abort", onTurnAbort, {
      once: true
    });

    timer = setTimeout(() => {
      finish(
        this.failure(
          request,
          "DEADLINE_EXCEEDED",
          `Local tool ${request.name} exceeded its wall-clock deadline.`,
          true
        )
      );
    }, request.deadlineAt - Date.now());

    if (ws.readyState !== WebSocket.OPEN) {
      finish(
        this.failure(
          request,
          "CLIENT_DISCONNECTED",
          "The originating CLI is no longer connected.",
          true
        )
      );

      return promise;
    }

    ws.send(JSON.stringify(request), error => {
      if (!error) return;

      finish(
        this.failure(
          request,
          "CLIENT_DISCONNECTED",
          error.message,
          true
        )
      );
    });

    return promise;
  }

  /**
   * Called only from the local_tool_result WS resolver.
   *
   * Because the pending map is socket-scoped, another connection cannot
   * satisfy this request even if it knows all serialized identifiers.
   */
  public acceptResult(ws: WebSocket, result: LocalToolResult) {
    const pending = this.pendingBySocket.get(ws);
    if (!pending) return false;

    const key = this.key(result);
    const entry = pending.get(key);
    if (!entry) return false;

    const expected = entry.request;

    if (
      result.conversationId !== expected.conversationId ||
      result.turnId !== expected.turnId ||
      result.name !== expected.name
    ) {
      entry.finish(
        this.failure(
          expected,
          "PROTOCOL_ERROR",
          "The local tool result did not match its pending request."
        )
      );

      return false;
    }

    entry.finish(result);
    return true;
  }

  public dropSocket(ws: WebSocket) {
    const pending = this.pendingBySocket.get(ws);
    if (!pending) return;

    for (const entry of [...pending.values()]) {
      entry.finish(
        this.failure(
          entry.request,
          "CLIENT_DISCONNECTED",
          "The local CLI disconnected while executing the tool.",
          true
        )
      );
    }

    this.pendingBySocket.delete(ws);
  }
}
```

Server wiring:

```ts
this.on("local_tool_result", (event, ws) => {
  this.localToolBroker.acceptResult(ws, event);
});

ws.on("close", () => {
  this.localToolBroker.dropSocket(ws);
});
```

`local_tool_request` must use direct `ws.send`, never Redis broadcast or your general conversation fan-out.

---

# 3. Provider-neutral turn interface

Provider-specific continuation machinery stays inside each adapter.

```ts
// apps/ws-server/src/providers/provider-turn.ts

import type {
  CanonicalToolDefinition,
  LocalToolName
} from "@slipstream/types";

export interface CanonicalProviderToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface CanonicalProviderToolResult {
  readonly toolCallId: string;
  readonly name: LocalToolName;
  readonly isError: boolean;
  readonly content: string;
}

export type ProviderTurnStep =
  | {
      readonly kind: "tool_calls";
      readonly calls: readonly CanonicalProviderToolCall[];
    }
  | {
      readonly kind: "complete";
      readonly text: string;
      readonly usage?: {
        readonly inputTokens?: number;
        readonly outputTokens?: number;
      };
    };

export interface ProviderTurn {
  /**
   * First call receives undefined.
   * Subsequent calls receive results for the previous tool-call step.
   */
  next(
    toolResults?: readonly CanonicalProviderToolResult[]
  ): Promise<ProviderTurnStep>;

  cancel(reason?: unknown): void;
}

export interface ProviderAdapter {
  readonly provider: string;

  startTurn(input: {
    readonly model: string;
    readonly messages: readonly unknown[];
    readonly tools: readonly CanonicalToolDefinition[];
    readonly signal: AbortSignal;
    readonly onTextDelta: (delta: string) => void;
    readonly onThinkingDelta?: (delta: string) => void;
  }): ProviderTurn;
}
```

Each adapter performs only these transformations:

```text
canonical definitions → provider-specific definitions
provider tool call     → CanonicalProviderToolCall
canonical result       → provider-specific tool-result message
```

The orchestrator stays the same for every provider:

```ts
// apps/ws-server/src/local-tools/provider-local-tool-loop.ts

import { WebSocket } from "ws";

import {
  isLocalToolName,
  LOCAL_TOOL_DEFINITIONS
} from "@slipstream/types";

import type {
  LocalToolCapabilities,
  LocalToolRequest,
  LocalToolResult
} from "@slipstream/types";

import type {
  CanonicalProviderToolResult,
  ProviderAdapter
} from "@/providers/provider-turn.ts";

import { LocalToolBroker } from "./local-tool-broker.ts";

const MAX_TOOL_ROUNDS = 8;

const TOOL_DEADLINE_MS = {
  repo_search: 15_000,
  read_file: 7_500,
  list_directory: 7_500
} as const;

export class ProviderLocalToolLoop {
  public constructor(
    private readonly broker: LocalToolBroker
  ) {}

  private toProviderResult(
    result: LocalToolResult
  ): CanonicalProviderToolResult {
    return {
      toolCallId: result.toolCallId,
      name: result.name,
      isError: !result.result.ok,
      content: JSON.stringify(
        result.result.ok
          ? result.result.value
          : {
              error: result.result.error
            }
      )
    };
  }

  public async run(input: {
    readonly adapter: ProviderAdapter;
    readonly ws: WebSocket;
    readonly model: string;
    readonly messages: readonly unknown[];
    readonly conversationId: string;
    readonly turnId: string;
    readonly capabilities?: LocalToolCapabilities;
    readonly signal: AbortSignal;
    readonly onTextDelta: (delta: string) => void;
    readonly onThinkingDelta?: (delta: string) => void;
  }) {
    const advertised = new Set(
      input.capabilities?.protocolVersion === 1
        ? input.capabilities.names
        : []
    );

    const tools = LOCAL_TOOL_DEFINITIONS.filter(definition =>
      advertised.has(definition.name)
    );

    const turn = input.adapter.startTurn({
      model: input.model,
      messages: input.messages,
      tools,
      signal: input.signal,
      onTextDelta: input.onTextDelta,
      onThinkingDelta: input.onThinkingDelta
    });

    let submittedResults:
      | readonly CanonicalProviderToolResult[]
      | undefined;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const step = await turn.next(submittedResults);

      if (step.kind === "complete") {
        return step;
      }

      const results = Array.of<CanonicalProviderToolResult>();

      /*
       * Sequential for the alpha:
       * one locally executing tool call at a time.
       *
       * We still gather every call from this provider step before passing
       * the result collection back, which works for providers that return
       * multiple calls in one assistant message.
       */
      for (const call of step.calls) {
        if (
          !isLocalToolName(call.name) ||
          !advertised.has(call.name)
        ) {
          results.push({
            toolCallId: call.id,
            name: "read_file",
            isError: true,
            content: JSON.stringify({
              error: {
                code: "INVALID_INPUT",
                message: `Unavailable local tool: ${call.name}`
              }
            })
          });

          continue;
        }

        const request: LocalToolRequest = {
          type: "local_tool_request",
          conversationId: input.conversationId,
          turnId: input.turnId,
          toolCallId: call.id,
          name: call.name,
          input: call.input,
          deadlineAt: Date.now() + TOOL_DEADLINE_MS[call.name]
        };

        const localResult = await this.broker.request(
          input.ws,
          request,
          input.signal
        );

        results.push(this.toProviderResult(localResult));
      }

      submittedResults = results;
    }

    turn.cancel("Maximum local-tool rounds exceeded.");

    throw new Error(
      `Provider exceeded the ${MAX_TOOL_ROUNDS}-round local tool limit.`
    );
  }
}
```

One minor type refinement: for an unknown tool name, I would eventually let `CanonicalProviderToolResult.name` remain `string`. I used `"read_file"` above only to keep the compact example aligned with the current canonical type. The provider result is correlated primarily by `toolCallId`; it need not pretend an unknown tool was a known one.

---

# 4. Workspace boundary and read-only executor

Node’s promise-based filesystem APIs work naturally with ESM, while child-process APIs accept explicit argv arrays, timeouts, and `AbortSignal`. A child process uses no shell unless one is explicitly enabled; this example still pins `shell: false` as an invariant. ([Node.js][1])

```ts
// packages/cli/src/local-tools/workspace-read-tools.ts

import { execFile } from "node:child_process";
import {
  readFile as fsReadFile,
  readdir,
  realpath,
  stat
} from "node:fs/promises";
import {
  isAbsolute,
  relative,
  resolve,
  sep
} from "node:path";
import { promisify } from "node:util";

import type {
  ListDirectoryOutput,
  LocalToolErrorCode,
  LocalToolName,
  LocalToolOutput,
  ReadFileOutput,
  RepoSearchOutput
} from "@slipstream/types";

const execFileAsync = promisify(execFile);

const MAX_FILE_BYTES = 1_048_576;
const MAX_READ_LINES = 400;
const MAX_TOOL_OUTPUT_BYTES = 65_536;
const MAX_DIRECTORY_ENTRIES = 500;

class ToolFault extends Error {
  public constructor(
    public readonly code: LocalToolErrorCode,
    message: string
  ) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new ToolFault(
      "INVALID_INPUT",
      "Tool input must be a JSON object."
    );
  }

  return value as Record<string, unknown>;
}

function requiredString(
  input: Record<string, unknown>,
  key: string
) {
  const value = input[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolFault(
      "INVALID_INPUT",
      `${key} must be a non-empty string.`
    );
  }

  return value;
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
  fallback: string
) {
  const value = input[key];

  if (typeof value === "undefined") return fallback;

  if (typeof value !== "string") {
    throw new ToolFault(
      "INVALID_INPUT",
      `${key} must be a string.`
    );
  }

  return value;
}

function optionalInteger(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number
) {
  const value = input[key];

  if (typeof value === "undefined") return fallback;

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new ToolFault(
      "INVALID_INPUT",
      `${key} must be an integer from ${min} through ${max}.`
    );
  }

  return value;
}

function optionalBoolean(
  input: Record<string, unknown>,
  key: string,
  fallback: boolean
) {
  const value = input[key];

  if (typeof value === "undefined") return fallback;

  if (typeof value !== "boolean") {
    throw new ToolFault(
      "INVALID_INPUT",
      `${key} must be a boolean.`
    );
  }

  return value;
}

function errorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    return error.code;
  }

  return undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error);
}

type ExpectedKind = "file" | "directory" | "any";

interface ResolvedWorkspacePath {
  readonly absolute: string;
  readonly display: string;
}

class WorkspaceBoundary {
  private constructor(
    public readonly root: string
  ) {}

  public static async create(root: string) {
    return new WorkspaceBoundary(await realpath(root));
  }

  private assertContained(absolute: string) {
    const rel = relative(this.root, absolute);

    if (
      rel === ".." ||
      rel.startsWith(`..${sep}`) ||
      isAbsolute(rel)
    ) {
      throw new ToolFault(
        "PATH_OUTSIDE_WORKSPACE",
        "The requested path escapes the active workspace."
      );
    }
  }

  public display(absolute: string) {
    const rel = relative(this.root, absolute);

    return rel.length === 0
      ? "."
      : rel.split(sep).join("/");
  }

  public async resolveExisting(
    requestedPath: string,
    expected: ExpectedKind
  ): Promise<ResolvedWorkspacePath> {
    if (requestedPath.includes("\0")) {
      throw new ToolFault(
        "INVALID_INPUT",
        "Paths may not contain NUL bytes."
      );
    }

    if (isAbsolute(requestedPath)) {
      throw new ToolFault(
        "PATH_OUTSIDE_WORKSPACE",
        "Only workspace-relative paths are accepted."
      );
    }

    /*
     * First reject syntactic ../ escape without probing the external target.
     */
    const candidate = resolve(this.root, requestedPath || ".");
    this.assertContained(candidate);

    let canonical: string;

    try {
      /*
       * realpath follows symlinks. Rechecking containment afterward rejects
       * a symlink inside the repository that targets /etc, $HOME, etc.
       */
      canonical = await realpath(candidate);
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        throw new ToolFault(
          "NOT_FOUND",
          `Path does not exist: ${requestedPath}`
        );
      }

      throw error;
    }

    this.assertContained(canonical);

    const info = await stat(canonical);

    if (expected === "file" && !info.isFile()) {
      throw new ToolFault(
        "NOT_A_FILE",
        `Path is not a regular file: ${requestedPath}`
      );
    }

    if (expected === "directory" && !info.isDirectory()) {
      throw new ToolFault(
        "NOT_A_DIRECTORY",
        `Path is not a directory: ${requestedPath}`
      );
    }

    return {
      absolute: canonical,
      display: this.display(canonical)
    };
  }
}

export class WorkspaceReadTools {
  private constructor(
    private readonly boundary: WorkspaceBoundary
  ) {}

  public static async create(root: string) {
    return new WorkspaceReadTools(
      await WorkspaceBoundary.create(root)
    );
  }

  public get root() {
    return this.boundary.root;
  }

  public execute(
    name: LocalToolName,
    input: unknown,
    signal: AbortSignal
  ): Promise<LocalToolOutput> {
    switch (name) {
      case "repo_search":
        return this.repoSearch(input, signal);

      case "read_file":
        return this.readFile(input, signal);

      case "list_directory":
        return this.listDirectory(input, signal);
    }
  }

  private async readFile(
    rawInput: unknown,
    signal: AbortSignal
  ): Promise<ReadFileOutput> {
    signal.throwIfAborted();

    const input = asRecord(rawInput);
    const path = requiredString(input, "path");
    const startLine = optionalInteger(
      input,
      "startLine",
      1,
      1,
      Number.MAX_SAFE_INTEGER
    );
    const requestedEndLine = optionalInteger(
      input,
      "endLine",
      startLine + 199,
      1,
      Number.MAX_SAFE_INTEGER
    );

    if (requestedEndLine < startLine) {
      throw new ToolFault(
        "INVALID_INPUT",
        "endLine must be greater than or equal to startLine."
      );
    }

    const target = await this.boundary.resolveExisting(
      path,
      "file"
    );

    const info = await stat(target.absolute);

    if (info.size > MAX_FILE_BYTES) {
      throw new ToolFault(
        "FILE_TOO_LARGE",
        `File is ${info.size} bytes; limit is ${MAX_FILE_BYTES}.`
      );
    }

    const buffer = await fsReadFile(target.absolute);
    signal.throwIfAborted();

    if (buffer.subarray(0, 8192).includes(0)) {
      throw new ToolFault(
        "BINARY_FILE",
        "The requested file appears to be binary."
      );
    }

    const lines = buffer
      .toString("utf8")
      .split("\n")
      .map(line => line.endsWith("\r") ? line.slice(0, -1) : line);

    const zeroBasedStart = Math.min(startLine - 1, lines.length);
    const boundedEndLine = Math.min(
      requestedEndLine,
      startLine + MAX_READ_LINES - 1,
      lines.length
    );

    const rendered = Array.of<string>();
    let outputBytes = 0;
    let lastIncludedLine = startLine - 1;
    let outputLimitReached = false;

    for (
      let index = zeroBasedStart;
      index < boundedEndLine;
      index += 1
    ) {
      const numbered = `${index + 1}: ${lines[index] ?? ""}`;
      const bytes = Buffer.byteLength(`${numbered}\n`);

      if (outputBytes + bytes > MAX_TOOL_OUTPUT_BYTES) {
        outputLimitReached = true;
        break;
      }

      rendered.push(numbered);
      outputBytes += bytes;
      lastIncludedLine = index + 1;
    }

    const truncated =
      outputLimitReached ||
      requestedEndLine > boundedEndLine ||
      requestedEndLine - startLine + 1 > MAX_READ_LINES;

    return {
      tool: "read_file",
      path: target.display,
      startLine,
      endLine: Math.max(startLine - 1, lastIncludedLine),
      totalLines: lines.length,
      content: rendered.join("\n"),
      truncated
    };
  }

  private async listDirectory(
    rawInput: unknown,
    signal: AbortSignal
  ): Promise<ListDirectoryOutput> {
    const input = asRecord(rawInput);
    const path = optionalString(input, "path", ".");
    const maxDepth = optionalInteger(
      input,
      "maxDepth",
      2,
      0,
      4
    );

    const target = await this.boundary.resolveExisting(
      path,
      "directory"
    );

    const entries = Array.of<{
      path: string;
      kind: "file" | "directory" | "symlink" | "other";
    }>();

    let truncated = false;

    const visit = async (
      directory: string,
      depth: number
    ): Promise<void> => {
      signal.throwIfAborted();

      const children = await readdir(directory, {
        withFileTypes: true
      });

      children.sort((a, b) => a.name.localeCompare(b.name));

      for (const child of children) {
        signal.throwIfAborted();

        if (entries.length >= MAX_DIRECTORY_ENTRIES) {
          truncated = true;
          return;
        }

        const absolute = resolve(directory, child.name);
        const display = this.boundary.display(absolute);

        const kind = child.isSymbolicLink()
          ? "symlink"
          : child.isDirectory()
            ? "directory"
            : child.isFile()
              ? "file"
              : "other";

        entries.push({
          path: display,
          kind
        });

        /*
         * Never follow symlinks. Avoid recursively dumping dependency and
         * VCS internals, while still showing that those directories exist.
         */
        const mayDescend =
          child.isDirectory() &&
          depth < maxDepth &&
          child.name !== ".git" &&
          child.name !== "node_modules";

        if (mayDescend) {
          await visit(absolute, depth + 1);

          if (truncated) return;
        }
      }
    };

    await visit(target.absolute, 0);

    return {
      tool: "list_directory",
      path: target.display,
      entries,
      truncated
    };
  }

  private async repoSearch(
    rawInput: unknown,
    signal: AbortSignal
  ): Promise<RepoSearchOutput> {
    signal.throwIfAborted();

    const input = asRecord(rawInput);
    const query = requiredString(input, "query");
    const path = optionalString(input, "path", ".");
    const literal = optionalBoolean(input, "literal", false);
    const maxResults = optionalInteger(
      input,
      "maxResults",
      100,
      1,
      200
    );

    if (query.length > 500) {
      throw new ToolFault(
        "INVALID_INPUT",
        "Search query exceeds 500 characters."
      );
    }

    const target = await this.boundary.resolveExisting(
      path,
      "any"
    );

    const args = [
      "--no-config",
      "--vimgrep",
      "--color=never",
      "--no-heading",
      "--smart-case",
      ...(literal ? ["--fixed-strings"] : []),
      /*
       * Ensures a query beginning with "-" is data, not another rg option.
       */
      "--",
      query,
      target.display
    ];

    let stdout: string;

    try {
      const result = await execFileAsync("rg", args, {
        cwd: this.boundary.root,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 5_000,
        maxBuffer: 1_048_576,
        signal
      });

      stdout = String(result.stdout);
    } catch (error) {
      /*
       * ripgrep uses exit code 1 for a valid search with zero matches.
       */
      if (errorCode(error) === 1) {
        stdout = "";
      } else {
        throw new ToolFault(
          "EXEC_FAILED",
          `ripgrep failed: ${errorMessage(error)}`
        );
      }
    }

    signal.throwIfAborted();

    const allMatches = stdout
      .split(/\r?\n/)
      .filter(line => line.length > 0);

    return {
      tool: "repo_search",
      query,
      path: target.display,
      matches: allMatches.slice(0, maxResults),
      truncated: allMatches.length > maxResults
    };
  }
}

export { ToolFault };
```

This contains the two containment checks you want:

```text
resolve(root, userPath) → reject syntactic escape
realpath(candidate)     → reject symlink escape
```

No user value becomes a command string. The executable is fixed to `rg`, arguments are an array, `shell` is false, output is bounded, and the operation is abortable.

---

# 5. CLI service wiring

Insert this into your existing service chain:

```text
CliConfigService
  → SlipstreamClientService
    → CliLocalToolsService
      → CliProviderContextService
        → CliRendererService
          → SlipstreamReplService
```

```ts
// packages/cli/src/local-tools/local-tools.ts

import {
  LOCAL_TOOL_NAMES
} from "@slipstream/types";

import type {
  LocalToolErrorCode,
  LocalToolRequest,
  LocalToolResult
} from "@slipstream/types";

import { SlipstreamClientService } from "@/client.ts";

import {
  ToolFault,
  WorkspaceReadTools
} from "./workspace-read-tools.ts";

interface ActiveLocalToolTurn {
  readonly conversationId: string;
  readonly turnId: string;
}

export class CliLocalToolsService extends SlipstreamClientService {
  private workspaceTools?: WorkspaceReadTools;
  private activeLocalToolTurn?: ActiveLocalToolTurn;

  private activeExecution?: {
    readonly toolCallId: string;
    readonly controller: AbortController;
  };

  protected async initializeLocalTools(
    workspaceRoot = process.cwd()
  ) {
    this.workspaceTools = await WorkspaceReadTools.create(
      workspaceRoot
    );

    /*
     * Register before connect, following the same discipline as your
     * provider-context listener.
     */
    this.on("local_tool_request", request => {
      void this.handleLocalToolRequest(request);
    });
  }

  protected beginLocalToolTurn(
    conversationId: string,
    turnId: string
  ) {
    this.activeLocalToolTurn = {
      conversationId,
      turnId
    };
  }

  protected endLocalToolTurn(turnId: string) {
    if (this.activeLocalToolTurn?.turnId !== turnId) return;

    this.activeExecution?.controller.abort(
      new Error("The owning turn ended.")
    );

    this.activeExecution = undefined;
    this.activeLocalToolTurn = undefined;
  }

  private failure(
    request: LocalToolRequest,
    code: LocalToolErrorCode,
    message: string,
    durationMs = 0,
    retryable = false
  ): LocalToolResult {
    return {
      type: "local_tool_result",
      conversationId: request.conversationId,
      turnId: request.turnId,
      toolCallId: request.toolCallId,
      name: request.name,
      result: {
        ok: false,
        error: {
          code,
          message,
          retryable
        },
        durationMs
      }
    };
  }

  private audit(
    request: LocalToolRequest,
    result: LocalToolResult
  ) {
    /*
     * Replace this with your existing pino child logger.
     * Do not dump full file contents into the audit log.
     */
    process.stderr.write(
      `${JSON.stringify({
        event: "local_tool_execution",
        at: new Date().toISOString(),
        conversationId: request.conversationId,
        turnId: request.turnId,
        toolCallId: request.toolCallId,
        name: request.name,
        input: request.input,
        ok: result.result.ok,
        durationMs: result.result.durationMs
      })}\n`
    );
  }

  private emitLocalToolResult(result: LocalToolResult) {
    /*
     * This method must bypass your reconnect queue.
     *
     * A tool result is a volatile reply to a pending request on this exact
     * socket. If disconnected, the server broker synthesizes an error.
     * Replaying a queued stale result after reconnect is actively wrong.
     */
    return this.sendVolatile(result);
  }

  private async handleLocalToolRequest(
    request: LocalToolRequest
  ) {
    let result: LocalToolResult;

    const active = this.activeLocalToolTurn;

    if (
      !active ||
      active.turnId !== request.turnId ||
      active.conversationId !== request.conversationId
    ) {
      result = this.failure(
        request,
        "TURN_MISMATCH",
        "The request does not belong to the CLI's active turn."
      );

      this.emitLocalToolResult(result);
      this.audit(request, result);
      return;
    }

    if (!this.workspaceTools) {
      result = this.failure(
        request,
        "INTERNAL",
        "Local workspace tools were not initialized."
      );

      this.emitLocalToolResult(result);
      this.audit(request, result);
      return;
    }

    if (this.activeExecution) {
      result = this.failure(
        request,
        "TOOL_BUSY",
        `Tool call ${this.activeExecution.toolCallId} is already running.`,
        0,
        true
      );

      this.emitLocalToolResult(result);
      this.audit(request, result);
      return;
    }

    const remainingMs = request.deadlineAt - Date.now();

    if (remainingMs <= 0) {
      result = this.failure(
        request,
        "DEADLINE_EXCEEDED",
        "The tool request arrived after its deadline.",
        0,
        true
      );

      this.emitLocalToolResult(result);
      this.audit(request, result);
      return;
    }

    const startedAt = performance.now();
    const turnController = new AbortController();
    const deadlineSignal = AbortSignal.timeout(remainingMs);
    const signal = AbortSignal.any([
      turnController.signal,
      deadlineSignal
    ]);

    this.activeExecution = {
      toolCallId: request.toolCallId,
      controller: turnController
    };

    try {
      const value = await this.workspaceTools.execute(
        request.name,
        request.input,
        signal
      );

      const durationMs = performance.now() - startedAt;

      result = {
        type: "local_tool_result",
        conversationId: request.conversationId,
        turnId: request.turnId,
        toolCallId: request.toolCallId,
        name: request.name,
        result: {
          ok: true,
          value,
          durationMs,
          outputBytes: Buffer.byteLength(
            JSON.stringify(value)
          )
        }
      };
    } catch (error) {
      const durationMs = performance.now() - startedAt;

      if (error instanceof ToolFault) {
        result = this.failure(
          request,
          error.code,
          error.message,
          durationMs
        );
      } else if (deadlineSignal.aborted) {
        result = this.failure(
          request,
          "DEADLINE_EXCEEDED",
          `Local tool ${request.name} exceeded its deadline.`,
          durationMs,
          true
        );
      } else if (turnController.signal.aborted) {
        result = this.failure(
          request,
          "TURN_CANCELLED",
          "The owning turn ended while the tool was running.",
          durationMs
        );
      } else {
        result = this.failure(
          request,
          "INTERNAL",
          this.safeErrMsg(error),
          durationMs
        );
      }
    } finally {
      if (
        this.activeExecution?.toolCallId === request.toolCallId
      ) {
        this.activeExecution = undefined;
      }
    }

    this.emitLocalToolResult(result);
    this.audit(request, result);
  }

  protected get localToolCapabilities() {
    return {
      protocolVersion: 1,
      names: LOCAL_TOOL_NAMES
    } as const;
  }
}
```

The important transport addition is not merely another alias for your current `send()`:

```ts
// client.ts

public sendVolatile<const K extends keyof EventTypeMap>(
  data: EventTypeMap[K]
) {
  /*
   * The underlying implementation must return false rather than queue when
   * the socket is not OPEN.
   */
  return this.wsClient?.sendVolatile(data.type, data) ?? false;
}
```

Your reconnect queue is useful for unsent chat prompts. It is wrong for a response whose corresponding server Promise died when the socket disconnected.

---

# 6. Turn lifecycle in the REPL

Use the same client-generated ID for:

```text
ai_chat_request.userMsgId
turnId
active CLI turn
server provider turn
```

```ts
protected async sendPrompt(prompt: string) {
  const userMsgId = crypto.randomUUID();
  const conversationId = this.state.conversationId;

  this.beginTurnRender();
  this.beginLocalToolTurn(conversationId, userMsgId);

  try {
    this.send({
      type: "ai_chat_request",
      conversationId,
      userMsgId,
      prompt,

      // existing provider/model/context fields...

      localTools: this.localToolCapabilities
    });

    await this.awaitTurn(userMsgId);
  } finally {
    this.endLocalToolTurn(userMsgId);
  }
}
```

When the feature is disabled:

```ts
localTools: undefined
```

That must result in:

```ts
adapter.startTurn({
  tools: []
});
```

not merely “tools attached, but execution will reject them.”

---

# 7. Runtime flow

A model asks:

```json
{
  "name": "repo_search",
  "input": {
    "query": "parsedCookies",
    "path": "apps/ws-server/src",
    "literal": true
  }
}
```

The CLI returns:

```json
{
  "tool": "repo_search",
  "query": "parsedCookies",
  "path": "apps/ws-server/src",
  "matches": [
    "apps/ws-server/src/server.ts:91:19:const parsed = parsedCookies(req);",
    "apps/ws-server/src/auth/cookies.ts:14:17:export function parsedCookies(...)"
  ],
  "truncated": false
}
```

The model then calls:

```json
{
  "name": "read_file",
  "input": {
    "path": "apps/ws-server/src/auth/cookies.ts",
    "startLine": 1,
    "endLine": 120
  }
}
```

That is the dopamine ping.

---

## Non-negotiable edges

1. **Bind pending calls to the originating socket.** Serialized IDs alone should not confer authority.

2. **Never queue `local_tool_result` over reconnect.** The old server-side Promise is dead.

3. **Keep model-generated input as `unknown`.** JSON Schema is generation guidance, not validation.

4. **Use realpath containment after syntactic containment.** The second check is what catches symlink escapes.

5. **Do not let the model specify an executable or argv.** `repo_search` invokes exactly one fixed executable with fixed structural arguments.

6. **Cap rounds, calls, time, bytes, lines, entries, file size, and subprocess output.** Every dimension needs a ceiling.

7. **Browsers advertise no local capabilities.** Shared event types can receive mechanical IGNORE entries, but only a CLI turn should cause the server to attach these definitions.

Node 26’s permission model can add defense in depth by restricting filesystem reads, network destinations, and whether child processes may be created, although allowing `rg` necessarily requires child-process permission and therefore does not replace your application-level boundary. ([Node.js][2])

This gives you an alpha whose only provider-specific code is the adapter translation. Once the Anthropic adapter works, OpenAI/xAI/Google support becomes “teach another adapter to produce and consume the same canonical calls,” not “rebuild local tooling four times.”

[1]: https://nodejs.org/api/esm.html "https://nodejs.org/api/esm.html"
[2]: https://nodejs.org/api/permissions.html "https://nodejs.org/api/permissions.html"
