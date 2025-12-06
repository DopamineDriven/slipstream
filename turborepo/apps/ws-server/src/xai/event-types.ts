import type {
  CodeInterpreterTool,
  FileSearchTool,
  ToolChoiceUnion,
  ToolMap,
  WebSearchTool,
  XSearchTool
} from "@/xai/responses-types.ts";
import { GrokModelIdUnion, Unenumerate } from "@slipstream/types";

export namespace OutputItemAdded {
  export interface ReasoningItem {
    /**
     * id starts with `rs_`
     */
    id: string;
    summary: [];
    type: "reasoning";
    status: "in_progress";
  }
  export interface MessageItem {
    type: "message";
    status: "in_progress";
    content: [];
    /**
     * id starts with `msg_`
     */
    id: string;
    role: "assistant";
  }
  export interface FileSearchItem {
    /**
     * id starts with `fs_`
     */
    id: string;
    type: "file_search_call";
    status: "in_progress";
    queries: [];
    results: [];
  }
  export interface WebSearchItem {
    /**
     * id starts with `ws_`
     */
    id: string;
    type: "web_search_call";
    status: "in_progress";
    action: {
      type: "search";
      query: string;
      sources: [];
    };
  }

  export interface CustomToolCallItem {
    type: "custom_tool_call";
    status: "in_progress";
    /**
     * id starts with `ctc_`
     */
    id: string;
    /**
     * if call_id starts with
     *
     *  `xs_` -> X Search tool
     *
     *  `as_` -> PDF Search tool
     */
    call_id: string;
    input: string;
    name:
      | "x_keyword_search"
      | "x_semantic_search"
      | "search_pdf_attachment"
      | "x_user_search"
      | (string & {});
  }

  export type Item =
    | ReasoningItem
    | MessageItem
    | FileSearchItem
    | WebSearchItem
    | CustomToolCallItem;
}
export interface OutputItemAddedEventTypes {
  sequence_number: number;
  type: "response.output_item.added";
  item: OutputItemAdded.Item;
  output_index: number;
}

export namespace OutputItemDone {
  /**
   * for models that surface non-encrypted CoT
   *
   * grok-3-mini, grok-code-fast-1
   */
  export interface ReasoningItemNonEncrypted {
    id: string;
    summary: {
      text: string;
      type: "summary_text";
    }[];
    type: "reasoning";
    status: "completed";
  }
  /**
   * for models that surface encrypted CoT only
   *
   * grok-4-0709, grok-4-fast-reasoning, grok-4-1-fast-reasoning
   */
  export interface ReasoningItemEncrypted {
    id: string;
    summary: never[];
    type: "reasoning";
    status: "completed";
    encrypted_content: string;
  }

  export type ReasoningItem =
    | ReasoningItemNonEncrypted
    | ReasoningItemEncrypted;

  export interface MessageAnnotationFull {
    type: "url_citation";
    url: string;
    start_index: number;
    end_index: number;
    title: string;
  }

  export interface MessageAnnotationMinimal {
    type: "url_citation";
    url: string;
  }

  export interface MessageItem {
    type: "message";
    status: "completed";
    content: {
      type: "output_text";
      text: string;
      logprobs: never[];
      annotations:
        | MessageAnnotationFull[]
        | MessageAnnotationMinimal[]
        | never[];
    }[];
    id: string;
    role: "assistant";
  }

  export interface FileSearchItem {
    id: string;
    type: "file_search_call";
    status: "completed";
    queries: string[];
    results?: {
      file_id: string;
      filename: string;
      score: number;
      text: string;
    }[];
  }
  export interface WebSearchItem {
    id: string;
    type: "web_search_call";
    status: "completed" | "failed";
    action: { type: "search"; query: string; sources: never[] | unknown[] };
  }

  export interface CustomToolCallItem {
    type: "custom_tool_call";
    status: "completed";
    id: string;
    call_id: string;
    /**
     * a json.parsable stringified object, eg
     *
     * `'{"query":"Catullus OR catullian filter:poetry OR riff OR parody","limit":10,"mode":"Top"}'`
     */
    input: string;
    name:
      | "x_keyword_search"
      | "x_semantic_search"
      | "search_pdf_attachment"
      | "x_user_search"
      | (string & {});
  }

  export type Item =
    | ReasoningItem
    | MessageItem
    | FileSearchItem
    | WebSearchItem
    | CustomToolCallItem;
}
export interface OutputItemDoneEventTypes {
  sequence_number: number;
  type: "response.output_item.done";
  item: OutputItemDone.Item;
  output_index: number;
}

export interface OutputTextAnnotationAddedEventType {
  sequence_number: number;
  type: "response.output_text.annotation.added";
  annotation: {
    type: "url_citation";
    url: string;
    start_index?: number;
    end_index?: number;
    title?: string;
  };
  annotation_index: number;
  content_index: number;
  item_id: string;
  output_index: number;
}

export interface ResponseCustomToolCallInputDelta {
  sequence_number: number;
  type: "response.custom_tool_call_input.delta";
  item_id: string;
  output_index: number;
  delta: string;
}

export interface ResponseCustomToolCallInputDone {
  sequence_number: number;
  type: "response.custom_tool_call_input.done";
  item_id: string;
  output_index: number;
  input: string;
}

export interface ResponseWebSearchCallSearching {
  sequence_number: number;
  type: "response.web_search_call.searching";
  item_id: string;
  output_index: number;
}

export interface ResponseWebSearchCallInProgress {
  sequence_number: number;
  type: "response.web_search_call.in_progress";
  item_id: string;
  output_index: number;
}

export interface ResponseWebSearchCallCompleted {
  sequence_number: number;
  type: "response.web_search_call.completed";
  item_id: string;
  output_index: number;
}

export interface ResponseOutputTextDelta {
  sequence_number: number;
  type: "response.output_text.delta";
  content_index: number;
  delta: string;
  item_id: string;
  output_index: number;
  logprobs: never[];
}

export interface ResponseOutputTextDone {
  sequence_number: number;
  type: "response.output_text.done";
  content_index: number;
  item_id: string;
  output_index: number;
  text: string;
}

export interface ResponseInitType<V extends "created" | "in_progress"> {
  sequence_number: number;
  type: `response.${V}`;
  response: {
    id: string;
    object: "response";
    created_at: number;
    model: GrokModelIdUnion;
    status: "in_progress";
    output: never[];
    max_output_tokens: number | null;
    parallel_tool_calls: boolean;
    previous_response_id: string | null;
    reasoning: {
      effort: "high" | "medium" | "low" | null;
      summary: "auto" | "concise" | "detailed" | null;
    };
    temperature: number | null;
    text: {
      format: { type: "text" | "json_object" | "json_schema" };
    };
    tool_choice: ToolChoiceUnion;
    tools?: (
      | ToolMap<XSearchTool | WebSearchTool>
      | CodeInterpreterTool
      | FileSearchTool
    )[];
    top_p: number | null;
    user: string | null;
    incomplete_details: object | null;
    store: boolean;
    metadata: Record<string, never>;
    usage?: XAIUsage;
  };
}

export interface ResponseCompletedType {
  sequence_number: number;
  type: "response.completed";
  response: {
    id: string;
    object: "response";
    created_at: number;
    model: GrokModelIdUnion;
    status: "completed";
    output: (
      | OutputItemDone.CustomToolCallItem
      | OutputItemDone.FileSearchItem
      | OutputItemDone.MessageItem
      | OutputItemDone.WebSearchItem
      | OutputItemDone.ReasoningItem
    )[];
    max_output_tokens: number | null;
    parallel_tool_calls: boolean;
    previous_response_id: string | null;
    reasoning: {
      effort: "high" | "medium" | "low" | null;
      summary: "auto" | "concise" | "detailed" | null;
    };
    temperature: number | null;
    text: {
      format: { type: "text" | "json_object" | "json_schema" };
    };
    tool_choice: ToolChoiceUnion;
    tools?: (
      | ToolMap<XSearchTool | WebSearchTool>
      | CodeInterpreterTool
      | FileSearchTool
    )[];
    top_p: number | null;
    user: string | null;
    incomplete_details: object | null;
    store: boolean;
    metadata: Record<string, never>;
    usage?: XAIUsage;
  };
}

export interface XAIUsage {
  input_tokens: number;
  input_tokens_details: {
    cached_tokens: number;
  };
  output_tokens: number;
  output_tokens_details: {
    reasoning_tokens: number;
  };
  total_tokens: number;
  num_sources_used: number;
  num_server_side_tools_used?: number;
  server_side_tool_usage_details?: {
    web_search_calls: number;
    x_search_calls: number;
    code_interpreter_calls: number;
    file_search_calls: number;
    mcp_calls: number;
    document_search_calls: number;
  };
}

export interface ResponseReasoningSummaryTextDeltaType {
  sequence_number: number;
  type: "response.reasoning_summary_text.delta";
  delta: string;
  item_id: string;
  output_index: number;
  summary_index: number;
}

export interface ResponseReasoningSummaryTextDoneType {
  sequence_number: number;
  type: "response.reasoning_summary_text.done";
  item_id: string;
  output_index: number;
  summary_index: number;
  text: string;
}

export interface ResponseContentPartAddedType {
  sequence_number: number;
  type: "response.content_part.added";
  content_index: number;
  item_id: string;
  output_index: number;
  part: {
    type: "output_text";
    text: string;
    logprobs: never[];
    annotations: never[];
  };
}

export interface ResponseContentPartDoneType {
  sequence_number: number;
  type: "response.content_part.done";
  content_index: number;
  item_id: string;
  output_index: number;
  part: Unenumerate<OutputItemDone.MessageItem["content"]>;
}

export interface ResponseFileSearchCallSearchingType {
  sequence_number: number;
  type: "response.file_search_call.searching";
  item_id: string;
  output_index: number;
}

export interface ResponseFileSearchCallInProgressType {
  sequence_number: number;
  type: "response.file_search_call.in_progress";
  item_id: string;
  output_index: number;
}

export interface ResponseFileSearchCallCompletedType {
  sequence_number: number;
  type: "response.file_search_call.completed";
  item_id: string;
  output_index: number;
}

export interface ResponseReasoningSummaryPartAddedType {
  sequence_number: number;
  type: "response.reasoning_summary_part.added";
  item_id: string;
  output_index: number;
  part: {
    text: string;
    type: "summary_text";
  };
  summary_index: number;
}

export interface ResponseReasoningSummaryPartDoneType {
  sequence_number: number;
  type: "response.reasoning_summary_part.done";
  item_id: string;
  output_index: number;
  part: {
    text: string;
    type: "summary_text";
  };
  summary_index: number;
}
