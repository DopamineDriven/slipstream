// apps/ws-server/src/stream/index.ts

/**
 * Represents a standard Server-Sent Event.
 */
export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * A specific transformer function designed to parse SSE-formatted text chunks.
 * This function is passed to the generic StreamParser to handle SSE data.
 * @param chunk A string chunk received from the stream, potentially containing one SSE message.
 * @returns An SSEEvent object if parsing is successful, otherwise null.
 */
function sseTransformer(chunk: string): SSEEvent | null {
  let eventType: string | undefined = undefined;
  const dataLines = Array.of<string>(); // Process each line of the chunk.
  for (const line of chunk.split(/\r?\n/)) {
    // Ignore empty lines and comments (lines starting with ':').
    if (!line.trim() || line.startsWith(":")) {
      continue;
    }

    const [fieldName, ...fieldValueParts] = line.split(/:(.*)/s);
    const fieldValue = fieldValueParts[1]?.trimStart() ?? "";

    switch (fieldName) {
      case "event":
        eventType = fieldValue;
        break;
      case "data":
        dataLines.push(fieldValue);
        break;
      // 'id' and 'retry' fields are ignored for this use case.
    }
  }

  // An SSE event is only valid if it contains data.
  if (dataLines.length > 0) {
    return { event: eventType, data: dataLines.join("\n") };
  }

  return null;
}

/**
 * A generic, reusable class that transforms a ReadableStream of raw bytes (Uint8Array)
 * into an AsyncIterable of a specific object type <T>.
 *
 * It uses a `TransformStream` internally to handle the byte decoding, buffering,
 * chunking, and parsing, making it highly efficient and compliant with web standards.
 */
export class StreamParser<T> implements AsyncIterable<T> {
  private readonly readable: ReadableStream<T>;

  /**
   * Constructs a new StreamParser.
   * @param sourceStream The original ReadableStream of Uint8Array from a fetch response.
   * @param transformer A function that takes a string chunk and returns a parsed object of type T or null.
   */
  constructor(
    sourceStream: ReadableStream<Uint8Array>,
    transformer: (chunk: string) => T | null
  ) {
    const decoder = new TextDecoder();
    let buffer = "";

    // The TransformStream is the core of this class, handling the conversion.
    const transformStream = new TransformStream<Uint8Array, T>({
      transform(chunk, controller) {
        // Decode the incoming byte chunk and append it to the buffer.
        buffer += decoder.decode(chunk, { stream: true });

        // Regular expression to find SSE message boundaries (double newline).
        const boundaryRegex = /\r?\n\r?\n/;
        let boundaryIndex: number;

        // Process all complete messages in the buffer.
        while ((boundaryIndex = buffer.search(boundaryRegex)) !== -1) {
          const rawChunk = buffer.slice(0, boundaryIndex);
          // Remove the processed chunk and its boundary from the buffer.
          buffer = buffer.slice(
            boundaryIndex + (rawChunk.match(boundaryRegex)?.[0].length ?? 0)
          );

          // Use the provided transformer to parse the chunk.
          const parsed = transformer(rawChunk);
          if (parsed) {
            // If parsing is successful, enqueue the object to the readable side of the stream.
            controller.enqueue(parsed);
          }
        }
      }
    });

    // Pipe the source stream through our transformation logic.
    this.readable = sourceStream.pipeThrough(transformStream);
  }

  /**
   * Implementation of the AsyncIterable protocol.
   * This allows the class to be used directly in `for await...of` loops.
   */
  public async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    const reader = this.readable.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // The stream has ended, break the loop.
          return;
        }
        yield value;
      }
    } finally {
      // Ensure the reader is released when the consuming loop finishes.
      reader.releaseLock();
    }
  }
}

/**
 * A factory function to create a specialized StreamParser for SSE events.
 * This provides a convenient, type-safe way to handle SSE streams.
 * @param response The Response object from a fetch call.
 * @returns A StreamParser instance configured for SSEEvents.
 */
export function createSSEParser(response: Response): StreamParser<SSEEvent> {
  if (!response.body) {
    throw new Error("Response body is not available for SSE parsing.");
  }
  return new StreamParser(response.body, sseTransformer);
}
