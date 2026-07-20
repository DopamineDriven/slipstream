import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { wsDebug } from "@/chat-ws-client.ts";
import { CliRendererService } from "@/render.ts";
import { ToolFault, WorkspaceReadTools } from "@/workspace-read-tools.ts";
import type {
  LocalToolErrorCode,
  LocalToolOutput,
  LocalToolRequest,
  LocalToolResult
} from "@slipstream/types";
import { LOCAL_TOOL_NAMES } from "@slipstream/types";

/**
 * CLI half of the local read-only tool bridge (slice 2). The server relays
 * the model's tool call as local_tool_request mid-stream; this service
 * gates it (active turn, conversation match, one execution at a time),
 * executes against the contained workspace, and answers with exactly one
 * local_tool_result per request — via sendVolatile, never the reconnect
 * queue: a tool result is a volatile reply to a pending promise on this
 * exact socket, and replaying a stale one after reconnect is actively
 * wrong (the server broker synthesizes the error instead).
 *
 * Dormant unless initializeLocalTools() runs (--workspace opt-in):
 * localToolCapabilities is undefined, ai_chat_request omits the field,
 * and the server attaches zero tool definitions to the provider request.
 */
export class CliLocalToolsService extends CliRendererService {
  constructor(wsUrl?: string) {
    super(wsUrl);
  }

  private workspaceTools?: WorkspaceReadTools = undefined;
  /** conversationId of the in-flight turn — rekeyed when "new-chat" resolves */
  private activeLocalToolConversation?: string = undefined;
  private activeExecution?: {
    readonly toolCallId: string;
    readonly controller: AbortController;
  } = undefined;

  /**
   * nearest ancestor containing .git (a directory in a normal checkout, a
   * FILE in worktrees/submodules — existence is the test), falling back to
   * the starting directory when none is found (non-git dirs are still
   * legitimate workspaces)
   */
  protected detectWorkspaceRoot(from = process.cwd()) {
    let dir = resolve(from);
    for (;;) {
      if (existsSync(join(dir, ".git"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) return resolve(from);
      dir = parent;
    }
  }

  /**
   * --workspace [root] opt-in — flag absent means the bridge stays
   * dormant. Bare flag autodetects the git root from cwd; an explicit
   * value is taken literally so a deliberately narrow boundary holds.
   */
  protected parseWorkspaceArg(argv: readonly string[]) {
    const idx = argv.indexOf("--workspace");
    if (idx !== -1) {
      const next = argv[idx + 1];
      return next !== undefined && !next.startsWith("-")
        ? next
        : this.detectWorkspaceRoot();
    }
    const eq = argv.find(a => a.startsWith("--workspace="));
    const value = eq?.slice("--workspace=".length);
    // empty value (--workspace=$UNSET_VAR) stays dormant — explicit check,
    // no falsy collapse
    return typeof value !== "undefined" && value.length > 0
      ? value
      : undefined;
  }

  protected async initializeLocalTools(workspaceRoot: string) {
    this.workspaceTools = await WorkspaceReadTools.create(workspaceRoot);
    // registered before connect, same discipline as the other listeners
    this.on("local_tool_request", request => {
      void this.handleLocalToolRequest(request);
    });
    return this.workspaceTools.root;
  }

  /** capability advertisement for ai_chat_request — undefined when dormant */
  protected get localToolCapabilities() {
    return this.workspaceTools
      ? ({ protocolVersion: 1, names: LOCAL_TOOL_NAMES } as const)
      : undefined;
  }

  protected beginLocalToolTurn(conversationId: string) {
    this.activeLocalToolConversation = conversationId;
  }

  /**
   * "new-chat" turns rekey to the real conversationId on the first chunk —
   * the gate must follow, or every tool request in a fresh conversation
   * would be rejected as TURN_MISMATCH.
   */
  protected rekeyLocalToolTurn(conversationId: string) {
    if (this.activeLocalToolConversation !== undefined) {
      this.activeLocalToolConversation = conversationId;
    }
  }

  protected endLocalToolTurn() {
    this.activeExecution?.controller.abort(new Error("The owning turn ended."));
    this.activeExecution = undefined;
    this.activeLocalToolConversation = undefined;
  }

  private localToolFailure(
    request: LocalToolRequest,
    code: LocalToolErrorCode,
    message: string,
    durationMs = 0,
    retryable = false
  ) {
    return {
      type: "local_tool_result",
      conversationId: request.conversationId,
      turnId: request.turnId,
      toolCallId: request.toolCallId,
      name: request.name,
      result: {
        ok: false,
        error: { code, message, retryable },
        durationMs
      }
    } as const satisfies LocalToolResult;
  }

  /** overridable seam — tests capture instead of hitting the socket */
  protected emitLocalToolResult(result: LocalToolResult) {
    return this.sendVolatile(result);
  }

  private narrateLocalTool(request: LocalToolRequest, result: LocalToolResult) {
    const r = result.result;
    const outcome = r.ok ? this.describeLocalToolOutput(r.value) : r.error.code;
    this.renderNotice(
      `⚙ ${request.name} · round ${request.round} · ${outcome} · ${Math.round(r.durationMs)}ms`
    );
    if (wsDebug.enabled) {
      process.stderr.write(
        `${JSON.stringify({
          event: "local_tool_execution",
          at: new Date().toISOString(),
          conversationId: request.conversationId,
          turnId: request.turnId,
          toolCallId: request.toolCallId,
          name: request.name,
          round: request.round,
          input: request.input,
          ok: r.ok,
          durationMs: r.durationMs
        })}\n`
      );
    }
  }

  private describeLocalToolOutput(value: LocalToolOutput) {
    switch (value.tool) {
      case "repo_search":
        return `${value.matches.length} match(es)${value.truncated ? " (truncated)" : ""}`;
      case "read_file":
        return `L${value.startLine}-${value.endLine} of ${value.totalLines}${value.truncated ? " (truncated)" : ""}`;
      case "list_directory":
        return `${value.entries.length} entr(ies)${value.truncated ? " (truncated)" : ""}`;
    }
  }

  protected async handleLocalToolRequest(request: LocalToolRequest) {
    let result: LocalToolResult;

    // pre-rekey adoption: a model may call tools BEFORE the first
    // ai_chat_chunk lands (glm-5.1 does — straight to tool calls, zero
    // preceding chunks), so a turn still keyed to "new-chat" adopts the
    // real conversationId from its first request. Same trust model as the
    // chunk-driven rekey: one armed turn per socket, server-minted id;
    // without this the gate TURN_MISMATCHes every request of the turn.
    if (
      this.activeLocalToolConversation === "new-chat" &&
      request.conversationId
    ) {
      this.rekeyLocalToolTurn(request.conversationId);
    }

    if (
      this.activeLocalToolConversation === undefined ||
      this.activeLocalToolConversation !== request.conversationId
    ) {
      result = this.localToolFailure(
        request,
        "TURN_MISMATCH",
        "The request does not belong to the CLI's active turn. " +
          "Non-retryable — stop calling local tools for this turn."
      );
      this.emitLocalToolResult(result);
      this.narrateLocalTool(request, result);
      return;
    }

    if (!this.workspaceTools) {
      result = this.localToolFailure(
        request,
        "INTERNAL",
        "Local workspace tools were not initialized."
      );
      this.emitLocalToolResult(result);
      this.narrateLocalTool(request, result);
      return;
    }

    if (this.activeExecution) {
      result = this.localToolFailure(
        request,
        "TOOL_BUSY",
        `Tool call ${this.activeExecution.toolCallId} is already running.`,
        0,
        true
      );
      this.emitLocalToolResult(result);
      this.narrateLocalTool(request, result);
      return;
    }

    const startedAt = performance.now();
    const turnController = new AbortController();
    const deadlineSignal = AbortSignal.timeout(request.timeoutMs);
    const signal = AbortSignal.any([turnController.signal, deadlineSignal]);

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
          outputBytes: Buffer.byteLength(JSON.stringify(value))
        }
      } satisfies LocalToolResult;
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      if (error instanceof ToolFault) {
        result = this.localToolFailure(
          request,
          error.code,
          error.message,
          durationMs
        );
      } else if (deadlineSignal.aborted) {
        result = this.localToolFailure(
          request,
          "DEADLINE_EXCEEDED",
          `Local tool ${request.name} exceeded its ${request.timeoutMs}ms budget.`,
          durationMs,
          true
        );
      } else if (turnController.signal.aborted) {
        result = this.localToolFailure(
          request,
          "TURN_CANCELLED",
          "The owning turn ended while the tool was running.",
          durationMs
        );
      } else {
        result = this.localToolFailure(
          request,
          "INTERNAL",
          this.safeErrMsg(error),
          durationMs
        );
      }
    } finally {
      if (this.activeExecution?.toolCallId === request.toolCallId) {
        this.activeExecution = undefined;
      }
    }

    this.emitLocalToolResult(result);
    this.narrateLocalTool(request, result);
  }
}
