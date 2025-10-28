import { Fs } from "@d0paminedriven/fs";

class ExtractSSE extends Fs {
  private reImg =
    /"type"\s*:\s*"image_generation_call"[\s\S]*?"result"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  private rePartialImg =
    /"type"\s*:\s*"response.image_generation_call.partial_image"[\s\S]*?"partial_image_b64"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  private reItemId =
    /"type"\s*:\s*"response.image_generation_call.in_progress"[\s\S]*?"item_id"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  constructor(private path: string) {
    super(process.cwd());
  }
  private extractTargetedWorkup(sse: string, re: RegExp) {
    const out = Array.of<string>();
    for (const m of sse.matchAll(re)) {
      const targ = JSON.parse(`"${m[1]}"`) as string;
      out.push(targ);
    }
    return out;
  }

  private get sse() {
    return this.fileToBuffer(this.path).toString("utf-8");
  }

  private extractTargeted<const T extends "item_id" | "imgs" | "partial_imgs">(
    target: T
  ) {
    switch (target) {
      case "imgs": {
        return this.extractTargetedWorkup(this.sse, this.reImg);
      }
      case "partial_imgs": {
        return this.extractTargetedWorkup(this.sse, this.rePartialImg);
      }
      case "item_id":
      default: {
        return this.extractTargetedWorkup(this.sse, this.reItemId);
      }
    }
  }

  public itemId() {
    const item_id = this.extractTargeted("item_id");
    const iId = item_id?.[0];
    if (!iId) {
      throw new Error(
        "check parsing method or targeted data, item_id not detected."
      );
    }
    return iId;
  }

  private pathHelper<const T extends "imgs" | "partial_imgs">(
    target: T,
    iId: string,
    i: number
  ) {
    return target === "partial_imgs"
      ? `src/test/__out__/openai/image-gen/${iId}/partial/${i++}.png`
      : `src/test/__out__/openai/image-gen/${iId}/${i++}.png`;
  }

  private async outputTargeted<const T extends "imgs" | "partial_imgs">(
    b64arr: string[],
    target: T
  ) {
    const iId = this.itemId();
    let i = 0;
    for (const img of b64arr) {
      i++;
      this.withWs(this.pathHelper(target, iId, i), Buffer.from(img, "base64"));
    }
  }
  public async exe<const T extends "imgs" | "partial_imgs" | "both">(
    target: T
  ) {
    if (target === "imgs") {
      return this.outputTargeted(this.extractTargeted("imgs"), "imgs");
    }
    if (target === "partial_imgs") {
      this.outputTargeted(this.extractTargeted("partial_imgs"), "partial_imgs");
    }
    if (target === "both") {
      const { promise, resolve } = Promise.withResolvers();
      resolve(
        this.outputTargeted(
          this.extractTargeted("partial_imgs"),
          "partial_imgs"
        )
      );
      promise.then(() =>
        this.outputTargeted(this.extractTargeted("imgs"), "imgs")
      );
    }
  }
}

const s = new ExtractSSE("src/test/openai/sse-chunks-3-responses.txt");

s.exe("both").then(() => {});
