import {
  AnthropicResponse,
  GeminiResponse,
  GrokModelsResponse,
  OpenAiResponse
} from "@/types/index.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import * as DATA from "./__out__/v0-results.json" with { type: "json" };

dotenv.config({ quiet: true });

async function anthropicFetcher() {
  return await fetch(`https://api.anthropic.com/v1/models?limit=100`, {
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01"
    }
  });
}

async function llamaFetcher() {
  const res = await fetch("https://api.llama.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ` + (process.env.LLAMA_API_KEY ?? ""),
      "Content-Type": "application/json"
    }
  });
  console.log(res.headers);
  return res;
}
async function v0Fetcher() {
  return await fetch("https://ai-gateway.vercel.sh/v1/models", {
    headers: {
      Authorization: `Bearer ` + (process.env.AI_GATEWAY_API_KEY ?? "")
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

async function mistralFetcher() {
  return await fetch("https://api.mistral.ai/v1/models", {
    headers: {
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY ?? ""}`
    }
  });
}

async function cohereFetcher() {
  return await fetch("https://api.cohere.com/v1/models?page_size=1000", {
    headers: {
      Authorization: `Bearer ${process.env.COHERE_TRIAL_KEY ?? ""}`
    }
  });
}

async function geminiFetcher() {
  const gemini = await fetch(
    `https://generativelanguage.googleapis.com/v1alpha/models?key=${process.env.GOOGLE_API_KEY ?? ""}&pageSize=1000`
  );
  console.log(gemini.status);
  return gemini;
}

const fs = new Fs(process.cwd());
(async () => {
  const v0Data = await v0Fetcher();
  const llamaData = await llamaFetcher();
  const data = await anthropicFetcher();
  const openAiData = await openAiFetcher();
  const geminiData = await geminiFetcher();
  const grokData = await grokFetcher();
  const mistralData = await mistralFetcher();
  const cohereData = await cohereFetcher();

  const parseV0 = JSON.parse<Record<string, any>>(await v0Data.text());
  const parseLlama = JSON.parse<Record<string, any>>(await llamaData.text());
  const parseMistral = JSON.parse<Record<string, any>>(
    await mistralData.text()
  );
  const parseCohere = JSON.parse<Record<string, any>>(await cohereData.text());
  const parseGemini = JSON.parse<GeminiResponse>(await geminiData.text());
  const parseOpenAi = JSON.parse<OpenAiResponse>(await openAiData.text());
  const parseGrok = JSON.parse<GrokModelsResponse>(await grokData.text());
  const parseIt = JSON.parse<AnthropicResponse>(await data.text());
  const openaiSorted = parseOpenAi.data?.sort((o, p) => o.created - p.created);
  fs.withWs(
    "src/test/__out__/llama-results.json",
    JSON.stringify(parseLlama, null, 2)
  );
  fs.withWs(
    "src/test/__out__/v0-results.json",
    JSON.stringify(parseV0, null, 2)
  );
  fs.withWs(
    "src/test/__out__/anthropic-results.json",
    JSON.stringify(parseIt, null, 2)
  );
  fs.withWs(
    "src/test/__out__/openai-results.json",
    JSON.stringify(openaiSorted, null, 2)
  );
  fs.withWs(
    "src/test/__out__/gemini-results.json",
    JSON.stringify(parseGemini, null, 2)
  );
  fs.withWs(
    "src/test/__out__/grok-results.json",
    JSON.stringify(parseGrok, null, 2)
  );
  fs.withWs(
    "src/test/__out__/mistral-results.json",
    JSON.stringify(parseMistral, null, 2)
  );
    fs.withWs(
    "src/test/__out__/cohere-results.json",
    JSON.stringify(parseCohere, null, 2)
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

console.log(DATA.default.data.length);
