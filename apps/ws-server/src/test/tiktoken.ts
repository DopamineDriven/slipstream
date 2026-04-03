import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { python } from "pythonia";

dotenv.config({ quiet: true });

export type VoyageUnion =
  | "voyage-multimodal-3.5"
  | "voyage-multimodal-3"
  | "voyage-context-3"
  | "voyage-code-2"
  | "voyage-2-law"
  | "voyage-2-finance"
  | "voyage-code-3"
  | "voyage-3.5-lite"
  | "voyage-3.5"
  | "voyage-3.5-large";

export type VoyageTokenizeResult = {
  counts: number[];
  total: number;
  model: VoyageUnion;
};

export type VoyageTokenizeError = {
  error: string;
};

export type VoyageTokenizeResponse = VoyageTokenizeResult | VoyageTokenizeError;

type PythonBuiltIns = {
  exec: Promise<(script: string, globals: object) => Promise<unknown>>;
  globals: Promise<
    () => Promise<{ tokenize_result: Promise<VoyageTokenizeResponse> }>
  >;
};

function isTokenizeError(
  response: VoyageTokenizeResponse
): response is VoyageTokenizeError {
  return "error" in response;
}

function voyageTokenizeScript(
  texts: readonly string[],
  model: VoyageUnion,
  apiKey: string
): string {
  // Escape texts for Python string literals
  const escapedTexts = texts.map(t =>
    t
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
  );

  const textsArrayLiteral = `[${escapedTexts.map(t => `"${t}"`).join(", ")}]`;

  return `
import voyageai

def main():
    try:
        client = voyageai.Client(api_key="${apiKey}")

        texts = ${textsArrayLiteral}
        model = "${model}"

        tokenized = client.tokenize(texts, model=model)

        counts = [len(t.tokens) for t in tokenized]

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

export class VoyageTokenizerBridge {
  constructor(private readonly apiKey: string) {}

  async countTokens(
    texts: readonly string[],
    model: VoyageUnion = "voyage-context-3"
  ): Promise<VoyageTokenizeResult> {
    const script = voyageTokenizeScript(texts, model, this.apiKey);

    try {
      const builtins = (await python("builtins")) as PythonBuiltIns;
      const execFunc = await builtins.exec;
      const globalsFunc = await builtins.globals;
      const globalDict = await globalsFunc();

      await execFunc(script, globalDict);

      const result = await globalDict.tokenize_result;

      if (!result) {
        throw new Error("Voyage tokenize returned null (Python bridge)");
      }

      if (isTokenizeError(result)) {
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
    model: VoyageUnion = "voyage-context-3"
  ): Promise<number> {
    const result = await this.countTokens([text], model);
    return result.counts[0] ?? 0;
  }
}

const apiKey = process.env.VOYAGE_API_KEY ?? "";

const fs = new Fs(process.cwd());
const filePath = `src/test/__out__/condensed/test/Whimsical-Merge---Scuba-Surfer-Scene-Meets-Guac-Dancing-Mammoth-Magic.md`;

const fileParsed = fs.fileToBuffer(filePath).toString("utf-8");

const voyageTokenizer = new VoyageTokenizerBridge(apiKey);

(async () => {
  return await voyageTokenizer.countTokensSingle(
    fileParsed,
    "voyage-context-3"
  );
})().then(o => {
  console.log(o);
});
