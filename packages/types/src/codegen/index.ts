import type {
  AnthropicResponse,
  GeminiResponse,
  ModeUnion,
  OmniMapperRT
} from "@/codegen-types.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

export class ModelServiceImage {
  public get imageFacilitatingGemini() {
    return [
      "deep-research-max-preview-04-2026",
      "deep-research-preview-04-2026"
    ] as const;
  }

  public get imagePureGemini() {
    return [
      "gemini-3.1-flash-lite-image",
      "gemini-3.1-flash-image-preview",
      "gemini-3-pro-image-preview",
      "gemini-2.5-flash-image"
    ] as const;
  }

  public get imageGemini() {
    return [...this.imageFacilitatingGemini, ...this.imagePureGemini] as const;
  }

  public get imagePureGrok() {
    return [
      "grok-imagine-image-2.0",
      "grok-imagine-image",
      "grok-imagine-image-quality"
    ] as const;
  }

  public get imageGrok() {
    return [...this.imagePureGrok] as const;
  }

  public get imagePureMeta() {
    return ["muse-image-1.0"] as const;
  }

  public get imageMeta() {
    return [...this.imagePureMeta] as const;
  }

  public get imagePureOpenAI() {
    return [
      "gpt-image-2.5-sunburst",
      "gpt-image-2.5-flare",
      "gpt-image-2",
      "gpt-image-1.5",
      "gpt-image-1",
      "gpt-image-1-mini"
    ] as const;
  }

  public get imageFacilitatingOpenAI() {
    return [
      "gpt-6-astra",
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
      "gpt-5-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o",
      "gpt-4o-mini",
      "o3"
    ] as const;
  }

  public get imageOpenAI() {
    return [...this.imageFacilitatingOpenAI, ...this.imagePureOpenAI] as const;
  }

  public get providerModelImageApi() {
    return {
      openai: this.imageOpenAI,
      gemini: this.imageGemini,
      grok: this.imageGrok,
      meta: this.imageMeta
    } as const;
  }
}

export class ModelServiceVideo extends ModelServiceImage {
  public get videoOmniGemini() {
    return ["gemini-omni-1.1-flash", "gemini-omni-flash-preview"] as const;
  }

  public get videoVeoGemini() {
    return [
      "veo-3.1-generate-preview",
      "veo-3.1-fast-generate-preview",
      "veo-3.1-lite-generate-preview"
    ] as const;
  }

  public get videoGemini() {
    return [...this.videoOmniGemini, ...this.videoVeoGemini] as const;
  }

  public get videoImagineGrok() {
    return ["grok-imagine-video-1.5", "grok-imagine-video"] as const;
  }

  public get videoGrok() {
    return [...this.videoImagineGrok] as const;
  }

  public get providerModelVideoApi() {
    return {
      gemini: this.videoGemini,
      grok: this.videoGrok
    } as const;
  }
}

export class ModelServiceAudio extends ModelServiceVideo {
  public get audioLyriaGemini() {
    return [
      "lyria-3.5",
      "lyria-3-pro-preview",
      "lyria-3-clip-preview"
    ] as const;
  }

  public get audioGemini() {
    return [...this.audioLyriaGemini] as const;
  }

  public get providerModelAudioApi() {
    return {
      gemini: this.audioGemini
    } as const;
  }
}

export class ModelServiceChat extends ModelServiceAudio {
  public get chatQwen3Alibaba() {
    return [
      "qwen3.8-max-0902",
      "qwen3.8-max",
      "qwen3.8-flash-next",
      "qwen3.8-flash",
      "qwen3.7-max",
      "qwen3.7-plus",
      "qwen3.7-flash",
      "qwen3.6-plus",
      "qwen3.5-plus",
      "qwen3.5-flash"
    ] as const;
  }

  public get chatAlibaba() {
    return [...this.chatQwen3Alibaba] as const;
  }

  public get chatClaude5Anthropic() {
    return [
      "claude-fable-5-1",
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-fable-5"
    ] as const;
  }

  public get chatClaude4Anthropic() {
    return [
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-sonnet-4-5-20250929",
      "claude-opus-4-5-20251101",
      "claude-haiku-4-5-20251001"
    ] as const;
  }

  public get chatAnthropic() {
    return [
      ...this.chatClaude5Anthropic,
      ...this.chatClaude4Anthropic
    ] as const;
  }

  public get chatCommandACohere() {
    return [
      "command-a-plus-05-2026",
      "command-a-reasoning-08-2025",
      "command-a-03-2025"
    ] as const;
  }

  public get chatCohere() {
    return [...this.chatCommandACohere] as const;
  }

  public get chatV4DeepSeek() {
    return [
      "deepseek-v4.1-flash",
      "deepseek-v4-pro-0813",
      "deepseek-v4-pro",
      "deepseek-v4-flash-0731",
      "deepseek-v4-flash"
    ] as const;
  }

  public get chatR1DeepSeek() {
    return ["deepseek-r1"] as const;
  }

  public get chatDeepSeek() {
    return [...this.chatV4DeepSeek, ...this.chatR1DeepSeek] as const;
  }

  public get chatGen3Gemini() {
    return [
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-pro-preview-customtools",
      "gemini-3.1-flash-lite-preview",
      "gemini-3-flash-preview"
    ] as const;
  }

  public get chatGen2Gemini() {
    return [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite"
    ] as const;
  }

  public get chatGemini() {
    return [
      ...this.chatGen3Gemini,
      ...this.imagePureGemini,
      ...this.audioGemini,
      ...this.videoGemini,
      ...this.chatGen2Gemini,
      ...this.imageFacilitatingGemini
    ] as const;
  }

  public get chatGen4Grok() {
    return [
      "grok-4.6",
      "grok-4.5",
      "grok-4.3",
      "grok-4.20-multi-agent-0309",
      "grok-4.20-0309-reasoning",
      "grok-4.20-0309-non-reasoning"
    ] as const;
  }

  public get chatBuildGrok() {
    return ["grok-build-0.1"] as const;
  }

  public get chatGrok() {
    return [
      ...this.chatGen4Grok,
      ...this.chatBuildGrok,
      ...this.imageGrok,
      ...this.videoGrok
    ] as const;
  }

  public get chatSparkMeta() {
    return ["muse-spark-1.3", "muse-spark-1.2", "muse-spark-1.1"] as const;
  }

  public get chatMeta() {
    return [...this.chatSparkMeta, ...this.imageMeta] as const;
  }

  public get chatM3MiniMax() {
    return ["minimax-m3"] as const;
  }

  public get chatM2MiniMax() {
    return ["minimax-m2.7", "minimax-m2.5", "minimax-m2.1"] as const;
  }

  public get chatMiniMax() {
    return [...this.chatM3MiniMax, ...this.chatM2MiniMax] as const;
  }

  public get chatSmallMistral() {
    return ["mistral-small-latest"] as const;
  }

  public get chatMediumMistral() {
    return ["mistral-medium-3", "mistral-medium-3.5"] as const;
  }

  public get chatLargeMistral() {
    return ["mistral-large-latest"] as const;
  }

  public get chatMistral() {
    return [
      ...this.chatSmallMistral,
      ...this.chatMediumMistral,
      ...this.chatLargeMistral
    ] as const;
  }

  public get chatK3MoonshotAI() {
    return ["kimi-k3", "kimi-k3-fast"] as const;
  }

  public get chatK2MoonshotAI() {
    return [
      "kimi-k2.7-code",
      "kimi-k2.7-code-highspeed",
      "kimi-k2.6",
      "kimi-k2.5",
      "kimi-k2-thinking"
    ] as const;
  }

  public get chatMoonshotAI() {
    return [...this.chatK3MoonshotAI, ...this.chatK2MoonshotAI] as const;
  }

  public get chatCodexOpenAI() {
    return ["gpt-5.3-codex"] as const;
  }

  /**
   * o3 is intentionally absent here, it arrives via imageFacilitatingOpenAI
   */
  public get chatOSeriesOpenAI() {
    return ["o4-mini", "o3-pro", "o3-mini", "o1", "o1-pro"] as const;
  }

  public get chatLegacyOpenAI() {
    return ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"] as const;
  }

  public get chatOpenAI() {
    return [
      ...this.imageFacilitatingOpenAI,
      ...this.chatCodexOpenAI,
      ...this.imagePureOpenAI,
      ...this.chatOSeriesOpenAI,
      ...this.chatLegacyOpenAI
    ] as const;
  }

  public get chatFuguSakana() {
    return ["fugu-max", "fugu-ultra", "fugu", "fugu-cyber"] as const;
  }

  public get chatNamazuSakana() {
    return ["sakana-namazu"] as const;
  }

  public get chatSakana() {
    return [...this.chatFuguSakana, ...this.chatNamazuSakana] as const;
  }

  public get chatV0Vercel() {
    return ["v0-1.5-md", "v0-1.0-md"] as const;
  }

  public get chatVercel() {
    return [...this.chatV0Vercel] as const;
  }

  public get chatGlm5Zai() {
    return [
      "glm-5.3",
      "glm-5.3-fast",
      "glm-5.3-flash",
      "glm-5.3-flashx",
      "glm-5.2",
      "glm-5.2-fast",
      "glm-5.1",
      "glm-5"
    ] as const;
  }

  public get chatGlm4Zai() {
    return ["glm-4.7", "glm-4.6", "glm-4.5"] as const;
  }

  public get chatZai() {
    return [...this.chatGlm5Zai, ...this.chatGlm4Zai] as const;
  }

  public get providerModelChatApi() {
    return {
      openai: this.chatOpenAI,
      gemini: this.chatGemini,
      grok: this.chatGrok,
      anthropic: this.chatAnthropic,
      meta: this.chatMeta,
      vercel: this.chatVercel,
      mistral: this.chatMistral,
      cohere: this.chatCohere,
      moonshotai: this.chatMoonshotAI,
      deepseek: this.chatDeepSeek,
      zai: this.chatZai,
      alibaba: this.chatAlibaba,
      minimax: this.chatMiniMax,
      sakana: this.chatSakana
    } as const;
  }
}

export class ModelServiceNameOverrides extends ModelServiceChat {
  public ALIBABA_NAME_OVERRIDES = {
    "qwen3.8-flash": "Qwen 3.8 Flash",
    "qwen3.8-flash-next": "Qwen 3.8 Flash Next",
    "qwen3.8-max": "Qwen 3.8 Max",
    "qwen3.8-max-0902": "Qwen 3.8 Max 0902",
    "qwen3.7-flash": "Qwen 3.7 Flash",
    "qwen3.7-max": "Qwen 3.7 Max",
    "qwen3.7-plus": "Qwen 3.7 Plus",
    "qwen3.6-plus": "Qwen 3.6 Plus",
    "qwen3.5-flash": "Qwen 3.5 Flash",
    "qwen3.5-plus": "Qwen 3.5 Plus"
  } as const;

  public COHERE_NAME_OVERRIDES = {
    "command-a-plus-05-2026": "Command A Plus",
    "command-a-reasoning-08-2025": "Command A Reasoning",
    "command-a-03-2025": "Command A"
  } as const;

  public DEEPSEEK_NAME_OVERRIDES = {
    "deepseek-r1": "DeepSeek R1",
    "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
    "deepseek-v4-flash-0731": "DeepSeek V4 Flash 0731",
    "deepseek-v4-flash": "DeepSeek V4 Flash",
    "deepseek-v4-pro-0813": "DeepSeek V4 Pro 0813",
    "deepseek-v4-pro": "DeepSeek V4 Pro"
  } as const;

  public GROK_NAME_OVERRIDES = {
    "grok-4.6": "Grok 4.6",
    "grok-4.5": "Grok 4.5",
    "grok-4.3": "Grok 4.3",
    "grok-4.20-multi-agent-0309": "Grok 4.20 Multi-Agent",
    "grok-4.20-0309-reasoning": "Grok 4.20 Reasoning",
    "grok-4.20-0309-non-reasoning": "Grok 4.20 Non-Reasoning",
    "grok-build-0.1": "Grok Build 0.1",
    "grok-imagine-image-2.0": "Grok Imagine Image 2.0",
    "grok-imagine-image-quality": "Grok Imagine Image Quality",
    "grok-imagine-image": "Grok Imagine Image",
    "grok-imagine-video-1.5": "Grok Imagine Video 1.5",
    "grok-imagine-video": "Grok Imagine Video"
  } as const;

  public META_NAME_OVERRIDES = {
    "muse-spark-1.3": "Muse Spark 1.3",
    "muse-spark-1.2": "Muse Spark 1.2",
    "muse-spark-1.1": "Muse Spark 1.1",
    "muse-image-1.0": "Muse Image 1.0"
  } as const;

  public MINIMAX_NAME_OVERRIDES = {
    "minimax-m3": "MiniMax-M3",
    "minimax-m2.7": "MiniMax-M2.7",
    "minimax-m2.5": "MiniMax-M2.5",
    "minimax-m2.1": "MiniMax-M2.1"
  } as const;

  public MISTRAL_NAME_OVERRIDES = {
    "mistral-large-latest": "Mistral Large Latest",
    "mistral-medium-3": "Mistral Medium 3",
    "mistral-medium-3.5": "Mistral Medium 3.5",
    "mistral-small-latest": "Mistral Small 4"
  } as const;

  public MOONSHOTAI_NAME_OVERRIDES = {
    "kimi-k3": "Kimi K3",
    "kimi-k3-fast": "Kimi K3 Fast",
    "kimi-k2.7-code": "Kimi K2.7 Code",
    "kimi-k2.7-code-highspeed": "Kimi K2.7 Code Highspeed",
    "kimi-k2.6": "Kimi K2.6",
    "kimi-k2.5": "Kimi K2.5",
    "kimi-k2-thinking": "Kimi K2 Thinking"
  } as const;

  public OPENAI_NAME_OVERRIDES = {
    "gpt-6-astra": "GPT-6 Astra",
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
    "gpt-5.5": "GPT-5.5",
    "gpt-5.5-pro": "GPT-5.5 Pro",
    "gpt-5.4": "GPT-5.4",
    "gpt-5.4-pro": "GPT-5.4 Pro",
    "gpt-5.4-mini": "GPT-5.4 Mini",
    "gpt-5.4-nano": "GPT-5.4 nano",
    "gpt-5.3-codex": "GPT-5.3-Codex",
    "gpt-5.2": "GPT-5.2",
    "gpt-5.2-pro": "GPT-5.2 Pro",
    "gpt-5.1": "GPT-5.1",
    "gpt-5": "GPT-5",
    "gpt-5-pro": "GPT-5 Pro",
    "gpt-5-mini": "GPT-5 Mini",
    "gpt-5-nano": "GPT-5 nano",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-4.1-nano": "GPT-4.1 nano",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4": "GPT-4",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gpt-3.5-turbo": "GPT-3.5 Turbo",
    "o4-mini": "o4-mini",
    o3: "o3",
    "o3-pro": "o3-pro",
    "o3-mini": "o3-mini",
    o1: "o1",
    "o1-pro": "o1-pro",
    "gpt-image-2.5-sunburst": "GPT-Image-2.5 Sunburst",
    "gpt-image-2.5-flare": "GPT-Image-2.5 Flare",
    "gpt-image-1": "GPT-Image-1",
    "gpt-image-1-mini": "GPT-Image-1 mini",
    "gpt-image-1.5": "GPT-Image-1.5",
    "gpt-image-2": "GPT-Image-2"
  } as const;

  public SAKANA_NAME_OVERRIDES = {
    fugu: "Fugu",
    "fugu-cyber": "Fugu Cyber",
    "fugu-max": "Fugu Max",
    "fugu-ultra": "Fugu Ultra",
    "sakana-namazu": "Sakana Namazu"
  } as const;

  public VERCEL_NAME_OVERRIDES = {
    "v0-1.5-md": "v0 medium",
    "v0-1.0-md": "v0 medium (legacy)"
  } as const;

  public ZAI_NAME_OVERRIDES = {
    "glm-5.3": "GLM 5.3",
    "glm-5.3-flashx": "GLM 5.3 FlashX",
    "glm-5.3-flash": "GLM 5.3 Flash",
    "glm-5.3-fast": "GLM 5.3 Fast",
    "glm-5.2": "GLM 5.2",
    "glm-5.2-fast": "GLM 5.2 Fast",
    "glm-5.1": "GLM 5.1",
    "glm-5": "GLM 5",
    "glm-4.7": "GLM 4.7",
    "glm-4.6": "GLM 4.6",
    "glm-4.5": "GLM 4.5"
  } as const;
}

export class ModelServiceFilter extends ModelServiceNameOverrides {
  public filterForAlibaba(id: string) {
    return (
      id === "qwen3.8-flash" ||
      id === "qwen3.8-flash-next" ||
      id === "qwen3.8-max" ||
      id === "qwen3.8-max-0902" ||
      id === "qwen3.7-flash" ||
      id === "qwen3.7-max" ||
      id === "qwen3.7-plus" ||
      id === "qwen3.6-plus" ||
      id === "qwen3.5-flash" ||
      id === "qwen3.5-plus"
    );
  }

  public filterForCohere(id: string) {
    return (
      id === "command-a-plus-05-2026" ||
      id === "command-a-reasoning-08-2025" ||
      id === "command-a-03-2025"
    );
  }

  public filterForDeepseek(id: string) {
    return (
      id === "deepseek-r1" ||
      id === "deepseek-v4-pro" ||
      id === "deepseek-v4-pro-0813" ||
      id === "deepseek-v4-flash" ||
      id === "deepseek-v4-flash-0731" ||
      id === "deepseek-v4.1-flash"
    );
  }

  public filterForGrok(id: string) {
    return (
      id === "grok-4.6" ||
      id === "grok-4.5" ||
      id === "grok-4.3" ||
      id === "grok-4.20-multi-agent-0309" ||
      id === "grok-4.20-0309-reasoning" ||
      id === "grok-4.20-0309-non-reasoning" ||
      id === "grok-build-0.1" ||
      id === "grok-imagine-image-2.0" ||
      id === "grok-imagine-image-quality" ||
      id === "grok-imagine-image" ||
      id === "grok-imagine-video-1.5" ||
      id === "grok-imagine-video"
    );
  }

  public filterForMeta(id: string) {
    return (
      id === "muse-spark-1.3" ||
      id === "muse-spark-1.2" ||
      id === "muse-spark-1.1" ||
      id === "muse-image-1.0"
    );
  }

  public filterForMinimax(id: string) {
    return (
      id === "minimax-m3" ||
      id === "minimax-m2.7" ||
      id === "minimax-m2.5" ||
      id === "minimax-m2.1"
    );
  }

  public filterForMistral(id: string) {
    return (
      id === "mistral-large-latest" ||
      id === "mistral-medium-3.5" ||
      id === "mistral-medium-3" ||
      id === "mistral-small-latest"
    );
  }

  public filterForMoonshotAI(id: string) {
    return (
      id === "kimi-k2-thinking" ||
      id === "kimi-k2.5" ||
      id === "kimi-k2.6" ||
      id === "kimi-k2.7-code" ||
      id === "kimi-k2.7-code-highspeed" ||
      id === "kimi-k3-fast" ||
      id === "kimi-k3"
    );
  }

  public filterForOpenAI(s: string) {
    return (
      s === "gpt-6-astra" ||
      s === "gpt-5.6-sol" ||
      s === "gpt-5.6-terra" ||
      s === "gpt-5.6-luna" ||
      s === "gpt-5.5" ||
      s === "gpt-5.5-pro" ||
      s === "gpt-5.4" ||
      s === "gpt-5.4-pro" ||
      s === "gpt-5.4-mini" ||
      s === "gpt-5.4-nano" ||
      s === "gpt-5.3-codex" ||
      s === "gpt-5.2" ||
      s === "gpt-5.2-pro" ||
      s === "gpt-5.1" ||
      s === "gpt-5" ||
      s === "gpt-5-pro" ||
      s === "gpt-5-mini" ||
      s === "gpt-5-nano" ||
      s === "gpt-4.1" ||
      s === "gpt-4.1-mini" ||
      s === "gpt-4.1-nano" ||
      s === "gpt-4o" ||
      s === "gpt-4o-mini" ||
      s === "gpt-4" ||
      s === "gpt-4-turbo" ||
      s === "gpt-3.5-turbo" ||
      s === "o4-mini" ||
      s === "o3" ||
      s === "o3-pro" ||
      s === "o3-mini" ||
      s === "o1" ||
      s === "o1-pro" ||
      s === "gpt-image-2.5-sunburst" ||
      s === "gpt-image-2.5-flare" ||
      s === "gpt-image-1" ||
      s === "gpt-image-1.5" ||
      s === "gpt-image-2" ||
      s === "gpt-image-1-mini"
    );
  }

  public filterForSakana(id: string) {
    return (
      id === "fugu" ||
      id === "fugu-cyber" ||
      id === "fugu-max" ||
      id === "fugu-ultra" ||
      id === "sakana-namazu"
    );
  }

  public filterForVercel(id: string) {
    return id === "v0-1.5-md" || id === "v0-1.0-md";
  }

  public filterForZai(id: string) {
    return (
      id === "glm-5.3" ||
      id === "glm-5.3-fast" ||
      id === "glm-5.3-flash" ||
      id === "glm-5.3-flashx" ||
      id === "glm-5.2" ||
      id === "glm-5.2-fast" ||
      id === "glm-5.1" ||
      id === "glm-5" ||
      id === "glm-4.7" ||
      id === "glm-4.6" ||
      id === "glm-4.5"
    );
  }
}

export class ModelServiceDisplayName extends ModelServiceFilter {
  public toAlibabaDisplayName(id: string) {
    if (this.filterForAlibaba(id)) {
      return this.ALIBABA_NAME_OVERRIDES[id];
    } else throw new Error("error in toAlibabaDisplayName");
  }

  public toCohereDisplayName(id: string) {
    if (this.filterForCohere(id)) {
      return this.COHERE_NAME_OVERRIDES[id];
    } else throw new Error("error in toCohereDisplayName");
  }

  public toDeepseekDisplayName(id: string) {
    if (this.filterForDeepseek(id)) {
      return this.DEEPSEEK_NAME_OVERRIDES[id];
    } else throw new Error("error in toDeepseekDisplayName");
  }

  public toGrokDisplayName(id: string) {
    if (this.filterForGrok(id)) {
      return this.GROK_NAME_OVERRIDES[id];
    } else throw new Error("error in toGrokDisplayName");
  }

  public toMetaDisplayName(id: string) {
    if (this.filterForMeta(id)) {
      return this.META_NAME_OVERRIDES[id];
    } else throw new Error("error in toMetaDisplayName");
  }

  public toMinimaxDisplayName(id: string) {
    if (this.filterForMinimax(id)) {
      return this.MINIMAX_NAME_OVERRIDES[id];
    } else throw new Error("error in toMinimaxDisplayName");
  }

  public toMistralDisplayName(id: string) {
    if (this.filterForMistral(id)) {
      return this.MISTRAL_NAME_OVERRIDES[id];
    } else throw new Error("error in toMistralDisplayName");
  }

  public toMoonshotAIDisplayName(id: string) {
    if (this.filterForMoonshotAI(id)) {
      return this.MOONSHOTAI_NAME_OVERRIDES[id];
    } else throw new Error("error in toMoonshotAIDisplayName");
  }

  public toOpenAIDisplayName(id: string) {
    if (this.filterForOpenAI(id)) {
      return this.OPENAI_NAME_OVERRIDES[id];
    } else throw new Error("error in toOpenAIDisplayName");
  }

  public toSakanaDisplayName(id: string) {
    if (this.filterForSakana(id)) {
      return this.SAKANA_NAME_OVERRIDES[id];
    } else throw new Error("error in toSakanaDisplayName");
  }

  public toVercelDisplayName(id: string) {
    if (this.filterForVercel(id)) {
      return this.VERCEL_NAME_OVERRIDES[id];
    } else throw new Error("error in toVercelDisplayName");
  }

  public toZaiDisplayName(id: string) {
    if (this.filterForZai(id)) {
      return this.ZAI_NAME_OVERRIDES[id];
    } else throw new Error("error in toZaiDisplayName");
  }
}

export class ModelServiceFetch extends ModelServiceDisplayName {
  private readonly anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  private readonly geminiKey = process.env.GOOGLE_API_KEY ?? "";
  private async anthropicFetcher() {
    return await fetch(`https://api.anthropic.com/v1/models?limit=100`, {
      headers: {
        "x-api-key": this.anthropicKey,
        "anthropic-version": "2023-06-01"
      }
    });
  }

  private async geminiFetcher() {
    return await fetch(
      `https://generativelanguage.googleapis.com/v1alpha/models?key=${this.geminiKey}&pageSize=1000`
    );
  }

  private formattedAnthropic(props: AnthropicResponse) {
    if (!props.data) throw new Error(props.error.message);
    return props.data;
  }

  private formattedGemini(props: GeminiResponse) {
    if (!props.models) throw new Error(props.error.message);
    return props.models;
  }

  public async fetchGemini() {
    const rawGemini = await this.geminiFetcher().then(d => d.text());
    return this.formattedGemini(JSON.parse(rawGemini));
  }

  public async fetchAnthropicAndGemini() {
    const [rawAnthropic, rawGemini] = await Promise.all([
      this.anthropicFetcher().then(d => d.text()),
      this.geminiFetcher().then(d => d.text())
    ]);

    const anthropicData = this.formattedAnthropic(JSON.parse(rawAnthropic));
    const geminiData = this.formattedGemini(JSON.parse(rawGemini));

    return {
      anthropicData,
      geminiData
    };
  }
}

export class ModelServiceMapper extends ModelServiceFetch {
  private async modelAudioMapper(modelKeys = true) {
    const geminiData = await this.fetchGemini();
    return Array.from(Object.entries(this.providerModelAudioApi)).map(
      ([provider, models]) => {
        const p = provider as keyof typeof this.providerModelAudioApi;
        switch (p) {
          case "gemini":
          default: {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name =
                geminiData.find(t => t.name === `models/${model}`)
                  ?.displayName ?? model;
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
        }
      }
    );
  }

  private async modelChatMapper(modelKeys = true) {
    const { anthropicData, geminiData } = await this.fetchAnthropicAndGemini();

    return Array.from(Object.entries(this.providerModelChatApi)).map(
      ([provider, models]) => {
        const p = provider as keyof typeof this.providerModelChatApi;
        switch (p) {
          case "alibaba": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toAlibabaDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "anthropic": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name =
                anthropicData.find(t => t.id === model)?.display_name ?? model;
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "cohere": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toCohereDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "deepseek": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toDeepseekDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "gemini": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name =
                geminiData.find(t => t.name === `models/${model}`)
                  ?.displayName ?? model;
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "grok": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toGrokDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "meta": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toMetaDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "minimax": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toMinimaxDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "mistral": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toMistralDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "moonshotai": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toMoonshotAIDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "openai": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toOpenAIDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "sakana": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toSakanaDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "vercel": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toVercelDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "zai":
          default: {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toZaiDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
        }
      }
    );
  }

  private async modelImageMapper(modelKeys = true) {
    const geminiData = await this.fetchGemini();
    return Array.from(Object.entries(this.providerModelImageApi)).map(
      ([provider, models]) => {
        const p = provider as keyof typeof this.providerModelImageApi;
        switch (p) {
          case "gemini": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name =
                geminiData.find(t => t.name === `models/${model}`)
                  ?.displayName ?? model;
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "grok": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toGrokDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "meta": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toMetaDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "openai":
          default: {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toOpenAIDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
        }
      }
    );
  }

  private async modelVideoMapper(modelKeys = true) {
    const geminiData = await this.fetchGemini();
    return Array.from(Object.entries(this.providerModelVideoApi)).map(
      ([provider, models]) => {
        const p = provider as keyof typeof this.providerModelVideoApi;
        switch (p) {
          case "gemini": {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name =
                geminiData.find(t => t.name === `models/${model}`)
                  ?.displayName ?? model;
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
          case "grok":
          default: {
            let helper = Array.of<[string, string]>();
            for (const model of models) {
              const name = this.toGrokDisplayName(model);
              if (modelKeys === true) {
                helper.push([model, name]);
              } else {
                helper.push([name, model]);
              }
            }
            return helper;
          }
        }
      }
    );
  }

  public async modelMapper<
    const T extends "audio" | "chat" | "image" | "video" = "chat"
  >(t: T, modelKeys = true) {
    if (t === "audio") {
      return await this.modelAudioMapper(modelKeys);
    } else if (t === "chat") {
      return await this.modelChatMapper(modelKeys);
    } else if (t === "image") {
      return await this.modelImageMapper(modelKeys);
    } else {
      return await this.modelVideoMapper(modelKeys);
    }
  }
}

export class ModelServiceDisplayNameModelId extends ModelServiceMapper {
  private async displayNameModelIdGenAudio<
    const T extends "keys=model-id" | "keys=display-name",
    const V extends "model-id-only" | "display-name-only"
  >(target: T, arrayOnly?: V) {
    const mapper = await this.modelMapper(
      "audio",
      target === "keys=display-name" ? false : true
    );
    const gemini = mapper[0];
    if (!gemini) {
      throw new Error("empty data in displayNameModelIdGenAudio");
    }
    if (typeof arrayOnly !== "undefined") {
      if (arrayOnly === "display-name-only") {
        if (target === "keys=display-name") {
          return {
            gemini: gemini.map(([keys, _v]) => keys)
          };
        } else {
          return { gemini: gemini.map(([_, vals]) => vals) };
        }
      } else {
        if (target === "keys=display-name") {
          return { gemini: gemini.map(([_, vals]) => vals) };
        } else {
          return {
            gemini: gemini.map(([keys, _v]) => keys)
          };
        }
      }
    }
    return {
      gemini: Object.fromEntries(gemini)
    };
  }
  private async displayNameModelIdGenChat<
    const T extends "keys=model-id" | "keys=display-name",
    const V extends "model-id-only" | "display-name-only"
  >(target: T, arrayOnly?: V) {
    const mapper = await this.modelMapper(
      "chat",
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
    ) {
      throw new Error("empty data in displayNameModelIdGen");
    }
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

  private async displayNameModelIdGenImage<
    const T extends "keys=model-id" | "keys=display-name",
    const V extends "model-id-only" | "display-name-only"
  >(target: T, arrayOnly?: V) {
    const mapper = await this.modelMapper(
      "image",
      target === "keys=display-name" ? false : true
    );
    const openai = mapper[0];
    const gemini = mapper[1];
    const grok = mapper[2];
    const meta = mapper[3];

    if (!openai || !gemini || !grok || !meta)
      throw new Error("empty data in displayNameModelIdGen");

    if (typeof arrayOnly !== "undefined") {
      if (arrayOnly === "display-name-only") {
        if (target === "keys=display-name") {
          return {
            openai: openai.map(([keys, _v]) => keys),
            gemini: gemini.map(([keys, _v]) => keys),
            grok: grok.map(([keys, _]) => keys),
            meta: meta.map(([keys, _v]) => keys)
          };
        } else {
          return {
            openai: openai.map(([_, vals]) => vals),
            gemini: gemini.map(([_, vals]) => vals),
            grok: grok.map(([_, vals]) => vals),
            meta: meta.map(([_, vals]) => vals)
          };
        }
      } else {
        if (target === "keys=display-name") {
          return {
            openai: openai.map(([_, vals]) => vals),
            gemini: gemini.map(([_, vals]) => vals),
            grok: grok.map(([_, vals]) => vals),
            meta: meta.map(([_, vals]) => vals)
          };
        } else {
          return {
            openai: openai.map(([keys, _v]) => keys),
            gemini: gemini.map(([keys, _v]) => keys),
            grok: grok.map(([keys, _]) => keys),
            meta: meta.map(([keys, _v]) => keys)
          };
        }
      }
    }
    return {
      openai: Object.fromEntries(openai),
      gemini: Object.fromEntries(gemini),
      grok: Object.fromEntries(grok),
      meta: Object.fromEntries(meta)
    };
  }

  private async displayNameModelIdGenVideo<
    const T extends "keys=model-id" | "keys=display-name",
    const V extends "model-id-only" | "display-name-only"
  >(target: T, arrayOnly?: V) {
    const mapper = await this.modelMapper(
      "video",
      target === "keys=display-name" ? false : true
    );
    const gemini = mapper[0];
    const grok = mapper[1];
    if (!gemini || !grok)
      throw new Error("empty data in displayNameModelIdGen");

    if (typeof arrayOnly !== "undefined") {
      if (arrayOnly === "display-name-only") {
        if (target === "keys=display-name") {
          return {
            gemini: gemini.map(([keys, _v]) => keys),
            grok: grok.map(([keys, _v]) => keys)
          };
        } else {
          return {
            gemini: gemini.map(([_, vals]) => vals),
            grok: grok.map(([_, vals]) => vals)
          };
        }
      } else {
        if (target === "keys=display-name") {
          return {
            gemini: gemini.map(([_, vals]) => vals),
            grok: grok.map(([_, vals]) => vals)
          };
        } else {
          return {
            gemini: gemini.map(([keys, _v]) => keys),
            grok: grok.map(([keys, _v]) => keys)
          };
        }
      }
    }
    return {
      gemini: Object.fromEntries(gemini),
      grok: Object.fromEntries(grok)
    };
  }

  public async omniMapper<
    const S extends ModeUnion,
    const T extends "keys=model-id" | "keys=display-name",
    const V extends "model-id-only" | "display-name-only"
  >(mode: S, target: T, arrayOnly?: V): Promise<OmniMapperRT> {
    switch (mode) {
      case "audio": {
        return await (arrayOnly
          ? this.displayNameModelIdGenAudio(target, arrayOnly)
          : this.displayNameModelIdGenAudio(target));
      }
      case "default": {
        return await (arrayOnly
          ? this.displayNameModelIdGenChat(target, arrayOnly)
          : this.displayNameModelIdGenChat(target));
      }
      case "img": {
        return await (arrayOnly
          ? this.displayNameModelIdGenImage(target, arrayOnly)
          : this.displayNameModelIdGenImage(target));
      }
      case "video": {
        return await (arrayOnly
          ? this.displayNameModelIdGenVideo(target, arrayOnly)
          : this.displayNameModelIdGenVideo(target));
      }
      default: {
        throw new Error(`error in omniMapper `);
      }
    }
  }
}

export class ModelServiceExe extends ModelServiceDisplayNameModelId {
  constructor(protected fs: Fs) {
    super();
  }
  private get format() {
    return {
      default: "",
      img: "ImgGen",
      video: "VideoGen",
      audio: "AudioGen"
    } as const;
  }

  private async displayNameToModelIdsScaffold(t: ModeUnion) {
    const displayNameToModelId = await this.omniMapper(t, "keys=display-name");
    // prettier-ignore
    return `export const displayNameToModelId${this.format[t]} = ${JSON.stringify(displayNameToModelId, null, 2)} as const;` as const;
  }

  private async displayNameOnlyScaffold(t: ModeUnion) {
    const displayNameOnly = await this.omniMapper(
      t,
      "keys=display-name",
      "display-name-only"
    );
    // prettier-ignore
    return `export const displayNameModelsByProvider${this.format[t]} = ${JSON.stringify(displayNameOnly, null, 2)} as const;` as const;
  }

  private async modelIdsOnlyScaffold(t: ModeUnion) {
    const modelIdsOnly = await this.omniMapper(
      t,
      "keys=model-id",
      "model-id-only"
    );
    // prettier-ignore
    return `export const modelIdsByProvider${this.format[t]} = ${JSON.stringify(modelIdsOnly, null, 2)} as const;` as const;
  }

  private async modelIdToDisplayNameScaffold(t: ModeUnion) {
    const modelIdToDisplayName = await this.omniMapper(t, "keys=model-id");
    // prettier-ignore
    return `export const modelIdToDisplayName${this.format[t]} = ${JSON.stringify(modelIdToDisplayName, null, 2)} as const;` as const;
  }

  private async displayNameToModelIdObj() {
    return {
      template: {
        default: await this.displayNameToModelIdsScaffold("default"),
        img: await this.displayNameToModelIdsScaffold("img"),
        video: await this.displayNameToModelIdsScaffold("video"),
        audio: await this.displayNameToModelIdsScaffold("audio")
      },
      path: {
        default: "src/codegen/__gen__/display-name-to-model-id.ts",
        img: "src/codegen/__gen__/display-name-to-model-id-img-gen.ts",
        video: "src/codegen/__gen__/display-name-to-model-id-video-gen.ts",
        audio: "src/codegen/__gen__/display-name-to-model-id-audio-gen.ts"
      }
    } as const;
  }

  private async displayNameOnlyObj() {
    return {
      template: {
        default: await this.displayNameOnlyScaffold("default"),
        img: await this.displayNameOnlyScaffold("img"),
        video: await this.displayNameOnlyScaffold("video"),
        audio: await this.displayNameOnlyScaffold("audio")
      },
      path: {
        default: "src/codegen/__gen__/display-names-by-provider.ts",
        img: "src/codegen/__gen__/display-names-by-provider-img-gen.ts",
        video: "src/codegen/__gen__/display-names-by-provider-video-gen.ts",
        audio: "src/codegen/__gen__/display-names-by-provider-audio-gen.ts"
      }
    } as const;
  }

  private async modelIdToDisplayNameObj() {
    return {
      template: {
        default: await this.modelIdToDisplayNameScaffold("default"),
        img: await this.modelIdToDisplayNameScaffold("img"),
        video: await this.modelIdToDisplayNameScaffold("video"),
        audio: await this.modelIdToDisplayNameScaffold("audio")
      },
      path: {
        default: "src/codegen/__gen__/model-id-to-display-name.ts",
        img: "src/codegen/__gen__/model-id-to-display-name-img-gen.ts",
        video: "src/codegen/__gen__/model-id-to-display-name-video-gen.ts",
        audio: "src/codegen/__gen__/model-id-to-display-name-audio-gen.ts"
      }
    } as const;
  }

  private async modelIdsOnlyObj() {
    return {
      template: {
        default: await this.modelIdsOnlyScaffold("default"),
        img: await this.modelIdsOnlyScaffold("img"),
        video: await this.modelIdsOnlyScaffold("video"),
        audio: await this.modelIdsOnlyScaffold("audio")
      },
      path: {
        default: "src/codegen/__gen__/model-ids-by-provider.ts",
        img: "src/codegen/__gen__/model-ids-by-provider-img-gen.ts",
        video: "src/codegen/__gen__/model-ids-by-provider-video-gen.ts",
        audio: "src/codegen/__gen__/model-ids-by-provider-audio-gen.ts"
      }
    } as const;
  }

  public async exe(target: ModeUnion) {
    const [
      displayNameToModelIdObj,
      displayNameOnlyObj,
      modelIdToDisplayNameObj,
      modelIdsOnlyObj
    ] = await Promise.all([
      this.displayNameToModelIdObj(),
      this.displayNameOnlyObj(),
      this.modelIdToDisplayNameObj(),
      this.modelIdsOnlyObj()
    ]);

    this.fs.withWs(
      displayNameToModelIdObj.path[target],
      displayNameToModelIdObj.template[target]
    );
    this.fs.withWs(
      displayNameOnlyObj.path[target],
      displayNameOnlyObj.template[target]
    );
    this.fs.withWs(
      modelIdToDisplayNameObj.path[target],
      modelIdToDisplayNameObj.template[target]
    );
    this.fs.withWs(
      modelIdsOnlyObj.path[target],
      modelIdsOnlyObj.template[target]
    );
  }
}

if (
  process.argv[3] === "img" ||
  process.argv[3] === "default" ||
  process.argv[3] === "video" ||
  process.argv[3] === "audio"
) {
  const fs = new Fs(process.cwd());
  const codegen = new ModelServiceExe(fs);
  codegen.exe(process.argv[3]).catch(err => console.error(err));
}
