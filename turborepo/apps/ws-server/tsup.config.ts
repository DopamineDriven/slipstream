import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

/** `outExtension({format})` -> when format passed in it outputs esm so using it as `.${format}.mjs` -> `filename.esm.mjs` on output */
const tsupConfig = (options: Options) =>
  ({
    entry: [
      "src/index.ts",
      "src/auth/index.ts",
      "src/db/index.ts",
      "src/gemini/index.ts",
      "src/generated/**/*.ts",
      "src/openai/index.ts",
      "src/r2-helper/index.ts",
      "src/prisma/index.ts",
      "src/resolver/index.ts",
      "src/types/index.ts",
      "src/ws-server/index.ts",
      "!src/__out__/**/*",
      "!src/test/**/*",
      "!public/**/*"
    ],
    target: ["node24"],
    dts: true,
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    format: ["esm"],
    sourcemap: true,
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: true,
    outDir: "dist",
    ...options
  }) satisfies Options;

export default defineConfig(tsupConfig);
