export namespace Voyage {
  /**
   * for status code 4xx errors
   */
  export interface ErrorResponse {
    detail: string;
  }
  export type InputType = "document" | "query";
  export namespace Contextual {
    export namespace List {
      export namespace List {
        /**
         * always an index of 0 when InputType = "query"
         */
        export type Index<T extends InputType = "document"> = T extends "query"
          ? 0
          : number;
        export interface Embedding<T extends InputType = "document"> {
          object: "embedding";
          embedding: number[];
          index: Index<T>;
        }
        export type Data<T extends InputType = "document"> = T extends "query"
          ? readonly [Embedding<T>]
          : readonly Embedding<T>[];
      }
      export interface List<T extends InputType = "document"> {
        object: "list";
        data: List.Data<T>;
        index: number;
      }
    }
    export interface List<T extends InputType = "document"> {
      object: "list";
      data: List.List<T>[];
      model: Model;
      usage: Usage;
    }
    export namespace Input {
      export type Inputs<T extends InputType = "document"> = T extends "query"
        ? readonly (readonly [string])[]
        : readonly (readonly string[])[];
    }
    export interface Input<T extends InputType = "document"> {
      inputs: Input.Inputs<T>;
      input_type: T;
      model: Model;
      output_dimension?: Output.Dimension;
      output_dtype?: Output.DType;
      encoding_format?: Output.EncodingFormat;
    }
    export namespace Output {
      export type EncodingFormat = "base64" | null;
      export type DType = "float" | "int8" | "uint8" | "binary" | "ubinary";
      export type Dimension = 256 | 512 | 1024 | 2048 | null;
      export interface Success<T extends InputType = "document"> {
        response: List<T>;
        success: true;
      }
      export interface Error {
        response: ErrorResponse;
        success: false;
      }
    }
    export type Output<T extends InputType = "document"> =
      | Output.Success<T>
      | Output.Error;

    export type Model = "voyage-context-3";

    export interface Usage {
      total_tokens: number;
    }
  }
  export interface Contextual<T extends InputType = "document"> {
    input: Contextual.Input<T>;
    output: Contextual.Output<T>;
  }

  export namespace Multimodal {
    export namespace List {
      export interface Embedding {
        object: "embedding";
        embedding: number[];
        index: number;
      }
    }
    export interface List {
      object: "list";
      data: readonly List.Embedding[];
      model: Model;
      usage: Usage;
    }

    export type OutputEncoding = "base64" | null;
    export type Model = "voyage-multimodal-3" | "voyage-multimodal-3.5";

    export namespace Input {
      export type Type = "query" | "document";
      export type ContentUnion = "url" | "base64";
      export interface Text {
        type: "text";
        text: string;
      }
      /**
       * png, webp, gif, and jpeg only
       */
      export interface ImageUrl {
        type: "image_url";
        image_url: string;
      }
      /**
       * mp4 only
       */
      export interface VideoUrl {
        type: "video_url";
        video_url: string;
      }
      /**
       * data:[<mediatype>];base64,<data>
       */
      export interface ImageBase64 {
        type: "image_base64";
        image_base64: string;
      }
      /**
       * data:[<mediatype>];base64,<data>
       */
      export interface VideoBase64 {
        type: "video_base64";
        video_base64: string;
      }

      export type Content<T extends ContentUnion> = T extends "url"
        ? ImageUrl | VideoUrl
        : ImageBase64 | VideoBase64;

      export interface Contents<T extends ContentUnion> {
        content: readonly (Content<T> | Text)[];
      }
    }

    export namespace Output {
      export type Encoding = "base64" | null;

      export interface Success {
        response: List;
        success: true;
      }
      export interface Error {
        response: ErrorResponse;
        success: false;
      }
    }
    export type Output = Output.Error | Output.Success;
    /**
     * Note: Only one of the keys, base64 or url, should be present in each dictionary for image and video data.
     * Consistency is required within a request, meaning each request should use either image_base64/video_base64 or image_url/video_url exclusively, not both.
     */
    export interface Input<T extends Input.ContentUnion> {
      inputs: readonly [Input.Contents<T>] | readonly Input.Contents<T>[];
      model: Model;
      input_type?: InputType;
      truncation?: boolean;
      output_encoding?: Output.Encoding;
    }

    export interface Usage {
      text_tokens: number;
      image_pixels: number;
      video_pixels: number;
      total_tokens: number;
    }
  }
  export interface Multimodal<T extends Multimodal.Input.ContentUnion> {
    input: Multimodal.Input<T>;
    output: Multimodal.Output;
  }
}
