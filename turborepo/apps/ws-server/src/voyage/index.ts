import type { Voyage } from "@/voyage/types.ts";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

export class VoyageEmbeddingService {
  private baseUrl = "https://api.voyageai.com/v1/" as const;
  constructor(private readonly apiKey: string) {}

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
    model = "voyage-context-3",
    encoding_format = null,
    output_dimension = 1024,
    output_dtype = "float"
  }: Voyage.Contextual.Input<T>) {
    const res = await fetch(
      "https://api.voyageai.com/v1/contextualizedembeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs,
          encoding_format,
          input_type,
          output_dimension,
          output_dtype,
          model
        })
      }
    );
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

  public isContextualError(
    response: Voyage.Contextual.Output<Voyage.InputType>
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
    model: Voyage.ModelUnion = "voyage-context-3"
  ) {
    const script = this.pyTokenizeScript(texts, model, this.apiKey);

    try {
      const { python } = await import("pythonia");
      const builtins = await python<Voyage.PyBuiltIns>("builtins");
      const execFunc = await builtins.exec;
      const globalsFunc = await builtins.globals;
      const globalDict = await globalsFunc();

      await execFunc(script, globalDict);

      const result = await globalDict.tokenize_result;

      if (!result) {
        throw new Error("Voyage tokenize returned null (Python bridge)");
      }

      if (this.isTokenizeError(result)) {
        throw new Error(`Voyage tokenize error: ${result.error}`);
      }

      return result;
    } catch (err) {
      console.error("VoyageTokenizerBridge error:", err);
      throw err;
    }
  }

  async countTokensSingle(
    text: string,
    model: Voyage.ModelUnion = "voyage-context-3"
  ) {
    const result = await this.countTokens([text], model);
    return result;
  }

  private pyTokenizeScript(
    texts: readonly string[],
    model: Voyage.ModelUnion = "voyage-context-3",
    apiKey = this.apiKey
  ) {
    // Escape texts for Python string literals
    const escapedTexts = texts.map(t =>
      t
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
    );

    const textsArrayLiteral = `[${escapedTexts.map(t => `"${t}"`).join(", ")}]`;
    // prettier-ignore
    return `import voyageai

def main():
    try:
        vo = voyageai.AsyncClient(api_key="${apiKey}")

        texts = ${textsArrayLiteral}
        model = "${model}"

        tokenized = vo.tokenize(texts, model=model)

        counts=[len(t.tokens) for t in tokenized]

        return {
            "counts": counts,
            "total": sum(counts),
            "model": model
        }
    except Exception as e:
        return {"error": str(e)}

tokenize_result = main()
  `;
  }
}

// if (process.argv[3] === "exe") {
//   const fs = new Fs(process.cwd());
//   const apiKey = process.env.VOYAGE_API_KEY ?? "";
//   const voyage = new VoyageEmbeddingService(apiKey);
//   (async () => {
//     const paths = [
//       "src/test/__out__/condensed/Geminastics-Pt-I.md",
//       "src/test/__out__/condensed/Geminastics-Pt-II.md",
//       "src/test/__out__/condensed/Geminastics-Pt-III.md"
//     ] as const;
//     const docArr = Array.of<readonly string[]>();
//     const anotherOne = Array.of<string>();
//     for (const p of paths.entries()) {
//       const content = fs.fileToBuffer(p[1]).toString("utf-8");
//       if (p[0] === 0) docArr.push([content]);
//       else if (p[0] === 1) anotherOne.push(content);
//       else if (p[0] === 2) anotherOne.push(content);
//       else continue;
//     }

//     docArr.push(anotherOne);
//     return await voyage.embedChunksContextual({
//       inputs: docArr,
//       input_type: "document",
//       model: "voyage-context-3"
//     });
//   })()
//     .then(r => {
//       const toJson = JSON.stringify(r);
//       console.log(r.usage);
//       fs.withWs(
//         "src/test/__out__/voyage/contextualized/testing-4.json",
//         toJson
//       );
//     })
//     .finally(() => {});
// }
// /**
//  * ephemeral code below for a quick exe demo
//  */

// // const apiKey = process.env.VOYAGE_API_KEY ?? "";
// // const voyage = new VoyageEmbeddingService(apiKey);

// async function _countBulk() {
//   const apiKey = process.env.VOYAGE_API_KEY ?? "";
//   const voyage = new VoyageEmbeddingService(apiKey);
//   const fs = new Fs(process.cwd());
//   const paths = ["I"] as const;
//   const fileParsed = (section: "I" | "II" | "III") =>
//     fs
//       .fileToBuffer(`src/test/__out__/condensed/Geminastics-Pt-${section}.md`)
//       .toString("utf-8");

//   const data = paths.map(t => fileParsed(t));
//   // JSON.stringify(data.map((t) => ({inputs: [t] as const}))).replace("[", "").replace("]", "").split(/},/gm).join("}\n")

//   return await voyage.countTokens(data, "voyage-context-3");
// }
