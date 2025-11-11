export const displayNameToModelIdImgGen = {
  openai: {
    "GPT-5": "gpt-5",
    "GPT-5 mini": "gpt-5-mini",
    "GPT-5 nano": "gpt-5-nano",
    "GPT-5 Chat": "gpt-5-chat-latest",
    "GPT-5 pro": "gpt-5-pro",
    "GPT-4.1": "gpt-4.1",
    "GPT-4.1 mini": "gpt-4.1-mini",
    "GPT-4.1 nano": "gpt-4.1-nano",
    "GPT-4o": "gpt-4o",
    "GPT-4o mini": "gpt-4o-mini",
    o3: "o3",
    "GPT Image 1": "gpt-image-1",
    "GPT Image 1 mini": "gpt-image-1-mini",
    "DALL·E 3": "dall-e-3",
    "DALL·E 2": "dall-e-2"
  },
  gemini: {
    "Nano Banana": "gemini-2.5-flash-image",
    "Imagen 4": "imagen-4.0-generate-001",
    "Imagen 4 Fast": "imagen-4.0-fast-generate-001",
    "Imagen 4 Ultra": "imagen-4.0-ultra-generate-001"
  },
  grok: {
    "Grok 2 Image": "grok-2-image-1212"
  }
} as const;
