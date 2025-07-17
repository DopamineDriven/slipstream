export const displayNameToModelId = {
  openai: {
    "GPT 4.1": "gpt-4.1",
    "GPT 4.1 Mini": "gpt-4.1-mini",
    "GPT 4.1 Nano": "gpt-4.1-nano",
    "GPT 4.5 Preview": "gpt-4.5-preview",
    "o4 Mini": "o4-mini",
    o1: "o1",
    o3: "o3",
    "o1 Mini": "o1-mini",
    "o3 Mini": "o3-mini",
    "GPT 4o": "gpt-4o",
    "GPT 4o Audio Preview": "gpt-4o-audio-preview",
    "GPT 4o Mini": "gpt-4o-mini",
    "GPT 4o Search Preview": "gpt-4o-search-preview",
    "GPT 4o Mini Search Preview": "gpt-4o-mini-search-preview",
    "GPT 4o Mini Audio Preview": "gpt-4o-mini-audio-preview",
    "GPT 4": "gpt-4",
    "GPT 4 Turbo": "gpt-4-turbo",
    "GPT 3.5 Turbo": "gpt-3.5-turbo",
    "GPT 3.5 Turbo 16k": "gpt-3.5-turbo-16k"
  },
  gemini: {
    "Gemini 2.5 Flash": "gemini-2.5-flash",
    "Gemini 2.5 Pro": "gemini-2.5-pro",
    "Gemini 2.5 Flash-Lite Preview 06-17":
      "gemini-2.5-flash-lite-preview-06-17",
    "Gemini 2.5 Flash Preview Native Audio Dialog":
      "gemini-2.5-flash-preview-native-audio-dialog",
    "Gemini 2.5 Flash Exp Native Audio Thinking Dialog":
      "gemini-2.5-flash-exp-native-audio-thinking-dialog",
    "Gemini 2.5 Flash Preview TTS": "gemini-2.5-flash-preview-tts",
    "Gemini 2.5 Pro Preview TTS": "gemini-2.5-pro-preview-tts",
    "Gemini 2.0 Flash": "gemini-2.0-flash",
    "Gemini 2.0 Flash Preview Image Generation":
      "gemini-2.0-flash-preview-image-generation",
    "Gemini 2.0 Flash-Lite": "gemini-2.0-flash-lite",
    "Gemini 1.5 Flash": "gemini-1.5-flash",
    "Gemini 1.5 Pro": "gemini-1.5-pro",
    "Gemini Embedding Experimental": "gemini-embedding-exp",
    "Imagen 4 (Preview)": "imagen-4.0-generate-preview-06-06",
    "Imagen 4 Ultra (Preview)": "imagen-4.0-ultra-generate-preview-06-06",
    "Imagen 3.0 002 model": "imagen-3.0-generate-002",
    "Veo 2": "veo-2.0-generate-001",
    "Gemini Live 2.5 Flash Preview": "gemini-live-2.5-flash-preview",
    "Gemini 2.0 Flash 001": "gemini-2.0-flash-live-001"
  },
  grok: {
    "Grok 3": "grok-3",
    "Grok 2": "grok-2-1212",
    "Grok 2 Vision": "grok-2-vision-1212",
    "Grok 3 Fast": "grok-3-fast",
    "Grok 3 Mini": "grok-3-mini",
    "Grok 3 Mini Fast": "grok-3-mini-fast",
    "Grok 4": "grok-4-0709",
    "Grok 2 Image": "grok-2-image-1212"
  },
  anthropic: {
    "Claude Opus 4": "claude-opus-4-20250514",
    "Claude Sonnet 4": "claude-sonnet-4-20250514",
    "Claude Sonnet 3.7": "claude-3-7-sonnet-20250219",
    "Claude Haiku 3.5": "claude-3-5-haiku-20241022",
    "Claude Sonnet 3.5 (New)": "claude-3-5-sonnet-20241022",
    "Claude Sonnet 3.5 (Old)": "claude-3-5-sonnet-20240620",
    "Claude Haiku 3": "claude-3-haiku-20240307"
  }
} as const;
