import type { GrokProviderChatRequestEntity } from "@/xai/types.ts";
import { xAIResponses } from "@/xai/event-types.ts";
import type { GrokModelIdUnion, MessageSingleton, XOR } from "@slipstream/types";

export type ResponsesRole = "user" | "assistant" | "developer" | "system";

/**
 * `from_date` and `to_date` *must* be in ISO8601 format, e.g., "YYYY-MM-DD" if included
 */
export type XSearchTool = {
  type: "x_search";
  filters?: XOR<
    {
      allowed_x_handles?: string[];
      enable_image_understanding?: boolean;
      enable_video_understanding?: boolean;
      from_date?: string;
      to_date?: string;
    },
    {
      excluded_x_handles?: string[];
      enable_image_understanding?: boolean;
      enable_video_understanding?: boolean;
      from_date?: string;
      to_date?: string;
    }
  >;
};

export type WebSearchTool = {
  type: "web_search";
  filters?: XOR<
    { allowed_domains?: string[]; enable_image_understanding?: boolean },
    { excluded_domains?: string[]; enable_image_understanding?: boolean }
  >;
};

export type FileSearchTool = {
  type: "file_search";
  vector_store_ids: string[];
  max_num_results?: number;
};

export type CodeInterpreterTool = { type: "code_interpreter" };

export type ToolUnion =
  | WebSearchTool
  | XSearchTool
  | FileSearchTool
  | CodeInterpreterTool;

/**
 * Controls which (if any) tool is called by the model
 *
 * `none` means the model will not call any tool and instead generates a message.
 *
 * `auto` means the model can pick between generating a message or calling one or more tools.
 *
 * `required` means the model must call one or more tools.
 *
 * Specifying a particular tool via `{"type": "function", "function": {"name": "my_function"}}` forces the model to call that tool.
 *
 * `none` is the default when no tools are present.
 *
 * `auto` is the default if tools are present.
 */
export type ToolChoiceUnion =
  | "none"
  | "auto"
  | "required"
  | { function: { name: string }; type: "function" }
  | null;

export type ImageContentBlock = {
  type: "input_image";
  image_url: string;
  /**
   * defaults to auto
   */
  detail: "low" | "auto" | "high" | null;
};

export type TextContentBlock = {
  type: "input_text";
  text: string;
};
/**
 * only text-based files supported
 */
export type FileContentBlock = { type: "input_file"; file_id: string };

export type ContentBlockUnion =
  | ImageContentBlock
  | TextContentBlock
  | FileContentBlock;

/**
 * only grok-3-mini supports the effort field...so it's essentially pointless to even worry about.
 */
export type InputReasoningProps = {
  effort: "high" | "medium" | "low" | null;
  /**
   * A summary of the model's reasoning process. Possible values are auto, concise and detailed. Only included for compatibility. The model shall always return detailed.
   */
  summary: "auto" | "concise" | "detailed" | null;
};

export type TextFormat = {
  format: { type: "text" | "json_object" | "json_schema" };
};

export type ResponsesContentInputSingleton = {
  role: ResponsesRole;
  content: string | ContentBlockUnion[];
};

export type ResponsesComprehensive =
  | ResponsesContentInputSingleton
  | xAIResponses.OutputItem.Done["item"];

export type ResponsesContentWorkup = {
  input: ResponsesComprehensive[];
  /**
   * defaults to false.
   */
  logprobs?: boolean | null;
  max_output_tokens?: null | number;
  model: GrokModelIdUnion;
  include: ["reasoning.encrypted_content"] | null; // "reasoning.encrypted_content"
  /**
   * An alternate way to specify the system prompt. Note that this cannot be used alongside `previous_response_id`, where the system prompt of the previous message will be used.
   */
  instructions?: string | null;
  parallel_tool_calls?: boolean | null;
  previous_response_id?: string | null;
  reasoning?: InputReasoningProps;
  /**
   * defaults to true
   **/
  store?: boolean | null;
  stream: boolean | null;
  text?: TextFormat;
  /**
   * min: 0, default: 1, max: 2
   */
  temperature?: number | null;
  tool_choice?: ToolChoiceUnion;
  tools?: ToolUnion[] | null;
  /**
   * An integer between 0 and 8 specifying the number of most likely tokens to return at each token position, each with an associated log probability. logprobs must be set to true if this parameter is used.
   */
  top_logprobs?: number | null;
  /**
   * default: 1; min(exclusive): 0; max: 1;
   */
  top_p?: number | null;
  /**
   * A unique identifier representing your end-user, which can help xAI to monitor and detect abuse.
   */
  user?: string | null;
};

export type ToolMap<V extends WebSearchTool | XSearchTool> = {
  type: V["type"];
} & V["filters"];

export type ToolRequestInput = (
  | ToolMap<XSearchTool | WebSearchTool>
  | CodeInterpreterTool
  | FileSearchTool
)[];

export type LogProbsFields = {
  token: string;
  logprob: number;
  bytes: number[];
  top_logprobs: never[];
};

export interface Usage {
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

export type CreateResponseStreamInputProps = {
  collectionId?: string;
  tool_choice_input?: ToolChoiceUnion;
  logprobs?: boolean;
  imgDetail?: ImageContentBlock["detail"];
  enableFileSearch?: boolean;
  fileSearchMaxResults?: number;
  enableCodeInterpreter?: boolean;
  enableWebSearch?: boolean;
  enableXSearch?: boolean;
  web_enable_image_understanding?: boolean;
  x_enable_image_understanding?: boolean;
  x_enable_video_understanding?: boolean;
  parallel_tool_calls?: boolean | null;
  previous_response_id?: string | null;
  reasoning?: InputReasoningProps;
  /**
   * defaults to true
   **/
  store?: boolean | null;
  stream?: boolean | null;
  text?: TextFormat;

  /**
   * An integer between 0 and 8 specifying the number of most likely tokens to return at each token position, each with an associated log probability. logprobs must be set to true if this parameter is used.
   */
  top_logprobs?: number | null;
  /**
   * A unique identifier representing your end-user, which can help xAI to monitor and detect abuse.
   */
  user?: string | null;
};

export interface GrokChatReqSubset extends GrokProviderChatRequestEntity {}

export interface CreateResponseStreamProps extends GrokChatReqSubset {
  payload: CreateResponseStreamInputProps;
}

export type SSEEvent<TUnion extends { type: string }> = TUnion extends {
  type: infer K extends string;
}
  ? {
      event: K;
      data: Extract<TUnion, { type: K }>;
    }
  : never;

export type XAIResponsesSSEEvent = SSEEvent<XAIResponsesEvent>;

export type UnionToRecord<
  TUnion extends { type: string },
  TDiscriminant extends string = TUnion["type"]
> = {
  [K in TDiscriminant]: Extract<TUnion, { type: K }>;
};

export type xAIRecord = UnionToRecord<XAIResponsesEvent>;

export type XAIResponsesEventType = keyof xAIRecord;

export type XAIResponsesEvent =
  | xAIResponses.Created
  | xAIResponses.InProgress
  | xAIResponses.Completed
  | xAIResponses.OutputItem.Added
  | xAIResponses.OutputItem.Done
  | xAIResponses.ContentPart.Added
  | xAIResponses.ContentPart.Done
  | xAIResponses.OutputText.Delta
  | xAIResponses.OutputText.Done
  | xAIResponses.OutputText.Annotation
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

export type MapIT = { [P in keyof xAIRecord]: xAIRecord[P] };

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

export interface ResponsesToolsParams {
  collectionId?: string;
  enableFileSearch?: boolean;
  enableWebSearch?: boolean;
  enableXSearch?: boolean;
  enableCodeInterpreter?: boolean;
  fileSearchMaxResults?: number;
  web_enable_image_understanding?: boolean;
  x_enable_image_understanding?: boolean;
  x_enable_video_understanding?: boolean;
}

export interface HandleToolUsageParams extends ResponsesToolsParams {
  model: GrokModelIdUnion;
}

export interface ResponsesApiInputWorkupParams {
  isNewChat: boolean;
  model: GrokModelIdUnion;
  userId: string;
  msgs: MessageSingleton<true>[];
  keyFingerprint: string;
  include?: readonly ["reasoning.encrypted_content"]
  systemPrompt?: string;
  max_output_tokens?: number;
  tool_choice?: ToolChoiceUnion;
  detail?: ImageContentBlock["detail"];
  keyId?: string;
  apiKey?: string;
  managementKey?: string;
  collectionId?: string;
  enableFileSearch?: boolean;
  fileSearchMaxResults?: number;
  enableCodeInterpreter?: boolean;
  enableWebSearch?: boolean;
  enableXSearch?: boolean;
  web_enable_image_understanding?: boolean;
  x_enable_image_understanding?: boolean;
  x_enable_video_understanding?: boolean;
  parallel_tool_calls?: boolean;
}
