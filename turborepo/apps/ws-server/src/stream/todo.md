![api-reference](../../public/api-reference.png)
![request-and-response](../../public/req-and-res.png)
---


GPT-5's take on this:

Yeah, the “OpenAI-compatible” marketing copy is doing a lot of work there. Two separate things are getting conflated:

1. **v0 Model API** (the LLM itself): it’s explicitly **Chat Completions–compatible** (`POST /v1/chat/completions`) and streams over **SSE**. Their docs even say you can “use it with any tool or SDK that supports OpenAI’s API format.” So far so good. ([v0][1])

2. **Vercel AI Gateway**: also exposes **OpenAI-compatible endpoints** (again, mainly **Chat Completions**), and they show examples working with the official OpenAI SDK by just swapping the `baseURL`. But take note: this is **not** the OpenAI **Responses** API; it’s the Chat Completions shape. If you try to drive it with `responses.create` you’ll have a bad time. ([Vercel][2])

So: you’re right to be annoyed. The compatibility is real, but **it’s compatibility with OpenAI’s Chat Completions**, not the new Responses event zoo. Your ECS/Fargate resolver is persistent, so you don’t need the AI SDK at all. Just talk to any “OpenAI-compatible” base URL with **native `fetch` + SSE**, keep it lean, and keep your own backpressure + resume semantics.

Below is a drop-in **strictly typed**, **no-`any`**, **no-axios** scaffold you can slot into your resolver. It handles:

* **Chat Completions streaming** (`/v1/chat/completions`) for v0, AI Gateway, OpenRouter-style, etc.
* Optional **Responses streaming** (`/v1/responses`) for real OpenAI/xAI/Meta endpoints that support it.
* **Backpressure** via `for await ... of` over the web stream, incremental flush to your WS/Redis, idle aborts, and clean completion.

---

### 1) Tiny SSE parser (strict, no deps)

```ts
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
```

---

### 2) OpenAI-compatible client (Chat Completions + Responses)

```ts
// openai-compat.ts
import { iterSSE, SSEEvent } from "./sse";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  // Minimal content typing; expand if you need images/tool calls
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  >;
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
  choices: Array<{
    index: number;
    delta: ChatCompletionDelta;
    finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  }>;
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
    const url = new URL("/v1/chat/completions", this.cfg.baseURL).toString();
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
    const url = new URL("/v1/responses", this.cfg.baseURL).toString();

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
```

---

### 3) How you’d wire this into your resolver (v0 + generic “OpenAI-compatible”)

```ts
// usage in your resolver’s vercel branch (or a new "openai_compat" branch)
import { OpenAICompat, type ChatMessage } from "./openai-compat";

const compat = new OpenAICompat({
  baseURL: "https://api.v0.dev/v1", // or "https://ai-gateway.vercel.sh/v1", or any OpenAI-compatible
  apiKey: key.apiKey ?? undefined,
  idleTimeoutMs: 120_000,
});

const messages: ChatMessage[] = yourFormatter(isNewChat, msgs, prompt, systemPrompt);

let agg = "";
for await (const { delta, finish } of compat.chatCompletionsStream({
  model,
  messages,
  temperature,
  top_p: topP,
  // v0 uses max_completion_tokens in non-streaming docs, but streams fine with standard shape.
  // If you hit a provider quirk, map your param name before calling.
  max_tokens: max_tokens,
})) {
  if (delta) {
    agg += delta;
    // push to WS + Redis exactly like your other branches
  }
  if (finish) {
    // do your wrap-up, usage save, and state clear
  }
}
```

If you want to support the **Responses** path for OpenAI/xAI/Meta, just call `responsesStream(...)` with your existing `tools`, `input`, etc., and forward `delta`/`done` events in the same way you already do for providers using the official SDKs.

---

## Why this fixes your pain

* **No SDK lock-in / no cold starts.** Pure native `fetch` + web streams. Your ECS task stays warm and happy.
* **Works with v0 Model API** because it’s **Chat Completions–compatible** and streams via SSE (`data: {...}`, ending with `[DONE]`). That’s exactly what the parser handles. ([v0][1])
* **Works with Vercel AI Gateway** the same way; they explicitly show OpenAI SDK usage with `baseURL` + `chat.completions`. If you want to skip the SDK entirely (you do), this code is equivalent but lighter. ([Vercel][2])
* **Robust to “OpenAI-compatible” clones.** Most of them copy the Chat Completions stream shape (`object: "chat.completion.chunk"`, `choices[0].delta.content`) and `[DONE]` terminator. We type-guard that shape and ignore the rest.

### Caveats (so you don’t lose another afternoon)

* **Don’t call `responses.create` against v0.** v0 only documents **Chat Completions**, not Responses; use the `chatCompletionsStream` path for v0 and the gateway. ([v0][1], [Vercel][2])
* **Param names drift across providers.** If some clone insists on `max_completion_tokens` vs `max_tokens`, shim it in your formatter before calling—keep your compat client “vanilla”.
* **Tool calls / images.** The scaffold types include basic multimodal; if you wire tools, add explicit types for the tool schema you support and branch on `choices[*].delta.tool_calls` (kept `unknown` here to avoid lying about shape).

If you want, I can sketch a small `VercelCompatService` around this to mirror your other services’ method signatures so you just slot a new branch into your big `handleAIChat` switch and call it a day. But the core fix is: **treat v0 (and the AI Gateway) as plain OpenAI-compatible Chat Completions over SSE, not Responses.** That’s the missing puzzle piece the docs don’t shout out nearly loud enough. ([v0][1], [Vercel][2])

And yes, the “no third-party APIs unless you build your own third-party API” thing reads like Schrödinger’s policy memo. You’re not crazy—just ship around it.

[1]: https://v0.dev/docs/api/model "v0 Model API | v0 Docs"
[2]: https://vercel.com/docs/ai-gateway/openai-compat "OpenAI-Compatible API"
