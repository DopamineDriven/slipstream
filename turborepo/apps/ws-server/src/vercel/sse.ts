// sse.ts - Updated for v0 API structure
import { XOR } from "@t3-chat-clone/types";

/**
 * a parsed Server-Sent Event (SSE)
 */
export interface SSEEvent<T = unknown> {
  event?: string;
  data: T;
}

/**
 * v0 API type definitions
 */
export type v0Delta = XOR<{ reasoning_content: string }, { content: string }>;

export type v0Choice = {
  index: number;
  delta: v0Delta;
  logprobs: null;
  finish_reason: null;
};

export type v0Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export interface v0BaseEntity {
  id: string;
  object: string;
  created: number;
  model: string;
  service_tier: string;
  system_fingerprint: string;
}

export interface v0ChatCompletionsRes extends v0BaseEntity {
  choices?: v0Choice[];
  usage?: v0Usage;
}

/**
 * Transformer function for v0 SSE chunks
 * Parses SSE text into structured v0ChatCompletionsRes objects
 */
function v0SSETransformer(
  chunk: string
): SSEEvent<v0ChatCompletionsRes> | null {
  let eventType: string | undefined = undefined;
  const dataLines = Array.of<string>();

  // Process each line of the chunk
  for (const line of chunk.split(/\r?\n/)) {
    // Ignore empty lines and comments
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
      // Ignore 'id', 'retry' fields
    }
  }

  // Parse the JSON data if present
  if (dataLines.length > 0) {
    try {
      const jsonStr = dataLines.join("\n");
      const parsedData = JSON.parse<v0ChatCompletionsRes>(jsonStr);
      return { event: eventType, data: parsedData };
    } catch (error) {
      console.error("Failed to parse v0 SSE data:", error);
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
        // Decode and append to buffer
        buffer += decoder.decode(chunk, { stream: true });

        // SSE messages are separated by double newlines
        const boundaryRegex = /\r?\n\r?\n/;
        let match: RegExpExecArray | null;

        // Process all complete messages in the buffer
        while ((match = boundaryRegex.exec(buffer)) !== null) {
          const rawChunk = buffer.slice(0, match.index);
          // Move buffer forward past this chunk and boundary
          buffer = buffer.slice(match.index + match[0].length);

          // Parse the chunk
          const parsed = transformer(rawChunk);
          if (parsed) {
            controller.enqueue(parsed);
          }
        }
      },

      flush(controller) {
        // Handle any remaining data in buffer
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

/**
 * Factory function to create a v0-specific SSE parser
 */
export function createV0SSEParser(
  response: Response
): StreamParser<SSEEvent<v0ChatCompletionsRes>> {
  if (!response.body) {
    throw new Error("Response body is not available for SSE parsing.");
  }
  return new StreamParser(response.body, v0SSETransformer);
}

/**
 * Helper to check if delta contains reasoning content
 */
export function isReasoningDelta(
  delta: v0Delta
): delta is { reasoning_content: string } {
  return (
    "reasoning_content" in delta &&
    typeof delta.reasoning_content !== "undefined"
  );
}

/**
 * Helper to check if delta contains regular content
 */
export function isContentDelta(delta: v0Delta): delta is { content: string } {
  return "content" in delta && typeof delta.content !== "undefined";
}

export function isFinished(chunk: v0ChatCompletionsRes) {
  if ("usage" in chunk && typeof chunk.usage !== "undefined") {
    return true;
  } else {
    return false;
  }
}
