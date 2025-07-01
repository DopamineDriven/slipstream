import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

const tsupConfig = (options: Options) =>
  ({
    entry: [
      "src/index.ts",
      "src/**/*.ts",
      "!src/test/**"
    ],
    target: ["esnext"],
    dts: true,
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    format: ["esm"],
    sourcemap: true,
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: false,
    outDir: "dist",
    ...options
  }) satisfies Options;

export default defineConfig(tsupConfig);
