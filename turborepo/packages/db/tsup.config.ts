import { relative } from "node:path";
import type { Options } from "tsup";
import { wasmLoader } from "esbuild-plugin-wasm";
import { defineConfig } from "tsup";

export default defineConfig(
  ({
    loader,
    ...options
  }: Omit<
    Options,
    | "clean"
    | "dts"
    | "entry"
    | "esbuildPlugins"
    | "format"
    | "minify"
    | "target"
    | "outDir"
    | "treeshake"
  >) =>
    ({
      clean: true,
      dts: true,
      entry: [
        "!src/generated/prisma-edge/internal/query_engine_bg.*",
        "!src/test/**",
        "!edge/**",
        "src/**/*.ts"
      ],
      format: ["esm"],
      minify: true,
      target: "esnext",
      outDir: "dist",
      treeshake: true,
      ...options
    }) satisfies Options
);
