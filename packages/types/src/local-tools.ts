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
  RepoSearchOutput | ReadFileOutput | ListDirectoryOutput;

/**
 * `input` deliberately remains unknown.
 *
 * It originates with a model and crosses a network boundary. JSON Schema
 * guides generation but does not make the generated value trustworthy.
 */
export interface LocalToolRequest {
  readonly type: "local_tool_request";
  readonly conversationId: string;
  /**
   * Server-minted opaque turn identity — `"turn_" + nanoid()` per provider
   * turn ATTEMPT at dispatch (the xai/img-gen.ts generateId precedent).
   * Not derived from userMsgId: retry/regenerate flows reuse the message
   * id across attempts, and the correlation unit is the attempt. Stable
   * across every tool round within the attempt; the CLI echoes it
   * verbatim. Semantics (provider/model/round) are typed fields, never
   * parsed out of this string — compose audit tags at print time.
   */
  readonly turnId: string;
  /** 1-indexed tool round within the turn — observability, not identity */
  readonly round: number;
  readonly toolCallId: string;
  readonly name: LocalToolName;
  readonly input: unknown;
  /**
   * Relative wall-clock budget in milliseconds. Each side computes its own
   * local deadline from arrival time — never an absolute epoch, so
   * server/CLI clock skew can neither pre-expire nor over-extend a request.
   */
  readonly timeoutMs: number;
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

/**
 * The portable schema intersection — the leaf shape every provider dialect
 * can translate totally and mechanically (anthropic input_schema is
 * near-identity; the gemini mapper walks these into its Type-enum
 * FunctionDeclaration form; openai adds strict-mode flags in its mapper).
 * Enforced by the compiler so a future tool cannot drift into schema some
 * provider cannot express — a canonical definition is the SOURCE, never the
 * literal wire payload.
 */
export interface CanonicalSchemaProperty {
  readonly type: "string" | "integer" | "boolean";
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface CanonicalToolDefinition {
  readonly name: LocalToolName;
  readonly description: string;
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: Readonly<Record<string, CanonicalSchemaProperty>>;
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
      "Returns bounded path:line:column:text match references.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 500,
          description: "The search pattern (regular expression by default)."
        },
        path: {
          type: "string",
          description:
            "Workspace-relative file or directory to search. Defaults to '.'."
        },
        literal: {
          type: "boolean",
          description:
            "Use literal rather than regular-expression matching. Defaults to false."
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "Maximum match lines to return. Defaults to 100."
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "read_file",
    description:
      "Read a bounded line range from a UTF-8 text file in the active local " +
      "workspace. Returns numbered lines and truncation metadata.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          minLength: 1,
          description: "Workspace-relative file path."
        },
        startLine: {
          type: "integer",
          minimum: 1,
          description: "First line to read (1-indexed). Defaults to 1."
        },
        endLine: {
          type: "integer",
          minimum: 1,
          description:
            "Last line to read (inclusive). Defaults to startLine + 199."
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
      "Traversal is depth- and entry-bounded; .git and node_modules are " +
      "shown but never descended into.",
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
          maximum: 4,
          description: "Recursion depth below the target. Defaults to 2."
        }
      },
      additionalProperties: false
    }
  }
] as const satisfies readonly CanonicalToolDefinition[];

export function isLocalToolName(value: string) {
  return (
    value === "list_directory" ||
    value === "read_file" ||
    value === "repo_search"
  );
}
