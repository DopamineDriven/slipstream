export interface SSEEvent<T = unknown> {
  event?: string;
  data: T;
}

// Precise types for xAI/Grok delta variations
export type xAIDeltaGrok3Start = {
  role: "assistant";
  content: string;
};

export type xAIDeltaGrok4Start = {
  role: "assistant";
};

export type xAIDeltaGrokThinkingStart = {
  role: "assistant";
  reasoning_content: string;
};

export type xAIDeltaContent = {
  content: string;
};

export type xAIDeltaReasoning = {
  reasoning_content: string;
};

export type xAIDeltaEmpty = Record<string, never>;

export type xAIDelta = 
  | xAIDeltaGrok3Start
  | xAIDeltaGrok4Start
  | xAIDeltaGrokThinkingStart
  | xAIDeltaContent
  | xAIDeltaReasoning
  | xAIDeltaEmpty;

// Choice types
export type xAIChoiceActive = {
  index: number;
  delta: xAIDelta;
  logprobs?: null;
  finish_reason?: null;
};

export type xAIChoiceFinish = {
  index: number;
  delta: xAIDeltaEmpty;
  finish_reason: "stop";
};

export type xAIChoice = xAIChoiceActive | xAIChoiceFinish;

export interface xAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface xAIBaseEntity {
  id: string;
  object: string;
  created: number;
  model: string;
  system_fingerprint: string;
}

export interface xAIChatCompletionsRes extends xAIBaseEntity {
  choices: xAIChoice[];
  usage?: xAIUsage;
}

/**
 * Transformer function for xAI SSE chunks
 * Parses SSE text into structured xAIChatCompletionsRes objects
 */
function xAISSETransformer(
  chunk: string
): SSEEvent<xAIChatCompletionsRes> | null {
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
      const parsedData = JSON.parse(jsonStr) as xAIChatCompletionsRes;
      return { event: eventType, data: parsedData };
    } catch (error) {
      console.error("Failed to parse xAI SSE data:", error);
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

export function createXAISSEParser(
  response: Response
): StreamParser<SSEEvent<xAIChatCompletionsRes>> {
  if (!response.body) {
    throw new Error("Response body is not available for SSE parsing.");
  }
  return new StreamParser(response.body, xAISSETransformer);
}

// Type guards for delta variations
export function isReasoningDelta(
  delta: xAIDelta
): delta is xAIDeltaReasoning | xAIDeltaGrokThinkingStart {
  return "reasoning_content" in delta && typeof (delta as xAIDeltaReasoning).reasoning_content === "string";
}

export function isStartDelta(delta: xAIDelta): boolean {
  return "role" in delta && (delta as xAIDeltaGrok3Start | xAIDeltaGrok4Start | xAIDeltaGrokThinkingStart).role === "assistant";
}

export function isContentDelta(
  delta: xAIDelta
): delta is xAIDeltaContent | xAIDeltaGrok3Start {
  return "content" in delta && typeof (delta as xAIDeltaContent).content === "string";
}

export function isEmptyDelta(delta: xAIDelta): delta is xAIDeltaEmpty {
  return Object.keys(delta).length === 0;
}

export function isFinishChoice(choice: xAIChoice): choice is xAIChoiceFinish {
  return "finish_reason" in choice && (choice as xAIChoiceFinish).finish_reason === "stop";
}
