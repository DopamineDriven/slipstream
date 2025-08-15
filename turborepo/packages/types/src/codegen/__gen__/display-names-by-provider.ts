export const displayNameModelsByProvider = {
  openai: [
    "GPT-5",
    "GPT-5 mini",
    "GPT-5 nano",
    "GPT-4.1",
    "GPT-4.1 mini",
    "GPT-4.1 nano",
    "o4-mini",
    "o3",
    "o3-pro",
    "o3-mini",
    "GPT-4o",
    "GPT-4o mini",
    "GPT-4",
    "GPT-4 turbo",
    "GPT-3.5 turbo",
    "GPT-3.5 turbo 16k"
  ],
  gemini: [
    "Gemini 2.5 Pro",
    "Gemini 2.5 Flash",
    "Gemini 2.5 Flash-Lite",
    "Gemini 2.5 Pro Preview TTS",
    "Gemini 2.5 Flash Preview TTS",
    "Gemini 2.0 Flash",
    "Gemini 2.0 Flash-Lite",
    "Gemini 2.0 Flash Preview Image Generation",
    "Gemini Embedding 001",
    "Imagen 4 (Preview)",
    "Imagen 4 Ultra (Preview)",
    "Imagen 3.0",
    "Veo 3",
    "Veo 3 fast",
    "Veo 2"
  ],
  grok: [
    "Grok 4",
    "Grok 3",
    "Grok 3 Fast",
    "Grok 3 Mini",
    "Grok 3 Mini Fast",
    "Grok 2 Image",
    "Grok 2 Vision"
  ],
  anthropic: [
    "Claude Opus 4.1",
    "Claude Opus 4",
    "Claude Sonnet 4",
    "Claude Sonnet 3.7",
    "Claude Haiku 3.5",
    "Claude Sonnet 3.5 (New)",
    "Claude Sonnet 3.5 (Old)",
    "Claude Haiku 3"
  ],
  meta: [
    "Llama 4 Maverick (17B/128E, Instruct, FP8)",
    "Llama 4 Scout (17B/16E, Instruct, FP8)",
    "Llama 3.3 (70B, Instruct)",
    "Llama 3.3 (8B, Instruct)",
    "Llama 4 Maverick (Cerebras, 17B/128E, Instruct)",
    "Llama 4 Scout (Cerebras, 17B/16E, Instruct)",
    "Llama 4 Maverick (Groq, 17B/128E, Instruct)"
  ],
  vercel: ["v0 medium", "v0 large", "v0 medium (legacy)"]
} as const;
