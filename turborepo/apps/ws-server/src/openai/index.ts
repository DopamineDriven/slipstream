import type { ClientOptions } from "openai";
import { OpenAI } from "openai";
import { logger } from "@/logger/index.ts";

const defaultConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  logger: logger.child({ name: "openai" })
} satisfies ClientOptions;

export const openai = new OpenAI(defaultConfig);
