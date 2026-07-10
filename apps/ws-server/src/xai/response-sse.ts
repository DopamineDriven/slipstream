import type {
  XAIResponsesEvent,
  XAIResponsesSSEEvent
} from "@/xai/responses-types.ts";

export class ResponseSSEWorkupService {
  protected xaiResponsesSSETransformer(chunk: string) {
    let eventType: string | undefined = undefined;
    const dataLines = Array.of<string>();

    for (const line of chunk.split(/\r?\n/)) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith(":")) {
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

    if (dataLines.length > 0 && eventType) {
      try {
        const jsonStr = dataLines.join("\n");
        const parsedData = JSON.parse<XAIResponsesEvent>(jsonStr);
        // event and data.type are always identical from xAI API
        return {
          event: parsedData.type,
          data: parsedData
        } as XAIResponsesSSEEvent;
      } catch (error) {
        console.error("Failed to parse xAI Responses SSE data:", error);
        return null;
      }
    }

    return null;
  }
}

export class ResponsesStreamParser
  extends ResponseSSEWorkupService
  implements AsyncIterable<XAIResponsesSSEEvent>
{
  private readonly readable: ReadableStream<XAIResponsesSSEEvent>;
  constructor(sourceStream: ReadableStream<Uint8Array>) {
    super();
    const decoder = new TextDecoder();

    let buffer = "";

    const transformStream = new TransformStream<
      Uint8Array,
      XAIResponsesSSEEvent
    >({
      transform: (chunk, controller) => {
        buffer += decoder.decode(chunk, { stream: true });

        const boundaryRegex = /\r?\n\r?\n/;
        let match: RegExpExecArray | null;

        while ((match = boundaryRegex.exec(buffer)) !== null) {
          const rawChunk = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);

          const parsed = this.xaiResponsesSSETransformer(rawChunk);
          if (parsed) {
            controller.enqueue(parsed);
          }
        }
      },

      flush: controller => {
        if (buffer.trim()) {
          const parsed = this.xaiResponsesSSETransformer(buffer);
          if (parsed) {
            controller.enqueue(parsed);
          }
        }
      }
    });

    this.readable = sourceStream.pipeThrough(transformStream);
  }

  public async *[Symbol.asyncIterator](): AsyncGenerator<
    XAIResponsesSSEEvent,
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
  public static createXAIResponsesParser(response: Response) {
    if (!response.body) {
      throw new Error("Response body is not available for SSE parsing.");
    }
    return new ResponsesStreamParser(response.body);
  }
}
