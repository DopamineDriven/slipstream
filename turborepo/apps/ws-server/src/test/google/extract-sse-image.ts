import { Fs } from "@d0paminedriven/fs";

class ExtractSSENanoBanana extends Fs {
  private reImg =
    /\s*data\s*:[\s\S]*?"candidates"\s*:\s*[\s\S]*?"content"\s*:[\s\S]*?"parts"\s*:[\s\S]*?"inlineData"\s*:[\s\S]*?"data"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/gim;
  private responseId =
    /\s*data:[\s\S]*?"responseId"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  constructor(private path: string) {
    super(process.cwd());
  }
  private extractTargetedWorkup(sse: string, re: RegExp) {
    const out = Array.of<string>();
    for (const m of sse.matchAll(re)) {
      console.log(m);
      const targ = JSON.parse(`"${m[1]}"`) as string;
      out.push(targ);
    }
    return out;
  }

  private get sse() {
    return this.fileToBuffer(this.path).toString("utf-8");
  }

  private extractTargeted<const T extends "responseId" | "imgs">(target: T) {
    switch (target) {
      case "imgs": {
        return this.extractTargetedWorkup(this.sse, this.reImg);
      }
      case "responseId":
      default: {
        return this.extractTargetedWorkup(this.sse, this.responseId);
      }
    }
  }

  public getResponseId() {
    const responseId = this.extractTargeted("responseId");
    const iId = responseId?.[0];
    if (!iId) {
      throw new Error(
        "check parsing method or targeted data, responseId not detected."
      );
    }
    return iId;
  }

  private pathHelper(iId: string, i: number) {
    return `src/test/__out__/google/image-gen/${iId}/${i++}.png`;
  }

  private async outputTargeted(b64arr: string[]) {
    const iId = this.getResponseId();
    let i = 0;
    for (const img of b64arr) {
      i++;
      this.withWs(this.pathHelper(iId, i), Buffer.from(img, "base64"));
    }
  }
  public async exe<const T extends "imgs" | "both">(target: T) {
    if (target === "imgs") {
      return this.outputTargeted(this.extractTargeted("imgs"));
    }
    if (target === "both") {
      const { promise, resolve } = Promise.withResolvers<string[]>();
      resolve(this.extractTargeted("imgs"));
      promise.then(val => this.outputTargeted(val));
    }
  }
}

const s = new ExtractSSENanoBanana("src/test/google/img-gen-with-images.sse");

s.exe("both").then(() => {});

export type NanoBananaStreamedResponseShape = {
  candidates: {
    content: {
      parts: (
        | { inlineData: { mimeType: string; data: string } }
        | {
            text: string;
          }
      )[];
      role: string;
    };
    /**
     * only defined in final chunk
     */
    finishReason?: string;
    /**
     * indicative of jobs n running in parallel, not index n pertaining to chunk numnber for any given response->eg, 1 job = index is 0 and unchanging.
     */
    index: number;
  }[];
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    promptTokensDetails: {
      /**
       * if parts contains text, modality is TEXT; if parts contains inlineData, modality is IMAGE
       */
      modality: "TEXT" | "IMAGE";
      tokenCount: number;
    }[];
    /**
     * only defined in final chunk
     */
    candidatesTokensDetails?: {
      modality: "TEXT" | "IMAGE";
      tokenCount: number;
    }[];
  };
  modelVersion: string;
  responseId: string;
};

const _shape = {
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAADwf7zUAAAgAElEQVR4ATT9abMr2Xof+AFIIIFEYtzDGapuXd6JZFNqqy2FO6xWKFphh+03Dr/zN/UHsF90OIhL3Z5IU6u+XUnai/5/RrysD4h/47oRaLRa7/Dyen/Nnm+okdAAAAAElFTkSuQmCC"
            }
          }
        ],
        role: "model"
      },
      finishReason: "STOP",
      index: 0
    }
  ],
  usageMetadata: {
    promptTokenCount: 198,
    candidatesTokenCount: 1308,
    totalTokenCount: 1506,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: 198 }],
    candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1290 }]
  },
  modelVersion: "gemini-2.5-flash-image",
  responseId: "n6weaZ7_Ceje_uMPjpfm2Ac"
};

const _abbreviatedRes = `data: {"candidates": [{"content": {"parts": [{"text": "Here is"}],"role": "model"},"index": 0}],"usageMetadata": {"promptTokenCount": 198,"candidatesTokenCount": 2,"totalTokenCount": 200,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 198}]},"modelVersion": "gemini-2.5-flash-image","responseId": "n6weaZ7_Ceje_uMPjpfm2Ac"}

data: {"candidates": [{"content": {"parts": [{"text": " a psychedelic, gon"}],"role": "model"},"index": 0}],"usageMetadata": {"promptTokenCount": 198,"candidatesTokenCount": 6,"totalTokenCount": 204,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 198}]},"modelVersion": "gemini-2.5-flash-image","responseId": "n6weaZ7_Ceje_uMPjpfm2Ac"}

data: {"candidates": [{"content": {"parts": [{"text": "zo-journalism"}],"role": "model"},"index": 0}],"usageMetadata": {"promptTokenCount": 198,"candidatesTokenCount": 10,"totalTokenCount": 208,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 198}]},"modelVersion": "gemini-2.5-flash-image","responseId": "n6weaZ7_Ceje_uMPjpfm2Ac"}

data: {"candidates": [{"content": {"parts": [{"text": "-"}],"role": "model"},"index": 0}],"usageMetadata": {"promptTokenCount": 198,"candidatesTokenCount": 11,"totalTokenCount": 209,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 198}]},"modelVersion": "gemini-2.5-flash-image","responseId": "n6weaZ7_Ceje_uMPjpfm2Ac"}

data: {"candidates": [{"content": {"parts": [{"text": "inspired scene as"}],"role": "model"},"index": 0}],"usageMetadata": {"promptTokenCount": 198,"candidatesTokenCount": 14,"totalTokenCount": 212,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 198}]},"modelVersion": "gemini-2.5-flash-image","responseId": "n6weaZ7_Ceje_uMPjpfm2Ac"}

data: {"candidates": [{"content": {"parts": [{"text": " you described: "}],"role": "model"},"index": 0}],"usageMetadata": {"promptTokenCount": 198,"candidatesTokenCount": 18,"totalTokenCount": 216,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 198}]},"modelVersion": "gemini-2.5-flash-image","responseId": "n6weaZ7_Ceje_uMPjpfm2Ac"}

data: {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/png","data": "iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAADwf7zUAAAgAElEQVR4ATT9abMr2Xof+AFIIIFEYtzDGapuXd6JZFNqqy2FO6xWKFphh+03Dr/zN/UHsF90OIhL3Z5IU6u+XUnai/5/RrysD4h/47oRaLRa7/Dyen/Nnm+okdAAAAAElFTkSuQmCC"}}],"role": "model"},"finishReason": "STOP","index": 0}],"usageMetadata": {"promptTokenCount": 198,"candidatesTokenCount": 1308,"totalTokenCount": 1506,"promptTokensDetails": [{"modality": "TEXT","tokenCount": 198}],"candidatesTokensDetails": [{"modality": "IMAGE","tokenCount": 1290}]},"modelVersion": "gemini-2.5-flash-image","responseId": "n6weaZ7_Ceje_uMPjpfm2Ac"}`;
