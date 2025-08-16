import { createSSEParser } from "./sse.ts";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content:
    | string
    | (
        | { type: "text"; text: string }
        | {
            type: "image_url";
            image_url: { url: string; detail?: "auto" | "low" | "high" };
          }
      )[];
}

export interface ChatCompletionDelta {
  content?: string;
  role?: "assistant";
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
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function isChatCompletionChunk(x: unknown): x is ChatCompletionChunk {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { object?: string }).object === "chat.completion.chunk" &&
    Array.isArray((x as { choices?: unknown }).choices)
  );
}

export interface OpenAICompatInit {
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
  idleTimeoutMs?: number;
}

export class OpenAICompat {
  constructor(private cfg: OpenAICompatInit) {}

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      "content-type": "application/json",
      ...this.cfg.headers
    };
    if (this.cfg.apiKey) h.authorization = `Bearer ${this.cfg.apiKey}`;
    return h;
  }

  /**
   * Stream Chat Completions (OpenAI-compatible)
   * Works with v0 Model API and AI Gateway
   */
  async *chatCompletionsStream(input: {
    model: string;
    messages: ChatMessage[];
    stream?: true;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    tools?: unknown;
    tool_choice?: unknown;
  }): AsyncGenerator<{
    delta?: string;
    finish?: string | null;
    raw: ChatCompletionChunk | "[DONE]";
    usage?: number;
  }> {
    const url = new URL("/v1/chat/completions", this.cfg.baseURL).href;
    const body = JSON.stringify({ ...input, stream: true });

    const res = await fetch(url, {
      method: "POST",
      headers: this.authHeaders(),
      body
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from ${url}: ${text}`);
    }

    let lastAt = Date.now();
    const idleTimeout = this.cfg.idleTimeoutMs ?? 60000;

    const idleWatch = setInterval(() => {
      if (Date.now() - lastAt > idleTimeout) {
        clearInterval(idleWatch);
      }
    }, 2000);

    try {
      const parser = createSSEParser(res);
      for await (const ev of parser) {
        lastAt = Date.now();
        if (ev.data === "[DONE]") {
          yield { raw: "[DONE]", finish: "stop" };
          break;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          continue;
        }
        if (isChatCompletionChunk(parsed)) {
          const choice = parsed.choices[0];
          const delta = choice?.delta?.content ?? undefined;
          const usage = parsed.usage?.total_tokens;
          yield {
            delta,
            finish: choice?.finish_reason ?? null,
            raw: parsed,
            usage
          };
        }
      }
    } finally {
      clearInterval(idleWatch);
    }
  }
}
