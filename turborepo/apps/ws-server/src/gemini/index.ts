import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private defaultClient: GoogleGenAI;

  constructor(private apiKey: string) {
    this.defaultClient = new GoogleGenAI({
      apiKey: this.apiKey,
      apiVersion: "v1alpha"
    });
  }

  public getClient(overrideKey?: string) {
    if (overrideKey) {
      return new GoogleGenAI({ apiKey: overrideKey, apiVersion: "v1alpha" });
    }
    return this.defaultClient;
  }
}
