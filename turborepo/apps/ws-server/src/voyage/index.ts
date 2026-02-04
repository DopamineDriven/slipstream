import type { Voyage } from "@/voyage/types.ts";
import { Fs } from "@d0paminedriven/fs";
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

  /**
   * Exact multimodal token counts via Voyage Python SDK's `count_usage`.
   * Local computation — no API call, just tokenization + pixel counting.
   *
   * Each input is an array of items: `{ t: string }` for text, `{ i: string }` for
   * base64 image data (raw base64, no `data:` prefix — we strip it if present).
   */
  public async countUsage(
    inputs: readonly (readonly ({ t: string } | { i: string })[])[],
    model: Voyage.Multimodal.Model = "voyage-multimodal-3.5"
  ) {
    const script = this.pyCountUsageScript(inputs, model, this.apiKey);

    try {
      const { python } = await import("pythonia");
      const builtins = await python<Voyage.PyBuiltIns>("builtins");
      const execFunc = await builtins.exec;
      const globalsFunc = await builtins.globals;
      const globalDict = await globalsFunc();

      await execFunc(script, globalDict);

      const result = await globalDict.count_usage_result;

      if (!result) {
        throw new Error("Voyage count_usage returned null (Python bridge)");
      }

      if ("error" in result) {
        throw new Error(
          `Voyage count_usage error: ${(result as Voyage.CountUsage.Error).error}`
        );
      }

      return result;
    } catch (err) {
      console.error("VoyageCountUsageBridge error:", err);
      throw err;
    }
  }

  /**
   * Exact multimodal token counts via Voyage Python SDK's `count_usage`.
   * Images are passed as file paths — Python reads them via PIL.Image.open(path).
   * Uses the `[[str, PIL.Image, str, ...]]` list-of-lists format.
   */
  public async countUsageFromPaths(
    inputs: readonly (readonly ({ t: string } | { f: string })[])[],
    model: Voyage.Multimodal.Model = "voyage-multimodal-3.5"
  ) {
    const script = this.pyCountUsageFromPathsScript(inputs, model, this.apiKey);

    try {
      const { python } = await import("pythonia");
      const builtins = await python<Voyage.PyBuiltIns>("builtins");
      const execFunc = await builtins.exec;
      const globalsFunc = await builtins.globals;
      const globalDict = await globalsFunc();

      await execFunc(script, globalDict);

      const result = await globalDict.count_usage_result;

      if (!result) {
        throw new Error("Voyage count_usage returned null (Python bridge)");
      }

      if ("error" in result) {
        throw new Error(`Voyage count_usage error`);
      }
      console.log("results made it to ts!");
      console.log(result);
      let x;
      x = result;
      return x;
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
        vo = voyageai.AsyncClient(api_key="${apiKey}")

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

        # --- SNEK TRANSLATION LAYER ---
        # Inspect what count_usage actually returns so we can extract plain dicts
        print(f"type: {type(raw_usage)}, len: {len(raw_usage) if hasattr(raw_usage, '__len__') else 'N/A'}")
        print(f"raw_usage: {raw_usage}")
        if isinstance(raw_usage, list) and len(raw_usage) > 0:
            print(f"element type: {type(raw_usage[0])}")
            print(f"element dir: {[a for a in dir(raw_usage[0]) if not a.startswith('_')]}")
            print(f"element[0]: {raw_usage[0]}")
        print(f"type: {type(raw_usage)}")
        print(f"raw_usage: {raw_usage}")
        return_dict = {
            "text_tokens": raw_usage["text_tokens"],
            "image_pixels": raw_usage["image_pixels"],
            "video_pixels": raw_usage["video_pixels"],
            "total_tokens": raw_usage["total_tokens"],
            "model": model
        }
        toStringgggg=json.dumps(return_dict)
        print(f"jsonify: {toStringgggg}")
        return {
            "raw_usage": raw_usage,
            "model": model
        }
    except Exception as e:
        return {"error": str(e)}

count_usage_result = main()
  `;
  }

  private pyCountUsageScript(
    inputs: readonly (readonly ({ t: string } | { i: string })[])[],
    model: Voyage.Multimodal.Model = "voyage-multimodal-3.5",
    apiKey = this.apiKey
  ) {
    // Serialize inputs as JSON — text items and base64 image strings
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
        // Strip data URL prefix if present
        const raw = item.i.includes(",")
          ? item.i.slice(item.i.indexOf(",") + 1)
          : item.i;
        return { i: raw };
      })
    );

    const inputsJson = JSON.stringify(serialized);

    // prettier-ignore
    return `import voyageai, base64, io, json
from PIL import Image

def main():
    try:
        vo = voyageai.AsyncClient(api_key="${apiKey}")

        raw_inputs = json.loads('${inputsJson.replace(/'/g, "\\'")}')
        model = "${model}"

        inputs = []
        for raw_input in raw_inputs:
            sequence = []
            for item in raw_input:
                if "t" in item:
                    sequence.append(item["t"])
                elif "i" in item:
                    img_bytes = base64.b64decode(item["i"])
                    img = Image.open(io.BytesIO(img_bytes))
                    sequence.append(img)
            inputs.append(sequence)

        raw_usage = vo.count_usage(inputs, model=model)

        usages = []
        for u in raw_usage:
            usages.append({
                "text_tokens": int(u.text_tokens) if hasattr(u, "text_tokens") else 0,
                "image_pixels": int(u.image_pixels) if hasattr(u, "image_pixels") else 0,
                "video_pixels": int(u.video_pixels) if hasattr(u, "video_pixels") else 0,
                "total_tokens": int(u.total_tokens) if hasattr(u, "total_tokens") else 0
            })
        print(f"type: {type(raw_usage)}")
        print(f"raw_usage: {raw_usage}")
        return raw_usage
    except Exception as e:
        return {"error": str(e)}

count_usage_result = main()
  `;
  }

  private pyTokenizeScript(
    texts: readonly string[],
    model: Voyage.ModelUnion = "voyage-context-3",
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

async function countBulkMultimodal() {
  const { tmpdir } = await import("os");
  const { resolve } = await import("path");
  const { Credentials } = await import("@slipstream/credentials");
  const creds = new Credentials();
  const voyageApiKey = await creds.get("VOYAGE_API_KEY");
  const voyage = new VoyageEmbeddingService(voyageApiKey);
  const fs = new Fs(process.cwd());
  const { PdfDown } = await import("@d0paminedriven/pdfdown");

  const paths = [
    "Geminastics-Pt-I",
    "Geminastics-Pt-II",
    "Geminastics-Pt-III"
  ] as const;

  // Each PDF becomes one input sequence: [text, img, img, text, img, ...]
  const allInputs = Array.of<({ t: string } | { f: string })[]>();
  const tmpFiles = Array.of<string>();

  for (const p of paths) {
    const buf = fs.fileToBuffer(`src/test/__out__/condensed/${p}.pdf`);
    const pdfdown = new PdfDown(buf);

    const [_meta, text, imgs] = await Promise.all([
      pdfdown.metadataAsync(),
      pdfdown.structuredTextAsync(),
      pdfdown.imagesPerPageAsync()
    ]);

    // Build page-image index
    const imagesByPage = new Map<number, typeof imgs>();
    for (const img of imgs) {
      const existing = imagesByPage.get(img.page);
      existing ? existing.push(img) : imagesByPage.set(img.page, [img]);
    }

    // Build interleaved sequence: text chunk, then its page images
    const sequence = Array.of<{ t: string } | { f: string }>();
    for (const page of text) {
      if (page.body && page.body.trim().length > 0) {
        sequence.push({ t: page.body });
      }
      const pageImgs = imagesByPage.get(page.page);
      if (pageImgs) {
        for (const img of pageImgs) {
          const tmpName = fs.uniqueTmpName(
            `${p}-img-${img.page}-${img.imageIndex}`,
            "png"
          );

          const absTmpPath = resolve(tmpdir(), tmpName);
          fs.writeTmp(tmpName, img.data);
          sequence.push({ f: absTmpPath });
          tmpFiles.push(tmpName);
        }
      }
    }

    if (sequence.length > 0) allInputs.push(sequence);
  }

  console.log(
    `Built ${allInputs.length} input sequences, ${tmpFiles.length} tmp image files`
  );

  try {
    const result = await voyage.countUsageFromPaths(
      allInputs,
      "voyage-multimodal-3.5"
    );

    let total = 0;
    let imgPixels = 0;
    let textTokens = 0;
    let vidPixels = 0;

    // eslint-disable-next-line
    total = await result?.raw_usage?.total_tokens;
    // eslint-disable-next-line
    imgPixels = await result?.raw_usage?.image_pixels;
    // eslint-disable-next-line
    vidPixels = await result?.raw_usage?.video_pixels;
    // eslint-disable-next-line
    textTokens = await result?.raw_usage?.text_tokens;

    fs.withWs("src/test/voyage/__out__/multimodal.json", JSON.stringify({
      total,
      imgPixels,
      textTokens,
      vidPixels
    }, null, 2));
    console.log(result);
    console.log("countUsage result:", JSON.stringify(result, null, 2));
    return result;
  } finally {
    // Clean up tmp image files
    for (const tmpName of tmpFiles) {
      try {
        fs.rmTmpFile(tmpName);
      } catch {
        // best-effort cleanup
      }
    }
    console.log(`Cleaned up ${tmpFiles.length} tmp files`);
  }
}
countBulkMultimodal();

// if (process.argv[3] === "exe") {
//   const fs = new Fs(process.cwd());
//   const apiKey = process.env.VOYAGE_API_KEY ?? "";
//   const voyage = new VoyageEmbeddingService(apiKey);
//   (async () => {
//     const paths = [
//       "src/test/__out__/condensed/Geminastics-Pt-I.pdf",
//       "src/test/__out__/condensed/Geminastics-Pt-II.pdf",
//       "src/test/__out__/condensed/Geminastics-Pt-III.pdf"
//     ] as const;
//     const docArr = Array.of<readonly string[]>();
//     const anotherOne = Array.of<string>();
//     for (const p of paths.entries()) {
//       const content = fs.fileToBuffer(p[1]);
//       const { PdfDown } = await import("@d0paminedriven/pdfdown");
//       const pdfdown = new PdfDown(content);
//       const [_meta, text, imgs, _annots] = await Promise.all([
//         pdfdown.metadataAsync(),
//         pdfdown.structuredTextAsync(),
//         pdfdown.imagesPerPageAsync(),
//         pdfdown.annotationsPerPageAsync()
//       ]);

//       const imgPages = imgs.map((v) =>v.page);

//       const body = text.map((o)=>o.body).join("\n\n");

//       if (p[0] === 0) docArr.push([body]);
//       else if (p[0] === 1) anotherOne.push(body);
//       else if (p[0] === 2) anotherOne.push(body);
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
/**
 * ephemeral code below for a quick exe demo
 */

// const apiKey = process.env.VOYAGE_API_KEY ?? "";
// const voyage = new VoyageEmbeddingService(apiKey);
