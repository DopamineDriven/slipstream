import type { Config as TailwindConfig } from "tailwindcss";

export default {
  content: ["src/**/*.{js,ts,jsx,tsx}"],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px"
      }
    }
  }
} satisfies TailwindConfig;