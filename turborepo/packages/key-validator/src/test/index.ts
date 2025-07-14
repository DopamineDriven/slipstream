import {
  AnthropicResponse,
  GeminiResponse,
  GrokModelsResponse,
  OpenAiResponse
} from "@/types/index.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

async function anthropicFetcher() {
  return await fetch(`https://api.anthropic.com/v1/models?limit=100`, {
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01"
    }
  });
}

async function openAiFetcher() {
  return await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ` + (process.env.OPENAI_API_KEY ?? "")
    }
  });
}

async function grokFetcher() {
  return await fetch("https://api.x.ai/v1/models", {
    headers: {
      Authorization: `Bearer ` + (process.env.X_AI_KEY ?? "")
    }
  });
}

async function geminiFetcher() {
  return await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_API_KEY ?? ""}&pageSize=1000`
  );
}

const fs = new Fs(process.cwd());
(async () => {
  const data = await anthropicFetcher();
  const openAiData = await openAiFetcher();
  const geminiData = await geminiFetcher();
  const grokData = await grokFetcher();
  const parseGemini = JSON.parse(await geminiData.text()) as GeminiResponse;
  const parseOpenAi = JSON.parse(await openAiData.text()) as OpenAiResponse;
  const parseGrok = JSON.parse(await grokData.text()) as GrokModelsResponse;
  const parseIt = JSON.parse(await data.text()) as AnthropicResponse;

  fs.withWs(
    "src/test/__out__/anthropic-results.json",
    JSON.stringify(parseIt, null, 2)
  );
  fs.withWs(
    "src/test/__out__/openai-results.json",
    JSON.stringify(parseOpenAi, null, 2)
  );
  fs.withWs(
    "src/test/__out__/gemini-results.json",
    JSON.stringify(
      parseGemini.models?.filter(
        t =>
          t.name.startsWith("models/gemini") ||
          t.name.startsWith("models/veo") ||
          t.name.startsWith("models/imagen")
      ),
      null,
      2
    )
  );
  fs.withWs(
    "src/test/__out__/grok-results.json",
    JSON.stringify(parseGrok, null, 2)
  );
  return parseIt;
})();

function normalizeGrokSegments(segments: string[]): string[] {
  if (segments[0] === "grok") {
    const last = segments[segments.length - 1] ?? "";
    if (/^\d{4}$/.test(last)) {
      return segments.slice(0, -1);
    }
  }
  return segments;
}

function _prettyModelName(id: string): string {

  let segments = id.split(/[-_]/);


  segments = normalizeGrokSegments(segments);

  return segments
    .map(segment => {
      if (/\d/.test(segment)) {
        return segment;
      }
      if (/^[a-zA-Z]+$/.test(segment) && segment.length <= 3) {
        return segment.toUpperCase();
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
}
