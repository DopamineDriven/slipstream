import { Credentials } from "@t3-chat-clone/credentials";
import { GoogleGenAI } from "@google/genai";

/**
 * Singleton service to manage Gemini (Google GenAI) clients.
 * Supports a default API key from credentials or per-request overrides.
 */
export class GeminiService {
  private defaultClient: GoogleGenAI | null = null;
  private defaultApiKey: string | null = null;

  constructor(private cred: Credentials) {}

  private async initDefault(): Promise<GoogleGenAI> {
    if (this.defaultClient && this.defaultApiKey) {
      return this.defaultClient;
    }

    const apiKey = await this.cred.get("GOOGLE_API_KEY");
    if (!apiKey) {
      throw new Error("Missing GOOGLE_API_KEY in credentials");
    }
    this.defaultApiKey = apiKey;
    this.defaultClient = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
    return this.defaultClient;
  }

  public async getClient(overrideKey?: string) {
    if (overrideKey) {
      return new GoogleGenAI({ apiKey: overrideKey, apiVersion: "v1alpha" });
    }
    return await this.initDefault();
  }
}
