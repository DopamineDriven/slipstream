import type {
  AnthropicResponse,
  GeminiResponse,
  GrokModelsResponse,
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
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini"
  ],
  gemini: [
    "deep-research-pro-preview-12-2025",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",
    "imagen-4.0-generate-001",
    "imagen-4.0-fast-generate-001",
    "imagen-4.0-ultra-generate-001"
  ],
  grok: ["grok-imagine-image", "grok-imagine-image-pro"]
} as const;

const providerModelVideosApi = {
  openai: ["sora-2", "sora-2-pro"],
  gemini: [
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.0-generate-001",
    "veo-3.0-fast-generate-001",
    "veo-2.0-generate-001"
  ],
  grok: ["grok-imagine-video"]
} as const;

const providerModelChatApi = {
  openai: [
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
    "gpt-5.4-pro",
    "gpt-5.2-pro",
    "gpt-5-pro",
    "gpt-5-chat-latest",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
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
    "gemini-3.1-pro-preview",
    "gemini-3.1-pro-preview-customtools",
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "deep-research-pro-preview-12-2025",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "imagen-4.0-generate-001",
    "imagen-4.0-fast-generate-001",
    "imagen-4.0-ultra-generate-001",
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.0-generate-001",
    "veo-3.0-fast-generate-001",
    "veo-2.0-generate-001"
  ],
  grok: [
    "grok-4.20-multi-agent-0309",
    "grok-4.20-0309-reasoning",
    "grok-4.20-0309-non-reasoning",
    "grok-4-1-fast-reasoning",
    "grok-4-1-fast-non-reasoning",
    "grok-4-fast-reasoning",
    "grok-4-fast-non-reasoning",
    "grok-imagine-image",
    "grok-imagine-image-pro",
    "grok-imagine-video"
  ],
  /**
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-names
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-aliases
   */
  anthropic: [
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-5-20251101",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-1-20250805",
    "claude-sonnet-4-20250514",
    "claude-opus-4-20250514",
    "claude-3-haiku-20240307"
  ],
  meta: [
    "Llama-4-Maverick-17B-128E-Instruct-FP8",
    "Llama-4-Scout-17B-16E-Instruct-FP8",
    "Llama-3.3-70B-Instruct",
    "Llama-3.3-8B-Instruct",
    "Cerebras-Llama-4-Maverick-17B-128E-Instruct",
    "Cerebras-Llama-4-Scout-17B-16E-Instruct",
    "Groq-Llama-4-Maverick-17B-128E-Instruct"
  ],
  vercel: ["v0-1.5-md", "v0-1.0-md"],
  mistral: [
    "mistral-small-latest",
    "mistral-medium-latest",
    "mistral-large-latest"
  ],
  cohere: ["command-a-reasoning-08-2025", "command-a-03-2025"],
  moonshotai: ["kimi-k2.5", "kimi-k2-thinking"],
  deepseek: ["deepseek-r1"],
  zai: ["glm-5", "glm-4.7", "glm-4.6", "glm-4.5"]
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
async function _llamaFetcher() {
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
async function _v0Fetcher() {
  return await fetch("https://api.v0.dev/v1/models", {
    headers: {
      Authorization: `Bearer ` + (process.env.V0_API_KEY ?? "")
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
    `https://generativelanguage.googleapis.com/v1alpha/models?key=${process.env.GOOGLE_API_KEY ?? ""}&pageSize=1000`
  );
}

/**
 * one-offs here for when xAI ships odd labels
 */
const GROK_NAME_OVERRIDES = {
  "grok-4-fast-reasoning": "Grok 4 Fast Reasoning",
  "grok-4-fast-non-reasoning": "Grok 4 Fast Non-Reasoning",
  "grok-4-1-fast-non-reasoning": "Grok 4.1 Fast Non-Reasoning",
  "grok-4-1-fast-reasoning": "Grok 4.1 Fast Reasoning",
  "grok-imagine-image": "Grok Imagine Image",
  "grok-imagine-image-pro": "Grok Imagine Image Pro",
  "grok-imagine-video": "Grok Imagine Video",
  "grok-4.20-multi-agent-0309": "Grok 4.20 Multi-Agent",
  "grok-4.20-0309-reasoning": "Grok 4.20 Reasoning",
  "grok-4.20-0309-non-reasoning": "Grok 4.20 Non-Reasoning"
} satisfies Record<string, string>;

const MISTRAL_NAME_OVERRIDES = {
  "mistral-small-latest": "Mistral Small 4",
  "mistral-medium-latest": "Mistral Medium Latest",
  "mistral-large-latest": "Mistral Large Latest"
};

const COHERE_NAME_OVERRIDES = {
  "command-a-reasoning-08-2025": "Command A Reasoning",
  "command-a-03-2025": "Command A"
};

const ZAI_NAME_OVERRIDES = {
  "glm-5": "GLM 5",
  "glm-4.7": "GLM 4.7",
  "glm-4.6": "GLM 4.6",
  "glm-4.5": "GLM 4.5"
};

const KIMI_NAME_OVERRIDES = {
  "kimi-k2-thinking": "Kimi K2 Thinking",
  "kimi-k2.5": "Kimi K2.5"
} as const;

const DEEPSEEK_NAME_OVERRIDES = {
  "deepseek-r1": "DeepSeek R1"
};

function filterForKimi(id: string) {
  return id === "kimi-k2-thinking" || id === "kimi-k2.5";
}

function filterForDeepseek(id: string) {
  return id === "deepseek-r1";
}

function filterForZai(id: string) {
  return (
    id === "glm-5" || id === "glm-4.7" || id === "glm-4.6" || id === "glm-4.5"
  );
}

function kimiDisplayName(id: string) {
  if (filterForKimi(id)) {
    return KIMI_NAME_OVERRIDES[id];
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
  return id === "mistral-small-latest"
    ? MISTRAL_NAME_OVERRIDES[id]
    : id === "mistral-medium-latest"
      ? MISTRAL_NAME_OVERRIDES[id]
      : id === "mistral-large-latest"
        ? MISTRAL_NAME_OVERRIDES[id]
        : id;
}

function cohereDisplayName(id: string) {
  return id === "command-a-reasoning-08-2025"
    ? COHERE_NAME_OVERRIDES[id]
    : id === "command-a-03-2025"
      ? COHERE_NAME_OVERRIDES[id]
      : id;
}

function grokDisplayName(id: string) {
  // Start from your generic formatter (already fixes 4-digit suffix dates etc.)
  let s = prettyModelName(id, "grok");

  // Opinionated cleanup: "Non Reasoning" -> "Non-Reasoning"
  s = s.replace(/\bNon Reasoning\b/i, "Non-Reasoning");

  // Explicit model-specific overrides take ultimate precedence

  return id === "grok-4-fast-reasoning"
    ? GROK_NAME_OVERRIDES[id]
    : id === "grok-4-fast-non-reasoning"
      ? GROK_NAME_OVERRIDES[id]
      : id === "grok-4-1-fast-non-reasoning"
        ? GROK_NAME_OVERRIDES[id]
        : id === "grok-4-1-fast-reasoning"
          ? GROK_NAME_OVERRIDES[id]
          : id === "grok-imagine-image"
            ? GROK_NAME_OVERRIDES[id]
            : id === "grok-imagine-image-pro"
              ? GROK_NAME_OVERRIDES[id]
              : id === "grok-imagine-video"
                ? GROK_NAME_OVERRIDES[id]
                : id === "grok-4.20-multi-agent-0309"
                  ? GROK_NAME_OVERRIDES[id]
                  : id === "grok-4.20-0309-reasoning"
                    ? GROK_NAME_OVERRIDES[id]
                    : id === "grok-4.20-0309-non-reasoning"
                      ? GROK_NAME_OVERRIDES[id]
                      : s;
}

function displayNameV0(id: string) {
  const raw = id?.trim();
  if (!raw) return "";
  // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
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

// Replace formatMeta with this stronger normalizer
function formatMeta(id: string) {
  const raw = id?.trim();
  if (!raw) return "";

  // Normalize: strip noise & standardize separators
  let s = raw
    .replace(/\s+/g, "")
    .replace(/^models\//i, "")
    .replace(/^hfs?:\/\//i, "")
    // eslint-disable-next-line no-useless-escape
    .replace(/^meta[._-]?llama[\/-]/i, "llama-") // meta-llama/llama-... -> llama-...
    .replace(/_/g, "-");

  // Host label (prefix before "llama-"): keep only well-known vendors
  let host: string | null = null;
  // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec, no-useless-escape
  const hostMatch = s.match(/^([a-z0-9.]+)[-\/](?=llama[-_]\d)/i);
  if (hostMatch) {
    const candidate = hostMatch?.[1]?.toLowerCase();
    if (candidate === "cerebras" || candidate === "groq") {
      host = candidate?.[0]?.toUpperCase() + candidate.slice(1);
    }
  }

  // Trim everything before the first "llama-<version>"
  const firstLlama = s.toLowerCase().indexOf("llama-");
  if (firstLlama >= 0) s = s.slice(firstLlama);
  const core = s.toLowerCase();

  // Tokenize
  const tokens = core.split(/[-/]/).filter(Boolean);
  if (!tokens[0]?.startsWith("llama")) return prettyModelName(raw);

  // Version (supports "4" or "3.3")
  const version =
    tokens.find((t, i) => i > 0 && /^\d+(?:\.\d+)?$/.test(t)) ?? "";

  // Known codenames (expand here as Meta adds more)
  const codename = tokens.find(t => t === "maverick" || t === "scout") ?? null;

  // Params & experts (e.g., 17B, 70B, 128E)
  const params = tokens.find(t => /^\d+(?:b|m)$/.test(t)) ?? null; // 8B, 70B, 17B (or M)
  const experts = tokens.find(t => /^\d+e$/.test(t)) ?? null; // 128E, 16E

  // Feature flags
  const has = (x: string) => tokens.includes(x);
  const isVision = has("vision");
  const isInstruct = has("instruct");
  const quant = tokens.find(t => /^(fp\d+|bf16|int\d+|q\d)/.test(t)) ?? null; // FP8, BF16, INT4, Q*
  const isHF = has("hf"); // sometimes appears in registry IDs

  // Compose
  const title = ["Llama", version, codename ? cap(codename) : null]
    .filter(Boolean)
    .join(" ");
  if (!title) return prettyModelName(raw);

  const size = params
    ? params.toUpperCase() + (experts ? `/${experts.toUpperCase()}` : "")
    : null;

  const metaParts = [
    host,
    size,
    isVision ? "Vision" : null,
    isInstruct ? "Instruct" : null,
    quant ? quant.toUpperCase() : null,
    isHF ? "HF" : null
  ].filter(Boolean);

  return metaParts.length ? `${title} (${metaParts.join(", ")})` : title;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

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

function formattedGrok(props: GrokModelsResponse) {
  return props.data.map(t => {
    const { id, ...rest } = t;
    const displayName = prettyModelName(id, "grok");
    return { id, ...rest, displayName };
  });
}

function formattedOpenAi(props: OpenAiResponse) {
  if (!props.data) throw new Error(props.error.message);
  return props?.data?.map(t => {
    const { id, ...rest } = t;
    if (id === "gpt-image-1")
      return { id, displayName: "GPT Image 1", ...rest };
    if (id === "gpt-5-codex")
      return { id, displayName: "GPT-5-Codex", ...rest };
    if (id === "gpt-5.1-codex")
      return { id, displayName: "GPT-5.1 Codex", ...rest };
    if (id === "gpt-5.1-codex-mini")
      return { id, displayName: "GPT-5.1 Codex mini", ...rest };
    if (id === "gpt-image-1-mini")
      return { id, displayName: "GPT Image 1 mini", ...rest };
    if (id === "dall-e-3") return { id, displayName: "DALL·E 3", ...rest };
    if (id === "dall-e-2") return { id, displayName: "DALL·E 2", ...rest };
    if (id === "sora-2") return { id, displayName: "Sora 2", ...rest };
    if (id === "sora-2-pro") return { id, displayName: "Sora 2 Pro", ...rest };
    if (id === "o4-mini-deep-research") return { id, displayName: id, ...rest };
    if (id === "o3-deep-research") return { id, displayName: id, ...rest };
    if (id === "chatgpt-4o-latest")
      return { id, displayName: "ChatGPT-4o", ...rest };
    if (id === "gpt-5-chat-latest")
      return { id, displayName: "GPT-5 Chat", ...rest };
    if (id === "gpt-5.1-chat-latest")
      return { id, displayName: "GPT-5.1 Chat", ...rest };
    if (id === "gpt-5.2-chat-latest")
      return { id, displayName: "GPT-5.2 Chat" };
    if (id === "gpt-5.2-pro") return { id, displayName: "GPT-5.2 pro" };
    if (id === "gpt-5.1-codex-max")
      return { id, displayName: "GPT-5.1-Codex-Max" };
    if (id === "gpt-image-1.5") return { id, displayName: "GPT Image 1.5" };
    const displayName = prettyModelName(id);
    return { id, displayName, ...rest };
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
  const data = await anthropicFetcher();
  const openAiData = await openAiFetcher();
  const geminiData = await geminiFetcher();
  const grokData = await grokFetcher();
  const parseGemini = formattedGemini(JSON.parse(await geminiData.text()));
  const parseOpenAi = formattedOpenAi(JSON.parse(await openAiData.text()));
  const _parseGrok = formattedGrok(JSON.parse(await grokData.text()));
  const parseIt = formattedAnthropic(JSON.parse(await data.text()));
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
            modelKeys === true
              ? Helper.push([model, formatMeta(model)])
              : Helper.push([formatMeta(model), model]);
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
  const openAiData = await openAiFetcher();
  const geminiData = await geminiFetcher();
  const parseGemini = formattedGemini(JSON.parse(await geminiData.text()));
  const parseOpenAi = formattedOpenAi(JSON.parse(await openAiData.text()));
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
  const openAiData = await openAiFetcher();
  const geminiData = await geminiFetcher();
  const parseGemini = formattedGemini(JSON.parse(await geminiData.text()));
  const parseOpenAi = formattedOpenAi(JSON.parse(await openAiData.text()));
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
    !zai
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
          zai: zai.map(([keys, _v]) => keys)
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
          zai: zai.map(([_, vals]) => vals)
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
          zai: zai.map(([_, vals]) => vals)
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
          zai: zai.map(([keys, _v]) => keys)
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
    zai: Object.fromEntries(zai)
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
