import type { xAIResponses } from "@/xai/event-types.ts";

export type SSEEvent<TUnion extends { type: string }> = TUnion extends {
  type: infer K extends string;
}
  ? {
      event: K;
      data: Extract<TUnion, { type: K }>;
    }
  : never;

export type XAIResponsesSSEEvent = SSEEvent<XAIResponsesEvent>;

export type XAIResponsesEventType =
  | "response.created"
  | "response.in_progress"
  | "response.completed"
  | "response.output_item.added"
  | "response.output_item.done"
  | "response.content_part.added"
  | "response.content_part.done"
  | "response.output_text.delta"
  | "response.output_text.done"
  | "response.output_text.annotation.added"
  | "response.reasoning_summary_part.added"
  | "response.reasoning_summary_part.done"
  | "response.reasoning_summary_text.delta"
  | "response.reasoning_summary_text.done"
  | "response.web_search_call.in_progress"
  | "response.web_search_call.searching"
  | "response.web_search_call.completed"
  | "response.file_search_call.in_progress"
  | "response.file_search_call.searching"
  | "response.file_search_call.completed"
  | "response.custom_tool_call_input.delta"
  | "response.custom_tool_call_input.done";

export type XAIResponsesEvent =
  | xAIResponses.Created
  | xAIResponses.InProgress
  | xAIResponses.Completed
  | xAIResponses.OutputItem.Added.EventTypes
  | xAIResponses.OutputItem.Done.EventTypes
  | xAIResponses.ContentPart.Added
  | xAIResponses.ContentPart.Done
  | xAIResponses.OutputText.Delta
  | xAIResponses.OutputText.Done
  | xAIResponses.OutputText.AnnotationAdded
  | xAIResponses.ReasoningSummaryPart.Added
  | xAIResponses.ReasoningSummaryPart.Done
  | xAIResponses.ReasoningSummaryText.Delta
  | xAIResponses.ReasoningSummaryText.Done
  | xAIResponses.WebSearchCall.InProgress
  | xAIResponses.WebSearchCall.Searching
  | xAIResponses.WebSearchCall.Completed
  | xAIResponses.FileSearchCall.InProgress
  | xAIResponses.FileSearchCall.Searching
  | xAIResponses.FileSearchCall.Completed
  | xAIResponses.CustomToolCallInput.Delta
  | xAIResponses.CustomToolCallInput.Done;

export type XAIResponsesEventTypes = XAIResponsesEvent["type"];

export type MapIT = {
  "response.created": xAIResponses.Created;
  "response.in_progress": xAIResponses.InProgress;
  "response.completed": xAIResponses.Completed;
  "response.output_item.added": xAIResponses.OutputItem.Added.EventTypes;
  "response.output_item.done": xAIResponses.OutputItem.Done.EventTypes;
  "response.content_part.added": xAIResponses.ContentPart.Added;
  "response.content_part.done": xAIResponses.ContentPart.Done;
  "response.output_text.delta": xAIResponses.OutputText.Delta;
  "response.output_text.done": xAIResponses.OutputText.Done;
  "response.output_text.annotation.added": xAIResponses.OutputText.AnnotationAdded;
  "response.reasoning_summary_part.added": xAIResponses.ReasoningSummaryPart.Added;
  "response.reasoning_summary_part.done": xAIResponses.ReasoningSummaryPart.Done;
  "response.reasoning_summary_text.delta": xAIResponses.ReasoningSummaryText.Delta;
  "response.reasoning_summary_text.done": xAIResponses.ReasoningSummaryText.Done;
  "response.web_search_call.in_progress": xAIResponses.WebSearchCall.InProgress;
  "response.web_search_call.searching": xAIResponses.WebSearchCall.Searching;
  "response.web_search_call.completed": xAIResponses.WebSearchCall.Completed;
  "response.file_search_call.in_progress": xAIResponses.FileSearchCall.InProgress;
  "response.file_search_call.searching": xAIResponses.FileSearchCall.Searching;
  "response.file_search_call.completed": xAIResponses.FileSearchCall.Completed;
  "response.custom_tool_call_input.delta": xAIResponses.CustomToolCallInput.Delta;
  "response.custom_tool_call_input.done": xAIResponses.CustomToolCallInput.Done;
};

export type CollapseAll<S extends string> = S extends `${infer A}_${infer B}`
  ? CollapseAll<`${A}${Capitalize<B>}`>
  : S extends `${infer A}.${infer B}`
    ? CollapseAll<`${Capitalize<A>}${Capitalize<B>}`>
    : S;

export type ToTypeNameObject<
  T extends XAIResponsesEventTypes = XAIResponsesEventTypes
> = Record<CollapseAll<T>, XAIResponsesEventMap<T>>;

export type XAIResponsesEventMap<
  T extends XAIResponsesEventTypes = XAIResponsesEventTypes
> = { [P in T]: MapIT[P] }[T];

export class ResponseSSEWorkupService {
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
  ): event is xAIResponses.OutputItem.Added.EventTypes {
    return event.type === "response.output_item.added";
  }

  protected isOutputItemDoneEvent(
    event: XAIResponsesEvent
  ): event is xAIResponses.OutputItem.Done.EventTypes {
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
