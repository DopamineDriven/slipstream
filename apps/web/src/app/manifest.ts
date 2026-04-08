import type { MetadataRoute } from "next";

export default function manifest() {
  return <MetadataRoute.Manifest>{
    short_name: "AI Coalesce",
    description:
      "Advanced custom tooling enabling user-tailored multimodel interactions that enhance with usage.",
    background_color: "#FFFFFF",
    name: "AI Coalesce",
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
