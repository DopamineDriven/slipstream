import type {
  OutputItemAdded,
  OutputItemAddedEventTypes,
  OutputItemDone,
  OutputItemDoneEventTypes,
  OutputTextAnnotationAddedEventType,
  ResponseCompletedType,
  ResponseContentPartAddedType,
  ResponseContentPartDoneType,
  ResponseCustomToolCallInputDelta,
  ResponseCustomToolCallInputDone,
  ResponseFileSearchCallCompletedType,
  ResponseFileSearchCallInProgressType,
  ResponseFileSearchCallSearchingType,
  ResponseInitType,
  ResponseOutputTextDelta,
  ResponseOutputTextDone,
  ResponseReasoningSummaryPartAddedType,
  ResponseReasoningSummaryPartDoneType,
  ResponseReasoningSummaryTextDeltaType,
  ResponseReasoningSummaryTextDoneType,
  ResponseWebSearchCallCompleted,
  ResponseWebSearchCallInProgress,
  ResponseWebSearchCallSearching
} from "@/xai/event-types.ts";

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

export interface ResponseCreatedEvent extends ResponseInitType<"created"> {}

export interface ResponseInProgressEvent extends ResponseInitType<"in_progress"> {}

export interface ResponseCompletedEvent extends ResponseCompletedType {}

export interface OutputItemAddedEvent extends OutputItemAddedEventTypes {}

export interface OutputItemDoneEvent extends OutputItemDoneEventTypes {}

export interface ContentPartAddedEvent extends ResponseContentPartAddedType {}

export interface ContentPartDoneEvent extends ResponseContentPartDoneType {}

export interface OutputTextDeltaEvent extends ResponseOutputTextDelta {}

export interface OutputTextDoneEvent extends ResponseOutputTextDone {}

export interface OutputTextAnnotationAddedEvent extends OutputTextAnnotationAddedEventType {}

export interface ReasoningSummaryPartAddedEvent extends ResponseReasoningSummaryPartAddedType {}

export interface ReasoningSummaryPartDoneEvent extends ResponseReasoningSummaryPartDoneType {}

export interface ReasoningSummaryTextDeltaEvent extends ResponseReasoningSummaryTextDeltaType {}

export interface ReasoningSummaryTextDoneEvent extends ResponseReasoningSummaryTextDoneType {}

export interface WebSearchCallInProgressEvent extends ResponseWebSearchCallInProgress {}

export interface WebSearchCallSearchingEvent extends ResponseWebSearchCallSearching {}

export interface WebSearchCallCompletedEvent extends ResponseWebSearchCallCompleted {}

export interface FileSearchCallInProgressEvent extends ResponseFileSearchCallInProgressType {}

export interface FileSearchCallSearchingEvent extends ResponseFileSearchCallSearchingType {}

export interface FileSearchCallCompletedEvent extends ResponseFileSearchCallCompletedType {}

export interface CustomToolCallInputDeltaEvent extends ResponseCustomToolCallInputDelta {}

export interface CustomToolCallInputDoneEvent extends ResponseCustomToolCallInputDone {}

export type XAIResponsesEvent =
  | ResponseCreatedEvent
  | ResponseInProgressEvent
  | ResponseCompletedEvent
  | OutputItemAddedEvent
  | OutputItemDoneEvent
  | ContentPartAddedEvent
  | ContentPartDoneEvent
  | OutputTextDeltaEvent
  | OutputTextDoneEvent
  | OutputTextAnnotationAddedEvent
  | ReasoningSummaryPartAddedEvent
  | ReasoningSummaryPartDoneEvent
  | ReasoningSummaryTextDeltaEvent
  | ReasoningSummaryTextDoneEvent
  | WebSearchCallInProgressEvent
  | WebSearchCallSearchingEvent
  | WebSearchCallCompletedEvent
  | FileSearchCallInProgressEvent
  | FileSearchCallSearchingEvent
  | FileSearchCallCompletedEvent
  | CustomToolCallInputDeltaEvent
  | CustomToolCallInputDoneEvent;

export type XAIResponsesEventTypes = XAIResponsesEvent["type"];

export type MapIT = {
  "response.created": ResponseCreatedEvent;
  "response.in_progress": ResponseInProgressEvent;
  "response.completed": ResponseCompletedEvent;
  "response.output_item.added": OutputItemAddedEvent;
  "response.output_item.done": OutputItemDoneEvent;
  "response.content_part.added": ContentPartAddedEvent;
  "response.content_part.done": ContentPartDoneEvent;
  "response.output_text.delta": OutputTextDeltaEvent;
  "response.output_text.done": OutputTextDoneEvent;
  "response.output_text.annotation.added": OutputTextAnnotationAddedEvent;
  "response.reasoning_summary_part.added": ReasoningSummaryPartAddedEvent;
  "response.reasoning_summary_part.done": ReasoningSummaryPartDoneEvent;
  "response.reasoning_summary_text.delta": ReasoningSummaryTextDeltaEvent;
  "response.reasoning_summary_text.done": ReasoningSummaryTextDoneEvent;
  "response.web_search_call.in_progress": WebSearchCallInProgressEvent;
  "response.web_search_call.searching": WebSearchCallSearchingEvent;
  "response.web_search_call.completed": WebSearchCallCompletedEvent;
  "response.file_search_call.in_progress": FileSearchCallInProgressEvent;
  "response.file_search_call.searching": FileSearchCallSearchingEvent;
  "response.file_search_call.completed": FileSearchCallCompletedEvent;
  "response.custom_tool_call_input.delta": CustomToolCallInputDeltaEvent;
  "response.custom_tool_call_input.done": CustomToolCallInputDoneEvent;
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
  ): event is OutputTextDeltaEvent {
    return event.type === "response.output_text.delta";
  }

  protected isReasoningSummaryDeltaEvent(
    event: XAIResponsesEvent
  ): event is ReasoningSummaryTextDeltaEvent {
    return event.type === "response.reasoning_summary_text.delta";
  }

  protected isResponseCompletedEvent(
    event: XAIResponsesEvent
  ): event is ResponseCompletedEvent {
    return event.type === "response.completed";
  }

  protected isResponseCreatedEvent(
    event: XAIResponsesEvent
  ): event is ResponseCreatedEvent {
    return event.type === "response.created";
  }

  protected isResponseInProgressEvent(
    event: XAIResponsesEvent
  ): event is ResponseInProgressEvent {
    return event.type === "response.in_progress";
  }

  protected isAnnotationAddedEvent(
    event: XAIResponsesEvent
  ): event is OutputTextAnnotationAddedEvent {
    return event.type === "response.output_text.annotation.added";
  }

  protected isOutputItemAddedEvent(
    event: XAIResponsesEvent
  ): event is OutputItemAddedEvent {
    return event.type === "response.output_item.added";
  }

  protected isOutputItemDoneEvent(
    event: XAIResponsesEvent
  ): event is OutputItemDoneEvent {
    return event.type === "response.output_item.done";
  }

  // Output item type guards
  protected isWebSearchCall(
    item:
      | WebSearchCallCompletedEvent
      | WebSearchCallInProgressEvent
      | WebSearchCallSearchingEvent
      | OutputItemDone.WebSearchItem
      | OutputItemAdded.WebSearchItem
  ): item is
    | WebSearchCallCompletedEvent
    | WebSearchCallInProgressEvent
    | WebSearchCallSearchingEvent
    | OutputItemDone.WebSearchItem
    | OutputItemAdded.WebSearchItem {
    return (
      item.type === "response.web_search_call.completed" ||
      item.type === "response.web_search_call.in_progress" ||
      item.type === "response.web_search_call.searching" ||
      item.type === "web_search_call"
    );
  }

  protected isFileSearchCall(
    item:
      | OutputItemAdded.FileSearchItem
      | OutputItemDone.FileSearchItem
      | FileSearchCallCompletedEvent
      | FileSearchCallInProgressEvent
      | FileSearchCallSearchingEvent
  ): item is
    | OutputItemAdded.FileSearchItem
    | OutputItemDone.FileSearchItem
    | FileSearchCallCompletedEvent
    | FileSearchCallInProgressEvent
    | FileSearchCallSearchingEvent {
    return (
      item.type === "file_search_call" ||
      item.type === "response.file_search_call.completed" ||
      item.type === "response.file_search_call.in_progress" ||
      item.type === "response.file_search_call.searching"
    );
  }

  protected isCustomToolCall(
    item:
      | OutputItemAdded.CustomToolCallItem
      | OutputItemDone.CustomToolCallItem
      | CustomToolCallInputDeltaEvent
      | CustomToolCallInputDoneEvent
  ): item is
    | OutputItemAdded.CustomToolCallItem
    | OutputItemDone.CustomToolCallItem
    | CustomToolCallInputDeltaEvent
    | CustomToolCallInputDoneEvent {
    return (
      item.type === "custom_tool_call" ||
      item.type === "response.custom_tool_call_input.delta" ||
      item.type === "response.custom_tool_call_input.done"
    );
  }

  protected isMessageOutput(
    item:
      | OutputItemAdded.MessageItem
      | OutputItemDone.MessageItem
      | OutputTextDeltaEvent
      | OutputTextDoneEvent
  ): item is
    | OutputItemAdded.MessageItem
    | OutputItemDone.MessageItem
    | OutputTextDeltaEvent
    | OutputTextDoneEvent {
    return (
      item.type === "message" ||
      item.type === "response.output_text.delta" ||
      item.type === "response.output_text.done"
    );
  }

  protected isReasoningSummaryOutput(
    item:
      | OutputItemAdded.ReasoningItem
      | OutputItemDone.ReasoningItem
      | ReasoningSummaryPartAddedEvent
      | ReasoningSummaryPartDoneEvent
      | ReasoningSummaryTextDeltaEvent
      | ReasoningSummaryTextDoneEvent
  ): item is
    | OutputItemAdded.ReasoningItem
    | OutputItemDone.ReasoningItem
    | ReasoningSummaryPartAddedEvent
    | ReasoningSummaryPartDoneEvent
    | ReasoningSummaryTextDeltaEvent
    | ReasoningSummaryTextDoneEvent {
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
  constructor(
    sourceStream: ReadableStream<Uint8Array>,
  ) {
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
    response: Response,
  ): ResponsesStreamParser {
    if (!response.body) {
      throw new Error("Response body is not available for SSE parsing.");
    }
    return new ResponsesStreamParser(response.body);
  }
}
