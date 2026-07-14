import { execFile } from "node:child_process";
import { readFile as fsReadFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { WorkspaceReadToolCaps } from "@/types.ts";
import type {
  ListDirectoryEntry,
  ListDirectoryOutput,
  LocalToolErrorCode,
  LocalToolName,
  ReadFileOutput,
  RepoSearchOutput
} from "@slipstream/types";

/**
 * Typed executor fault — every anticipated failure carries a wire error
 * code so the CLI's local_tool_result failure branch is a mechanical map.
 */
export class ToolFault extends Error {
  constructor(
    public readonly code: LocalToolErrorCode,
    message: string
  ) {
    super(message);
  }
}

/**
 * The workspace containment boundary (fable-findings-v3 §3-alpha, adopted
 * from sol.md §4). Two checks, always in order:
 *
 *   resolve(root, userPath) → reject syntactic ../ or absolute escape
 *   realpath(candidate)     → reject symlink escape (re-check containment)
 *
 * No model-supplied value is ever probed outside the root; the syntactic
 * rejection happens before the filesystem is touched.
 */
export class WorkspaceBoundary {
  private constructor(public readonly root: string) {}

  public static async create(root: string) {
    return new WorkspaceBoundary(await realpath(root));
  }

  private assertContained(absolute: string) {
    const rel = relative(this.root, absolute);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new ToolFault(
        "PATH_OUTSIDE_WORKSPACE",
        "The requested path escapes the active workspace."
      );
    }
  }

  /** workspace-relative, forward-slashed display path ("." for the root) */
  public display(absolute: string) {
    const rel = relative(this.root, absolute);
    return rel.length === 0 ? "." : rel.split(sep).join("/");
  }

  private errorCode(error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const { code } = error;
      return typeof code === "string" || typeof code === "number"
        ? code
        : undefined;
    }
    return undefined;
  }

  public async resolveExisting(
    requestedPath: string,
    expected: "file" | "directory" | "any"
  ) {
    if (requestedPath.includes("\0")) {
      throw new ToolFault("INVALID_INPUT", "Paths may not contain NUL bytes.");
    }
    if (isAbsolute(requestedPath)) {
      throw new ToolFault(
        "PATH_OUTSIDE_WORKSPACE",
        "Only workspace-relative paths are accepted."
      );
    }

    // syntactic escape rejected before the external target is ever probed
    const candidate = resolve(this.root, requestedPath || ".");
    this.assertContained(candidate);

    let canonical: string;
    try {
      // realpath follows symlinks — rechecking containment afterward
      // rejects an in-repo symlink that targets /etc, $HOME, etc.
      canonical = await realpath(candidate);
    } catch (error) {
      if (this.errorCode(error) === "ENOENT") {
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
    } as const;
  }
}

/**
 * The three read-only executors behind the local tool bridge. Model input
 * arrives as `unknown` (JSON Schema guides generation, validates nothing)
 * and is narrowed by the private validator methods; every dimension is
 * bounded (file bytes, lines, output bytes, entries, depth, matches,
 * subprocess time and buffer); `rg` is a fixed executable with structural
 * argv, `--` before the query, shell: false — no model value ever becomes
 * a command string.
 */
export class WorkspaceReadTools {
  private readonly execFileAsync = promisify(execFile);

  private constructor(
    private readonly boundary: WorkspaceBoundary,
    private readonly caps: WorkspaceReadToolCaps
  ) {}

  public static async create(
    root: string,
    caps: WorkspaceReadToolCaps = {
      maxFileBytes: 1_048_576,
      maxReadLines: 400,
      maxToolOutputBytes: 65_536,
      maxDirectoryEntries: 500
    }
  ) {
    return new WorkspaceReadTools(await WorkspaceBoundary.create(root), caps);
  }

  public get root() {
    return this.boundary.root;
  }

  private asRecord(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ToolFault("INVALID_INPUT", "Tool input must be a JSON object.");
    }
    return value as Record<string, unknown>;
  }

  private requiredString(input: Record<string, unknown>, key: string) {
    const value = input[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ToolFault("INVALID_INPUT", `${key} must be a non-empty string.`);
    }
    return value;
  }

  private optionalString(
    input: Record<string, unknown>,
    key: string,
    fallback: string
  ) {
    const value = input[key];
    if (typeof value === "undefined") return fallback;
    if (typeof value !== "string") {
      throw new ToolFault("INVALID_INPUT", `${key} must be a string.`);
    }
    return value;
  }

  private optionalInteger(
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

  private optionalBoolean(
    input: Record<string, unknown>,
    key: string,
    fallback: boolean
  ) {
    const value = input[key];
    if (typeof value === "undefined") return fallback;
    if (typeof value !== "boolean") {
      throw new ToolFault("INVALID_INPUT", `${key} must be a boolean.`);
    }
    return value;
  }

  private errorCode(error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const { code } = error;
      return typeof code === "string" || typeof code === "number"
        ? code
        : undefined;
    }
    return undefined;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  public execute(name: LocalToolName, input: unknown, signal: AbortSignal) {
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

    const input = this.asRecord(rawInput);
    const path = this.requiredString(input, "path");
    const startLine = this.optionalInteger(
      input,
      "startLine",
      1,
      1,
      Number.MAX_SAFE_INTEGER
    );
    const requestedEndLine = this.optionalInteger(
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

    const target = await this.boundary.resolveExisting(path, "file");
    const info = await stat(target.absolute);
    if (info.size > this.caps.maxFileBytes) {
      throw new ToolFault(
        "FILE_TOO_LARGE",
        `File is ${info.size} bytes; limit is ${this.caps.maxFileBytes}.`
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
      .map(line => (line.endsWith("\r") ? line.slice(0, -1) : line));

    const zeroBasedStart = Math.min(startLine - 1, lines.length);
    const boundedEndLine = Math.min(
      requestedEndLine,
      startLine + this.caps.maxReadLines - 1,
      lines.length
    );

    const rendered = Array.of<string>();
    let outputBytes = 0;
    let lastIncludedLine = startLine - 1;
    let outputLimitReached = false;

    for (let index = zeroBasedStart; index < boundedEndLine; index += 1) {
      const numbered = `${index + 1}: ${lines[index] ?? ""}`;
      const bytes = Buffer.byteLength(`${numbered}\n`);
      if (outputBytes + bytes > this.caps.maxToolOutputBytes) {
        outputLimitReached = true;
        break;
      }
      rendered.push(numbered);
      outputBytes += bytes;
      lastIncludedLine = index + 1;
    }

    // truncated means content was actually withheld — reading past EOF is
    // not truncation (totalLines already tells that story)
    const truncated =
      outputLimitReached ||
      boundedEndLine < Math.min(requestedEndLine, lines.length);

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
    const input = this.asRecord(rawInput);
    const path = this.optionalString(input, "path", ".");
    const maxDepth = this.optionalInteger(input, "maxDepth", 2, 0, 4);

    const target = await this.boundary.resolveExisting(path, "directory");
    const entries = Array.of<ListDirectoryEntry>();
    let truncated = false;

    const visit = async (directory: string, depth: number): Promise<void> => {
      signal.throwIfAborted();
      const children = await readdir(directory, { withFileTypes: true });
      children.sort((a, b) => a.name.localeCompare(b.name));

      for (const child of children) {
        signal.throwIfAborted();
        if (entries.length >= this.caps.maxDirectoryEntries) {
          truncated = true;
          return;
        }
        const absolute = resolve(directory, child.name);
        const kind = child.isSymbolicLink()
          ? "symlink"
          : child.isDirectory()
            ? "directory"
            : child.isFile()
              ? "file"
              : "other";
        entries.push({ path: this.boundary.display(absolute), kind });

        // never follow symlinks; show that dependency/VCS internals exist
        // without ever descending into them
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

    const input = this.asRecord(rawInput);
    const query = this.requiredString(input, "query");
    const path = this.optionalString(input, "path", ".");
    const literal = this.optionalBoolean(input, "literal", false);
    const maxResults = this.optionalInteger(input, "maxResults", 100, 1, 200);

    if (query.length > 500) {
      throw new ToolFault(
        "INVALID_INPUT",
        "Search query exceeds 500 characters."
      );
    }

    const target = await this.boundary.resolveExisting(path, "any");

    const args = [
      "--no-config",
      "--vimgrep",
      "--color=never",
      "--no-heading",
      "--smart-case",
      ...(literal ? ["--fixed-strings"] : []),
      // a query beginning with "-" is data, never another rg option
      "--",
      query,
      target.display
    ];

    let stdout: string;
    try {
      const result = await this.execFileAsync("rg", args, {
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
      const code = this.errorCode(error);
      // rg exits 1 for a valid search with zero matches
      if (typeof code === "number" && code === 1) {
        stdout = "";
      } else {
        throw new ToolFault(
          "EXEC_FAILED",
          `ripgrep failed: ${this.errorMessage(error)}`
        );
      }
    }
    signal.throwIfAborted();

    // rg prefixes "./" when searching from the root — strip it so match
    // paths are workspace-relative and directly reusable as read_file input
    const allMatches = stdout
      .split(/\r?\n/)
      .filter(line => line.length > 0)
      .map(line => (line.startsWith("./") ? line.slice(2) : line));

    return {
      tool: "repo_search",
      query,
      path: target.display,
      matches: allMatches.slice(0, maxResults),
      truncated: allMatches.length > maxResults
    };
  }
}
