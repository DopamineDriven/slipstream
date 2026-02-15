import type { Include } from "@/types/index.ts";

export namespace Voyage {
  export type EndpointUnion =
    | "embeddings"
    | "contextualizedembeddings"
    | "multimodalembeddings"
    | "rerank"
    | "files"
    | "batches";

  /**
   * default to 1024
   */
  export type EmbeddingDims = 256 | 512 | 1024 |2048;
  export type PromiseConditional<T> = Promise<T> | PromiseLike<T>;
  export namespace PyBuiltIns {
    export type Exec = <const V = unknown>(
      script: string,
      globals: object
    ) => Promise<V>;
    export type BuiltIns = Promise<{
      tokenize_result: Promise<Tokenize.PyReturnedJson>;
      raw_usage: Promise<CountUsage.Result>;
      count_usage_result: Promise<string>;
    }>;
  }
  export interface PyBuiltIns {
    exec: PromiseConditional<PyBuiltIns.Exec>;
    globals: Promise<() => PyBuiltIns.BuiltIns>;
  }
  export type ModelUnion =
    | "rerank-1"
    | "rerank-2"
    | "rerank-2.5"
    | "rerank-2-lite"
    | "rerank-2.5-lite"
    | "rerank-lite-1"
    | "voyage-01"
    | "voyage-02"
    | "voyage-2"
    | "voyage-3"
    | "voyage-3-large"
    | "voyage-3-lite"
    | "voyage-3.5"
    | "voyage-3.5-lite"
    | "voyage-4-large"
    | "voyage-4"
    | "voyage-4-lite"
    | "voyage-code-2"
    | "voyage-code-3"
    | "voyage-context-3"
    | "voyage-finance-2"
    | "voyage-large-2"
    | "voyage-large-2-instruct"
    | "voyage-law-2"
    | "voyage-lite-01"
    | "voyage-lite-01-instruct"
    | "voyage-lite-02-instruct"
    | "voyage-multilingual-2"
    | "voyage-multimodal-3.5"
    | "voyage-multimodal-3";

  export namespace Tokenize {
    export interface Result {
      counts: number[];
      total: number;
      model: ModelUnion;
    }

    export type PyReturnedJson = string;

    export interface Error {
      error: string;
    }

    export type Response = Result | Error;
  }

  export namespace CountUsage {
    export interface InputUsage {
      text_tokens: number;
      image_pixels: number;
      video_pixels: number;
      total_tokens: number;
    }

    export interface Result {
      usages: InputUsage[];
      model: Multimodal.Model;
    }

    export interface Error {
      error: string;
    }

    export type Response = Result | Error;
  }

  /**
   * for status code 4xx errors
   */
  export interface ErrorResponse {
    detail: string;
  }

  export namespace Embeddings {
    export type Model = Exclude<
      ModelUnion,
      Contextual.Model | Multimodal.Model
    >;
    export type DynamicModel = Include<
      Model,
      | "voyage-code-3"
      | "voyage-3"
      | "voyage-3.5"
      | "voyage-3-large"
      | "voyage-3.5-lite"
      | "voyage-4-large"
      | "voyage-4-lite"
      | "voyage-4"
    >;
    export interface Usage {
      total_tokens: number;
    }
    export namespace List {
      export interface Embedding {
        object: "embedding";
        embedding: number[];
        index: number;
      }
    }
    export interface List<T extends Model = "voyage-4-large"> {
      object: "list";
      data: readonly List.Embedding[];
      model: T;
      usage: Usage;
    }
    export namespace Output {
      export type EncodingFormat = "base64" | null;
      export type DType = "float" | "int8" | "uint8" | "binary" | "ubinary";
      export type Dimension<T extends Model = "voyage-4-large"> =
        T extends DynamicModel ? 256 | 512 | 1024 | 2048 | null : null;
      export interface Success<T extends Model = "voyage-4-large"> {
        response: List<T>;
        success: true;
      }
      export interface Error {
        response: ErrorResponse;
        success: false;
      }
    }
    export interface Input<T extends Model = "voyage-4-large"> {
      inputs: readonly string[];
      input_type: InputType;
      model: T;
      output_dimension?: Output.Dimension<T>;
      output_dtype?: Output.DType;
      encoding_format?: Output.EncodingFormat;
    }
    export type Output<T extends Model = "voyage-4-large"> =
      | Output.Success<T>["response"]
      | Output.Error["response"];
  }

  export interface Embeddings<T extends Embeddings.Model = "voyage-4-large"> {
    input: Embeddings.Input<T>;
    output: Embeddings.Output<T>;
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
      | Output.Success<T>["response"]
      | Output.Error["response"];

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
    export type Output = Output.Error["response"] | Output.Success["response"];
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

  export namespace Batch {
    export type Endpoints =
      | "v1/contextualizedembeddings"
      | "v1/rerank"
      | "v1/embeddings";
    export namespace Input {
      export type Inputs<T extends Endpoints = "v1/contextualizedembeddings"> =
        T extends "v1/embeddings"
          ? {}
          : T extends "v1/rerank"
            ? {}
            : Contextual.Input<"document">["inputs"];
      export interface Body<
        T extends Endpoints = "v1/contextualizedembeddings"
      > {
        inputs: T extends "v1/embeddings"
          ? Embeddings.Input<Embeddings.Model>["inputs"]
          : T extends "v1/rerank"
            ? {}
            : Contextual.Input<"document">["inputs"];
      }
    }
  }
}
