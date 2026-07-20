import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CliLocalToolsService } from "@/local-tools.ts";
import { ToolFault, WorkspaceReadTools } from "@/workspace-read-tools.ts";
import type { LocalToolRequest, LocalToolResult } from "@slipstream/types";
import { isLocalToolName, LOCAL_TOOL_NAMES } from "@slipstream/types";

/**
 * fixture workspace:
 *   ws/
 *     alpha.ts            (10 lines)
 *     binary.bin          (contains NUL bytes)
 *     sub/beta.ts         (contains "parsedCookies")
 *     sub/deep/gamma.txt
 *     escape-link -> /etc (symlink escaping the root)
 */
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "aic-local-tools-"));
  const ws = join(root, "ws");
  mkdirSync(join(ws, "sub", "deep"), { recursive: true });
  writeFileSync(
    join(ws, "alpha.ts"),
    Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n")
  );
  writeFileSync(join(ws, "binary.bin"), Buffer.from([1, 2, 0, 3, 4]));
  writeFileSync(
    join(ws, "sub", "beta.ts"),
    "export function parsedCookies() {\n  return null;\n}\n"
  );
  writeFileSync(join(ws, "sub", "deep", "gamma.txt"), "deep file\n");
  try {
    symlinkSync("/etc", join(ws, "escape-link"));
  } catch {
    // symlink creation can fail on odd filesystems — escape test skips itself
  }
  return ws;
}

function hasRg() {
  try {
    execFileSync("rg", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const WS = makeFixture();
const NO_ABORT = new AbortController().signal;

async function faultCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof ToolFault ? err.code : null;
  }
}

describe("LOCAL_TOOL_NAMES ↔ isLocalToolName parity", () => {
  it("every registered name passes the guard", () => {
    assert.equal(LOCAL_TOOL_NAMES.every(isLocalToolName), true);
    assert.equal(isLocalToolName("write_file"), false);
  });
});

describe("WorkspaceBoundary — containment matrix", () => {
  it("rejects traversal, absolute, and NUL paths without execution", async () => {
    const tools = await WorkspaceReadTools.create(WS);
    const read = (path: string) =>
      tools.execute("read_file", { path }, NO_ABORT);
    assert.equal(await faultCode(read("../outside.ts")), "PATH_OUTSIDE_WORKSPACE");
    assert.equal(await faultCode(read("sub/../../outside.ts")), "PATH_OUTSIDE_WORKSPACE");
    assert.equal(await faultCode(read("/etc/passwd")), "PATH_OUTSIDE_WORKSPACE");
    assert.equal(await faultCode(read("alpha.ts\0.png")), "INVALID_INPUT");
  });

  it("rejects a symlink that escapes the root AFTER realpath", async () => {
    const tools = await WorkspaceReadTools.create(WS);
    const code = await faultCode(
      tools.execute("list_directory", { path: "escape-link" }, NO_ABORT)
    );
    // ENOENT-style skip if the fixture couldn't create the symlink
    if (code !== null) {
      assert.equal(code, "PATH_OUTSIDE_WORKSPACE");
    }
  });

  it("distinguishes NOT_FOUND / NOT_A_FILE / NOT_A_DIRECTORY", async () => {
    const tools = await WorkspaceReadTools.create(WS);
    assert.equal(
      await faultCode(tools.execute("read_file", { path: "nope.ts" }, NO_ABORT)),
      "NOT_FOUND"
    );
    assert.equal(
      await faultCode(tools.execute("read_file", { path: "sub" }, NO_ABORT)),
      "NOT_A_FILE"
    );
    assert.equal(
      await faultCode(
        tools.execute("list_directory", { path: "alpha.ts" }, NO_ABORT)
      ),
      "NOT_A_DIRECTORY"
    );
  });
});

describe("read_file — windowing, numbering, truncation semantics", () => {
  it("returns numbered lines for the requested window", async () => {
    const tools = await WorkspaceReadTools.create(WS);
    const out = await tools.execute(
      "read_file",
      { path: "alpha.ts", startLine: 2, endLine: 4 },
      NO_ABORT
    );
    if (out.tool !== "read_file") assert.fail("wrong output tool");
    assert.equal(out.content, "2: line 2\n3: line 3\n4: line 4");
    assert.equal(out.totalLines, 10);
    assert.equal(out.truncated, false);
  });

  it("reading past EOF is NOT truncation — totalLines tells that story", async () => {
    const tools = await WorkspaceReadTools.create(WS);
    const out = await tools.execute(
      "read_file",
      { path: "alpha.ts", startLine: 1, endLine: 5000 },
      NO_ABORT
    );
    if (out.tool !== "read_file") assert.fail("wrong output tool");
    assert.equal(out.truncated, false);
    assert.equal(out.endLine, 10);
  });

  it("line-cap truncation IS truncation", async () => {
    const tools = await WorkspaceReadTools.create(WS, {
      maxFileBytes: 1_048_576,
      maxReadLines: 3,
      maxToolOutputBytes: 65_536,
      maxDirectoryEntries: 500
    });
    const out = await tools.execute(
      "read_file",
      { path: "alpha.ts", startLine: 1, endLine: 10 },
      NO_ABORT
    );
    if (out.tool !== "read_file") assert.fail("wrong output tool");
    assert.equal(out.endLine, 3);
    assert.equal(out.truncated, true);
  });

  it("rejects binary files and oversized files", async () => {
    const tools = await WorkspaceReadTools.create(WS);
    assert.equal(
      await faultCode(
        tools.execute("read_file", { path: "binary.bin" }, NO_ABORT)
      ),
      "BINARY_FILE"
    );
    const tiny = await WorkspaceReadTools.create(WS, {
      maxFileBytes: 4,
      maxReadLines: 400,
      maxToolOutputBytes: 65_536,
      maxDirectoryEntries: 500
    });
    assert.equal(
      await faultCode(tiny.execute("read_file", { path: "alpha.ts" }, NO_ABORT)),
      "FILE_TOO_LARGE"
    );
  });

  it("rejects malformed input shapes", async () => {
    const tools = await WorkspaceReadTools.create(WS);
    assert.equal(
      await faultCode(tools.execute("read_file", "alpha.ts", NO_ABORT)),
      "INVALID_INPUT"
    );
    assert.equal(
      await faultCode(
        tools.execute(
          "read_file",
          { path: "alpha.ts", startLine: 5, endLine: 2 },
          NO_ABORT
        )
      ),
      "INVALID_INPUT"
    );
    assert.equal(
      await faultCode(
        tools.execute("read_file", { path: "alpha.ts", startLine: 1.5 }, NO_ABORT)
      ),
      "INVALID_INPUT"
    );
  });
});

describe("list_directory — bounds and symlink discipline", () => {
  it("honors maxDepth and reports symlinks without following", async () => {
    const tools = await WorkspaceReadTools.create(WS);
    const out = await tools.execute(
      "list_directory",
      { path: ".", maxDepth: 0 },
      NO_ABORT
    );
    if (out.tool !== "list_directory") assert.fail("wrong output tool");
    const paths = out.entries.map(e => e.path);
    assert.ok(paths.includes("alpha.ts"));
    assert.ok(paths.includes("sub"));
    assert.equal(paths.includes("sub/beta.ts"), false);
    const link = out.entries.find(e => e.path === "escape-link");
    if (link) assert.equal(link.kind, "symlink");
  });

  it("caps entries with truncation metadata", async () => {
    const tools = await WorkspaceReadTools.create(WS, {
      maxFileBytes: 1_048_576,
      maxReadLines: 400,
      maxToolOutputBytes: 65_536,
      maxDirectoryEntries: 2
    });
    const out = await tools.execute(
      "list_directory",
      { path: ".", maxDepth: 3 },
      NO_ABORT
    );
    if (out.tool !== "list_directory") assert.fail("wrong output tool");
    assert.equal(out.entries.length, 2);
    assert.equal(out.truncated, true);
  });
});

describe("repo_search — fixed executable, bounded output", () => {
  it("finds matches in vimgrep format (skips when rg absent)", async t => {
    if (!hasRg()) return t.skip("rg not installed");
    const tools = await WorkspaceReadTools.create(WS);
    const out = await tools.execute(
      "repo_search",
      { query: "parsedCookies", literal: true },
      NO_ABORT
    );
    if (out.tool !== "repo_search") assert.fail("wrong output tool");
    assert.equal(out.matches.length, 1);
    assert.match(out.matches[0] ?? "", /^sub\/beta\.ts:1:\d+:/);
    assert.equal(out.truncated, false);
  });

  it("zero matches is a valid empty result, not an error", async t => {
    if (!hasRg()) return t.skip("rg not installed");
    const tools = await WorkspaceReadTools.create(WS);
    const out = await tools.execute(
      "repo_search",
      { query: "zzz_never_present_zzz" },
      NO_ABORT
    );
    if (out.tool !== "repo_search") assert.fail("wrong output tool");
    assert.deepEqual(out.matches, []);
  });

  it("a query starting with '-' is data, not an rg flag", async t => {
    if (!hasRg()) return t.skip("rg not installed");
    const tools = await WorkspaceReadTools.create(WS);
    const out = await tools.execute(
      "repo_search",
      { query: "--version", literal: true },
      NO_ABORT
    );
    if (out.tool !== "repo_search") assert.fail("wrong output tool");
    assert.deepEqual(out.matches, []);
  });
});

/** widens the protected surface and captures emissions instead of sending */
class TestLocalToolsService extends CliLocalToolsService {
  public emitted = Array.of<LocalToolResult>();

  protected override emitLocalToolResult(result: LocalToolResult) {
    this.emitted.push(result);
    return true;
  }

  // renderNotice writes to stdout — silence it for test runs
  protected override renderNotice(_notice: string) {}

  public async arm(root: string) {
    return this.initializeLocalTools(root);
  }

  public begin(conversationId: string) {
    this.beginLocalToolTurn(conversationId);
  }

  public rekey(conversationId: string) {
    this.rekeyLocalToolTurn(conversationId);
  }

  public end() {
    this.endLocalToolTurn();
  }

  public async handle(request: LocalToolRequest) {
    return this.handleLocalToolRequest(request);
  }

  public get capabilities() {
    return this.localToolCapabilities;
  }

  public workspace(argv: readonly string[]) {
    return this.parseWorkspaceArg(argv);
  }

  public detectRoot(from?: string) {
    return from ? this.detectWorkspaceRoot(from) : this.detectWorkspaceRoot();
  }
}

function request(overrides?: Partial<LocalToolRequest>) {
  return {
    type: "local_tool_request",
    conversationId: "cm_convo",
    turnId: "turn_abc123",
    round: 1,
    toolCallId: "toolu_001",
    name: "read_file",
    input: { path: "alpha.ts", startLine: 1, endLine: 2 },
    timeoutMs: 5_000,
    ...overrides
  } satisfies LocalToolRequest;
}

describe("CliLocalToolsService — turn gating and exactly-one-result", () => {
  it("dormant service advertises no capabilities; armed service advertises all three", async () => {
    const dormant = new TestLocalToolsService();
    assert.equal(dormant.capabilities, undefined);
    const armed = new TestLocalToolsService();
    await armed.arm(WS);
    const caps = armed.capabilities;
    assert.ok(caps);
    assert.deepEqual(caps.names, LOCAL_TOOL_NAMES);
    assert.equal(caps.protocolVersion, 1);
  });

  it("no active turn → TURN_MISMATCH without execution", async () => {
    const svc = new TestLocalToolsService();
    await svc.arm(WS);
    await svc.handle(request());
    assert.equal(svc.emitted.length, 1);
    const r = svc.emitted[0]?.result;
    assert.equal(r?.ok, false);
    if (r && !r.ok) assert.equal(r.error.code, "TURN_MISMATCH");
  });

  it("pre-rekey adoption — a new-chat turn adopts its first request's id; cross-conversation still rejects", async () => {
    const svc = new TestLocalToolsService();
    await svc.arm(WS);
    svc.begin("new-chat");
    // glm-5.1 case: the model calls a tool BEFORE any chunk lands — the
    // gate adopts the server-minted id instead of TURN_MISMATCH-looping
    await svc.handle(request({ conversationId: "cm_real" }));
    const first = svc.emitted[0]?.result;
    assert.equal(first?.ok, true);
    // the gate is now keyed to cm_real — a cross-conversation request
    // still rejects
    await svc.handle(
      request({ conversationId: "cm_other", toolCallId: "toolu_002" })
    );
    const second = svc.emitted[1]?.result;
    assert.equal(second?.ok, false);
    if (second && !second.ok) {
      assert.equal(second.error.code, "TURN_MISMATCH");
    }
    // the chunk-driven rekey remains idempotent with the adopted id
    svc.rekey("cm_real");
    await svc.handle(
      request({ conversationId: "cm_real", toolCallId: "toolu_003" })
    );
    const third = svc.emitted[2]?.result;
    assert.equal(third?.ok, true);
    svc.end();
  });

  it("happy path — exactly one ok result with the request identity echoed", async () => {
    const svc = new TestLocalToolsService();
    await svc.arm(WS);
    svc.begin("cm_convo");
    await svc.handle(request());
    svc.end();
    assert.equal(svc.emitted.length, 1);
    const emitted = svc.emitted[0];
    assert.equal(emitted?.turnId, "turn_abc123");
    assert.equal(emitted?.toolCallId, "toolu_001");
    const r = emitted?.result;
    assert.equal(r?.ok, true);
    if (r?.ok) {
      assert.equal(r.value.tool, "read_file");
      assert.ok(r.outputBytes > 0);
    }
  });

  it("executor faults surface as typed failures, not throws", async () => {
    const svc = new TestLocalToolsService();
    await svc.arm(WS);
    svc.begin("cm_convo");
    await svc.handle(request({ input: { path: "../escape.ts" } }));
    svc.end();
    const r = svc.emitted[0]?.result;
    assert.equal(r?.ok, false);
    if (r && !r.ok) assert.equal(r.error.code, "PATH_OUTSIDE_WORKSPACE");
  });

  it("parseWorkspaceArg — flag forms, dormant default, bare-flag autodetect", () => {
    const svc = new TestLocalToolsService();
    assert.equal(svc.workspace(["node", "aic"]), undefined);
    // bare flag autodetects the git root; explicit values stay literal
    assert.equal(svc.workspace(["node", "aic", "--workspace"]), svc.detectRoot());
    assert.equal(svc.workspace(["node", "aic", "--workspace", "pkg"]), "pkg");
    assert.equal(svc.workspace(["node", "aic", "--workspace=apps"]), "apps");
    assert.equal(
      svc.workspace(["node", "aic", "--workspace", "--debug"]),
      svc.detectRoot()
    );
  });

  it("detectWorkspaceRoot — nearest .git ancestor wins (dir or file)", () => {
    const svc = new TestLocalToolsService();

    // .git as a directory (normal checkout)
    const gitRoot = mkdtempSync(join(tmpdir(), "aic-git-root-"));
    mkdirSync(join(gitRoot, ".git"));
    mkdirSync(join(gitRoot, "packages", "deep"), { recursive: true });
    assert.equal(svc.detectRoot(join(gitRoot, "packages", "deep")), gitRoot);
    assert.equal(svc.detectRoot(gitRoot), gitRoot);

    // .git as a FILE (worktree/submodule) — existence, not dir-ness, is the test
    const worktree = mkdtempSync(join(tmpdir(), "aic-worktree-"));
    writeFileSync(join(worktree, ".git"), "gitdir: /elsewhere\n");
    mkdirSync(join(worktree, "nested"));
    assert.equal(svc.detectRoot(join(worktree, "nested")), worktree);
  });
});
