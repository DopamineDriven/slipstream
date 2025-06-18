import type { ClientOptions } from "openai";
import { OpenAI } from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const defaultConfig = {
  apiKey: process.env.OPENAI_API_KEY
} satisfies ClientOptions;

export const openai = new OpenAI(defaultConfig);
