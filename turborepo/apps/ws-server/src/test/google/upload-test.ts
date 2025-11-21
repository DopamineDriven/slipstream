import { relative } from "path";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const genai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
  apiVersion: "v1alpha"
});

(async () => {
  const upload = await genai.files.upload({
    file: relative(
      process.cwd(),
      "src/test/__out__/condensed/The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-III.md"
    ),
    config: { mimeType: "text/markdown", name: "files/Paved-with-Good-Intentions-Pt-III".toLowerCase() }
  });
  return upload;
})().then(v => {
  console.log(v);
  return v;
});
