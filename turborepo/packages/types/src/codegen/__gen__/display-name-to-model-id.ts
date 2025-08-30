export const displayNameToModelId = {
  openai: {
    "GPT-5": "gpt-5",
    "GPT-5 mini": "gpt-5-mini",
    "GPT-5 nano": "gpt-5-nano",
    "GPT-4.1": "gpt-4.1",
    "GPT-4.1 mini": "gpt-4.1-mini",
    "GPT-4.1 nano": "gpt-4.1-nano",
    "o4-mini": "o4-mini",
    o3: "o3",
    "o3-pro": "o3-pro",
    "o3-mini": "o3-mini",
    "GPT-4o": "gpt-4o",
    "GPT-4o mini": "gpt-4o-mini",
    "GPT-4": "gpt-4",
    "GPT-4 turbo": "gpt-4-turbo",
    "GPT-3.5 turbo": "gpt-3.5-turbo",
    "GPT-3.5 turbo 16k": "gpt-3.5-turbo-16k"
  },
  gemini: {
    "Gemini 2.5 Pro": "gemini-2.5-pro",
    "Gemini 2.5 Flash": "gemini-2.5-flash",
    "Gemini 2.5 Flash-Lite": "gemini-2.5-flash-lite",
    "Gemini 2.5 Pro Preview TTS": "gemini-2.5-pro-preview-tts",
    "Gemini 2.5 Flash Preview TTS": "gemini-2.5-flash-preview-tts",
    "Gemini 2.0 Flash": "gemini-2.0-flash",
    "Gemini 2.0 Flash-Lite": "gemini-2.0-flash-lite",
    "Gemini 2.0 Flash Preview Image Generation":
      "gemini-2.0-flash-preview-image-generation",
    "Gemini Embedding 001": "gemini-embedding-001",
    "Imagen 4 (Preview)": "imagen-4.0-generate-preview-06-06",
    "Imagen 4 Ultra (Preview)": "imagen-4.0-ultra-generate-preview-06-06",
    "Imagen 3.0": "imagen-3.0-generate-002",
    "Veo 3": "veo-3.0-generate-preview",
    "Veo 3 fast": "veo-3.0-fast-generate-preview",
    "Veo 2": "veo-2.0-generate-001"
  },
  grok: {
    "Grok 4": "grok-4-0709",
    "Grok Code Fast 1": "grok-code-fast-1",
    "Grok 3": "grok-3",
    "Grok 3 Fast": "grok-3-fast",
    "Grok 3 Mini": "grok-3-mini",
    "Grok 3 Mini Fast": "grok-3-mini-fast",
    "Grok 2 Image": "grok-2-image-1212",
    "Grok 2 Vision": "grok-2-vision-1212"
  },
  anthropic: {
    "Claude Opus 4.1": "claude-opus-4-1-20250805",
    "Claude Opus 4": "claude-opus-4-20250514",
    "Claude Sonnet 4": "claude-sonnet-4-20250514",
    "Claude Sonnet 3.7": "claude-3-7-sonnet-20250219",
    "Claude Haiku 3.5": "claude-3-5-haiku-20241022",
    "Claude Sonnet 3.5 (New)": "claude-3-5-sonnet-20241022",
    "Claude Sonnet 3.5 (Old)": "claude-3-5-sonnet-20240620",
    "Claude Haiku 3": "claude-3-haiku-20240307"
  },
  meta: {
    "Llama 4 Maverick (17B/128E, Instruct, FP8)":
      "Llama-4-Maverick-17B-128E-Instruct-FP8",
    "Llama 4 Scout (17B/16E, Instruct, FP8)":
      "Llama-4-Scout-17B-16E-Instruct-FP8",
    "Llama 3.3 (70B, Instruct)": "Llama-3.3-70B-Instruct",
    "Llama 3.3 (8B, Instruct)": "Llama-3.3-8B-Instruct",
    "Llama 4 Maverick (Cerebras, 17B/128E, Instruct)":
      "Cerebras-Llama-4-Maverick-17B-128E-Instruct",
    "Llama 4 Scout (Cerebras, 17B/16E, Instruct)":
      "Cerebras-Llama-4-Scout-17B-16E-Instruct",
    "Llama 4 Maverick (Groq, 17B/128E, Instruct)":
      "Groq-Llama-4-Maverick-17B-128E-Instruct"
  },
  vercel: {
    "v0 medium": "v0-1.5-md",
    "v0 large": "v0-1.5-lg",
    "v0 medium (legacy)": "v0-1.0-md"
  }
} as const;
