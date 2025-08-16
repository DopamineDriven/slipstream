// sse.ts
export interface SSEEvent {
  event?: string;          // e.g. "response.output_text.delta" (Responses API) or undefined for Chat Completions
  data: string;            // raw JSON (or "[DONE]")
}

export async function* iterSSE(res: Response): AsyncGenerator<SSEEvent> {
  if (!res.body) throw new Error("No response body to read (SSE).");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let lastEvent: string | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // Split on double newline (SSE event boundary); handle CRLF too.
    let boundaryIndex: number;
    while (
      (boundaryIndex = buf.indexOf("\n\n")) !== -1 ||
      (boundaryIndex = buf.indexOf("\r\n\r\n")) !== -1
    ) {
      const chunk = buf.slice(0, boundaryIndex);
      buf = buf.slice(boundaryIndex + (chunk.includes("\r\n") ? 4 : 2));

      let dataLines: string[] = [];
      lastEvent = undefined;

      for (const line of chunk.split(/\r?\n/)) {
        if (!line || line.startsWith(":")) continue; // comment/keepalive
        if (line.startsWith("event:")) {
          lastEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
        // Ignore id:, retry: for our use case
      }

      const data = dataLines.join("\n");
      if (data) yield { event: lastEvent, data };
    }
  }
  // ignore leftover buf; SSE senders end on a boundary
}
// openai-compat.ts

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  // Minimal content typing; expand if you need images/tool calls
  content: string | (
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  )[]
}

export interface ChatCompletionDelta {
  content?: string;
  role?: "assistant";
  // add tool/function fields if you need them, typed as unknown until you use them
  // tool_calls?: unknown;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: ChatCompletionDelta;
    finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  }[]
}

function isChatCompletionChunk(x: unknown): x is ChatCompletionChunk {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { object?: string }).object === "chat.completion.chunk" &&
    Array.isArray((x as { choices?: unknown }).choices)
  );
}

// Responses API (OpenAI/xAI/Meta) — minimal surface to get text deltas & done
export type ResponsesEventType =
  | "response.output_text.delta"
  | "response.output_text.done"
  | "response.reasoning_text.delta"
  | "response.reasoning_text.done"
  | "response.completed"
  | "response.error";

export interface ResponsesDelta {
  type: ResponsesEventType;
  // only fields we care about for streaming text; expand as you need:
  delta?: string;
  message?: string; // for error
}

export interface OpenAICompatInit {
  baseURL: string;                    // e.g. https://api.v0.dev/v1 or https://ai-gateway.vercel.sh/v1 or https://api.openai.com/v1
  apiKey?: string;
  headers?: Record<string, string>;
  // Socket timeouts/idle aborts:
  idleTimeoutMs?: number;             // abort if no events in this window
}

export class OpenAICompat {
  constructor(private cfg: OpenAICompatInit) {}

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      "content-type": "application/json",
      ...this.cfg.headers,
    };
    if (this.cfg.apiKey) h.authorization = `Bearer ${this.cfg.apiKey}`;
    return h;
  }

  /**
   * Stream Chat Completions (OpenAI-compatible)
   * Works with v0 Model API and AI Gateway (and most “OpenAI-compatible” providers).
   */
  async *chatCompletionsStream(input: {
    model: string;
    messages: ChatMessage[];
    // pass-through params (strictly typed as needed):
    stream?: true;
    temperature?: number;
    top_p?: number;
    max_tokens?: number; // v0 uses max_completion_tokens; openai uses max_tokens. v0 accepts stream: true and still returns SSE.
    tools?: unknown;
    tool_choice?: unknown;
  }): AsyncGenerator<{ delta?: string; finish?: string | null; raw: ChatCompletionChunk | "[DONE]"; }> {
    const url = new URL("/v1/chat/completions", this.cfg.baseURL).href;
    const body = JSON.stringify({ ...input, stream: true });

    const res = await fetch(url, { method: "POST", headers: this.authHeaders(), body });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from ${url}: ${text}`);
    }

    let lastAt = Date.now();
    const idleTimeout = this.cfg.idleTimeoutMs ?? 60_000;

    const idleWatch = setInterval(() => {
      if (Date.now() - lastAt > idleTimeout) {
        clearInterval(idleWatch);
        // Aborting the stream in a generator is messy; let consumer decide.
        // You can throw here if you want a hard deadline:
        // throw new Error(`SSE idle > ${idleTimeout}ms`);
      }
    }, 2_000);

    try {
      for await (const ev of iterSSE(res)) {
        lastAt = Date.now();
        if (ev.data === "[DONE]") {
          yield { raw: "[DONE]", finish: "stop" };
          break;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          // skip junk heartbeats
          continue;
        }
        if (isChatCompletionChunk(parsed)) {
          const choice = parsed.choices[0];
          const delta = choice?.delta?.content ?? undefined;
          yield { delta, finish: choice?.finish_reason ?? null, raw: parsed };
        }
      }
    } finally {
      clearInterval(idleWatch);
      // Node will close the connection when function returns
    }
  }

  /**
   * Stream Responses API (OpenAI/xAI/Meta OpenAI-compatible “/v1/responses”)
   * If you point this at something that only supports Chat Completions (like v0),
   * you’ll get 404/405 — use chatCompletionsStream instead.
   */
  async *responsesStream(body: Record<string, unknown>): AsyncGenerator<ResponsesDelta> {
    const url = new URL("/v1/responses", this.cfg.baseURL).href;

    const res = await fetch(url, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ ...body, stream: true }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from ${url}: ${text}`);
    }

    for await (const ev of iterSSE(res)) {
      if (!ev.data) continue;
      let type = ev.event as ResponsesEventType | undefined;
      // Some servers omit "event:" and pack type into JSON; we handle both
      if (ev.data === "[DONE]" || type === "response.completed") {
        yield { type: "response.completed" };
        break;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(ev.data); } catch { continue; }

      if (!type && typeof parsed === "object" && parsed && "type" in parsed) {
        type = (parsed as { type: string }).type as ResponsesEventType;
      }

      if (type === "response.output_text.delta") {
        yield { type, delta: (parsed as { delta?: string }).delta ?? "" };
      } else if (type === "response.output_text.done" || type === "response.reasoning_text.done") {
        yield { type };
      } else if (type?.endsWith(".delta")) {
        // Ignore other deltas unless you need them; keep it typed:
        yield { type };
      } else if (type === "response.error") {
        yield { type, message: (parsed as { error?: { message?: string } })?.error?.message ?? "unknown error" };
      }
    }
  }
}
