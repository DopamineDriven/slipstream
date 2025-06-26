import { Credentials } from "@t3-chat-clone/credentials";
import { GoogleGenAI } from "@google/genai";

let gemini: GoogleGenAI;
export async function getGemini(cred: Credentials) {
  if (gemini) return gemini;

  const apiKey = await cred.get("GOOGLE_API_KEY");

  if (!apiKey) throw new Error("Missing GOOGLE_API_KEY!");

  gemini = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });

  return gemini;
}

