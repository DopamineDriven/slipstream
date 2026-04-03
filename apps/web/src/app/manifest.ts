import type { MetadataRoute } from "next";

export default function manifest() {
  return <MetadataRoute.Manifest>{
    short_name: "aicoalesce chat medium",
    description: "Chat with models offered by Gemini, OpenAI, Anthropic, Meta, v0, and xAI",
    background_color: "#FFFFFF",
    name: "aicoalesce multi-LLM chat medium",
    theme_color: "#020817",
    start_url: "/",
    display: "fullscreen",
    icons: [
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}
