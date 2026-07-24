export const modelIdsByProviderVideoGen = {
  openai: ["sora-2", "sora-2-pro"],
  gemini: [
    "gemini-omni-flash-preview",
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.1-lite-generate-preview"
  ],
  grok: ["grok-imagine-video-1.5", "grok-imagine-video"]
} as const;
