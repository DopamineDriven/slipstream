export interface SSEEvent<T = unknown> {
  event?: string;
  data: T;
}

export type MistralToolCalls = {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};

export type MistralDelta = Partial<{
  role: "assistant";
  content: string | null;
  reasoning_content: string;
  refusal: string | null;
  tool_calls: MistralToolCalls[];
}>;

export type MistralFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | null;

export type MistralChoice = {
  index: number;
  delta: MistralDelta;
  logprobs: null;
  finish_reason: MistralFinishReason;
};

export type MistralUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export interface MistralBaseEntity {
  id: string;
  object: string;
  created: number;
  model: string;
  service_tier: string;
  system_fingerprint: string;
}

export interface MistralChatCompletionsRes extends MistralBaseEntity {
  choices?: MistralChoice[];
  usage?: MistralUsage;
}

/**
 * Transformer function for mistral SSE chunks
 * Parses SSE text into structured MistralChatCompletionsRes objects
 */
function MistralSSETransformer(
  chunk: string
): SSEEvent<MistralChatCompletionsRes> | null {
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
      const parsedData = JSON.parse<MistralChatCompletionsRes>(jsonStr);
      return { event: eventType, data: parsedData };
    } catch (error) {
      console.error("Failed to parse mistral SSE data:", error);
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

export function createMistralSSEParser(
  response: Response
): StreamParser<SSEEvent<MistralChatCompletionsRes>> {
  if (!response.body) {
    throw new Error("Response body is not available for SSE parsing.");
  }
  return new StreamParser(response.body, MistralSSETransformer);
}

export function isReasoningDelta(
  delta: MistralDelta
): delta is { reasoning_content: string } {
  return (
    "reasoning_content" in delta &&
    typeof delta.reasoning_content !== "undefined"
  );
}

export function isContentDelta(delta: MistralDelta): delta is { content: string } {
  return typeof delta.content === "string";
}

export function hasToolCallDelta(
  delta: MistralDelta
): delta is { tool_calls: MistralToolCalls[] } {
  return Array.isArray(delta.tool_calls);
}

export function isTerminalTextChunk(chunk: MistralChatCompletionsRes) {
  return Array.isArray(chunk.choices) && chunk.choices.length === 0 && !!chunk.usage;
}
