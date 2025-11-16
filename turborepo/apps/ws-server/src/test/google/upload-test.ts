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
    file: relative(process.cwd(), "src/test/__out__/data/resume-2025.pdf")
  });
  return upload;
})().then(v => {
  console.log(v);
  return v;
});
