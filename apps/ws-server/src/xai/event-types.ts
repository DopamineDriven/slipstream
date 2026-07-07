import type {
  InputReasoningProps,
  TextFormat,
  ToolChoiceUnion,
  ToolRequestInput
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
  export namespace FunctionCallArguments {
    export interface Delta {
      sequence_number: number;
      type: "response.function_call_arguments.delta";
      /**
       * contains stringified JSON for parsing
       */
      delta: string;
      /**
       * item_id starts with `fc_`
       */
      item_id: string;
      output_index: number;
    }
    export interface Done {
      sequence_number: number;
      type: "response.function_call_arguments.done";
      /**
       * contains stringified JSON for parsing
       */
      arguments: string;
      /**
       * item_id starts with `fc_`
       */
      item_id: string;
      output_index: number;
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
      export interface FunctionCall {
        /**
         * alway an empty `""` -- populated in a `"response.function_call_arguments.delta"` event
         * immediately after this event
         */
        arguments: string;
        call_id: string;
        name:
          | "slather_user_store"
          | "conversation_memory_search"
          | "conversation_memory_get_chunk"
          | "tool_catalog"
          | (string & {});
        type: "function_call";
        /**
         * id starts with `fc_`
         */
        id: string;
        status: "in_progress";
      }
      export interface Reasoning {
        /**
         * id starts with `rs_`
         */
        id: string;
        summary: [];
        type: "reasoning";
        status: "in_progress";
      }
      export interface Message {
        type: "message";
        status: "in_progress";
        content: [];
        /**
         * id starts with `msg_`
         */
        id: string;
        role: "assistant";
      }
      export interface FileSearchCall {
        /**
         * id starts with `fs_`
         */
        id: string;
        type: "file_search_call";
        status: "in_progress";
        queries: [];
        results: [];
      }

      export namespace WebSearchCall {
        export namespace Action {
          export interface Search {
            type: "search";
            query: string;
            sources: [];
          }
        }
        export interface Action extends Action.Search {}
      }
      export interface WebSearchCall {
        /**
         * id starts with `ws_`
         */
        id: string;
        type: "web_search_call";
        status: "in_progress";
        action: WebSearchCall.Action;
      }
      export namespace CustomToolCall {
        export type Name =
          | "x_keyword_search"
          | "x_semantic_search"
          | "search_pdf_attachment"
          | "read_attachment"
          | "x_user_search"
          | (string & {});
      }
      export interface CustomToolCall {
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
        name: CustomToolCall.Name;
      }
    }
    export interface Added {
      sequence_number: number;
      type: "response.output_item.added";
      item:
        | Added.Reasoning
        | Added.Message
        | Added.FileSearchCall
        | Added.WebSearchCall
        | Added.CustomToolCall
        | Added.FunctionCall;
      output_index: number;
    }
    export namespace Done {
      export interface FunctionCall {
        /**
         * contains stringified JSON for parsing
         */
        arguments: string;
        call_id: string;
        name:
          | "slather_user_store"
          | "conversation_memory_search"
          | "conversation_memory_get_chunk"
          | "tool_catalog"
          | (string & {});
        type: "function_call";
        /**
         * id starts with `fc_`
         */
        id: string;
        status: "completed";
      }
      export namespace Reasoning {
        export interface SummaryText {
          text: string;
          type: "summary_text";
        }
      }
      export interface Reasoning {
        id: string;
        type: "reasoning";
        status: "completed";
        encrypted_content: string;
        summary: Reasoning.SummaryText[] | never[];
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
      export interface Message {
        type: "message";
        status: "completed";
        content: ContentPart.Done.OutputText[];
        id: string;
        role: "assistant";
      }
      export namespace FileSearchCall {
        export interface Results {
          file_id: string;
          filename: string;
          score: number;
          text: string;
        }
      }
      export interface FileSearchCall {
        id: string;
        type: "file_search_call";
        status: "completed";
        queries: string[];
        results?: FileSearchCall.Results[];
      }
      export namespace WebSearchCall {
        export interface Action {
          type: "search";
          query: string;
          sources: never[] | unknown[];
        }
      }
      export interface WebSearchCall {
        id: string;
        type: "web_search_call";
        status: "completed" | "failed";
        action: WebSearchCall.Action;
      }
      export namespace CustomToolCall {
        export type Name =
          | "x_keyword_search"
          | "x_semantic_search"
          | "search_pdf_attachment"
          | "read_attachment"
          | "x_user_search"
          | (string & {});
      }
      export interface CustomToolCall {
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
        name: CustomToolCall.Name;
      }
    }
    export interface Done {
      sequence_number: number;
      type: "response.output_item.done";
      item:
        | Done.Reasoning
        | Done.Message
        | Done.FileSearchCall
        | Done.WebSearchCall
        | Done.CustomToolCall
        | Done.FunctionCall;
      output_index: number;
    }
  }
  export namespace ContentPart {
    export interface Added {
      sequence_number: number;
      type: "response.content_part.added";
      content_index: number;
      item_id: string;
      output_index: number;
      part: Added.OutputText;
    }
    export namespace Added {
      export interface OutputText {
        type: "output_text";
        text: string;
        logprobs: never[];
        annotations: never[];
      }
    }
    export namespace Done {
      export interface OutputText {
        type: "output_text";
        text: string;
        logprobs: number[] | never[];
        annotations: OutputText.Annotation.Added["annotation"][] | never[];
      }
    }
    export interface Done {
      sequence_number: number;
      type: "response.content_part.done";
      content_index: number;
      item_id: string;
      output_index: number;
      part: Done.OutputText;
    }
  }
  export namespace OutputText {
    export namespace Annotation {
      export namespace Added {
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
      }
      export interface Added {
        sequence_number: number;
        type: "response.output_text.annotation.added";
        annotation:
          Added.UrlCitationSansSpecificity | Added.UrlCitationWithSpecificity;
        annotation_index: number;
        content_index: number;
        item_id: string;
        output_index: number;
      }
    }
    export interface Annotation extends Annotation.Added {}
    export interface Delta {
      sequence_number: number;
      type: "response.output_text.delta";
      content_index: number;
      delta: string;
      item_id: string;
      output_index: number;
      logprobs: never[] | LogProbs[];
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
      output: V extends "completed" ? OutputItem.Done["item"][] : never[];
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
      logprobs: never[] | LogProbs[];
    };
  }
  export namespace LogProbs {
    export interface Fields {
      token: string;
      logprob: number;
      bytes: number[];
      top_logprobs: never[];
    }
  }
  export interface LogProbs extends LogProbs.Fields {}
  export namespace Usage {
    export namespace InputTokens {
      export interface Details {
        cached_tokens: number;
      }
    }
    export interface InputTokens extends InputTokens.Details {}
    export namespace OutputTokens {
      export interface Details {
        reasoning_tokens: number;
      }
    }
    export interface OutputTokens extends OutputTokens.Details {}
    export namespace ServerSideToolUsage {
      export interface Details {
        web_search_calls: number;
        x_search_calls: number;
        code_interpreter_calls: number;
        file_search_calls: number;
        mcp_calls: number;
        document_search_calls: number;
      }
    }
    export interface ServerSideToolUsage extends ServerSideToolUsage.Details {}
  }
  export interface Usage {
    input_tokens: number;
    input_tokens_details: Usage.InputTokens;
    output_tokens: number;
    output_tokens_details: Usage.OutputTokens;
    total_tokens: number;
    num_sources_used: number;
    num_server_side_tools_used?: number;
    server_side_tool_usage_details?: Usage.ServerSideToolUsage;
  }
}
