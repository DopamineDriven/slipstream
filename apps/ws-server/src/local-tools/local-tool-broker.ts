import type { BrokerSocket, PendingLocalTool } from "@/local-tools/types.ts";
import type {
  LocalToolErrorCode,
  LocalToolRequest,
  LocalToolResult
} from "@slipstream/types";

/** WebSocket.OPEN without importing the ws class into a pure module */
const SOCKET_OPEN = 1;

/**
 * Server half of the local read-only tool bridge (slice 3 — plan of
 * record: architectural-decisions/sovereign-cli/local/fable.md). The
 * provider loop parks here while the CLI executes; the broker owns the
 * Promise parking, wall-clock deadline, socket binding, stale-result
 * rejection, and disconnect synthesis.
 *
 * Invariants:
 * - `request()` ALWAYS resolves to exactly one LocalToolResult — timeout,
 *   turn cancellation, disconnect, duplicate, and send failure become
 *   typed is_error results, never rejected promises that could wedge a
 *   provider loop (exactly-one-terminal, inverted direction).
 * - The pending map is socket-scoped (WeakMap by socket identity), so
 *   another connection can never satisfy a pending call even if it knows
 *   every serialized identifier.
 * - local_tool_request goes out via direct ws.send — never the Redis
 *   broadcast path; the provider turn and the originating socket live on
 *   the same instance by construction.
 */
export class LocalToolBroker {
  protected nanoid: Promise<<Type extends string>(size?: number) => Type>;

  constructor() {
    this.nanoid = import("nanoid").then(d => d.nanoid);
  }

  private readonly pendingBySocket = new WeakMap<
    BrokerSocket,
    Map<string, PendingLocalTool>
  >();

  /**
   * Server-minted opaque turn identity — one per provider turn ATTEMPT at
   * dispatch (the xai/img-gen.ts generateId precedent). Correlation lives
   * with the component that parks on it; the provider loop calls this once
   * per attempt and stamps every local_tool_request of that turn with it.
   */
  public async generateTurnId() {
    const nanoid = await this.nanoid;
    return `turn_${nanoid()}` as const;
  }

  private key(event: Pick<LocalToolRequest, "turnId" | "toolCallId">) {
    return `${event.turnId}:${event.toolCallId}`;
  }

  private getPendingMap(ws: BrokerSocket) {
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
        durationMs: 0
      }
    } as const satisfies LocalToolResult;
  }

  /**
   * Relay the model's tool call to the originating CLI and park until the
   * result, the wall-clock deadline (request.timeoutMs — relative, each
   * side computes its own local deadline), the turn's abort signal, or
   * the socket's death — whichever settles first wins, exactly once.
   */
  public request(
    ws: BrokerSocket,
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
        this.failure(
          request,
          "TURN_CANCELLED",
          "The provider turn was cancelled."
        )
      );
    }
    if (request.timeoutMs <= 0) {
      return Promise.resolve(
        this.failure(
          request,
          "DEADLINE_EXCEEDED",
          "The local tool request carried no wall-clock budget.",
          true
        )
      );
    }

    const { promise, resolve } = Promise.withResolvers<LocalToolResult>();
    let timer: NodeJS.Timeout | undefined = undefined;

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
      // only the first completion path wins
      if (!pending.delete(key)) return;
      if (timer) clearTimeout(timer);
      turnSignal.removeEventListener("abort", onTurnAbort);
      resolve(result);
    };

    pending.set(key, { request, finish });
    turnSignal.addEventListener("abort", onTurnAbort, { once: true });

    timer = setTimeout(() => {
      finish(
        this.failure(
          request,
          "DEADLINE_EXCEEDED",
          `Local tool ${request.name} exceeded its ${request.timeoutMs}ms wall-clock budget.`,
          true
        )
      );
    }, request.timeoutMs);

    if (ws.readyState !== SOCKET_OPEN) {
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
      finish(this.failure(request, "CLIENT_DISCONNECTED", error.message, true));
    });

    return promise;
  }

  /**
   * Called only from the local_tool_result resolver. Because the pending
   * map is socket-scoped, another connection cannot satisfy this request
   * even if it knows all serialized identifiers. Returns false for
   * unmatched (stale/foreign) results so the caller can log-and-drop.
   */
  public acceptResult(ws: BrokerSocket, result: LocalToolResult) {
    const pending = this.pendingBySocket.get(ws);
    if (!pending) return false;

    const entry = pending.get(this.key(result));
    if (!entry) return false;

    const expected = entry.request;
    if (
      result.conversationId !== expected.conversationId ||
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

  /** socket death synthesizes CLIENT_DISCONNECTED for every pending call */
  public dropSocket(ws: BrokerSocket) {
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
