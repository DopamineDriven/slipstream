import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

const tsupConfig = (options: Options) =>
  ({
    entry: [
      "src/index.ts",
      "src/docs/index.ts",
      "src/images/index.ts",
      "src/images/workup.ts"
    ],
    target: ["esnext"],
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
