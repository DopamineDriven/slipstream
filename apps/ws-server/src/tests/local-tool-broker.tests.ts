import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LocalToolBroker } from "@/local-tools/local-tool-broker.ts";
import type { BrokerSocket } from "@/local-tools/types.ts";
import type { LocalToolRequest, LocalToolResult } from "@slipstream/types";

const SOCKET_OPEN = 1;
const SOCKET_CLOSED = 3;

/** literal BrokerSocket fake — captures outbound frames, no assertions needed */
function fakeSocket(readyState = SOCKET_OPEN, sendError?: Error) {
  const sent = Array.of<string>();
  const socket = {
    readyState,
    send(data: string, cb?: (err?: Error) => void) {
      sent.push(data);
      cb?.(sendError);
    }
  } satisfies BrokerSocket;
  return { socket, sent };
}

function request(overrides?: Partial<LocalToolRequest>) {
  return {
    type: "local_tool_request",
    conversationId: "cm_convo",
    turnId: "turn_abc123",
    round: 1,
    toolCallId: "toolu_001",
    name: "read_file",
    input: { path: "alpha.ts" },
    timeoutMs: 5_000,
    ...overrides
  } satisfies LocalToolRequest;
}

function okResult(overrides?: Partial<LocalToolResult>) {
  return {
    type: "local_tool_result",
    conversationId: "cm_convo",
    turnId: "turn_abc123",
    toolCallId: "toolu_001",
    name: "read_file",
    result: {
      ok: true,
      value: {
        tool: "read_file",
        path: "alpha.ts",
        startLine: 1,
        endLine: 2,
        totalLines: 10,
        content: "1: line 1\n2: line 2",
        truncated: false
      },
      durationMs: 12,
      outputBytes: 42
    },
    ...overrides
  } satisfies LocalToolResult;
}

function failureCode(result: LocalToolResult) {
  return result.result.ok ? null : result.result.error.code;
}

describe("generateTurnId — opaque attempt identity", () => {
  it("mints turn_-prefixed unique ids via the lazy nanoid", async () => {
    const broker = new LocalToolBroker();
    const [a, b] = await Promise.all([
      broker.generateTurnId(),
      broker.generateTurnId()
    ]);
    assert.match(a, /^turn_/);
    assert.match(b, /^turn_/);
    assert.notEqual(a, b);
  });
});

describe("LocalToolBroker — request/accept round trip", () => {
  it("relays the frame on the socket and settles with the accepted result", async () => {
    const broker = new LocalToolBroker();
    const { socket, sent } = fakeSocket();
    const pending = broker.request(socket, request(), new AbortController().signal);

    assert.equal(sent.length, 1);
    const frame = JSON.parse<LocalToolRequest>(sent[0] ?? "{}");
    assert.equal(frame.type, "local_tool_request");
    assert.equal(frame.toolCallId, "toolu_001");

    assert.equal(broker.acceptResult(socket, okResult()), true);
    const settled = await pending;
    assert.equal(settled.result.ok, true);
  });

  it("a second acceptResult for the same call is unmatched", async () => {
    const broker = new LocalToolBroker();
    const { socket } = fakeSocket();
    const pending = broker.request(socket, request(), new AbortController().signal);
    assert.equal(broker.acceptResult(socket, okResult()), true);
    assert.equal(broker.acceptResult(socket, okResult()), false);
    const settled = await pending;
    assert.equal(settled.result.ok, true);
  });

  it("another socket cannot satisfy the pending call, even with every id", async () => {
    const broker = new LocalToolBroker();
    const { socket } = fakeSocket();
    const { socket: intruder } = fakeSocket();
    const pending = broker.request(socket, request(), new AbortController().signal);

    assert.equal(broker.acceptResult(intruder, okResult()), false);
    // the rightful socket still settles it
    assert.equal(broker.acceptResult(socket, okResult()), true);
    const settled = await pending;
    assert.equal(settled.result.ok, true);
  });

  it("a result whose conversation/name mismatch settles as PROTOCOL_ERROR", async () => {
    const broker = new LocalToolBroker();
    const { socket } = fakeSocket();
    const pending = broker.request(socket, request(), new AbortController().signal);

    assert.equal(
      broker.acceptResult(socket, okResult({ conversationId: "cm_other" })),
      false
    );
    const settled = await pending;
    assert.equal(failureCode(settled), "PROTOCOL_ERROR");
  });

  it("duplicate pending key resolves immediately as PROTOCOL_ERROR without a second send", async () => {
    const broker = new LocalToolBroker();
    const { socket, sent } = fakeSocket();
    const first = broker.request(socket, request(), new AbortController().signal);
    const dup = await broker.request(socket, request(), new AbortController().signal);
    assert.equal(failureCode(dup), "PROTOCOL_ERROR");
    assert.equal(sent.length, 1);
    assert.equal(broker.acceptResult(socket, okResult()), true);
    assert.equal((await first).result.ok, true);
  });
});

describe("LocalToolBroker — synthesized terminals", () => {
  it("wall-clock deadline synthesizes DEADLINE_EXCEEDED exactly once", async () => {
    const broker = new LocalToolBroker();
    const { socket } = fakeSocket();
    const settled = await broker.request(
      socket,
      request({ timeoutMs: 10 }),
      new AbortController().signal
    );
    assert.equal(failureCode(settled), "DEADLINE_EXCEEDED");
    // late result after the deadline is unmatched, not a double settle
    assert.equal(broker.acceptResult(socket, okResult()), false);
  });

  it("a non-positive budget fails fast without sending", async () => {
    const broker = new LocalToolBroker();
    const { socket, sent } = fakeSocket();
    const settled = await broker.request(
      socket,
      request({ timeoutMs: 0 }),
      new AbortController().signal
    );
    assert.equal(failureCode(settled), "DEADLINE_EXCEEDED");
    assert.equal(sent.length, 0);
  });

  it("turn abort synthesizes TURN_CANCELLED (pre-aborted and mid-flight)", async () => {
    const broker = new LocalToolBroker();
    const { socket } = fakeSocket();

    const preAborted = new AbortController();
    preAborted.abort();
    const pre = await broker.request(socket, request(), preAborted.signal);
    assert.equal(failureCode(pre), "TURN_CANCELLED");

    const mid = new AbortController();
    const pending = broker.request(
      socket,
      request({ toolCallId: "toolu_002" }),
      mid.signal
    );
    mid.abort();
    const settled = await pending;
    assert.equal(failureCode(settled), "TURN_CANCELLED");
  });

  it("a closed socket synthesizes CLIENT_DISCONNECTED; a send error too", async () => {
    const broker = new LocalToolBroker();
    const { socket: closed } = fakeSocket(SOCKET_CLOSED);
    const dead = await broker.request(
      closed,
      request(),
      new AbortController().signal
    );
    assert.equal(failureCode(dead), "CLIENT_DISCONNECTED");

    const { socket: flaky } = fakeSocket(SOCKET_OPEN, new Error("EPIPE"));
    const failed = await broker.request(
      flaky,
      request(),
      new AbortController().signal
    );
    assert.equal(failureCode(failed), "CLIENT_DISCONNECTED");
  });

  it("dropSocket settles every pending call as CLIENT_DISCONNECTED", async () => {
    const broker = new LocalToolBroker();
    const { socket } = fakeSocket();
    const signal = new AbortController().signal;
    const a = broker.request(socket, request(), signal);
    const b = broker.request(
      socket,
      request({ toolCallId: "toolu_002" }),
      signal
    );

    broker.dropSocket(socket);
    assert.equal(failureCode(await a), "CLIENT_DISCONNECTED");
    assert.equal(failureCode(await b), "CLIENT_DISCONNECTED");
    // and the map is gone — a straggler result is unmatched
    assert.equal(broker.acceptResult(socket, okResult()), false);
  });
});
