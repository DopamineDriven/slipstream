import type { ClientOptions } from "openai";
import { Credentials } from "@t3-chat-clone/credentials";
import { OpenAI } from "openai";

let openai: OpenAI;

export async function getOpenAI(cred: Credentials) {
  if (openai) return openai;

  const apiKey = await cred.get("OPENAI_API_KEY");

  if (!apiKey) throw new Error("Missing OPENAI_API_KEY!");

  openai = new OpenAI({ apiKey } satisfies ClientOptions);

  return openai;
}
