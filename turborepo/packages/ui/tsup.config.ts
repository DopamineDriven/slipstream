import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

const tsupConfig = (
  options: Omit<
    Options,
    | "entry"
    | "dts"
    | "external"
    | "watch"
    | "keepNames"
    | "format"
    | "sourcemap"
    | "tsconfig"
    | "clean"
    | "outDir"
  >
) =>
  ({
    entry: [
      "src/base/*.tsx",
      "src/globals.css",
      "src/index.ts",
      "src/icons/*.tsx",
      "src/lib/*.ts",
      "src/ui/*.tsx",
      "!src/services/icon-workup.ts",
      "!src/services/postbuild.ts"
    ],
    dts: true,
    external: ["react", "react-dom"],
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    target: ["esnext"],
    format: ["esm"],
    sourcemap: true,
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: true,
    outDir: "dist",
    ...options
  }) satisfies Options;

export default defineConfig(tsupConfig);
