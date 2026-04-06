import type { ZaiReasoningDelta } from "@/zai/types.ts";

export interface SSEEvent<T = unknown> {
  event?: string;
  data: T;
}

export type ZaiToolCallDelta = {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};

export type ZaiDelta = Partial<{
  role: "assistant";
  content: string | null;
  refusal: string | null;
  tool_calls: ZaiToolCallDelta[];
}> & ZaiReasoningDelta;

export type ZaiFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | null;

export type ZaiChoice = {
  index: number;
  delta: ZaiDelta;
  logprobs: null;
  finish_reason: ZaiFinishReason;
};

export type ZaiUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export interface ZaiBaseEntity {
  id: string;
  object: string;
  created: number;
  model: string;
  service_tier: string;
  system_fingerprint: string;
}

export interface ZaiChatCompletionsRes extends ZaiBaseEntity {
  choices?: ZaiChoice[];
  usage?: ZaiUsage;
}

/**
 * Transformer function for Zai SSE chunks
 * Parses SSE text into structured ZaiChatCompletionsRes objects
 */
function ZaiSSETransformer(
  chunk: string
): SSEEvent<ZaiChatCompletionsRes> | null {
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
    try {
      const jsonStr = dataLines.join("\n");
      const parsedData = JSON.parse<ZaiChatCompletionsRes>(jsonStr);
      return { event: eventType, data: parsedData };
    } catch (error) {
      console.error("Failed to parse Zai SSE data:", error);
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

export function createZaiSSEParser(
  response: Response
): StreamParser<SSEEvent<ZaiChatCompletionsRes>> {
  if (!response.body) {
    throw new Error("Response body is not available for SSE parsing.");
  }
  return new StreamParser(response.body, ZaiSSETransformer);
}

export function isReasoningDelta(
  delta: ZaiDelta
): delta is ZaiDelta & ({ reasoning: string } | { reasoning_content: string }) {
  return (
    ("reasoning" in delta && typeof delta.reasoning === "string") ||
    ("reasoning_content" in delta &&
      typeof delta.reasoning_content === "string")
  );
}

export function isContentDelta(delta: ZaiDelta): delta is { content: string } {
  return typeof delta.content === "string";
}

export function hasToolCallDelta(
  delta: ZaiDelta
): delta is { tool_calls: ZaiToolCallDelta[] } {
  return Array.isArray(delta.tool_calls);
}

export function isTerminalTextChunk(chunk: ZaiChatCompletionsRes) {
  return (
    Array.isArray(chunk.choices) && chunk.choices.length === 0 && !!chunk.usage
  );
}
