import type { GrokModelIdUnion, XOR } from "@slipstream/types";

export type ResponsesRole = "user" | "assistant" | "developer" | "system";

/**
 * for x_search, from_date and to_date *must* be in ISO8601 format, e.g., "YYYY-MM-DD" if included
 */
export type ToolUnion =
  | {
      type: "web_search";
      filters?: XOR<
        { allowed_domains?: string[]; enable_image_understanding?: boolean },
        { excluded_doamins?: string[]; enable_image_understanding?: boolean }
      >;
    }
  | {
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
    }
  | {
      type: "file_search";
      vector_store_ids: string[];
      max_num_results?: number;
    }
  | { type: "code_interpreter" };

export type ResponsesContentWorkup = {
  input: {
    role: ResponsesRole;
    content:
      | string
      | (
          | {
              type: "input_image";
              image_url: string;
              /**
               * defaults to auto
               */
              detail: "low" | "auto" | "high" | null;
            }
          | { type: "input_text"; text: string }
          /**
           * only text-based files supported
           */
          | { type: "input_file"; file_id: string }
        )[];
  }[];
  /**
   * defaults to false.
   */
  logprobs?: boolean | null;
  max_output_tokens?: null | number;
  model: GrokModelIdUnion;
  /**
   * An alternate way to specify the system prompt. Note that this cannot be used alongside `previous_response_id`, where the system prompt of the previous message will be used.
   */
  instructions?: string | null;
  parallel_tool_calls?: boolean | null;
  previous_response_id?: string | null;
  /**
   * only grok-3-mini supports this field...so it's essentially pointless to even worry about.
   */
  reasoning?: {
    effort: "high" | "medium" | "low" | null;
    /**
     * A summary of the model's reasoning process. Possible values are auto, concise and detailed. Only included for compatibility. The model shall always return detailed.
     */
    summary: "auto" | "concise" | "detailed" | null;
  };
  /**
   * defaults to true
   **/
  store?: boolean | null;
  stream: boolean | null;
  /**
   * min: 0, default: 1, max: 2
   */
  temperature?: number | null;
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
  tool_choice?:
    | "none"
    | "auto"
    | "required"
    | { function: { name: string }; type: "function" }
    | null;
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
