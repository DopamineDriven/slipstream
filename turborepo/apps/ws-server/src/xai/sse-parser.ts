// sse-parser.ts
export interface SSEEvent<T = unknown> {
  event?: string;
  data: T;
}

export interface SSEParserOptions<T> {
  transformer: (data: string, event?: string) => T | null;
  sentinelValues?: readonly string[];
  validator?: (data: unknown) => data is T;
  skipEmptyLines?: boolean;
  onError?: (error: Error, rawData: string) => void;
}

/**
 * Base SSE Parser class - can be extended for specific implementations
 */
export class SSEParser<T> implements AsyncIterable<SSEEvent<T>> {
  private readonly readable: ReadableStream<SSEEvent<T>>;
  protected readonly sentinels: Set<string>;

  constructor(
    sourceStream: ReadableStream<Uint8Array>,
    protected readonly options: SSEParserOptions<T>
  ) {
    this.sentinels = new Set(
      options.sentinelValues ?? ["[DONE]", "data: [DONE]", "data:[DONE]"]
    );

    const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
    let buffer = "";

    const transformStream = new TransformStream<Uint8Array, SSEEvent<T>>({
      transform: (chunk, controller) => {
        buffer += decoder.decode(chunk, { stream: true });

        const messages = this.extractMessages(buffer);
        buffer = messages.remaining;

        for (const message of messages.complete) {
          const event = this.parseSSEMessage(message);
          if (event) {
            controller.enqueue(event);
          }
        }
      },

      flush: controller => {
        if (buffer.trim()) {
          const event = this.parseSSEMessage(buffer);
          if (event) {
            controller.enqueue(event);
          }
        }
      }
    });

    this.readable = sourceStream.pipeThrough(transformStream);
  }

  public safeStrParse(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return String(err);
  }
  protected extractMessages(buffer: string): {
    complete: string[];
    remaining: string;
  } {
    const messages: string[] = [];
    const boundaryRegex = /\r?\n\r?\n/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = boundaryRegex.exec(buffer)) !== null) {
      const message = buffer.slice(lastIndex, match.index);
      if (message.trim()) {
        messages.push(message);
      }
      lastIndex = match.index + match[0].length;
    }

    return {
      complete: messages,
      remaining: buffer.slice(lastIndex)
    };
  }

  protected parseSSEMessage(message: string): SSEEvent<T> | null {
    const trimmedMessage = message.trim();
    if (this.sentinels.has(trimmedMessage)) {
      return null;
    }

    let eventType: string | undefined;
    const dataLines: string[] = [];

    const lines = message.split(/\r?\n/);

    for (const line of lines) {
      if (!line.trim() && this.options.skipEmptyLines !== false) {
        continue;
      }

      if (line.startsWith(":")) {
        continue;
      }

      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) {
        if (line.trim()) {
          dataLines.push(line);
        }
        continue;
      }

      const field = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trimStart();

      switch (field) {
        case "event":
          eventType = value;
          break;
        case "data":
          if (this.sentinels.has(value)) {
            return null;
          }
          dataLines.push(value);
          break;
        case "id":
        case "retry":
          break;
        default:
          break;
      }
    }

    if (dataLines.length > 0) {
      const rawData = dataLines.join("\n");

      if (this.sentinels.has(rawData)) {
        return null;
      }

      try {
        const parsed = this.options.transformer(rawData, eventType);

        if (parsed === null) {
          return null;
        }

        if (this.options.validator && !this.options.validator(parsed)) {
          throw new Error(`Data failed validation: ${JSON.stringify(parsed)}`);
        }

        return { event: eventType, data: parsed };
      } catch (error) {
        if (this.options.onError) {
          this.options.onError(
            error instanceof Error
              ? error
              : new Error(this.safeStrParse(error)),
            rawData
          );
        }
        return null;
      }
    }

    return null;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SSEEvent<T>, void, unknown> {
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
 * JSON Transformer service - can be injected as a dependency
 */
export class JSONTransformerService {
  /**
   * Check if a string is valid JSON
   */
  public isValidJSON(str: string): boolean {
    if (!str || typeof str !== 'string') return false;

    // Quick checks for common non-JSON patterns
    if (str === '[DONE]' || str === 'done' || str === 'DONE') return false;

    // Check if it starts with valid JSON characters
    const firstChar = str.trim()[0];
    if (!firstChar || (firstChar !== '{' && firstChar !== '[' && firstChar !== '"')) {
      return false;
    }

    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a transformer function for a given type
   */
  public createTransformer<T>(): (data: string, event?: string) => T | null {
    return (data: string, _event?: string): T | null => {
      if (!this.isValidJSON(data)) {
        return null;
      }

      try {
        return JSON.parse(data) as T;
      } catch {
        return null;
      }
    };
  }
}

/**
 * xAI-specific SSE Parser that extends the base parser
 */
export class XAISSEParser extends SSEParser<xAIChatCompletionsRes> {
  private transformerService: JSONTransformerService;
  constructor(
    sourceStream: ReadableStream<Uint8Array>,
    transformerService: JSONTransformerService
  ) {
    super(sourceStream, {
      transformer: transformerService.createTransformer<xAIChatCompletionsRes>(),
      sentinelValues: ['[DONE]', 'data: [DONE]', 'data:[DONE]'],
      skipEmptyLines: true,
      onError: (error, rawData) => {
        if (rawData && rawData !== '[DONE]' && rawData.trim() !== '') {
          console.error('Failed to parse xAI SSE data:', error.message);
        }
      }
    });
    transformerService = new JSONTransformerService();
    this.transformerService = transformerService;
  }
}

/**
 * Factory class for creating SSE parsers - can be injected as a dependency
 */
export class SSEParserFactory {
  constructor(
    private readonly transformerService: JSONTransformerService
  ) {}

  /**
   * Create a generic SSE parser
   */
  public createParser<T>(
    sourceStream: ReadableStream<Uint8Array>,
    options: SSEParserOptions<T>
  ): SSEParser<T> {
    return new SSEParser<T>(sourceStream, options);
  }

  /**
   * Create an xAI-specific parser
   */
  public createXAIParser(response: Response): XAISSEParser {
    if (!response.body) {
      throw new Error('Response body is not available for SSE parsing.');
    }

    return new XAISSEParser(response.body, this.transformerService);
  }

  /**
   * Create a parser for other AI providers (extensible)
   */
  public createOpenAIParser(response: Response): SSEParser<any> {
    if (!response.body) {
      throw new Error('Response body is not available for SSE parsing.');
    }

    return new SSEParser(response.body, {
      transformer: this.transformerService.createTransformer(),
      sentinelValues: ['[DONE]', 'data: [DONE]'],
      skipEmptyLines: true
    });
  }
}

// ===== xAI Types (unchanged) =====

export interface xAIChatCompletionsRes extends xAIBaseEntity {
  choices: xAIChoice[];
  usage?: xAIUsage;
}

export interface xAIBaseEntity {
  id: string;
  object: string;
  created: number;
  model: string;
  system_fingerprint: string;
}

export interface xAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export type xAIChoice = xAIChoiceActive | xAIChoiceFinish;

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

export type xAIDelta =
  | xAIDeltaGrok3Start
  | xAIDeltaGrok4Start
  | xAIDeltaGrokThinkingStart
  | xAIDeltaContent
  | xAIDeltaReasoning
  | xAIDeltaEmpty;

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

export interface xAIImgGenResponse {
  data: {
    url: string;
    revised_prompt: string;
  }[];
}

// Type guards
export function isReasoningDelta(
  delta: xAIDelta
): delta is xAIDeltaReasoning | xAIDeltaGrokThinkingStart {
  return (
    "reasoning_content" in delta &&
    typeof (delta as xAIDeltaReasoning).reasoning_content === "string"
  );
}

export function isStartDelta(delta: xAIDelta): boolean {
  return (
    "role" in delta &&
    (
      delta as
        | xAIDeltaGrok3Start
        | xAIDeltaGrok4Start
        | xAIDeltaGrokThinkingStart
    ).role === "assistant"
  );
}

export function isContentDelta(
  delta: xAIDelta
): delta is xAIDeltaContent | xAIDeltaGrok3Start {
  return (
    "content" in delta && typeof (delta as xAIDeltaContent).content === "string"
  );
}

export function isEmptyDelta(delta: xAIDelta): delta is xAIDeltaEmpty {
  return Object.keys(delta).length === 0;
}

export function isFinishChoice(choice: xAIChoice): choice is xAIChoiceFinish {
  return (
    "finish_reason" in choice &&
    (choice as xAIChoiceFinish).finish_reason === "stop"
  );
}
