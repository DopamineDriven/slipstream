import type { Voyage } from "@/voyage/types.ts";
import type { Python } from "pythonia";

export class VoyageEmbeddingService {
  #python: Promise<Python>;
  private baseUrl = "https://api.voyageai.com/v1/" as const;
  constructor(private readonly apiKey: string) {
    this.#python = import("pythonia").then(t => t.python);
  }

  private targetUrl<
    const T extends Voyage.EndpointUnion = "contextualizedembeddings"
  >(target: T) {
    return `${this.baseUrl}${target}` as const;
  }

  private async fetcher<
    const T extends Voyage.EndpointUnion = "contextualizedembeddings"
  >(target: T, opts?: RequestInit) {
    const method = opts?.method ?? "POST";
    return await fetch(this.targetUrl(target), {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...opts?.headers
      },
      ...opts
    });
  }
  public async embedChunksText<
    const T extends Voyage.Embeddings.Model = "voyage-4-large"
  >({
    input_type = "document",
    inputs,
    model,
    encoding_format = null,
    output_dimension = null,
    output_dtype = "float"
  }: Voyage.Embeddings.Input<T>) {
    const res = await this.fetcher("embeddings", {
      body: JSON.stringify({
        inputs,
        encoding_format,
        input_type,
        output_dimension,
        output_dtype,
        model
      })
    });
    if (res.status < 500) {
      const resp = await res.json<Voyage.Embeddings.Output<T>>();
      console.log(resp);
      if (this.isError(resp)) {
        throw new Error(
          `error in voyage text embedding post: [code]: ${res.status}; [text]: ${resp.detail}`
        );
      } else {
        return resp;
      }
    } else {
      throw new Error(
        `something went wrong with the text embeddings voyage method: [code]: ${res.status} [text]: ${res.statusText}`
      );
    }
  }

  public async embedChunksContextual<const T extends Voyage.InputType>({
    inputs,
    input_type,
    model = "voyage-context-4",
    encoding_format = null,
    output_dimension = 1024,
    output_dtype = "float"
  }: Voyage.Contextual.Input<T>) {
    const res = await this.fetcher("contextualizedembeddings", {
      body: JSON.stringify({
        inputs,
        encoding_format,
        input_type,
        output_dimension,
        output_dtype,
        model
      })
    });
    if (res.status < 500) {
      const resp = await res.json<Voyage.Contextual.Output<T>>();
      if (this.isError(resp)) {
        throw new Error(
          `error in voyage contextual embedding post: [code]: ${res.status}; [text]: ${resp.detail}`
        );
      } else {
        return resp;
      }
    } else {
      throw new Error(
        `something went wrong with the embedChunksContextual method: [code]: ${res.status} [text]: ${res.statusText}`
      );
    }
  }

  public async embedChunksMultimodal<
    const T extends Voyage.Multimodal.Input.ContentUnion
  >(
    type: T,
    {
      input_type = "document",
      inputs,
      model = "voyage-multimodal-3.5",
      output_encoding = null,
      truncation = true
    }: Voyage.Multimodal.Input<typeof type>
  ) {
    const res = await this.fetcher("multimodalembeddings", {
      body: JSON.stringify({
        inputs,
        input_type,
        output_encoding,
        truncation,
        model
      })
    });
    if (res.status < 500) {
      const resp = await res.json<Voyage.Multimodal.Output>();
      if (this.isError(resp)) {
        throw new Error(
          `error in voyage multimodal post: [code]: ${res.status}; [text]: ${resp.detail}`
        );
      } else {
        return resp;
      }
    } else {
      throw new Error(
        `something went wrong with the embedChunksMultimodal method: [code]: ${res.status} [text]: ${res.statusText}`
      );
    }
  }

  private isError(
    response:
      | Voyage.Contextual.Output<Voyage.InputType>
      | Voyage.Embeddings.Output<Voyage.Embeddings.Model>
      | Voyage.Multimodal.Output
  ) {
    return "detail" in response;
  }

  private isTokenizeError(response: Voyage.Tokenize.Response) {
    return "error" in response;
  }

  /**meh, not great, not awful, but definitely not great */
  public async tokenApproximation(text: string, normalize: 1.05 | 1.1 = 1.05) {
    const { encoding_for_model } = await import("tiktoken");
    const encoding = encoding_for_model("gpt-5");
    return encoding.encode(text, "all").length * normalize;
  }

  public async countTokens(
    texts: readonly string[],
    model: Voyage.ModelUnion = "voyage-context-4"
  ) {
    const script = this.pyTokenizeScript(texts, model, this.apiKey);

    try {
      const python = await this.#python;
      const builtins = await python<Voyage.PyBuiltIns>("builtins");
      const execFunc = await builtins.exec;
      const globalsFunc = await builtins.globals;
      const globalDict = await globalsFunc();

      await execFunc(script, globalDict);

      const result = await globalDict.tokenize_result;
      const parsed = JSON.parse<Voyage.Tokenize.Response>(result);
      if (!parsed) {
        throw new Error("Voyage tokenize returned null (Python bridge)");
      }

      if (this.isTokenizeError(parsed)) {
        throw new Error(`Voyage tokenize error: ${parsed.error}`);
      }

      return parsed;
    } catch (err) {
      console.error("VoyageTokenizerBridge error:", err);
      throw err;
    }
  }

  // TODO
  // ADD VIDEO COVERAGE HERE ONCE USERSTORE IS FULLY UP AND RUNNING FOR IMAGES/PDFS
  /**
   * Exact multimodal token counts via Voyage Python SDK's `count_usage`.
   * Images are passed as file paths — Python reads them via PIL.Image.open(path).
   * Uses the `[[str, PIL.Image, PIL.Video, str, ...]]` list-of-lists format.
   */
  public async countUsageFromPaths(
    inputs: readonly (readonly ({ t: string } | { f: string })[])[],
    model: Voyage.Multimodal.Model = "voyage-multimodal-3.5"
  ) {
    const script = this.pyCountUsageFromPathsScript(inputs, model, this.apiKey);
    const python = await this.#python;

    try {
      const builtins = await python<Voyage.PyBuiltIns>("builtins");
      const execFunc = await builtins.exec;
      const globalsFunc = await builtins.globals;
      const globalDict = await globalsFunc();

      await execFunc(script, globalDict);

      const result = await globalDict.count_usage_result;

      if (!result) {
        throw new Error("Voyage count_usage returned null (Python bridge)");
      }
      const parseIt = JSON.parse<{
        text_tokens: number;
        image_pixels: number;
        video_pixels: number;
        total_tokens: number;
        model: string;
      }>(result);
      if ("error" in parseIt) {
        throw new Error(`Voyage count_usage error`);
      }
      return parseIt;
    } catch (err) {
      console.error("VoyageCountUsageFromPathsBridge error:", err);
      throw err;
    }
  }

  private pyCountUsageFromPathsScript(
    inputs: readonly (readonly ({ t: string } | { f: string })[])[],
    model: Voyage.Multimodal.Model = "voyage-multimodal-3.5",
    apiKey = this.apiKey
  ) {
    const serialized = inputs.map(input =>
      input.map(item => {
        if ("t" in item) {
          return {
            t: item.t
              .replace(/\0/g, "")
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"')
              .replace(/\n/g, "\\n")
              .replace(/\r/g, "\\r")
          };
        }
        return { f: item.f.replace(/\\/g, "\\\\") };
      })
    );

    const inputsJson = JSON.stringify(serialized);

    // prettier-ignore
    return `import voyageai, json
from PIL import Image

def main():
    try:
        vo = voyageai.Client(api_key="${apiKey}")

        raw_inputs = json.loads('${inputsJson.replace(/'/g, "\\'")}')
        model = "${model}"

        inputs = []
        for raw_input in raw_inputs:
            sequence = []
            for item in raw_input:
                if "t" in item:
                    sequence.append(item["t"])
                elif "f" in item:
                    img = Image.open(item["f"])
                    sequence.append(img)
            inputs.append(sequence)

        raw_usage = vo.count_usage(inputs, model=model)

        return_dict = {
            "text_tokens": raw_usage["text_tokens"],
            "image_pixels": raw_usage["image_pixels"],
            "video_pixels": raw_usage["video_pixels"],
            "total_tokens": raw_usage["total_tokens"],
            "model": model
        }
        return json.dumps(return_dict)
    except Exception as e:
        return {"error": str(e)}

count_usage_result = main()
  `;
  }

  private pyTokenizeScript(
    texts: readonly string[],
    model: Voyage.ModelUnion = "voyage-context-4",
    apiKey = this.apiKey
  ) {
    // Escape texts for Python string literals
    const escapedTexts = texts.map(t =>
      t
        .replace(/\0/g, "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
    );

    const textsArrayLiteral = `[${escapedTexts.map(t => `"${t}"`).join(", ")}]`;
    // prettier-ignore
    return `import voyageai, json

def main():
    try:
        vo = voyageai.Client(api_key="${apiKey}")

        texts = ${textsArrayLiteral}
        model = "${model}"

        tokenized = vo.tokenize(texts, model=model)

        counts=[len(t.tokens) for t in tokenized]
        return_dict = {
            "counts": counts,
            "total": sum(counts),
            "model": model
        }
        return json.dumps(return_dict)
    except Exception as e:
        return {"error": str(e)}

tokenize_result = main()
  `;
  }

  /**
   * @internal
   * WARNING: ONLY USE FOR PROGRAMMATICALLY EXITING SCRIPTS THAT INVOKE PYTHONIA
   * DO NOT CALL FOR RUNTIME CODE
   */
  public async exitPython() {
    const python = await this.#python;
    python.exit();
  }
}
