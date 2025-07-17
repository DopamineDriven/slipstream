import type {
  AnthropicResponse,
  GeminiResponse,
  GrokModelsResponse,
  OpenAiResponse
} from "@/types.ts";
import { providerModelChatApi } from "@/models.ts";
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

function normalizeGrokSegments(segments: string[]): string[] {
  if (segments[0] === "grok") {
    const last = segments[segments.length - 1] ?? "";
    if (/^\d{4}$/.test(last)) {
      return segments.slice(0, -1);
    }
  }
  return segments;
}

function prettyModelName(id: string): string {
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

function formattedGrok(props: GrokModelsResponse) {
  return props.data.map(t => {
    const { id, ...rest } = t;
    const displayName = prettyModelName(id);
    return { id, displayName, ...rest };
  });
}

function formattedOpenAi(props: OpenAiResponse) {
  if (!props.data) throw new Error("no openai model data");
  return props?.data?.map(t => {
    const { id, ...rest } = t;
    const displayName = prettyModelName(id);
    return { id, displayName, ...rest };
  });
}

function formattedGemini(props: GeminiResponse) {
  if (!props.models) throw new Error("no gemini model data");
  return props.models;
}

function formattedAnthropic(props: AnthropicResponse) {
  if (!props.data) throw new Error("no gemini model data");
  return props.data;
}
const fs = new Fs(process.cwd());

const modelMapper = async (modelKeys = true) => {
  const data = await anthropicFetcher();
  const openAiData = await openAiFetcher();
  const geminiData = await geminiFetcher();
  const grokData = await grokFetcher();
  const parseGemini = formattedGemini(
    JSON.parse(await geminiData.text()) as GeminiResponse
  );
  const parseOpenAi = formattedOpenAi(
    JSON.parse(await openAiData.text()) as OpenAiResponse
  );
  const parseGrok = formattedGrok(
    JSON.parse(await grokData.text()) as GrokModelsResponse
  );
  const parseIt = formattedAnthropic(
    JSON.parse(await data.text()) as AnthropicResponse
  );
  return Object.entries(providerModelChatApi).map(([provider, models]) => {
    const p = provider as keyof typeof providerModelChatApi;
    switch (p) {
      case "anthropic": {
        let helper = Array.of<[string, string]>();
        models.forEach(function (model) {
          modelKeys === true
            ? helper.push([
                model,
                parseIt.find(t => t.id === model)?.display_name ?? model
              ])
            : helper.push([
                parseIt.find(t => t.id === model)?.display_name ?? model,
                model
              ]);
        });
        return helper;
      }
      case "gemini": {
        let helper = Array.of<[string, string]>();
        models.forEach(function (model) {
          modelKeys === true
            ? helper.push([
                model,
                parseGemini.find(t => t.name === `models/${model}`)
                  ?.displayName ?? model
              ])
            : helper.push([
                parseGemini.find(t => t.name === `models/${model}`)
                  ?.displayName ?? model,
                model
              ]);
        });
        return helper;
      }
      case "grok": {
        let helper = Array.of<[string, string]>();
        models.forEach(function (model) {
          modelKeys === true
            ? helper.push([
                model,
                parseGrok.find(t => t.id === model)?.displayName ?? model
              ])
            : helper.push([
                parseGrok.find(t => t.id === model)?.displayName ?? model,
                model
              ]);
        });
        return helper;
      }
      default: {
        let helper = Array.of<[string, string]>();
        models.forEach(function (model) {
          modelKeys === true
            ? helper.push([
                model,
                parseOpenAi.find(t => t.id === `${model}`)?.displayName ?? model
              ])
            : helper.push([
                parseOpenAi.find(t => t.id === `${model}`)?.displayName ??
                  model,
                model
              ]);
        });
        return helper;
      }
    }
  });
};

async function displayNameModelIdGen<
  const T extends "keys=model-id" | "keys=display-name",
  const V extends "model-id-only" | "display-name-only"
>(target: T, arrayOnly?: V) {
  const mapper = await modelMapper(
    target === "keys=display-name" ? false : true
  );
  const openai = mapper[0];
  const gemini = mapper[1];
  const grok = mapper[2];
  const anthropic = mapper[3];

  if (!openai || !gemini || !grok || !anthropic)
    throw new Error("empty data in displayNameModelIdGen");

  if (typeof arrayOnly !== "undefined") {
    if (arrayOnly === "display-name-only") {
      if (target === "keys=display-name") {
        return {
          openai: openai.map(([keys, _v]) => keys),
          gemini: gemini.map(([keys, _v]) => keys),
          grok: grok.map(([keys, _]) => keys),
          anthropic: anthropic.map(([keys, _]) => keys)
        };
      } else {
        return {
          openai: openai.map(([_, vals]) => vals),
          gemini: gemini.map(([_, vals]) => vals),
          grok: grok.map(([_, vals]) => vals),
          anthropic: anthropic.map(([_, vals]) => vals)
        };
      }
    } else {
      if (target === "keys=display-name") {
        return {
          openai: openai.map(([_, vals]) => vals),
          gemini: gemini.map(([_, vals]) => vals),
          grok: grok.map(([_, vals]) => vals),
          anthropic: anthropic.map(([_, vals]) => vals)
        };
      } else {
        return {
          openai: openai.map(([keys, _v]) => keys),
          gemini: gemini.map(([keys, _v]) => keys),
          grok: grok.map(([keys, _]) => keys),
          anthropic: anthropic.map(([keys, _]) => keys)
        };
      }
    }
  }
  return {
    openai: Object.fromEntries(openai),
    gemini: Object.fromEntries(gemini),
    grok: Object.fromEntries(grok),
    anthropic: Object.fromEntries(anthropic)
  };
}

(async () => {
  const displayNameToModelId = await displayNameModelIdGen("keys=display-name");

  const displayNameOnly = await displayNameModelIdGen("keys=display-name", "display-name-only");

  // prettier-ignore
  const displayNameToModelIdTemplate = `export const displayNameToModelId = ${JSON.stringify(displayNameToModelId, null, 2)} as const;`

// prettier-ignore
const displayNameOnlyTemplate = `export const displayNameModelsByProvider = ${JSON.stringify(displayNameOnly, null, 2)} as const;`

  const modelIdToDisplayName = await displayNameModelIdGen("keys=model-id");

  const modelIdsOnly = await displayNameModelIdGen("keys=model-id", "model-id-only");

  // prettier-ignore
  const modelIdsOnlyTemplate = `export const modelIdsByProvider = ${JSON.stringify(modelIdsOnly, null, 2)} as const;`

  // prettier-ignore
  const modelIdToDisplayNameTemplate = `export const modelIdToDisplayName = ${JSON.stringify(modelIdToDisplayName, null, 2)} as const;`

  fs.withWs(
    "src/codegen/__gen__/display-name-to-model-id.ts",
    displayNameToModelIdTemplate
  );
    fs.withWs(
    "src/codegen/__gen__/display-names-by-provider.ts",
    displayNameOnlyTemplate
  );
  fs.withWs(
    "src/codegen/__gen__/model-id-to-display-name.ts",
    modelIdToDisplayNameTemplate
  );
      fs.withWs(
    "src/codegen/__gen__/model-ids-by-provider.ts",
    modelIdsOnlyTemplate
  );
})();
