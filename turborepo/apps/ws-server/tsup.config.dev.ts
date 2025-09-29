import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

/** `outExtension({format})` -> when format passed in it outputs esm so using it as `.${format}.mjs` -> `filename.esm.mjs` on output */
const tsupConfig = (options: Options) =>
  ({
    entry: [
      "src/index.ts",
      "src/anthropic/index.ts",
      "src/auth/index.ts",
      "src/gemini/index.ts",
      "src/logger/index.ts",
      "src/meta/index.ts",
      "src/models/index.ts",
      "src/openai/index.ts",
      "src/pdf/index.ts",
      "src/prisma/index.ts",
      "src/resolver/index.ts",
      "src/types/index.ts",
      "src/vercel/index.ts",
      "src/vercel/sse.ts",
      "src/ws-server/index.ts",
      "src/xai/index.ts",
      "src/xai/sse.ts",
      "!src/__out__/**/*",
      "!src/test/**/*",
      "!public/**/*"
    ],
    target: ["node24"],
    dts: true,
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    format: ["esm"],
    external: ["pino-pretty", "pino/file", "pino-abstract-transport"],
    sourcemap: true,
    onSuccess: "node dist/index.js",
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: true,
    outDir: "dist",
    ...options
  }) satisfies Options;

export default defineConfig(tsupConfig);
