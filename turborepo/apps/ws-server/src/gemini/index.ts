import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const gemini = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY, apiVersion: "v1alpha" });



export { gemini };
