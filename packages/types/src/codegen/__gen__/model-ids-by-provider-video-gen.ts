export const modelIdsByProviderVideoGen = {
  openai: ["sora-2", "sora-2-pro"],
  gemini: [
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.0-generate-001",
    "veo-3.0-fast-generate-001",
    "veo-2.0-generate-001"
  ],
  grok: ["grok-imagine-video-1.5-preview", "grok-imagine-video"]
} as const;
