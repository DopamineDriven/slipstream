import type { KimiReasoningDelta } from "@/kimi/types.ts";

export interface SSEEvent<T = unknown> {
  event?: string;
  data: T;
}

export type KimiToolCallDelta = {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};

export type KimiDelta = Partial<{
  role: "assistant";
  content: string | null;
  refusal: string | null;
  tool_calls: KimiToolCallDelta[];
}> &
  KimiReasoningDelta;

export type KimiFinishReason =
  "stop" | "length" | "tool_calls" | "content_filter" | null;

export type KimiChoice = {
  index: number;
  delta: KimiDelta;
  logprobs: null;
  finish_reason: KimiFinishReason;
};

export type KimiUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export interface KimiBaseEntity {
  id: string;
  object: string;
  created: number;
  model: string;
  service_tier: string;
  system_fingerprint: string;
}

export interface KimiChatCompletionsRes extends KimiBaseEntity {
  choices?: KimiChoice[];
  usage?: KimiUsage;
}

/**
 * Transformer function for Kimi SSE chunks
 * Parses SSE text into structured KimiChatCompletionsRes objects
 */
function KimiSSETransformer(
  chunk: string
): SSEEvent<KimiChatCompletionsRes> | null {
  let eventType: string | undefined = undefined;
  const dataLines = Array.of<string>();

  for (const line of chunk.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith(":")) {
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const fieldName = line.slice(0, colonIndex);
    const fieldValue = line.slice(colonIndex + 1).trimStart();

    switch (fieldName) {
      case "event":
        eventType = fieldValue;
        break;
      case "data":
        dataLines.push(fieldValue);
        break;
    }
  }

  if (dataLines.length > 0) {
    const rawData = dataLines.join("\n").trim();
    if (rawData === "[DONE]") {
      return null;
    }

    try {
      const parsedData = JSON.parse<KimiChatCompletionsRes>(rawData);
      return { event: eventType, data: parsedData };
    } catch (error) {
      console.error("Failed to parse Kimi SSE data:", error);
      return null;
    }
  }

  return null;
}

/**
 * Generic StreamParser that transforms ReadableStream<Uint8Array> into AsyncIterable<T>
 */
export class StreamParser<T> implements AsyncIterable<T> {
  private readonly readable: ReadableStream<T>;

  constructor(
    sourceStream: ReadableStream<Uint8Array>,
    transformer: (chunk: string) => T | null
  ) {
    const decoder = new TextDecoder();
    let buffer = "";

    const transformStream = new TransformStream<Uint8Array, T>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });

        const boundaryRegex = /\r?\n\r?\n/;
        let match: RegExpExecArray | null;

        while ((match = boundaryRegex.exec(buffer)) !== null) {
          const rawChunk = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);

          const parsed = transformer(rawChunk);
          if (parsed) {
            controller.enqueue(parsed);
          }
        }
      },

      flush(controller) {
        if (buffer.trim()) {
          const parsed = transformer(buffer);
          if (parsed) {
            controller.enqueue(parsed);
          }
        }
      }
    });

    this.readable = sourceStream.pipeThrough(transformStream);
  }

  public async *[Symbol.asyncIterator](): AsyncGenerator<
    Awaited<T>,
    void,
    unknown
  > {
    const reader = this.readable.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export function createKimiSSEParser(
  response: Response
): StreamParser<SSEEvent<KimiChatCompletionsRes>> {
  if (!response.body) {
    throw new Error("Response body is not available for SSE parsing.");
  }
  return new StreamParser(response.body, KimiSSETransformer);
}

export function isReasoningDelta(
  delta: KimiDelta
): delta is KimiDelta &
  ({ reasoning: string } | { reasoning_content: string }) {
  return (
    ("reasoning" in delta && typeof delta.reasoning === "string") ||
    ("reasoning_content" in delta &&
      typeof delta.reasoning_content === "string")
  );
}

export function isContentDelta(delta: KimiDelta): delta is { content: string } {
  return typeof delta.content === "string";
}

export function hasToolCallDelta(
  delta: KimiDelta
): delta is { tool_calls: KimiToolCallDelta[] } {
  return Array.isArray(delta.tool_calls);
}

export function isTerminalTextChunk(chunk: KimiChatCompletionsRes) {
  return (
    Array.isArray(chunk.choices) && chunk.choices.length === 0 && !!chunk.usage
  );
}
