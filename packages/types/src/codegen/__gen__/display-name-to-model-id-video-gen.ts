export const displayNameToModelIdVideoGen = {
  openai: {
    "Sora 2": "sora-2",
    "Sora 2 Pro": "sora-2-pro"
  },
  gemini: {
    "Veo 3.1": "veo-3.1-generate-preview",
    "Veo 3.1 fast": "veo-3.1-fast-generate-preview",
    "Veo 3": "veo-3.0-generate-001",
    "Veo 3 fast": "veo-3.0-fast-generate-001",
    "Veo 2": "veo-2.0-generate-001"
  },
  grok: {
    "Grok Imagine Video 1.5 Preview": "grok-imagine-video-1.5-preview",
    "Grok Imagine Video": "grok-imagine-video"
  }
} as const;
