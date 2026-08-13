import type {
  AnthropicResponse,
  GeminiResponse,
  MultimodalRT,
  OpenAiResponse
} from "@/codegen-types.ts";
import type { Provider } from "@/models.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

/**
 * facilitate image-gen by recruting an image gen model via tooling for the task
 */

const providerModelImagesApi = {
  openai: [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.5-pro",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.4-pro",
    "gpt-5.2",
    "gpt-5.2-pro",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5-chat-latest",
    "gpt-5-pro",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "gpt-image-2",
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini"
  ],
  gemini: [
    "deep-research-max-preview-04-2026",
    "deep-research-preview-04-2026",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image"
  ],
  grok: [
    "grok-imagine-image-2.0",
    "grok-imagine-image",
    "grok-imagine-image-quality"
  ]
} as const;

const providerModelVideosApi = {
  openai: ["sora-2", "sora-2-pro"],
  gemini: [
    "gemini-omni-flash-preview",
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.1-lite-generate-preview"
  ],
  grok: ["grok-imagine-video-1.5", "grok-imagine-video"]
} as const;

const providerModelChatApi = {
  openai: [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.2",
    "gpt-5.2-chat-latest",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5.1-chat-latest",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex",
    "gpt-5.1-codex-mini",
    "gpt-5-codex",
    "gpt-5.5-pro",
    "gpt-5.4-pro",
    "gpt-5.2-pro",
    "gpt-5-pro",
    "gpt-5-chat-latest",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-image-2",
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini",
    "chatgpt-4o-latest",
    "o4-mini",
    "o4-mini-deep-research",
    "o3-deep-research",
    "o3",
    "o3-pro",
    "o3-mini",
    "o1",
    "o1-pro",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "sora-2",
    "sora-2-pro"
  ],
  gemini: [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.1-pro-preview-customtools",
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",
    "gemini-omni-flash-preview",
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.1-lite-generate-preview",
    "lyria-3-pro-preview",
    "lyria-3-clip-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "deep-research-max-preview-04-2026",
    "deep-research-preview-04-2026",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite"
  ],
  grok: [
    "grok-4.6",
    "grok-4.5",
    "grok-4.3",
    "grok-4.20-multi-agent-0309",
    "grok-4.20-0309-reasoning",
    "grok-4.20-0309-non-reasoning",
    "grok-build-0.1",
    "grok-imagine-image-2.0",
    "grok-imagine-image",
    "grok-imagine-image-quality",
    "grok-imagine-video",
    "grok-imagine-video-1.5"
  ],
  anthropic: [
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-fable-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-5-20251101",
    "claude-haiku-4-5-20251001"
  ],
  meta: ["muse-spark-1.2", "muse-spark-1.1"],
  vercel: ["v0-1.5-md", "v0-1.0-md"],
  mistral: [
    "mistral-small-latest",
    "mistral-medium-3",
    "mistral-medium-3.5",
    "mistral-large-latest"
  ],
  cohere: [
    "command-a-plus-05-2026",
    "command-a-reasoning-08-2025",
    "command-a-03-2025"
  ],
  moonshotai: [
    "kimi-k3",
    "kimi-k2.7-code",
    "kimi-k2.6",
    "kimi-k2.5",
    "kimi-k2-thinking"
  ],
  deepseek: [
    "deepseek-v4-pro-0813",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "deepseek-r1"
  ],
  zai: ["glm-5.2", "glm-5.1", "glm-5", "glm-4.7", "glm-4.6", "glm-4.5"],
  alibaba: [
    "qwen3.8-max",
    "qwen3.7-max",
    "qwen3.7-plus",
    "qwen3.7-flash",
    "qwen3.6-plus",
    "qwen3.5-plus",
    "qwen3.5-flash"
  ],
  minimax: ["minimax-m3", "minimax-m2.7", "minimax-m2.5", "minimax-m2.1"],
  sakana: ["fugu-ultra", "fugu", "fugu-cyber", "sakana-namazu"]
} as const;

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

async function geminiFetcher() {
  return await fetch(
    `https://generativelanguage.googleapis.com/v1alpha/models?key=${process.env.GOOGLE_API_KEY ?? ""}&pageSize=1000`
  );
}

const META_NAME_OVERRIDES = {
  "muse-spark-1.2": "Muse Spark 1.2",
  "muse-spark-1.1": "Muse Spark 1.1"
} as const;

const GROK_NAME_OVERRIDES = {
  "grok-4.6": "Grok 4.6",
  "grok-4.5": "Grok 4.5",
  "grok-imagine-image-2.0": "Grok Imagine Image 2.0",
  "grok-imagine-image": "Grok Imagine Image",
  "grok-imagine-image-quality": "Grok Imagine Image Quality",
  "grok-imagine-video": "Grok Imagine Video",
  "grok-4.20-multi-agent-0309": "Grok 4.20 Multi-Agent",
  "grok-4.20-0309-reasoning": "Grok 4.20 Reasoning",
  "grok-4.20-0309-non-reasoning": "Grok 4.20 Non-Reasoning",
  "grok-4.3": "Grok 4.3",
  "grok-build-0.1": "Grok Build 0.1",
  "grok-imagine-video-1.5": "Grok Imagine Video 1.5"
} as const;

const ALIBABA_NAME_OVERRIDES = {
  "qwen3.5-flash": "Qwen3.5-Flash",
  "qwen3.5-plus": "Qwen3.5-Plus",
  "qwen3.6-plus": "Qwen3.6-Plus",
  "qwen3.7-plus": "Qwen3.7-Plus",
  "qwen3.7-max": "Qwen3.7-Max",
  "qwen3.7-flash": "Qwen3.7-Flash",
  "qwen3.8-max": "Qwen3.8-Max"
} as const;

const MINIMAX_NAME_OVERRIDES = {
  "minimax-m2.1": "MiniMax-M2.1",
  "minimax-m2.5": "MiniMax-M2.5",
  "minimax-m2.7": "MiniMax-M2.7",
  "minimax-m3": "MiniMax-M3"
} as const;

const MISTRAL_NAME_OVERRIDES = {
  "mistral-small-latest": "Mistral Small 4",
  "mistral-medium-3": "Mistral Medium 3",
  "mistral-medium-3.5": "Mistral Medium 3.5",
  "mistral-large-latest": "Mistral Large Latest"
} as const;

const COHERE_NAME_OVERRIDES = {
  "command-a-plus-05-2026": "Command A Plus",
  "command-a-reasoning-08-2025": "Command A Reasoning",
  "command-a-03-2025": "Command A"
} as const;

const ZAI_NAME_OVERRIDES = {
  "glm-5.2": "GLM 5.2",
  "glm-5.1": "GLM 5.1",
  "glm-5": "GLM 5",
  "glm-4.7": "GLM 4.7",
  "glm-4.6": "GLM 4.6",
  "glm-4.5": "GLM 4.5"
} as const;

const KIMI_NAME_OVERRIDES = {
  "kimi-k3": "Kimi K3",
  "kimi-k2.7-code": "Kimi K2.7 Code",
  "kimi-k2-thinking": "Kimi K2 Thinking",
  "kimi-k2.5": "Kimi K2.5",
  "kimi-k2.6": "Kimi K2.6"
} as const;

const DEEPSEEK_NAME_OVERRIDES = {
  "deepseek-r1": "DeepSeek R1",
  "deepseek-v4-pro": "DeepSeek V4 Pro Preview",
  "deepseek-v4-pro-0813": "DeepSeek V4 Pro",
  "deepseek-v4-flash": "DeepSeek V4 Flash"
} as const;

const SAKANA_NAME_OVERRIDES = {
  fugu: "Fugu",
  "fugu-ultra": "Fugu Ultra",
  "fugu-cyber": "Fugu Cyber",
  "sakana-namazu": "Sakana Namazu"
} as const;

function filterForSakana(id: string) {
  return (
    id === "fugu" ||
    id === "fugu-ultra" ||
    id === "fugu-cyber" ||
    id === "sakana-namazu"
  );
}

function filterForMinimax(id: string) {
  return (
    id === "minimax-m2.1" ||
    id === "minimax-m2.5" ||
    id === "minimax-m2.7" ||
    id === "minimax-m3"
  );
}

function filterForAlibaba(id: string) {
  return (
    id === "qwen3.5-flash" ||
    id === "qwen3.5-plus" ||
    id === "qwen3.6-plus" ||
    id === "qwen3.7-max" ||
    id === "qwen3.7-plus" ||
    id === "qwen3.7-flash" ||
    id === "qwen3.8-max"
  );
}

function filterForGrok(id: string) {
  return (
    id === "grok-4.6" ||
    id === "grok-4.5" ||
    id === "grok-4.3" ||
    id === "grok-4.20-multi-agent-0309" ||
    id === "grok-4.20-0309-reasoning" ||
    id === "grok-4.20-0309-non-reasoning" ||
    id === "grok-imagine-image-2.0" ||
    id === "grok-imagine-image-quality" ||
    id === "grok-imagine-image" ||
    id === "grok-imagine-video" ||
    id === "grok-build-0.1" ||
    id === "grok-imagine-video-1.5"
  );
}

function filterForKimi(id: string) {
  return (
    id === "kimi-k2-thinking" ||
    id === "kimi-k2.5" ||
    id === "kimi-k2.6" ||
    id === "kimi-k2.7-code" ||
    id === "kimi-k3"
  );
}

function filterForDeepseek(id: string) {
  return (
    id === "deepseek-r1" ||
    id === "deepseek-v4-pro" ||
    id === "deepseek-v4-pro-0813" ||
    id === "deepseek-v4-flash"
  );
}

function filterForZai(id: string) {
  return (
    id === "glm-5" ||
    id === "glm-4.7" ||
    id === "glm-4.6" ||
    id === "glm-4.5" ||
    id === "glm-5.1" ||
    id === "glm-5.2"
  );
}

function filterForMeta(id: string) {
  return id === "muse-spark-1.1" || id === "muse-spark-1.2";
}

function filterForMistral(id: string) {
  return (
    id === "mistral-small-latest" ||
    id === "mistral-medium-3" ||
    id === "mistral-medium-3.5" ||
    id === "mistral-large-latest"
  );
}

function filterForCohere(id: string) {
  return (
    id === "command-a-reasoning-08-2025" ||
    id === "command-a-03-2025" ||
    id === "command-a-plus-05-2026"
  );
}

function toSakanaDisplayName(id: string) {
  if (filterForSakana(id)) {
    return SAKANA_NAME_OVERRIDES[id];
  } else return id;
}

function toMinimaxDisplayName(id: string) {
  if (filterForMinimax(id)) {
    return MINIMAX_NAME_OVERRIDES[id];
  } else return id;
}

function toMetaDisplayName(id: string) {
  if (filterForMeta(id)) {
    return META_NAME_OVERRIDES[id];
  } else {
    return id;
  }
}

function toAlibabaDisplayName(id: string) {
  if (filterForAlibaba(id)) {
    return ALIBABA_NAME_OVERRIDES[id];
  } else return id;
}

function kimiDisplayName(id: string) {
  if (filterForKimi(id)) {
    return KIMI_NAME_OVERRIDES[id];
  } else return id;
}

function grokDisplayName(id: string) {
  if (filterForGrok(id)) {
    return GROK_NAME_OVERRIDES[id];
  } else return id;
}

function deepseekDisplayName(id: string) {
  if (filterForDeepseek(id)) {
    return DEEPSEEK_NAME_OVERRIDES[id];
  } else return id;
}

function zaiDisplayNames(id: string) {
  if (filterForZai(id)) {
    return ZAI_NAME_OVERRIDES[id];
  } else return id;
}

function mistralDisplayName(id: string) {
  if (filterForMistral(id)) {
    return MISTRAL_NAME_OVERRIDES[id];
  } else return id;
}

function cohereDisplayName(id: string) {
  if (filterForCohere(id)) {
    return COHERE_NAME_OVERRIDES[id];
  } else return id;
}

function displayNameV0(id: string) {
  const raw = id?.trim();
  if (!raw) return "";
  const m = raw.toLowerCase().match(/^v0-(\d+(?:\.\d+)?)-([a-z]+)$/);
  if (!m) return prettyModelName(raw); // fallback to your generic formatter

  const [, version, tier] = m;

  const TIER_MAP = {
    lg: "large",
    md: "medium",
    sm: "small",
    xl: "x-large"
  } as const;

  let name =
    `v0 ${TIER_MAP[(tier ?? "lg") as keyof typeof TIER_MAP] ?? tier}` as const;
  // Only the 1.0 medium is “legacy” per Vercel’s docs
  if (version === "1.0" && tier === "md") {
    name += " (legacy)";
  }
  return name;
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

function prettyModelName(id: string, provider: Provider = "openai") {
  let segments = id.split(/[-_]/);

  segments = normalizeGrokSegments(segments);

  return segments
    .map(segment => {
      if (/\d/.test(segment)) {
        return segment;
      }
      if (
        (/^[a-zA-Z]+$/.test(segment) && segment.length <= 2) ||
        segment.startsWith("gpt")
      ) {
        return segment.toUpperCase();
      }
      return provider === "openai"
        ? !/(mini|nano|turbo|pro|codex)/.test(segment)
          ? segment.charAt(0).toUpperCase() + segment.slice(1)
          : segment
        : segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .map((s, i) =>
      provider === "openai"
        ? i === 0 && segments.length !== 1
          ? s.concat("-")
          : segments.length !== i + 1
            ? s.concat(" ")
            : s
        : s
    )
    .join(provider === "openai" ? "" : " ");
}

const gptNameMap = {
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-image-1": "GPT Image 1",
  "gpt-image-1-mini": "GPT Image 1 mini",
  "gpt-image-1.5": "GPT Image 1.5",
  "gpt-image-2": "GPT Image 2",
  "gpt-5-codex": "GPT-5-Codex",
  "gpt-5.1-codex": "GPT-5.1 Codex",
  "gpt-5.1-codex-mini": "GPT-5.1 Codex mini",
  "sora-2": "Sora 2",
  "sora-2-pro": "Sora 2 Pro",
  "o4-mini-deep-research": "o4-mini-deep-research",
  "o3-deep-research": "o3-deep-research",
  "chatgpt-4o-latest": "ChatGPT-4o",
  "gpt-5-chat-latest": "GPT-5 Chat",
  "gpt-5.1-chat-latest": "GPT-5.1 Chat",
  "gpt-5.2-chat-latest": "GPT-5.2 Chat",
  "gpt-5.2-pro": "GPT-5.2 pro",
  "gpt-5.1-codex-max": "GPT-5.1-Codex-Max"
} as const;

function filterForGPT(s: string) {
  return (
    s === "gpt-5.6-sol" ||
    s === "gpt-5.6-terra" ||
    s === "gpt-5.6-luna" ||
    s === "gpt-image-1" ||
    s === "gpt-image-1.5" ||
    s === "gpt-image-2" ||
    s === "gpt-image-1-mini" ||
    s === "gpt-5-codex" ||
    s === "gpt-5.1-codex" ||
    s === "gpt-5.1-codex-mini" ||
    s === "sora-2" ||
    s === "sora-2-pro" ||
    s === "o4-mini-deep-research" ||
    s === "o3-deep-research" ||
    s === "chatgpt-4o-latest" ||
    s === "gpt-5-chat-latest" ||
    s === "gpt-5.1-chat-latest" ||
    s === "gpt-5.2-chat-latest" ||
    s === "gpt-5.2-pro" ||
    s === "gpt-5.1-codex-max"
  );
}

function formattedOpenAi(props: OpenAiResponse) {
  if (!props.data) throw new Error(props.error.message);
  return props?.data?.map(t => {
    const { id, ...rest } = t;
    if (filterForGPT(id)) {
      return { id, displayName: gptNameMap[id], ...rest };
    } else {
      const displayName = prettyModelName(id);
      return { id, displayName, ...rest };
    }
  });
}

function formattedGemini(props: GeminiResponse) {
  if (!props.models) throw new Error(props.error.message);
  return props.models;
}

function formattedAnthropic(props: AnthropicResponse) {
  if (!props.data) throw new Error(props.error.message);
  return props.data;
}
const fs = new Fs(process.cwd());

const modelMapper = async (modelKeys = true) => {
  const [data, openAiData, geminiData] = await Promise.all([
    anthropicFetcher().then(d => d.text()),
    openAiFetcher().then(d => d.text()),
    geminiFetcher().then(d => d.text())
  ]);
  const parseGemini = formattedGemini(JSON.parse(geminiData));
  const parseOpenAi = formattedOpenAi(JSON.parse(openAiData));
  const parseIt = formattedAnthropic(JSON.parse(data));

  return Array.from(Object.entries(providerModelChatApi)).map(
    ([provider, models]) => {
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
        case "meta": {
          let Helper = Array.of<[string, string]>();

          models.forEach(function (model) {
            const name = toMetaDisplayName(model);
            modelKeys === true
              ? Helper.push([model, name])
              : Helper.push([name, model]);
          });
          return Helper;
        }
        case "vercel": {
          let Helper = Array.of<[string, string]>();

          models.forEach(function (model) {
            modelKeys === true
              ? Helper.push([model, displayNameV0(model)])
              : Helper.push([displayNameV0(model), model]);
          });
          return Helper;
        }
        case "grok": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = grokDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "mistral": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = mistralDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "sakana": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = toSakanaDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "cohere": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = cohereDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "deepseek": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = deepseekDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "moonshotai": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = kimiDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "zai": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = zaiDisplayNames(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "alibaba": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = toAlibabaDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "minimax": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = toMinimaxDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "openai":
        default: {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            modelKeys === true
              ? helper.push([
                  model,
                  parseOpenAi.find(t => t.id === `${model}`)?.displayName ??
                    model
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
    }
  );
};

const imageModelMapper = async (modelKeys = true) => {
  const openAiData = await openAiFetcher().then(d => d.text());
  const geminiData = await geminiFetcher().then(d => d.text());
  const parseGemini = formattedGemini(JSON.parse(geminiData));
  const parseOpenAi = formattedOpenAi(JSON.parse(openAiData));
  return Array.from(Object.entries(providerModelImagesApi)).map(
    ([provider, models]) => {
      const p = provider as keyof typeof providerModelImagesApi;
      switch (p) {
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
            const name = grokDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
          });
          return helper;
        }
        case "openai":
        default: {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            modelKeys === true
              ? helper.push([
                  model,
                  parseOpenAi.find(t => t.id === `${model}`)?.displayName ??
                    model
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
    }
  );
};

const videoModelMapper = async (modelKeys = true) => {
  const openAiData = await openAiFetcher().then(d => d.text());
  const geminiData = await geminiFetcher().then(d => d.text());
  const parseGemini = formattedGemini(JSON.parse(geminiData));
  const parseOpenAi = formattedOpenAi(JSON.parse(openAiData));
  return Array.from(Object.entries(providerModelVideosApi)).map(
    ([provider, models]) => {
      const p = provider as keyof typeof providerModelVideosApi;
      switch (p) {
        case "grok": {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            const name = grokDisplayName(model);
            modelKeys === true
              ? helper.push([model, name])
              : helper.push([name, model]);
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
        case "openai":
        default: {
          let helper = Array.of<[string, string]>();
          models.forEach(function (model) {
            modelKeys === true
              ? helper.push([
                  model,
                  parseOpenAi.find(t => t.id === `${model}`)?.displayName ??
                    model
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
    }
  );
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
  const meta = mapper[4];
  const vercel = mapper[5];
  const grok = mapper[2];
  const anthropic = mapper[3];
  const mistral = mapper[6];
  const cohere = mapper[7];
  const moonshotai = mapper[8];
  const deepseek = mapper[9];
  const zai = mapper[10];
  const alibaba = mapper[11];
  const minimax = mapper[12];
  const sakana = mapper[13];

  if (
    !openai ||
    !gemini ||
    !grok ||
    !anthropic ||
    !meta ||
    !vercel ||
    !mistral ||
    !cohere ||
    !moonshotai ||
    !deepseek ||
    !zai ||
    !alibaba ||
    !minimax ||
    !sakana
  )
    throw new Error("empty data in displayNameModelIdGen");

  if (typeof arrayOnly !== "undefined") {
    if (arrayOnly === "display-name-only") {
      if (target === "keys=display-name") {
        return {
          openai: openai.map(([keys, _v]) => keys),
          gemini: gemini.map(([keys, _v]) => keys),
          grok: grok.map(([keys, _]) => keys),
          anthropic: anthropic.map(([keys, _]) => keys),
          meta: meta.map(([keys, _v]) => keys),
          vercel: vercel.map(([keys, _v]) => keys),
          mistral: mistral.map(([keys, _v]) => keys),
          cohere: cohere.map(([keys, _v]) => keys),
          moonshotai: moonshotai.map(([keys, _v]) => keys),
          deepseek: deepseek.map(([keys, _v]) => keys),
          zai: zai.map(([keys, _v]) => keys),
          alibaba: alibaba.map(([keys, _v]) => keys),
          minimax: minimax.map(([keys, _v]) => keys),
          sakana: sakana.map(([keys, _v]) => keys)
        };
      } else {
        return {
          openai: openai.map(([_, vals]) => vals),
          gemini: gemini.map(([_, vals]) => vals),
          grok: grok.map(([_, vals]) => vals),
          anthropic: anthropic.map(([_, vals]) => vals),
          meta: meta.map(([_, vals]) => vals),
          vercel: vercel.map(([_, vals]) => vals),
          mistral: mistral.map(([_, vals]) => vals),
          cohere: cohere.map(([_, vals]) => vals),
          moonshotai: moonshotai.map(([_, vals]) => vals),
          deepseek: deepseek.map(([_, vals]) => vals),
          zai: zai.map(([_, vals]) => vals),
          alibaba: alibaba.map(([_, vals]) => vals),
          minimax: minimax.map(([_, vals]) => vals),
          sakana: sakana.map(([_, vals]) => vals)
        };
      }
    } else {
      if (target === "keys=display-name") {
        return {
          openai: openai.map(([_, vals]) => vals),
          gemini: gemini.map(([_, vals]) => vals),
          grok: grok.map(([_, vals]) => vals),
          anthropic: anthropic.map(([_, vals]) => vals),
          meta: meta.map(([_, vals]) => vals),
          vercel: vercel.map(([_, vals]) => vals),
          mistral: mistral.map(([_, vals]) => vals),
          cohere: cohere.map(([_, vals]) => vals),
          moonshotai: moonshotai.map(([_, vals]) => vals),
          deepseek: deepseek.map(([_, vals]) => vals),
          zai: zai.map(([_, vals]) => vals),
          alibaba: alibaba.map(([_, vals]) => vals),
          minimax: minimax.map(([_, vals]) => vals),
          sakana: sakana.map(([_, vals]) => vals)
        };
      } else {
        return {
          openai: openai.map(([keys, _v]) => keys),
          gemini: gemini.map(([keys, _v]) => keys),
          grok: grok.map(([keys, _]) => keys),
          anthropic: anthropic.map(([keys, _]) => keys),
          meta: meta.map(([keys, _v]) => keys),
          vercel: vercel.map(([keys, _v]) => keys),
          mistral: mistral.map(([keys, _v]) => keys),
          cohere: cohere.map(([keys, _v]) => keys),
          moonshotai: moonshotai.map(([keys, _v]) => keys),
          deepseek: deepseek.map(([keys, _v]) => keys),
          zai: zai.map(([keys, _v]) => keys),
          alibaba: alibaba.map(([keys, _v]) => keys),
          minimax: minimax.map(([keys, _v]) => keys),
          sakana: sakana.map(([keys, _v]) => keys)
        };
      }
    }
  }
  return {
    openai: Object.fromEntries(openai),
    gemini: Object.fromEntries(gemini),
    grok: Object.fromEntries(grok),
    anthropic: Object.fromEntries(anthropic),
    meta: Object.fromEntries(meta),
    vercel: Object.fromEntries(vercel),
    mistral: Object.fromEntries(mistral),
    cohere: Object.fromEntries(cohere),
    moonshotai: Object.fromEntries(moonshotai),
    deepseek: Object.fromEntries(deepseek),
    zai: Object.fromEntries(zai),
    alibaba: Object.fromEntries(alibaba),
    minimax: Object.fromEntries(minimax),
    sakana: Object.fromEntries(sakana)
  };
}

async function displayNameModelIdGenImages<
  const T extends "keys=model-id" | "keys=display-name",
  const V extends "model-id-only" | "display-name-only"
>(target: T, arrayOnly?: V) {
  const mapper = await imageModelMapper(
    target === "keys=display-name" ? false : true
  );
  const openai = mapper[0];
  const gemini = mapper[1];
  const grok = mapper[2];

  if (!openai || !gemini || !grok)
    throw new Error("empty data in displayNameModelIdGen");

  if (typeof arrayOnly !== "undefined") {
    if (arrayOnly === "display-name-only") {
      if (target === "keys=display-name") {
        return {
          openai: openai.map(([keys, _v]) => keys),
          gemini: gemini.map(([keys, _v]) => keys),
          grok: grok.map(([keys, _]) => keys)
        };
      } else {
        return {
          openai: openai.map(([_, vals]) => vals),
          gemini: gemini.map(([_, vals]) => vals),
          grok: grok.map(([_, vals]) => vals)
        };
      }
    } else {
      if (target === "keys=display-name") {
        return {
          openai: openai.map(([_, vals]) => vals),
          gemini: gemini.map(([_, vals]) => vals),
          grok: grok.map(([_, vals]) => vals)
        };
      } else {
        return {
          openai: openai.map(([keys, _v]) => keys),
          gemini: gemini.map(([keys, _v]) => keys),
          grok: grok.map(([keys, _]) => keys)
        };
      }
    }
  }
  return {
    openai: Object.fromEntries(openai),
    gemini: Object.fromEntries(gemini),
    grok: Object.fromEntries(grok)
  };
}
async function displayNameModelIdGenVideos<
  const T extends "keys=model-id" | "keys=display-name",
  const V extends "model-id-only" | "display-name-only"
>(target: T, arrayOnly?: V) {
  const mapper = await videoModelMapper(
    target === "keys=display-name" ? false : true
  );
  const openai = mapper[0];
  const gemini = mapper[1];
  const grok = mapper[2];
  if (!openai || !gemini || !grok)
    throw new Error("empty data in displayNameModelIdGen");

  if (typeof arrayOnly !== "undefined") {
    if (arrayOnly === "display-name-only") {
      if (target === "keys=display-name") {
        return {
          openai: openai.map(([keys, _v]) => keys),
          gemini: gemini.map(([keys, _v]) => keys),
          grok: grok.map(([keys, _v]) => keys)
        };
      } else {
        return {
          openai: openai.map(([_, vals]) => vals),
          gemini: gemini.map(([_, vals]) => vals),
          grok: grok.map(([_, vals]) => vals)
        };
      }
    } else {
      if (target === "keys=display-name") {
        return {
          openai: openai.map(([_, vals]) => vals),
          gemini: gemini.map(([_, vals]) => vals),
          grok: grok.map(([_, vals]) => vals)
        };
      } else {
        return {
          openai: openai.map(([keys, _v]) => keys),
          gemini: gemini.map(([keys, _v]) => keys),
          grok: grok.map(([keys, _v]) => keys)
        };
      }
    }
  }
  return {
    openai: Object.fromEntries(openai),
    gemini: Object.fromEntries(gemini),
    grok: Object.fromEntries(grok)
  };
}
async function Multimodal<
  const S extends "default" | "img" | "video",
  const T extends "keys=model-id" | "keys=display-name",
  const V extends "model-id-only" | "display-name-only"
>(mode: S, target: T, arrayOnly?: V): Promise<MultimodalRT> {
  switch (mode) {
    case "img": {
      return await (arrayOnly
        ? displayNameModelIdGenImages(target, arrayOnly)
        : displayNameModelIdGenImages(target));
    }
    case "video": {
      return await (arrayOnly
        ? displayNameModelIdGenVideos(target, arrayOnly)
        : displayNameModelIdGenVideos(target));
    }
    case "default": {
      return await (arrayOnly
        ? displayNameModelIdGen(target, arrayOnly)
        : displayNameModelIdGen(target));
    }
    default: {
      throw new Error("must select a target of img or default");
    }
  }
}

if (
  process.argv[3] === "img" ||
  process.argv[3] === "default" ||
  process.argv[3] === "video"
) {
  (async (target: "img" | "default" | "video") => {
    const displayNameToModelId = await Multimodal(target, "keys=display-name");

    const displayNameOnly = await Multimodal(
      target,
      "keys=display-name",
      "display-name-only"
    );

    const modelIdToDisplayName = await Multimodal(target, "keys=model-id");

    const modelIdsOnly = await Multimodal(
      target,
      "keys=model-id",
      "model-id-only"
    );

    const format = {
      default: "",
      img: "ImgGen",
      video: "VideoGen"
    } as const;

    const displayNameToModelIdsScaffold = (t: "default" | "video" | "img") =>
      `export const displayNameToModelId${format[t]} = ${JSON.stringify(displayNameToModelId, null, 2)} as const;` as const;

    const displayNameOnlyScaffold = (t: "default" | "video" | "img") =>
      `export const displayNameModelsByProvider${format[t]} = ${JSON.stringify(displayNameOnly, null, 2)} as const;` as const;

    const modelIdsOnlyScaffold = (t: "default" | "video" | "img") =>
      `export const modelIdsByProvider${format[t]} = ${JSON.stringify(modelIdsOnly, null, 2)} as const;` as const;

    const modelIdToDisplayNameScaffold = (t: "default" | "video" | "img") =>
      `export const modelIdToDisplayName${format[t]} = ${JSON.stringify(modelIdToDisplayName, null, 2)} as const;` as const;

    const displayNameToModelIdObj = {
      template: {
        default: displayNameToModelIdsScaffold("default"),
        img: displayNameToModelIdsScaffold("img"),
        video: displayNameToModelIdsScaffold("video")
      },
      path: {
        default: "src/codegen/__gen__/display-name-to-model-id.ts",
        img: "src/codegen/__gen__/display-name-to-model-id-img-gen.ts",
        video: "src/codegen/__gen__/display-name-to-model-id-video-gen.ts"
      }
    } as const;

    const displayNameOnlyObj = {
      template: {
        default: displayNameOnlyScaffold("default"),
        img: displayNameOnlyScaffold("img"),
        video: displayNameOnlyScaffold("video")
      },
      path: {
        default: "src/codegen/__gen__/display-names-by-provider.ts",
        img: "src/codegen/__gen__/display-names-by-provider-img-gen.ts",
        video: "src/codegen/__gen__/display-names-by-provider-video-gen.ts"
      }
    } as const;

    const modelIdToDisplayNameObj = {
      template: {
        default: modelIdToDisplayNameScaffold("default"),
        img: modelIdToDisplayNameScaffold("img"),
        video: modelIdToDisplayNameScaffold("video")
      },
      path: {
        default: "src/codegen/__gen__/model-id-to-display-name.ts",
        img: "src/codegen/__gen__/model-id-to-display-name-img-gen.ts",
        video: "src/codegen/__gen__/model-id-to-display-name-video-gen.ts"
      }
    } as const;

    const modelIdsOnlyObj = {
      template: {
        default: modelIdsOnlyScaffold("default"),
        img: modelIdsOnlyScaffold("img"),
        video: modelIdsOnlyScaffold("video")
      },
      path: {
        default: "src/codegen/__gen__/model-ids-by-provider.ts",
        img: "src/codegen/__gen__/model-ids-by-provider-img-gen.ts",
        video: "src/codegen/__gen__/model-ids-by-provider-video-gen.ts"
      }
    } as const;

    fs.withWs(
      displayNameToModelIdObj.path[target],
      displayNameToModelIdObj.template[target]
    );
    fs.withWs(
      displayNameOnlyObj.path[target],
      displayNameOnlyObj.template[target]
    );
    fs.withWs(
      modelIdToDisplayNameObj.path[target],
      modelIdToDisplayNameObj.template[target]
    );
    fs.withWs(modelIdsOnlyObj.path[target], modelIdsOnlyObj.template[target]);
  })(process.argv[3]);
}
