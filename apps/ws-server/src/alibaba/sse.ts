import type { AlibabaReasoningDelta } from "@/alibaba/types.ts";

export interface SSEEvent<T = unknown> {
  event?: string;
  data: T;
}

export type AlibabaToolCallDelta = {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};

export type AlibabaDelta = Partial<{
  role: "assistant";
  content: string | null;
  refusal: string | null;
  tool_calls: AlibabaToolCallDelta[];
}> & AlibabaReasoningDelta;

export type AlibabaFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | null;

export type AlibabaChoice = {
  index: number;
  delta: AlibabaDelta;
  logprobs: null;
  finish_reason: AlibabaFinishReason;
};

export type AlibabaUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export interface AlibabaBaseEntity {
  id: string;
  object: string;
  created: number;
  model: string;
  service_tier: string;
  system_fingerprint: string;
}

export interface AlibabaChatCompletionsRes extends AlibabaBaseEntity {
  choices?: AlibabaChoice[];
  usage?: AlibabaUsage;
}

/**
 * Transformer function for Alibaba SSE chunks
 * Parses SSE text into structured AlibabaChatCompletionsRes objects
 */
function AlibabaSSETransformer(
  chunk: string
): SSEEvent<AlibabaChatCompletionsRes> | null {
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
      const parsedData = JSON.parse<AlibabaChatCompletionsRes>(rawData);
      return { event: eventType, data: parsedData };
    } catch (error) {
      console.error("Failed to parse Alibaba SSE data:", error);
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

export function createAlibabaSSEParser(
  response: Response
): StreamParser<SSEEvent<AlibabaChatCompletionsRes>> {
  if (!response.body) {
    throw new Error("Response body is not available for SSE parsing.");
  }
  return new StreamParser(response.body, AlibabaSSETransformer);
}

export function isReasoningDelta(
  delta: AlibabaDelta
): delta is AlibabaDelta &
  ({ reasoning: string } | { reasoning_content: string }) {
  return (
    ("reasoning" in delta && typeof delta.reasoning === "string") ||
    ("reasoning_content" in delta &&
      typeof delta.reasoning_content === "string")
  );
}

export function isContentDelta(delta: AlibabaDelta): delta is { content: string } {
  return typeof delta.content === "string";
}

export function hasToolCallDelta(
  delta: AlibabaDelta
): delta is { tool_calls: AlibabaToolCallDelta[] } {
  return Array.isArray(delta.tool_calls);
}

export function isTerminalTextChunk(chunk: AlibabaChatCompletionsRes) {
  return Array.isArray(chunk.choices) && chunk.choices.length === 0 && !!chunk.usage;
}
