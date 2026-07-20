import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const urlByProvider = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models?limit=100",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01"
    }
  },
  cohere: {
    url: "https://api.cohere.com/v1/models?page_size=1000",
    headers: { Authorization: `Bearer ${process.env.COHERE_TRIAL_KEY ?? ""}` }
  },
  gemini: {
    url: `https://generativelanguage.googleapis.com/v1alpha/models?key=${process.env.GOOGLE_API_KEY ?? ""}&pageSize=1000`,
    headers: { "Content-Type": "application/json" }
  },
  grok: {
    url: "https://api.x.ai/v1/models",
    headers: { Authorization: `Bearer ` + (process.env.X_AI_KEY ?? "") }
  },
  llama: {
    url: "https://api.meta.ai/v1/models",
    headers: {
      Authorization: `Bearer ` + (process.env.LLAMA_API_KEY ?? ""),
      "Content-Type": "application/json"
    }
  },
  mistral: {
    url: "https://api.mistral.ai/v1/models",
    headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY ?? ""}` }
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: { Authorization: `Bearer ` + (process.env.OPENAI_API_KEY ?? "") }
  },
  v0: {
    url: "https://ai-gateway.vercel.sh/v1/models",
    headers: {
      Authorization: `Bearer ` + (process.env.AI_GATEWAY_API_KEY ?? "")
    }
  },
  sakana: {
    url: "https://api.sakana.ai/v1/models",
    headers: {
      Authorization: `Bearer ` + (process.env.SAKANA_API_KEY ?? "")
    }
  }
};

const fs = new Fs(process.cwd());
(async () => {
  for (const [u, k] of Object.entries(urlByProvider)) {
    const data = await fetch(k.url, { headers: k.headers }).then(
      async v => await v.text()
    );
    const parsed = JSON.parse<Record<string, any>>(data);
    fs.withWs(
      `src/test/__out__/${u}-results.json`,
      JSON.stringify(parsed, null, 2)
    );
  }
})();
