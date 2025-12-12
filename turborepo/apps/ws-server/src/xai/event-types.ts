import type {
  InputReasoningProps,
  LogProbsFields,
  TextFormat,
  ToolChoiceUnion,
  ToolRequestInput,
  Usage
} from "@/xai/responses-types.ts";
import type { GrokModelIdUnion } from "@slipstream/types";

export namespace xAIResponses {
  export interface Created extends ResponseInitType<"created"> {}
  export interface InProgress extends ResponseInitType<"in_progress"> {}
  export interface Completed extends ResponseInitType<"completed"> {}
  export namespace ReasoningSummaryText {
    export interface Delta {
      sequence_number: number;
      type: "response.reasoning_summary_text.delta";
      delta: string;
      item_id: string;
      output_index: number;
      summary_index: number;
    }

    export interface Done {
      sequence_number: number;
      type: "response.reasoning_summary_text.done";
      item_id: string;
      output_index: number;
      summary_index: number;
      text: string;
    }
  }
  export namespace ReasoningSummaryPart {
    export interface Part {
        text: string;
        type: "summary_text";
      }
    export interface Added {
      sequence_number: number;
      type: "response.reasoning_summary_part.added";
      item_id: string;
      output_index: number;
      part: Part;
      summary_index: number;
    }
    export interface Done {
      sequence_number: number;
      type: "response.reasoning_summary_part.done";
      item_id: string;
      output_index: number;
      part: Part;
      summary_index: number;
    }
  }
  export namespace CustomToolCallInput {
    export interface Delta {
      sequence_number: number;
      type: "response.custom_tool_call_input.delta";
      item_id: string;
      output_index: number;
      delta: string;
    }
    export interface Done {
      sequence_number: number;
      type: "response.custom_tool_call_input.done";
      item_id: string;
      output_index: number;
      input: string;
    }
    export namespace Parsed {
      export interface ReadAttachment {
        query: string;
        key: string;
      }
      export interface SearchPDFAttachment {
        query: string;
        file_name: string;
        mode: "keyword" | (string & {});
      }
      export interface XUserSearch {
        query: string;
        count: number;
      }
      export interface XSemanticSearch {
        query: string;
        limit?: number;
      }
      export interface XKeywordSearch {
        query: string;
        limit: number;
        mode: "Top" | (string & {});
      }
    }
  }
  export namespace FileSearchCall {
    export interface Searching {
      sequence_number: number;
      type: "response.file_search_call.searching";
      item_id: string;
      output_index: number;
    }
    export interface InProgress {
      sequence_number: number;
      type: "response.file_search_call.in_progress";
      item_id: string;
      output_index: number;
    }
    export interface Completed {
      sequence_number: number;
      type: "response.file_search_call.completed";
      item_id: string;
      output_index: number;
    }
  }
  export namespace WebSearchCall {
    export interface Searching {
      sequence_number: number;
      type: "response.web_search_call.searching";
      item_id: string;
      output_index: number;
    }
    export interface InProgress {
      sequence_number: number;
      type: "response.web_search_call.in_progress";
      item_id: string;
      output_index: number;
    }
    export interface Completed {
      sequence_number: number;
      type: "response.web_search_call.completed";
      item_id: string;
      output_index: number;
    }
  }
  export namespace OutputItem {
    export namespace Added {
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
      export type CustomToolCallName =
        | "x_keyword_search"
        | "x_semantic_search"
        | "search_pdf_attachment"
        | "read_attachment"
        | "x_user_search"
        | (string & {});
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
        name: CustomToolCallName;
      }
      export type Item =
        | ReasoningItem
        | MessageItem
        | FileSearchItem
        | WebSearchItem
        | CustomToolCallItem;
      export interface EventTypes {
        sequence_number: number;
        type: "response.output_item.added";
        item: Item;
        output_index: number;
      }
    }
    export namespace Done {
      export interface ReasoningItem {
        id: string;
        type: "reasoning";
        status: "completed";
        encrypted_content: string;
        summary:
          | {
              text: string;
              type: "summary_text";
            }[]
          | never[];
      }
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
        content: ContentPart.OutputText[];
        id: string;
        role: "assistant";
      }
      export interface FileSearchItemResultsSingleton {
        file_id: string;
        filename: string;
        score: number;
        text: string;
      }
      export interface FileSearchItem {
        id: string;
        type: "file_search_call";
        status: "completed";
        queries: string[];
        results?: xAIResponses.OutputItem.Done.FileSearchItemResultsSingleton[];
      }
      export interface WebSearchItem {
        id: string;
        type: "web_search_call";
        status: "completed" | "failed";
        action: { type: "search"; query: string; sources: never[] | unknown[] };
      }
      export type CustomToolCallName =
        | "x_keyword_search"
        | "x_semantic_search"
        | "search_pdf_attachment"
        | "read_attachment"
        | "x_user_search"
        | (string & {});
      export interface CustomToolCallItem {
        type: "custom_tool_call";
        status: "completed";
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
        /**
         * a json.parsable stringified object, eg
         *
         * `'{"query":"Catullus OR catullian filter:poetry OR riff OR parody","limit":10,"mode":"Top"}'`
         */
        input: string;
        name: CustomToolCallName;
      }
      export type Item =
        | ReasoningItem
        | MessageItem
        | FileSearchItem
        | WebSearchItem
        | CustomToolCallItem;
      export interface EventTypes {
        sequence_number: number;
        type: "response.output_item.done";
        item: Item;
        output_index: number;
      }
    }
  }
  export namespace ContentPart {
    export interface OutputText {
      type: "output_text";
      text: string;
      logprobs: number[] | never[];
      annotations: OutputText.UrlCitation[] | never[];
    }
    export interface Added {
      sequence_number: number;
      type: "response.content_part.added";
      content_index: number;
      item_id: string;
      output_index: number;
      part: Part.Added;
    }
    export namespace Part {
      export interface Added {
        type: "output_text";
        text: string;
        logprobs: never[];
        annotations: never[];
      }
      export interface Done {
        type: "output_text";
        text: string;
        logprobs: number[] | never[];
        annotations: OutputText.UrlCitation[] | never[];
      }
    }
    export interface Done {
      sequence_number: number;
      type: "response.content_part.added";
      content_index: number;
      item_id: string;
      output_index: number;
      part: Part.Done;
    }
  }
  export namespace OutputText {
    export interface UrlCitationWithSpecificity {
      type: "url_citation";
      url: string;
      start_index: number;
      end_index: number;
      title: string;
    }
    export interface UrlCitationSansSpecificity {
      type: "url_citation";
      url: string;
    }
    export type UrlCitation =
      | UrlCitationSansSpecificity
      | UrlCitationWithSpecificity;
    export interface AnnotationAdded {
      sequence_number: number;
      type: "response.output_text.annotation.added";
      annotation: UrlCitationSansSpecificity | UrlCitationWithSpecificity;
      annotation_index: number;
      content_index: number;
      item_id: string;
      output_index: number;
    }
    export interface Delta {
      sequence_number: number;
      type: "response.output_text.delta";
      content_index: number;
      delta: string;
      item_id: string;
      output_index: number;
      logprobs: never[] | LogProbsFields[];
    }
    export interface Done {
      sequence_number: number;
      type: "response.output_text.done";
      content_index: number;
      item_id: string;
      output_index: number;
      text: string;
    }
  }
  export interface ResponseInitType<
    V extends "created" | "in_progress" | "completed"
  > {
    sequence_number: number;
    type: `response.${V}`;
    response: {
      id: string;
      object: "response";
      created_at: number;
      model: GrokModelIdUnion;
      status: V extends "completed" ? V : "in_progress";
      output: V extends "completed"
        ? xAIResponses.OutputItem.Done.Item[]
        : never[];
      max_output_tokens: number | null;
      parallel_tool_calls: boolean;
      previous_response_id: string | null;
      reasoning: InputReasoningProps;
      temperature: number | null;
      text: TextFormat;
      tool_choice: ToolChoiceUnion;
      tools?: ToolRequestInput;
      top_p: number | null;
      user: string | null;
      incomplete_details: object | null;
      store: boolean;
      metadata: Record<string, never>;
      usage?: Usage;
      logprobs: never[] | LogProbsFields[];
    };
  }
}
