import type {
  XAIResponsesEvent,
  XAIResponsesSSEEvent
} from "@/xai/responses-types.ts";

export class ResponseSSEWorkupService {
  // SSE chunk transformer
  protected xaiResponsesSSETransformer(
    chunk: string
  ): XAIResponsesSSEEvent | null {
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
        const parsedData = JSON.parse(jsonStr) as XAIResponsesEvent;
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

// ============================================================================
// STREAM PARSER CLASS
// ============================================================================

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
      // const controller = new AbortController();
      while (true) {
        // if (controller.signal.aborted) {
        //   // ← Just check the signal
        //   break;
        // }
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  public static createXAIResponsesParser(
    response: Response
  ): ResponsesStreamParser {
    if (!response.body) {
      throw new Error("Response body is not available for SSE parsing.");
    }
    return new ResponsesStreamParser(response.body);
  }
}

/**
 *
 * True narrowing
  if (dataLines.length > 0 && eventType) {
      try {
        const jsonStr = dataLines.join("\n");
        const parsedData = JSON.parse(jsonStr) as XAIResponsesEvent;
        // event and data.type are always identical from xAI API

        return parsedData.type === "response.completed"
          ? { event: parsedData.type, data: parsedData }
          : parsedData.type === "response.content_part.added"
            ? { event: parsedData.type, data: parsedData }
            : parsedData.type === "response.content_part.done"
              ? { event: parsedData.type, data: parsedData }
              : parsedData.type === "response.created"
                ? { event: parsedData.type, data: parsedData }
                : parsedData.type === "response.custom_tool_call_input.delta"
                  ? { event: parsedData.type, data: parsedData }
                  : parsedData.type === "response.custom_tool_call_input.done"
                    ? { event: parsedData.type, data: parsedData }
                    : parsedData.type === "response.file_search_call.completed"
                      ? { event: parsedData.type, data: parsedData }
                      : parsedData.type ===
                          "response.file_search_call.in_progress"
                        ? { event: parsedData.type, data: parsedData }
                        : parsedData.type ===
                            "response.file_search_call.searching"
                          ? { event: parsedData.type, data: parsedData }
                          : parsedData.type === "response.in_progress"
                            ? { event: parsedData.type, data: parsedData }
                            : parsedData.type === "response.output_item.added"
                              ? { event: parsedData.type, data: parsedData }
                              : parsedData.type === "response.output_item.done"
                                ? { event: parsedData.type, data: parsedData }
                                : parsedData.type ===
                                    "response.output_text.annotation.added"
                                  ? { event: parsedData.type, data: parsedData }
                                  : parsedData.type ===
                                      "response.output_text.delta"
                                    ? {
                                        event: parsedData.type,
                                        data: parsedData
                                      }
                                    : parsedData.type ===
                                        "response.output_text.done"
                                      ? {
                                          event: parsedData.type,
                                          data: parsedData
                                        }
                                      : parsedData.type ===
                                          "response.reasoning_summary_part.added"
                                        ? {
                                            event: parsedData.type,
                                            data: parsedData
                                          }
                                        : parsedData.type ===
                                            "response.reasoning_summary_part.done"
                                          ? {
                                              event: parsedData.type,
                                              data: parsedData
                                            }
                                          : parsedData.type ===
                                              "response.reasoning_summary_text.delta"
                                            ? {
                                                event: parsedData.type,
                                                data: parsedData
                                              }
                                            : parsedData.type ===
                                                "response.reasoning_summary_text.done"
                                              ? {
                                                  event: parsedData.type,
                                                  data: parsedData
                                                }
                                              : parsedData.type ===
                                                  "response.web_search_call.completed"
                                                ? {
                                                    event: parsedData.type,
                                                    data: parsedData
                                                  }
                                                : parsedData.type ===
                                                    "response.web_search_call.in_progress"
                                                  ? {
                                                      event: parsedData.type,
                                                      data: parsedData
                                                    }
                                                  : {
                                                      event: parsedData.type,
                                                      data: parsedData
                                                    };
 *
 * unused guards
 *
   // Event type guards
  protected isTextDeltaEvent(
    event: XAIResponsesEvent
  ): event is xAIResponses.OutputText.Delta {
    return event.type === "response.output_text.delta";
  }

  protected isReasoningSummaryDeltaEvent(
    event: XAIResponsesEvent
  ): event is xAIResponses.ReasoningSummaryText.Delta {
    return event.type === "response.reasoning_summary_text.delta";
  }

  protected isResponseCompletedEvent(
    event: XAIResponsesEvent
  ): event is xAIResponses.Completed {
    return event.type === "response.completed";
  }

  protected isResponseCreatedEvent(
    event: XAIResponsesEvent
  ): event is xAIResponses.Created {
    return event.type === "response.created";
  }

  protected isResponseInProgressEvent(
    event: XAIResponsesEvent
  ): event is xAIResponses.InProgress {
    return event.type === "response.in_progress";
  }

  protected isAnnotationAddedEvent(
    event: XAIResponsesEvent
  ): event is xAIResponses.OutputText.AnnotationAdded {
    return event.type === "response.output_text.annotation.added";
  }

  protected isOutputItemAddedEvent(
    event: XAIResponsesEvent
  ): event is xAIResponses.OutputItem.Added {
    return event.type === "response.output_item.added";
  }

  protected isOutputItemDoneEvent(
    event: XAIResponsesEvent
  ): event is xAIResponses.OutputItem.Done {
    return event.type === "response.output_item.done";
  }

  // Output item type guards
  protected isWebSearchCall(
    item:
      | xAIResponses.WebSearchCall.Searching
      | xAIResponses.WebSearchCall.InProgress
      | xAIResponses.WebSearchCall.Completed
      | (
          | xAIResponses.OutputItem.Done.WebSearchItem
          | xAIResponses.OutputItem.Added.WebSearchItem
        )
  ): item is
    | xAIResponses.WebSearchCall.Searching
    | xAIResponses.WebSearchCall.InProgress
    | xAIResponses.WebSearchCall.Completed
    | (
        | xAIResponses.OutputItem.Done.WebSearchItem
        | xAIResponses.OutputItem.Added.WebSearchItem
      ) {
    return (
      item.type === "response.web_search_call.completed" ||
      item.type === "response.web_search_call.in_progress" ||
      item.type === "response.web_search_call.searching" ||
      item.type === "web_search_call"
    );
  }

  protected isFileSearchCall(
    item:
      | (
          | xAIResponses.OutputItem.Added.FileSearchItem
          | xAIResponses.OutputItem.Done.FileSearchItem
        )
      | xAIResponses.FileSearchCall.Completed
      | xAIResponses.FileSearchCall.InProgress
      | xAIResponses.FileSearchCall.Searching
  ): item is
    | (
        | xAIResponses.OutputItem.Added.FileSearchItem
        | xAIResponses.OutputItem.Done.FileSearchItem
      )
    | xAIResponses.FileSearchCall.Completed
    | xAIResponses.FileSearchCall.InProgress
    | xAIResponses.FileSearchCall.Searching {
    return (
      item.type === "file_search_call" ||
      item.type === "response.file_search_call.completed" ||
      item.type === "response.file_search_call.in_progress" ||
      item.type === "response.file_search_call.searching"
    );
  }

  protected isCustomToolCall(
    item:
      | (
          | xAIResponses.OutputItem.Added.CustomToolCallItem
          | xAIResponses.OutputItem.Done.CustomToolCallItem
        )
      | xAIResponses.CustomToolCallInput.Delta
      | xAIResponses.CustomToolCallInput.Done
  ): item is
    | (
        | xAIResponses.OutputItem.Added.CustomToolCallItem
        | xAIResponses.OutputItem.Done.CustomToolCallItem
      )
    | xAIResponses.CustomToolCallInput.Delta
    | xAIResponses.CustomToolCallInput.Done {
    return (
      item.type === "custom_tool_call" ||
      item.type === "response.custom_tool_call_input.delta" ||
      item.type === "response.custom_tool_call_input.done"
    );
  }

  protected isMessageOutput(
    item:
      | (
          | xAIResponses.OutputItem.Added.MessageItem
          | xAIResponses.OutputItem.Done.MessageItem
        )
      | xAIResponses.OutputText.Delta
      | xAIResponses.OutputText.Done
  ): item is
    | (
        | xAIResponses.OutputItem.Added.MessageItem
        | xAIResponses.OutputItem.Done.MessageItem
      )
    | xAIResponses.OutputText.Delta
    | xAIResponses.OutputText.Done {
    return (
      item.type === "message" ||
      item.type === "response.output_text.delta" ||
      item.type === "response.output_text.done"
    );
  }

  protected isReasoningSummaryOutput(
    item:
      | (
          | xAIResponses.OutputItem.Added.ReasoningItem
          | xAIResponses.OutputItem.Done.ReasoningItem
        )
      | xAIResponses.ReasoningSummaryPart.Added
      | xAIResponses.ReasoningSummaryPart.Done
      | xAIResponses.ReasoningSummaryText.Delta
      | xAIResponses.ReasoningSummaryText.Done
  ): item is
    | (
        | xAIResponses.OutputItem.Added.ReasoningItem
        | xAIResponses.OutputItem.Done.ReasoningItem
      )
    | xAIResponses.ReasoningSummaryPart.Added
    | xAIResponses.ReasoningSummaryPart.Done
    | xAIResponses.ReasoningSummaryText.Delta
    | xAIResponses.ReasoningSummaryText.Done {
    return (
      item.type === "reasoning" ||
      item.type === "response.reasoning_summary_part.added" ||
      item.type === "response.reasoning_summary_part.done" ||
      item.type === "response.reasoning_summary_text.delta" ||
      item.type === "response.reasoning_summary_text.done"
    );
  }
 */
