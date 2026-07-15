import type {
  LocalToolRequest,
  LocalToolResult
} from "@slipstream/types";

/**
 * Structural minimum the broker needs from a socket — the real `ws`
 * WebSocket satisfies it, and tests exercise the broker with literal
 * fakes instead of type assertions. Identity (the object reference) is
 * the authority anchor: the pending map is keyed BY socket.
 */
export interface BrokerSocket {
  readyState: number;
  send(data: string, cb?: (err?: Error) => void): void;
}

export interface PendingLocalTool {
  readonly request: LocalToolRequest;
  readonly finish: (result: LocalToolResult) => void;
}
